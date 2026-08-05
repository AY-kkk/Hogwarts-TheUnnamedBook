from __future__ import annotations

from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI

from app.admin.repository import ModelConfigRepository
from app.services.runtime_model import ResolvedModel, RuntimeModelResolver


class LLMFactory:
    _repository: ModelConfigRepository | None = None

    @classmethod
    def configure_repository(cls, repository: ModelConfigRepository) -> None:
        cls._repository = repository

    @classmethod
    def describe_active(
        cls, repository: ModelConfigRepository | None = None
    ) -> ResolvedModel:
        return RuntimeModelResolver(repository or cls._repository).resolve()

    @classmethod
    def create_llm(
        cls,
        provider: str | None = None,
        model_name: str | None = None,
        *,
        repository: ModelConfigRepository | None = None,
        resolved: ResolvedModel | None = None,
    ):
        selection = resolved or cls.describe_active(repository)
        if provider is not None or model_name is not None:
            environment = RuntimeModelResolver().resolve()
            selection = ResolvedModel(
                provider_id=None,
                provider_name=provider or environment.provider_name,
                provider_type=provider or environment.provider_type,
                model=model_name or environment.model,
                base_url=environment.base_url,
                api_key=environment.api_key,
                source="environment",
            )

        if selection.provider_type == "anthropic":
            kwargs = {
                "model": selection.model,
                "temperature": 0.7,
                "streaming": False,
                "api_key": selection.api_key,
            }
            if selection.base_url:
                kwargs["base_url"] = selection.base_url
            return ChatAnthropic(**kwargs)

        kwargs = {
            "model": selection.model,
            "temperature": 0.7,
            "streaming": False,
            "api_key": selection.api_key,
        }
        if selection.base_url:
            kwargs["base_url"] = selection.base_url
        return ChatOpenAI(**kwargs)
