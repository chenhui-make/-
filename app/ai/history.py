"""按账号存储已完成的 AI 对话，并为后续请求提取上下文。"""
import re

from fastapi.encoders import jsonable_encoder
from psycopg.types.json import Jsonb

from app.core.database import database
from app.core.paths import PROJECT_ROOT

HISTORY_LIMIT = 150
RECENT_LIMIT = 6
RELATED_LIMIT = 4
SCHEMA = PROJECT_ROOT / "sql" / "ai-history.sql"


async def initialize_history(connection):
    await connection.execute("SELECT pg_advisory_xact_lock(hashtext('riglab.ai_conversations'))")
    await connection.execute(SCHEMA.read_text(encoding="utf-8"))


def terms(text):
    words = set(re.findall(r"[a-z0-9]{2,}", text.lower()))
    for segment in re.findall(r"[\u3400-\u9fff]+", text):
        words.update(segment[i:i + 2] for i in range(len(segment) - 1))
    return words


async def previous_recommendation(user_id):
    async with database() as connection:
        cursor = await connection.execute(
            """SELECT request, response FROM riglab.ai_conversations AS history
               WHERE user_id = %s AND kind = 'recommend'
                 AND EXISTS (SELECT 1 FROM riglab.users WHERE id = history.user_id AND ai_memory_enabled)
               ORDER BY id DESC LIMIT 1""",
            (user_id,),
        )
        return await cursor.fetchone()


async def conversation_context(user_id, purpose):
    async with database() as connection:
        cursor = await connection.execute(
            """SELECT id, kind, request, response->>'summary' AS summary,
                      response->'selection' AS selection, response->>'total' AS total
               FROM riglab.ai_conversations AS history WHERE user_id = %s
                 AND EXISTS (SELECT 1 FROM riglab.users WHERE id = history.user_id AND ai_memory_enabled)
               ORDER BY id DESC LIMIT %s""",
            (user_id, HISTORY_LIMIT),
        )
        rows = await cursor.fetchall()

    query = terms(purpose)
    related = []
    for row in rows[RECENT_LIMIT:]:
        keywords = terms(row["request"]["purpose"] + " " + row["summary"])
        score = len(query & keywords)
        if score:
            related.append((score, row["id"], row))
    matches = [row for _, _, row in sorted(related, reverse=True)[:RELATED_LIMIT]]
    return [
        {
            "kind": row["kind"],
            "request": row["request"] if row is rows[0] else {
                **row["request"], "purpose": row["request"]["purpose"][:600]
            },
            "summary": row["summary"] if row is rows[0] else row["summary"][:800],
            "selection": row["selection"],
            "total": row["total"],
        }
        for row in sorted(rows[:RECENT_LIMIT] + matches, key=lambda row: row["id"])
    ]


async def save_conversation(user_id, kind, request, response):
    async with database() as connection:
        # 每个账号的写入和清理在同一事务内串行执行。
        cursor = await connection.execute(
            "SELECT ai_memory_enabled FROM riglab.users WHERE id = %s FOR NO KEY UPDATE", (user_id,)
        )
        account = await cursor.fetchone()
        if not account or not account["ai_memory_enabled"]:
            return
        await connection.execute(
            """INSERT INTO riglab.ai_conversations (user_id, kind, request, response)
               VALUES (%s, %s, %s, %s)""",
            (user_id, kind, Jsonb(jsonable_encoder(request)), Jsonb(jsonable_encoder(response))),
        )
        await connection.execute(
            """DELETE FROM riglab.ai_conversations
               WHERE user_id = %s AND id <= (
                   SELECT id FROM riglab.ai_conversations WHERE user_id = %s
                   ORDER BY id DESC OFFSET %s LIMIT 1
               )""",
            (user_id, user_id, HISTORY_LIMIT),
        )
