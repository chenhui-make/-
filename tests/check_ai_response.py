"""模型响应兼容测试。所有 HTTP 请求由 MockTransport 截获。"""

import asyncio
import json
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

from httpx import AsyncClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import httpx
from fastapi import HTTPException
import app.ai.service as ai


def completion(content, reason="stop"):
    return {"choices": [{"finish_reason": reason, "message": {"content": content}}]}


async def run_case(responses, expected=None, expected_error=None):
    calls = []
    real_client = httpx.AsyncClient

    def provider(request):
        calls.append(json.loads(request.content))
        return httpx.Response(200, json=responses[len(calls) - 1])

    settings = ai.Settings(
        enabled=True, base_url="https://api.deepseek.com", model="test-model", api_key="test-key"
    )
    with patch.object(ai, "read_settings", AsyncMock(return_value=settings)), patch.object(
        ai.httpx,
        "AsyncClient",
        side_effect=lambda **kwargs: real_client(transport=httpx.MockTransport(provider), **kwargs),
    ):
        try:
            result = await ai.ask_model("输出 JSON", {"task": "test"})
            assert expected_error is None
            assert result == expected
        except HTTPException as error:
            assert expected_error and expected_error in error.detail, error.detail
    assert all(call["thinking"] == {"type": "disabled"} for call in calls)
    assert calls[0]["max_tokens"] == 4096
    if len(calls) == 2:
        assert calls[1]["max_tokens"] == 8192
    return len(calls)


async def check_stream():
    resume = asyncio.Event()

    class Chunks(httpx.AsyncByteStream):
        async def __aiter__(self):
            for content, reason in [('{"summary":"first', None), (' second"}', "stop")]:
                chunk = {"choices": [{"delta": {"content": content}, "finish_reason": reason}]}
                yield f"data: {json.dumps(chunk)}\n\n".encode()
                await resume.wait()
            yield b"data: [DONE]\n\n"

    def provider(request):
        assert json.loads(request.content)["stream"] is True
        return httpx.Response(200, stream=Chunks())

    async def generate(data, user_id, emit):
        async with httpx.AsyncClient(transport=httpx.MockTransport(provider)) as client:
            completion = await ai.stream_completion(client, "https://test", {}, {}, emit)
            return ai.parse_completion(completion)

    stream = ai.stream_answer(generate, None, 1).body_iterator
    try:
        first = json.loads(await asyncio.wait_for(anext(stream), timeout=2))
        assert first == {"type": "delta", "data": '{"summary":"first'}
        resume.set()
        assert json.loads(await anext(stream)) == {"type": "delta", "data": ' second"}'}
        assert json.loads(await anext(stream)) == {
            "type": "result", "data": {"summary": "first second"}
        }
    finally:
        await stream.aclose()


async def check_follow_up():
    categories = sorted(ai.CORE | {"monitor"})
    parts = [
        {"id": index, "category": category, "name": category, "price": 100}
        for index, category in enumerate(categories, 1)
    ]
    plan = {
        "title": "上一套方案",
        "summary": "2K 游戏，低噪音",
        "selection": {part["category"]: part["id"] for part in parts},
        "strengths": [],
        "limitations": [],
        "suggestions": [],
    }
    previous = {
        "request": {"purpose": "2K 游戏，低噪音", "budget": "6000", "peripherals": ["monitor"]},
        "response": {**plan, "parts": parts, "total": 900},
    }
    data = ai.RecommendationRequest(
        purpose="只换显卡", budget=12000, inherit=["budget", "peripherals"]
    )
    with (
        patch.object(ai, "previous_recommendation", AsyncMock(return_value=previous)) as last,
        patch.object(ai, "conversation_context", AsyncMock(return_value=[])),
        patch.object(ai, "inventory", AsyncMock(return_value=parts)),
        patch.object(ai, "ask_model", AsyncMock(return_value=plan)) as model,
        patch.object(ai, "validate_plan", return_value=({part["category"]: part for part in parts}, 900)),
        patch.object(ai, "save_conversation", AsyncMock()) as save,
    ):
        result = await ai.generate_recommendation(data, 42)
        last.assert_awaited_once_with(42)
        payload = model.await_args.args[1]
        assert payload["previous_recommendation"]["selection"] == plan["selection"]
        assert result["budget"] == 6000 and result["peripherals"] == ["monitor"]
        assert save.await_args.args[2].budget == 6000
        result = await ai.generate_recommendation(data.model_copy(update={"inherit": []}), 42)
        assert result["budget"] == 12000 and result["peripherals"] == []
        await ai.generate_recommendation(data.model_copy(update={"follow_up": False}), 42)
        assert "previous_recommendation" not in model.await_args.args[1]


async def main():
    await check_stream()
    await check_follow_up()
    assert ai.parse_completion(completion('{"ok":true}')) == {"ok": True}
    assert ai.parse_completion(completion('```json\n{"ok": true}\n```')) == {"ok": True}
    assert await run_case([completion('{"ok":true}')], {"ok": True}) == 1
    assert await run_case([completion("   "), completion('{"ok":true}')], {"ok": True}) == 2
    assert (
        await run_case([completion('{"ok":', "length"), completion('{"ok":true}')], {"ok": True})
        == 2
    )
    assert (
        await run_case(
            [completion("not json"), completion("not json")], expected_error="不是完整 JSON"
        )
        == 2
    )
    assert await run_case([completion(None), completion(None)], expected_error="空正文") == 2
    assert (
        await run_case(
            [completion("{}", "length"), completion("{}", "length")], expected_error="长度上限"
        )
        == 2
    )
    assert (
        await run_case([completion("[]"), completion("[]")], expected_error="必须为 JSON 对象") == 2
    )
    print(
        "PASS: follow-up context, live stream, JSON parsing, bounded retry, DeepSeek request parameters"
    )


if __name__ == "__main__":
    with asyncio.Runner(loop_factory=asyncio.SelectorEventLoop) as runner:
        runner.run(main())
