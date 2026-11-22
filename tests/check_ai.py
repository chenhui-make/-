"""临时数据库集成测试，AI 服务使用模拟响应，避免调用真实服务。"""

import asyncio
import json
import os
import sys
import tempfile
import uuid
from pathlib import Path
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import httpx
import app.ai.service as ai
from app.ai.history import initialize_history
from app.core.database import database
from main import app


async def main():
    assert os.getenv("RIGLAB_TEST_DATABASE") == "1"
    assert os.getenv("PGPORT") == "55439"
    async with database() as connection:
        await initialize_history(connection)
    selection = {
        "cpu": 2,
        "gpu": 5,
        "board": 9,
        "ssd": 12,
        "ram": 14,
        "fan": 17,
        "psu": 20,
        "case": 22,
    }
    plan = {
        "title": "游戏方案",
        "summary": "优先满足 2K 游戏与日常使用。",
        "selection": selection,
        "strengths": ["搭配均衡"],
        "limitations": ["实际表现需按软件和设置核实"],
        "suggestions": ["核对机箱散热空间"],
    }
    requirement = {"purpose": "主要玩 2K 游戏", "budget": 12000, "peripherals": []}
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post("/api/ai/recommend", json=requirement)
        assert response.status_code == 401
        username = f"139{uuid.uuid4().int % 10**8:08d}"
        response = await client.post(
            "/api/auth/register",
            json={
                "username": username,
                "password": "Password2026",
                "confirm_password": "Password2026",
                "nickname": "AI 测试",
            },
        )
        assert response.status_code == 201
        user_id = response.json()["id"]
        with tempfile.TemporaryDirectory() as directory, patch.object(
            ai, "CONFIG_PATH", Path(directory) / "ai-settings.json"
        ):
            assert (await client.get("/api/ai/status")).json() == {"configured": False}
            assert (await client.get("/api/admin/ai-settings")).status_code == 403
            assert (await client.post("/api/ai/recommend", json=requirement)).status_code == 503
            async with database() as connection:
                await connection.execute(
                    "UPDATE riglab.users SET role='admin' WHERE id=%s", (user_id,)
                )
            settings = {
                "enabled": True,
                "base_url": "https://example.com/v1",
                "model": "test-model",
                "api_key": "test-private-key",
            }
            response = await client.put("/api/admin/ai-settings", json=settings)
            assert response.status_code == 200 and "api_key" not in response.json()
            assert "test-private-key" not in response.text
            assert (await client.get("/api/ai/status")).json() == {"configured": True}
            response = await client.put("/api/admin/ai-settings", json={**settings, "api_key": ""})
            assert response.json()["has_api_key"]
            assert (await ai.read_settings()).api_key.get_secret_value() == settings["api_key"]
            assert (
                await client.put(
                    "/api/admin/ai-settings",
                    json={
                        **settings,
                        "base_url": "http://example.com",
                    },
                )
            ).status_code == 422

            with patch.object(ai, "ask_model", AsyncMock(return_value=plan)) as model:
                response = await client.post("/api/ai/recommend", json=requirement)
                assert response.status_code == 200, response.text
                data = response.json()
                assert data["selection"] == selection
                assert float(data["total"]) <= requirement["budget"]
                assert len(data["parts"]) == 8
            validation = {**requirement, "selection": selection}
            assert (await client.post("/api/ai/validate", json=validation)).status_code == 200
            assert (
                await client.post(
                    "/api/ai/validate",
                    json={
                        **validation,
                        "budget": 100,
                    },
                )
            ).status_code == 409
            bad = {**selection, "cpu": 999999}
            assert (
                await client.post(
                    "/api/ai/validate",
                    json={
                        **validation,
                        "selection": bad,
                    },
                )
            ).status_code == 409
            incompatible = {**selection, "board": 8}
            assert (
                await client.post(
                    "/api/ai/validate",
                    json={
                        **validation,
                        "selection": incompatible,
                    },
                )
            ).status_code == 409
            # 无效模型方案只能重试一次，不能直接套用。
            with patch.object(
                ai, "ask_model", AsyncMock(return_value={**plan, "selection": bad})
            ) as model:
                assert (await client.post("/api/ai/recommend", json=requirement)).status_code == 502
                assert model.await_count == 2
            with patch.object(
                ai, "ask_model", AsyncMock(side_effect=[{**plan, "selection": incompatible}, plan])
            ):
                assert (await client.post("/api/ai/recommend", json=requirement)).status_code == 200
            commentary = {
                key: value for key, value in plan.items() if key not in ("title", "selection")
            }
            with patch.object(ai, "ask_model", AsyncMock(return_value=commentary)) as model:
                response = await client.post(
                    "/api/ai/review",
                    json={
                        **validation,
                        "selection": incompatible,
                    },
                )
                assert response.status_code == 200 and response.json()["warnings"]
                history = model.await_args.args[1]["conversation_history"]
                assert history[-1]["kind"] == "recommend"
                assert history[-1]["summary"] == plan["summary"]
                assert (
                    await client.post(
                        "/api/ai/review",
                        json={
                            **validation,
                            "selection": {"cpu": 2},
                        },
                    )
                ).json()["warnings"]
            async with database() as connection:
                await connection.execute(
                    """INSERT INTO riglab.ai_conversations (user_id, kind, request, response)
                       SELECT %s, 'review', '{"purpose":"旧问题"}', '{"summary":"旧回答"}'
                       FROM generate_series(1, 150)""",
                    (user_id,),
                )
            await ai.save_conversation(user_id, "review", requirement, commentary)
            async with database() as connection:
                cursor = await connection.execute(
                    "SELECT count(*) AS count FROM riglab.ai_conversations WHERE user_id = %s",
                    (user_id,),
                )
                assert (await cursor.fetchone())["count"] == 150
            # 已下架配件不能通过应用前校验。
            async with database() as connection:
                await connection.execute("UPDATE riglab.parts SET status='inactive' WHERE id=2")
            try:
                assert (await client.post("/api/ai/validate", json=validation)).status_code == 409
            finally:
                async with database() as connection:
                    await connection.execute("UPDATE riglab.parts SET status='active' WHERE id=2")

    # 检查真实 HTTP 适配器请求格式；响应由 MockTransport 提供。
    real_client = httpx.AsyncClient

    def provider(request):
        assert request.url == "https://example.com/v1/chat/completions"
        assert request.headers["Authorization"] == "Bearer test-key"
        assert json.loads(request.content)["model"] == "test-model"
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"ok": true}'}}]})

    with patch.object(
        ai,
        "read_settings",
        AsyncMock(
            return_value=ai.Settings(
                enabled=True,
                base_url="https://example.com/v1",
                model="test-model",
                api_key="test-key",
            )
        ),
    ), patch.object(
        ai.httpx,
        "AsyncClient",
        side_effect=lambda **kwargs: real_client(transport=httpx.MockTransport(provider), **kwargs),
    ):
        assert await ai.ask_model("输出 JSON", {}) == {"ok": True}
    print(
        "PASS: AI auth, configuration, secret masking, recommendation, budget, compatibility, review, apply validation, provider adapter"
    )


if __name__ == "__main__":
    with asyncio.Runner(loop_factory=asyncio.SelectorEventLoop) as runner:
        runner.run(main())
