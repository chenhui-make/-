"""仅针对临时测试库运行。显式设置 RIGLAB_TEST_DATABASE=1 与 PGPORT=55439。"""

import asyncio
from concurrent.futures import ThreadPoolExecutor
import http.cookiejar
import json
import os
import sys
import threading
import time
import uuid
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, HTTPCookieProcessor, build_opener
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import uvicorn
from app.core.database import database
from app.auth.security import hash_password
from app.auth.cli import manage_account
from main import app


def main():
    assert os.getenv("RIGLAB_TEST_DATABASE") == "1"
    assert os.getenv("PGPORT") == "55439", "只允许使用临时测试实例"
    server = uvicorn.Server(
        uvicorn.Config(
            app, host="127.0.0.1", port=58039, log_level="error", loop="app.core.database:selector_loop_factory"
        )
    )
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    try:
        for _ in range(100):
            if server.started:
                break
            time.sleep(0.05)
        assert server.started
        user_client = build_opener(HTTPCookieProcessor(http.cookiejar.CookieJar()))
        admin_client = build_opener(HTTPCookieProcessor(http.cookiejar.CookieJar()))

        def call(client, path, method="GET", body=None, expected=200, origin=None):
            headers = {"Content-Type": "application/json"}
            if origin:
                headers["Origin"] = origin
            data = json.dumps(body).encode() if body is not None else None
            request = Request(
                "http://127.0.0.1:58039/api" + path, data=data, headers=headers, method=method
            )
            try:
                result = client.open(request)
            except HTTPError as error:
                result = error
            assert result.code == expected, (path, result.code, result.read())
            return json.load(result), result.headers

        call(user_client, "/auth/me", expected=401)
        username = f"139{uuid.uuid4().int % 10**8:08d}"
        credentials = {"username": username, "password": "ValidPassword2026"}
        registration = {
            **credentials,
            "nickname": "测试用户",
            "confirm_password": credentials["password"],
        }
        call(user_client, "/auth/register", "POST", {**registration, "username": "test_user"}, 422)
        call(
            user_client,
            "/auth/register",
            "POST",
            {**registration, "confirm_password": "DifferentPassword2026"},
            422,
        )
        user, headers = call(user_client, "/auth/register", "POST", registration, 201)
        assert user["role"] == "user" and "password_hash" not in user
        assert "HttpOnly" in headers["Set-Cookie"]
        call(user_client, "/auth/register", "POST", registration, 409)
        call(user_client, "/auth/me")
        call(user_client, "/admin/users", expected=403)
        call(user_client, "/auth/staff-login", "POST", credentials, 403)
        call(user_client, "/auth/login", "POST", {**credentials, "password": "wrongpassword"}, 401)
        call(user_client, "/auth/logout", "POST")
        call(user_client, "/auth/me", expected=401)
        call(user_client, "/auth/login", "POST", credentials)
        call(user_client, "/auth/logout", "POST", expected=403, origin="https://other.example")

        admin_name = "admin_" + uuid.uuid4().hex[:12]

        async def create_admin():
            async with database() as connection:
                await connection.execute(
                    """INSERT INTO riglab.users(username, nickname, password_hash, role)
                       VALUES (%s, %s, %s, 'admin')""",
                    (admin_name, "测试管理员", hash_password(credentials["password"])),
                )

        with asyncio.Runner(loop_factory=asyncio.SelectorEventLoop) as runner:
            runner.run(create_admin())
        call(admin_client, "/auth/login", "POST", {**credentials, "username": admin_name})
        call(admin_client, "/auth/staff-login", "POST", {**credentials, "username": admin_name})
        accounts, _ = call(admin_client, "/admin/users")
        assert all("password_hash" not in account for account in accounts)
        call(admin_client, "/admin/users/" + str(user["id"]), "PATCH", {"is_active": False})
        call(user_client, "/auth/me", expected=401)
        call(user_client, "/auth/login", "POST", credentials, 401)
        call(admin_client, "/admin/users/" + str(user["id"]), "PATCH", {"is_active": True})
        call(user_client, "/auth/login", "POST", credentials)

        async def expire_session():
            async with database() as connection:
                await connection.execute(
                    "UPDATE riglab.sessions SET expires_at = now() - interval '1 second' WHERE user_id = %s",
                    (user["id"],),
                )

        with asyncio.Runner(loop_factory=asyncio.SelectorEventLoop) as runner:
            runner.run(expire_session())
        call(user_client, "/auth/me", expected=401)
        call(user_client, "/auth/register", "POST", {**registration, "role": "admin"}, 422)

        # 命令行重置也使用异步连接，并应撤销现有管理员会话。
        async def reset_admin():
            with patch.object(sys, "argv", ["auth.py", "--reset-password", admin_name]), patch(
                "app.auth.cli.getpass.getpass", return_value="NewPassword2026"
            ):
                await manage_account()

        with asyncio.Runner(loop_factory=asyncio.SelectorEventLoop) as runner:
            runner.run(reset_admin())
        call(admin_client, "/auth/me", expected=401)
        call(
            admin_client, "/auth/staff-login", "POST", {**credentials, "username": admin_name}, 401
        )
        call(
            admin_client,
            "/auth/staff-login",
            "POST",
            {"username": admin_name, "password": "NewPassword2026"},
        )
        with ThreadPoolExecutor(max_workers=8) as executor:
            results = list(executor.map(lambda _: call(build_opener(), "/parts")[0], range(8)))
        assert all(len(parts) == 33 for parts in results)
        print("PASS: auth, staff roles, reset CLI, session revocation, 8 concurrent parts requests")
    finally:
        server.should_exit = True
        thread.join(timeout=5)


if __name__ == "__main__":
    main()
