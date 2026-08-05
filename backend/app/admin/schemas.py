from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


ProviderPreset = Literal["openai", "deepseek", "minimax", "glm", "custom"]
UsageOutcome = Literal["success", "error", "timeout", "cancelled"]


def validate_model_id(value: str) -> str:
    if value != value.strip() or not value or len(value) > 200:
        raise ValueError("model IDs must contain between 1 and 200 non-padding characters")
    if any(character.isspace() or ord(character) < 32 for character in value):
        raise ValueError("model IDs cannot contain whitespace or control characters")
    return value


class ProviderCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=80)
    preset: ProviderPreset = "custom"
    base_url: str = Field(min_length=1, max_length=2048)
    api_key: str = Field(min_length=1, max_length=8192)
    models: list[str] = Field(default_factory=list, max_length=200)
    is_enabled: bool = True

    @field_validator("models")
    @classmethod
    def validate_models(cls, values: list[str]) -> list[str]:
        return list(dict.fromkeys(validate_model_id(value) for value in values))


class ProviderUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str | None = Field(default=None, min_length=1, max_length=80)
    preset: ProviderPreset | None = None
    base_url: str | None = Field(default=None, min_length=1, max_length=2048)
    api_key: str | None = Field(default=None, max_length=8192)
    models: list[str] | None = Field(default=None, max_length=200)
    is_enabled: bool | None = None

    @field_validator("models")
    @classmethod
    def validate_models(cls, values: list[str] | None) -> list[str] | None:
        if values is None:
            return None
        return list(dict.fromkeys(validate_model_id(value) for value in values))


class ProviderRecord(BaseModel):
    id: str
    name: str
    preset: ProviderPreset
    base_url: str
    api_key_last4: str
    has_api_key: bool
    models: list[str]
    active_model: str | None
    is_enabled: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime


class RuntimeProvider(BaseModel):
    id: str
    name: str
    preset: ProviderPreset
    base_url: str
    api_key: str
    active_model: str | None


class ConnectionTestResult(BaseModel):
    ok: bool
    model: str
    latency_ms: int = Field(ge=0)
    input_tokens: int = Field(ge=0)
    output_tokens: int = Field(ge=0)


class UsageRecord(BaseModel):
    occurred_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    endpoint: str = Field(min_length=1, max_length=80)
    provider_id: str | None = None
    provider_name: str = Field(min_length=1, max_length=80)
    model: str = Field(min_length=1, max_length=200)
    outcome: UsageOutcome
    latency_ms: int = Field(ge=0)
    input_tokens: int = Field(ge=0)
    output_tokens: int = Field(ge=0)
    request_id: str = Field(min_length=1, max_length=128)


class UsageGroup(BaseModel):
    provider_name: str
    model: str
    total_requests: int
    successful_requests: int
    failed_requests: int
    success_rate: float
    average_latency_ms: float
    input_tokens: int
    output_tokens: int


class UsageSummary(BaseModel):
    window: Literal["24h", "7d", "30d"]
    total_requests: int
    successful_requests: int
    failed_requests: int
    success_rate: float
    average_latency_ms: float
    input_tokens: int
    output_tokens: int
    groups: list[UsageGroup]


class AuditRecord(BaseModel):
    id: int
    occurred_at: datetime
    action: str
    target_id: str | None
    result: str
