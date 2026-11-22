"""幂等扩充商品；保留现有商品价格、状态和人工设置的购买链接。"""
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlencode
import psycopg
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.core.database import database_password

def main():
    rows = json.loads((ROOT / 'data/popular_parts.json').read_text(encoding='utf-8'))
    with psycopg.connect(host=os.getenv('PGHOST', '127.0.0.1'), port=os.getenv('PGPORT','5432'), dbname=os.getenv('PGDATABASE','RIGLAB'), user=os.getenv('PGUSER','postgres'), password=database_password(), connect_timeout=5) as conn:
        conn.execute('ALTER TABLE riglab.parts ADD COLUMN IF NOT EXISTS purchase_url text')
        conn.execute("ALTER TABLE riglab.parts ADD COLUMN IF NOT EXISTS purchase_kind text DEFAULT 'search'")
        conn.execute("SELECT setval(pg_get_serial_sequence('riglab.parts','id'), GREATEST(COALESCE((SELECT max(id) FROM riglab.parts), 999), 999), true)")
        fields = ['category','brand','name','price','spec','socket','ddr','power','watts','chip']
        for row in rows:
            conn.execute('INSERT INTO riglab.parts (' + ','.join(fields) + ') VALUES (' + ','.join(['%s']*len(fields)) + ') ON CONFLICT DO NOTHING', [row.get(k) for k in fields])
        for part_id,brand,name in conn.execute("SELECT id,brand,name FROM riglab.parts WHERE purchase_url IS NULL OR btrim(purchase_url) = ''").fetchall():
            url = 'https://search.jd.com/Search?' + urlencode({'keyword': brand + ' ' + name, 'enc':'utf-8'})
            conn.execute("UPDATE riglab.parts SET purchase_url=%s,purchase_kind='search' WHERE id=%s", (url,part_id))
        print(conn.execute("SELECT category,count(*) FROM riglab.parts WHERE status='active' GROUP BY category ORDER BY category").fetchall())
if __name__ == '__main__':
    main()
