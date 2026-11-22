"""配件列表 API。"""
import psycopg
from fastapi import APIRouter, HTTPException, Response
from .service import list_active_parts

router = APIRouter()

@router.get("/api/parts")
async def list_parts(response: Response):
    response.headers["Cache-Control"] = "no-store"
    try:
        parts = await list_active_parts()

        # 前端需要用价格进行加法计算，明确返回 JSON 数字。
        for part in parts:
            part["price"] = float(part["price"])

        return parts

    except psycopg.Error as exc:
        raise HTTPException(
            status_code=503,
            detail="数据库连接或查询失败，请检查后端终端日志",
        ) from exc


from decimal import Decimal
from typing import Literal
from urllib.parse import urlparse
from pydantic import BaseModel, Field, field_validator
from fastapi import Depends
from app.auth.service import administrator, same_origin
from app.core.database import database

class PartInput(BaseModel):
    category: Literal['cpu','gpu','board','ssd','ram','fan','psu','case','monitor','keyboard','mouse','headset','speaker']
    name: str = Field(min_length=1,max_length=100)
    brand: str = Field(min_length=1,max_length=40)
    price: Decimal = Field(gt=0,le=999999,max_digits=10,decimal_places=2)
    spec: str = Field(min_length=1,max_length=200)
    status: Literal['active','inactive'] = 'active'
    socket: str | None = None
    ddr: str | None = None
    power: int | None = Field(default=None,gt=0)
    watts: int | None = Field(default=None,gt=0)
    chip: str | None = None
    tag: str | None = None
    purchase_url: str = Field(max_length=2048)
    purchase_kind: Literal['search','product'] = 'search'

    @field_validator('name','brand','spec')
    @classmethod
    def nonblank(cls,v):
        if not v.strip(): raise ValueError('不能为空')
        return v.strip()

    @field_validator('purchase_url')
    @classmethod
    def safe_url(cls,v):
        p=urlparse(v)
        if p.scheme != 'https' or not p.hostname or p.username or p.password or any(c.isspace() for c in v):
            raise ValueError('请填写完整 HTTPS 购买链接')
        return v

@router.get('/api/admin/parts', dependencies=[Depends(administrator)])
async def admin_parts(response: Response):
    response.headers['Cache-Control']='no-store'
    async with database() as conn:
        return await (await conn.execute('SELECT * FROM riglab.parts ORDER BY id')).fetchall()

@router.put('/api/admin/parts/{part_id}', dependencies=[Depends(administrator), Depends(same_origin)])
async def save_part(part_id: int, data: PartInput):
    values=data.model_dump()
    fields=list(values)
    try:
        async with database() as conn:
            if part_id == 0:
                sql='INSERT INTO riglab.parts ('+','.join(fields)+') VALUES ('+','.join(['%s']*len(fields))+') RETURNING *'
                params=list(values.values())
            else:
                sql='UPDATE riglab.parts SET '+','.join(k+'=%s' for k in fields)+' WHERE id=%s RETURNING *'
                params=[*values.values(),part_id]
            result=await (await conn.execute(sql,params)).fetchone()
            if result is None: raise HTTPException(404,'商品不存在')
            return result
    except psycopg.errors.UniqueViolation as exc:
        raise HTTPException(409,'该品牌型号已存在') from exc
