"""AI 配置、推荐和点评的数据结构。"""
from decimal import Decimal
from typing import Literal
from urllib.parse import urlsplit
from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator

CORE = {"cpu", "gpu", "board", "ssd", "ram", "fan", "psu", "case"}
Peripheral = Literal["monitor", "keyboard", "mouse", "headset", "speaker"]
Category = Literal[
    "cpu",
    "gpu",
    "board",
    "ssd",
    "ram",
    "fan",
    "psu",
    "case",
    "monitor",
    "keyboard",
    "mouse",
    "headset",
    "speaker",
]

class Settings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool = False
    base_url: str = Field(default="", max_length=500)
    model: str = Field(default="", max_length=100)
    api_key: SecretStr = SecretStr("")

    @field_validator("base_url")
    @classmethod
    def validate_url(cls, value):
        value = value.strip().rstrip("/")
        if not value:
            return value
        url = urlsplit(value)
        if url.username or url.password or url.query or url.fragment:
            raise ValueError("服务地址不能包含账号、密码、查询参数或片段")
        local_http = url.scheme == "http" and url.hostname in ("127.0.0.1", "localhost", "::1")
        if not url.hostname or (url.scheme != "https" and not local_http):
            raise ValueError("请填写 HTTPS 地址，本地模型可使用 HTTP 本机地址")
        return value


class Requirements(BaseModel):
    model_config = ConfigDict(extra="forbid")
    purpose: str = Field(min_length=2, max_length=1000)
    budget: Decimal = Field(gt=0, le=1000000, max_digits=12, decimal_places=2)
    peripherals: list[Peripheral] = Field(default_factory=list, max_length=5)


class RecommendationRequest(Requirements):
    follow_up: bool = True
    inherit: list[Literal["budget", "peripherals"]] = Field(default_factory=list, max_length=2)


class ReviewRequest(Requirements):
    selection: dict[Category, int] = Field(min_length=1, max_length=13)


class Plan(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    summary: str = Field(min_length=1, max_length=2000)
    selection: dict[Category, int] = Field(min_length=1, max_length=13)
    strengths: list[str] = Field(max_length=8)
    limitations: list[str] = Field(max_length=8)
    suggestions: list[str] = Field(max_length=8)


class Commentary(BaseModel):
    summary: str = Field(min_length=1, max_length=2000)
    strengths: list[str] = Field(max_length=8)
    limitations: list[str] = Field(max_length=8)
    suggestions: list[str] = Field(max_length=8)

