"""统一读取上架配件，供列表接口和 AI 使用。"""
from app.core.database import database


async def list_active_parts():
    async with database() as connection:
        cursor = await connection.execute("""
            SELECT id, category, name, brand, price, spec,
                   socket, ddr, power, watts, tag, chip, purchase_url, purchase_kind
            FROM riglab.parts WHERE status = 'active' ORDER BY id
        """)
        return await cursor.fetchall()
