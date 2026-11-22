"""管理员账号命令行维护。"""
import argparse
import asyncio
import getpass
import psycopg
from fastapi import HTTPException
from pydantic import ValidationError
from app.core.database import database
from .schemas import Login
from .security import hash_password

async def manage_account():
    parser = argparse.ArgumentParser(description="创建管理员或重置现有账号密码")
    parser.add_argument(
        "--reset-password", metavar="USERNAME", help="重置现有账号密码并撤销登录会话"
    )
    args = parser.parse_args()
    username = (
        args.reset_password
        or (await asyncio.to_thread(input, "新管理员账号（字母、数字、下划线，3–64 位）：")).strip()
    )
    password = await asyncio.to_thread(getpass.getpass, "密码（8–128 位）：")
    if password != await asyncio.to_thread(getpass.getpass, "确认密码："):
        raise SystemExit("两次密码不一致")
    account = Login(username=username, password=password)
    password_hash = await asyncio.to_thread(hash_password, account.password)
    async with database() as connection:
        if args.reset_password:
            cursor = await connection.execute(
                """UPDATE riglab.users SET password_hash = %s
                   WHERE lower(username) = %s RETURNING id, role, is_active""",
                (password_hash, account.username.lower()),
            )
            user = await cursor.fetchone()
            if not user:
                raise SystemExit("账号不存在，请检查用户名")
            await connection.execute(
                "DELETE FROM riglab.sessions WHERE user_id = %s", (user["id"],)
            )
        else:
            await connection.execute(
                """INSERT INTO riglab.users(username, nickname, password_hash, role)
                   VALUES (%s, %s, %s, 'admin')""",
                (account.username.lower(), account.username[:20], password_hash),
            )
    if args.reset_password:
        print("密码已重置，旧登录会话已撤销")
        print("账号角色：" + user["role"] + "；启用状态：" + str(user["is_active"]))
    else:
        print("管理员已创建")


def main():
    try:
        with asyncio.Runner(loop_factory=asyncio.SelectorEventLoop) as runner:
            runner.run(manage_account())
    except psycopg.errors.UniqueViolation:
        raise SystemExit("账号已存在。重置密码请运行：python auth.py --reset-password 用户名")
    except ValidationError:
        raise SystemExit("请检查账号格式（3–64 位字母、数字、下划线）及密码长度（8–128 位）")
    except HTTPException as exc:
        raise SystemExit(exc.detail)


if __name__ == "__main__":
    main()
