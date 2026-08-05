from __future__ import annotations

import os
from contextvars import ContextVar, Token
from dataclasses import dataclass, field
from typing import Literal

from app.admin.repository import ModelConfigRepository


@dataclass(frozen=True)
class ResolvedModel:
    provider_id: str | None
    provider_name: str
    provider_type: str
    model: str
    base_url: str | None
    api_key: str = field(repr=False)
    source: Literal["database", "environment"] = "environment"


_runtime_model_context: ContextVar[ResolvedModel | None] = ContextVar(
    "runtime_model", default=None
)


def bind_runtime_model(resolved: ResolvedModel) -> Token[ResolvedModel | None]:
    return _runtime_model_context.set(resolved)


def reset_runtime_model(token: Token[ResolvedModel | None]) -> None:
    _runtime_model_context.reset(token)


def current_runtime_model() -> ResolvedModel | None:
    return _runtime_model_context.get()


class RuntimeModelResolver:
    def __init__(self, repository: ModelConfigRepository | None = None):
        self._repository = repository

    def resolve(self) -> ResolvedModel:
        bound = current_runtime_model()
        if bound is not None:
            return bound
        if self._repository is not None:
            active = self._repository.get_active_runtime()
            if active is not None:
                if not active.active_model:
                    raise RuntimeError("active model configuration is incomplete")
                return ResolvedModel(
                    provider_id=active.id,
                    provider_name=active.name,
                    provider_type="openai-compatible",
                    model=active.active_model,
                    base_url=active.base_url,
                    api_key=active.api_key,
                    source="database",
                )
        return self._from_environment()

    @staticmethod
    def _from_environment() -> ResolvedModel:
        provider = os.getenv("LLM_PROVIDER", "openai").strip().lower()
        model = os.getenv("LLM_MODEL_NAME", "gpt-4o").strip()
        configurations = {
            "openai": (
                "OpenAI",
                "openai",
                os.getenv("OPENAI_API_KEY", ""),
                os.getenv("OPENAI_BASE_URL") or None,
            ),
            "deepseek": (
                "DeepSeek",
                "openai-compatible",
                os.getenv("DEEPSEEK_API_KEY", ""),
                os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
            ),
            "modelscope": (
                "ModelScope",
                "openai-compatible",
                os.getenv("MODELSCOPE_API_KEY", ""),
                os.getenv(
                    "MODELSCOPE_BASE_URL", "https://api-inference.modelscope.cn/v1"
                ),
            ),
            "anthropic": (
                "Anthropic",
                "anthropic",
                os.getenv("ANTHROPIC_API_KEY", ""),
                os.getenv("ANTHROPIC_BASE_URL") or None,
            ),
        }
        if provider not in configurations:
            raise ValueError(f"Unsupported LLM provider: {provider}")
        if not model:
            raise RuntimeError("LLM_MODEL_NAME cannot be empty")
        provider_name, provider_type, api_key, base_url = configurations[provider]
        return ResolvedModel(
            provider_id=None,
            provider_name=provider_name,
            provider_type=provider_type,
            model=model,
            base_url=base_url,
            api_key=api_key,
            source="environment",
        )
