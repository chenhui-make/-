from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from app.core.database import database
from app.core.paths import FRONTEND_DIR
from app.auth.service import router as auth_router
from app.parts.router import router as parts_router
from app.ai.service import router as ai_router
from app.ai.history import initialize_history


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        async with database() as connection:
            cursor = await connection.execute("SELECT current_database() AS name")
            connected = await cursor.fetchone()
            await initialize_history(connection)
            await connection.execute("ALTER TABLE riglab.users ADD COLUMN IF NOT EXISTS avatar text")
            await connection.execute(
                "ALTER TABLE riglab.users ADD COLUMN IF NOT EXISTS ai_memory_enabled boolean NOT NULL DEFAULT true"
            )
    except HTTPException as exc:
        logging.getLogger("uvicorn.error").error("数据库启动检查失败：%s", exc.detail)
        raise RuntimeError(exc.detail) from exc
    logging.getLogger("uvicorn.error").info("数据库连接成功：%s", connected["name"])
    yield


app = FastAPI(lifespan=lifespan)
app.include_router(auth_router)
app.include_router(ai_router)
app.include_router(parts_router)


# 放在 API 路由后面，让 FastAPI 同时提供 dist 中的网页。
app.mount(
    "/",
    StaticFiles(directory=str(FRONTEND_DIR), html=True),
    name="frontend",
)
