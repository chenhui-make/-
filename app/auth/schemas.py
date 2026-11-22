"""认证及用户管理请求结构。"""
import base64
import binascii

from pydantic import BaseModel, ConfigDict, Field
from pydantic import field_validator

class Login(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9_]+$")
    password: str = Field(min_length=8, max_length=128)


class Registration(Login):
    username: str = Field(pattern=r"^1[3-9][0-9]{9}$")
    nickname: str = Field(min_length=1, max_length=20)
    confirm_password: str = Field(min_length=8, max_length=128)
    avatar: str | None = None

    @field_validator("avatar")
    @classmethod
    def validate_avatar(cls, value):
        if value is None:
            return value
        prefix = "data:image/jpeg;base64,"
        if value.startswith(prefix) and len(value) <= 175000:
            try:
                data = base64.b64decode(value[len(prefix):], validate=True)
            except binascii.Error:
                pass
            else:
                if len(data) <= 128 * 1024 and data.startswith(b"\xff\xd8\xff") and data.endswith(b"\xff\xd9"):
                    return value
        raise ValueError("头像格式无效或超过 128 KB")


class ProfileSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    nickname: str | None = Field(default=None, min_length=1, max_length=20)
    ai_memory_enabled: bool | None = None


class PasswordChange(BaseModel):
    model_config = ConfigDict(extra="forbid")
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class UserStatus(BaseModel):
    model_config = ConfigDict(extra="forbid")
    is_active: bool

