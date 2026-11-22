"""共享数据库连接与 Windows 异步事件循环。"""
import asyncio
import os
from contextlib import asynccontextmanager
import psycopg
from psycopg.rows import dict_row
from fastapi import HTTPException

LOCAL_DATABASE_PASSWORD = "Hhdsg12021109."


def database_password():
    return os.getenv("PGPASSWORD") or LOCAL_DATABASE_PASSWORD


def selector_loop_factory():
    """供 Uvicorn 使用，兼容 Windows 上的 Psycopg 异步连接。"""
    return asyncio.SelectorEventLoop()


@asynccontextmanager
async def database():
    if not database_password():
        raise HTTPException(
            503, "未设置数据库密码 PGPASSWORD，请使用 python run.py 启动并输入数据库密码"
        )
    try:
        async with await psycopg.AsyncConnection.connect(
            host=os.getenv("PGHOST", "127.0.0.1"),
            port=os.getenv("PGPORT", "5432"),
            dbname=os.getenv("PGDATABASE", "RIGLAB"),
            user=os.getenv("PGUSER", "postgres"),
            password=database_password(),
            connect_timeout=5,
            row_factory=dict_row,
        ) as connection:
            yield connection
    except psycopg.errors.InvalidPassword as exc:
        raise HTTPException(
            503, "PostgreSQL 数据库账号或密码错误，请检查 PGUSER 和 PGPASSWORD"
        ) from exc
    except psycopg.errors.InvalidCatalogName as exc:
        raise HTTPException(503, "数据库不存在，请检查 PGDATABASE，默认值为 RIGLAB") from exc
    except psycopg.errors.UndefinedTable as exc:
        raise HTTPException(
            503, "数据库表不存在，请在 RIGLAB 中执行 sql/database.sql 和 sql/auth.sql"
        ) from exc
    except psycopg.OperationalError as exc:
        # 连接阶段的部分错误没有 sqlstate，具体原因保留在后端异常链中。
        raise HTTPException(
            503, "数据库连接失败，请检查 PostgreSQL 服务、地址、端口及数据库账号密码"
        ) from exc
    except psycopg.ProgrammingError as exc:
        raise HTTPException(503, "数据库查询失败，请检查表结构与后端终端日志") from exc

