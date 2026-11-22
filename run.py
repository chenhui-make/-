"""本地开发启动入口：python run.py"""

import getpass
import os

import uvicorn
from app.core.database import database_password

if __name__ == "__main__":
    if not database_password():
        password = getpass.getpass("请输入 PostgreSQL 数据库连接密码（postgres 用户）：")
        if not password:
            raise SystemExit("数据库密码不能为空")
        os.environ["PGPASSWORD"] = password
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        loop="app.core.database:selector_loop_factory",
    )
