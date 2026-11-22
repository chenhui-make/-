"""PostgreSQL 用户认证。初始化管理员：python auth.py"""

import asyncio
import secrets

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Request, Response

from app.core.database import database
from .schemas import Login, PasswordChange, ProfileSettings, Registration, UserStatus
from .security import hash_password, verify_password, token_hash

COOKIE = "riglab_session"
router = APIRouter(prefix="/api")


DUMMY_HASH = hash_password(secrets.token_urlsafe(32))


async def same_origin(request: Request):
    origin = request.headers.get("origin")
    if origin and origin != str(request.base_url).rstrip("/"):
        raise HTTPException(403, "请求来源不匹配")


def public_user(user):
    return {**{key: user[key] for key in ("id", "username", "nickname", "role")}, "avatar": user.get("avatar")}


async def issue_session(connection, user, request, response):
    old_token = request.cookies.get(COOKIE)
    if old_token:
        await connection.execute(
            "DELETE FROM riglab.sessions WHERE token_hash = %s", (token_hash(old_token),)
        )
    token = secrets.token_urlsafe(32)
    await connection.execute(
        """INSERT INTO riglab.sessions(token_hash, user_id, expires_at)
           VALUES (%s, %s, now() + interval '4 hours')""",
        (token_hash(token), user["id"]),
    )
    response.set_cookie(
        COOKIE,
        token,
        max_age=14400,
        httponly=True,
        secure=request.url.scheme == "https",
        samesite="lax",
        path="/",
    )
    response.headers["Cache-Control"] = "no-store"
    return public_user(user)


async def current_user(request: Request):
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(401, "请先登录")
    async with database() as connection:
        cursor = await connection.execute(
            """SELECT u.id, u.username, u.nickname, u.role
               FROM riglab.sessions s JOIN riglab.users u ON u.id = s.user_id
               WHERE s.token_hash = %s AND s.expires_at > now() AND u.is_active""",
            (token_hash(token),),
        )
        user = await cursor.fetchone()
    if not user:
        raise HTTPException(401, "登录已过期，请重新登录")
    return user


async def administrator(user=Depends(current_user)):
    if user["role"] != "admin":
        raise HTTPException(403, "需要管理员权限")
    return user


@router.post("/auth/register", status_code=201, dependencies=[Depends(same_origin)])
async def register(data: Registration, request: Request, response: Response):
    if data.password != data.confirm_password:
        raise HTTPException(422, "两次输入的密码不一致")
    nickname = data.nickname.strip()
    if not nickname:
        raise HTTPException(422, "昵称不能为空")
    password_hash = await asyncio.to_thread(hash_password, data.password)
    try:
        async with database() as connection:
            cursor = await connection.execute(
                """INSERT INTO riglab.users(username, nickname, password_hash, avatar)
                   VALUES (%s, %s, %s, %s) RETURNING id, username, nickname, role, avatar""",
                (data.username.lower(), nickname, password_hash, data.avatar),
            )
            user = await cursor.fetchone()
            return await issue_session(connection, user, request, response)
    except psycopg.errors.UniqueViolation as exc:
        raise HTTPException(409, "账号已存在") from exc


@router.post("/auth/login", dependencies=[Depends(same_origin)])
async def login(data: Login, request: Request, response: Response):
    return await authenticate(data, request, response)


@router.post("/auth/staff-login", dependencies=[Depends(same_origin)])
async def staff_login(data: Login, request: Request, response: Response):
    return await authenticate(data, request, response, admin_only=True)


async def authenticate(data: Login, request: Request, response: Response, admin_only=False):
    async with database() as connection:
        cursor = await connection.execute(
            "SELECT * FROM riglab.users WHERE lower(username) = %s FOR SHARE",
            (data.username.lower(),),
        )
        user = await cursor.fetchone()
        valid = await asyncio.to_thread(
            verify_password, data.password, user["password_hash"] if user else DUMMY_HASH
        )
        if not valid or not user or not user["is_active"]:
            raise HTTPException(401, "账号或密码错误")
        if admin_only and user["role"] != "admin":
            raise HTTPException(403, "该账户没有后台管理权限")
        return await issue_session(connection, user, request, response)


