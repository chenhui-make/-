"""结构调整回归：路由契约、静态资源、配件接口及匿名访问。无需数据库。"""
import ast
import asyncio
import json
import re
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import httpx
from main import app
from app.parts import router as parts_router


def check_routes():
    actual = []
    for path in (ROOT / 'app').rglob('*.py'):
        for node in ast.parse(path.read_text(encoding='utf-8')).body:
            for decorator in getattr(node, 'decorator_list', []):
                if (isinstance(decorator, ast.Call)
                        and isinstance(decorator.func, ast.Attribute)
                        and decorator.func.attr in {'get', 'post', 'put', 'patch'}):
                    actual.append(ast.unparse(decorator).replace('router.', 'app.', 1))
    expected = json.loads((ROOT / 'tests/route_contract.json').read_text(encoding='utf-8'))
    assert sorted(actual) == sorted(s.replace('router.', 'app.', 1) for s in expected)


async def main():
    check_routes()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url='http://test') as client:
        for page in (ROOT / 'dist').glob('*.html'):
            response = await client.get('/' + page.name)
            assert response.status_code == 200, page
            for ref in re.findall(r'(?:src|href)="([^"]+)"', response.text):
                if ref.startswith('assets/'):
                    assert (await client.get('/' + ref)).status_code == 200, ref
        assert (await client.get('/api/auth/me')).status_code == 401
        assert (await client.get('/api/admin/users')).status_code == 401
        assert (await client.post('/api/ai/recommend', json={
            'purpose': '游戏', 'budget': 10000, 'peripherals': []
        })).status_code == 401
        with patch.object(parts_router, 'list_active_parts', AsyncMock(return_value=[{
            'id': 1, 'price': __import__('decimal').Decimal('1999.50')
        }])):
            response = await client.get('/api/parts')
            assert response.json() == [{'id': 1, 'price': 1999.5}]
            assert response.headers['cache-control'] == 'no-store'
    print('PASS: route contract, HTML/assets, anonymous permissions, parts serialization')


if __name__ == '__main__':
    with asyncio.Runner(loop_factory=asyncio.SelectorEventLoop) as runner:
        runner.run(main())
