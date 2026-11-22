import asyncio,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from urllib.parse import urlparse,parse_qs
import httpx
from app.main import app
from app.parts.router import PartInput
from pydantic import ValidationError
from contextlib import asynccontextmanager
from unittest.mock import patch
from app.core.database import database
from app.parts import router as parts_router
from app.auth.service import administrator

async def main():
 async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as client:
  r=await client.get('/api/parts'); assert r.status_code==200,r.text
  rows=r.json();assert len(rows)>=130
  for p in rows:
   assert isinstance(p['price'],(int,float))
   assert urlparse(p['purchase_url']).scheme=='https'
   if p['purchase_kind']=='search': assert p['name'] in parse_qs(urlparse(p['purchase_url']).query)['keyword'][0]
  assert (await client.get('/api/admin/parts')).status_code==401
  assert (await client.put('/api/admin/parts/0',json={})).status_code==401
  p=rows[0]
  for url in ['javascript:alert(1)','http://example.com','https://user:password@example.com']:
   try: PartInput(**{**p,'purchase_url':url})
   except ValidationError: pass
   else: raise AssertionError(url)
  async with database() as conn:
   async with conn.transaction(force_rollback=True):
    @asynccontextmanager
    async def transaction_database():
     yield conn
    app.dependency_overrides[administrator] = lambda: {'id':0,'role':'admin'}
    try:
     with patch.object(parts_router,'database',transaction_database):
      payload=dict(category='cpu',name='__purchase_integration_test__',brand='Test',price=100,spec='test',purchase_url='https://item.jd.com/123.html',purchase_kind='product')
      created=await client.put('/api/admin/parts/0',json=payload)
      assert created.status_code==200,created.text
      part_id=created.json()['id']
      payload.update(status='inactive',purchase_url='https://item.jd.com/456.html')
      updated=await client.put('/api/admin/parts/'+str(part_id),json=payload)
      assert updated.status_code==200,updated.text
      assert updated.json()['status']=='inactive'
      stored=await (await conn.execute('SELECT purchase_url FROM riglab.parts WHERE id=%s',(part_id,))).fetchone()
      assert stored['purchase_url']==payload['purchase_url']
    finally: app.dependency_overrides.clear()
  print('PASS: database create/update rolled back; ',len(rows),'active products, purchase links, numeric prices, admin access, unsafe URL rejection')
with asyncio.Runner(loop_factory=asyncio.SelectorEventLoop) as runner: runner.run(main())