@router.get("/auth/me")
async def me(response: Response, user=Depends(current_user)):
    response.headers["Cache-Control"] = "no-store"
    async with database() as connection:
        cursor = await connection.execute(
            "SELECT avatar, ai_memory_enabled FROM riglab.users WHERE id = %s", (user["id"],)
        )
        profile = await cursor.fetchone()
    if not profile:
        raise HTTPException(401, "请重新登录")
    return {**public_user({**user, **profile}), "ai_memory_enabled": profile["ai_memory_enabled"]}


@router.patch("/auth/profile", dependencies=[Depends(same_origin)])
async def update_profile(data: ProfileSettings, user=Depends(current_user)):
    nickname = data.nickname.strip() if data.nickname is not None else None
    if nickname == "":
        raise HTTPException(422, "昵称不能为空")
    async with database() as connection:
        cursor = await connection.execute(
            """UPDATE riglab.users SET nickname = COALESCE(%s, nickname),
                   ai_memory_enabled = COALESCE(%s, ai_memory_enabled)
               WHERE id = %s AND is_active RETURNING nickname, ai_memory_enabled""",
            (nickname, data.ai_memory_enabled, user["id"]),
        )
        profile = await cursor.fetchone()
    if not profile:
        raise HTTPException(401, "请重新登录")
    return profile


@router.put("/auth/password", dependencies=[Depends(same_origin)])
async def change_password(data: PasswordChange, request: Request, user=Depends(current_user)):
    if data.current_password == data.new_password:
        raise HTTPException(422, "新密码必须与当前密码不同")
    async with database() as connection:
        cursor = await connection.execute(
            "SELECT password_hash FROM riglab.users WHERE id = %s AND is_active FOR NO KEY UPDATE",
            (user["id"],),
        )
        account = await cursor.fetchone()
        if not account or not await asyncio.to_thread(verify_password, data.current_password, account["password_hash"]):
            raise HTTPException(400, "当前密码不正确")
        password_hash = await asyncio.to_thread(hash_password, data.new_password)
        await connection.execute(
            "UPDATE riglab.users SET password_hash = %s WHERE id = %s", (password_hash, user["id"])
        )
        await connection.execute(
            "DELETE FROM riglab.sessions WHERE user_id = %s AND token_hash <> %s",
            (user["id"], token_hash(request.cookies[COOKIE])),
        )
    return {"ok": True}


@router.post("/auth/logout", dependencies=[Depends(same_origin)])
async def logout(request: Request, response: Response):
    token = request.cookies.get(COOKIE)
    if token:
        async with database() as connection:
            await connection.execute(
                "DELETE FROM riglab.sessions WHERE token_hash = %s", (token_hash(token),)
            )
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@router.get("/admin/users")
async def users(response: Response, user=Depends(administrator)):
    response.headers["Cache-Control"] = "no-store"
    async with database() as connection:
        cursor = await connection.execute(
            """SELECT id, username, nickname, role, is_active, created_at
               FROM riglab.users ORDER BY id"""
        )
        return await cursor.fetchall()


@router.patch("/admin/users/{user_id}", dependencies=[Depends(same_origin)])
async def update_status(user_id: int, data: UserStatus, user=Depends(administrator)):
    # 管理员账号由命令行维护，避免通过此接口锁定所有管理员。
    async with database() as connection:
        cursor = await connection.execute(
            """UPDATE riglab.users SET is_active = %s
               WHERE id = %s AND role = 'user' RETURNING id, is_active""",
            (data.is_active, user_id),
        )
        result = await cursor.fetchone()
        if not result:
            raise HTTPException(404, "普通用户不存在")
        if not data.is_active:
            await connection.execute("DELETE FROM riglab.sessions WHERE user_id = %s", (user_id,))
        return result


