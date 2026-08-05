from __future__ import annotations

import httpx
from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI

from app.admin.endpoint_policy import AddressResolver
from app.admin.repository import ModelConfigRepository
from app.services.runtime_model import ResolvedModel, RuntimeModelResolver


class LLMFactory:
    _repository: ModelConfigRepository | None = None
    _direct_http_client: httpx.Client | None = None
    _direct_async_http_client: httpx.AsyncClient | None = None
    _app_env: str | None = None
    _allow_private_endpoints: bool | None = None
    _address_resolver: AddressResolver | None = None

    @classmethod
    def configure_repository(
        cls,
        repository: ModelConfigRepository,
        *,
        app_env: str | None = None,
        allow_private_endpoints: bool | None = None,
        address_resolver: AddressResolver | None = None,
    ) -> None:
        cls._repository = repository
        cls._app_env = app_env
        cls._allow_private_endpoints = allow_private_endpoints
        cls._address_resolver = address_resolver

    @classmethod
    def describe_active(
        cls,
        repository: ModelConfigRepository | None = None,
        *,
        app_env: str | None = None,
        allow_private_endpoints: bool | None = None,
        address_resolver: AddressResolver | None = None,
    ) -> ResolvedModel:
        return RuntimeModelResolver(
            repository or cls._repository,
            app_env=app_env or cls._app_env,
            allow_private_endpoints=(
                cls._allow_private_endpoints
                if allow_private_endpoints is None
                else allow_private_endpoints
            ),
            address_resolver=address_resolver or cls._address_resolver,
        ).resolve()

    @classmethod
    def create_llm(
        cls,
        provider: str | None = None,
        model_name: str | None = None,
        *,
        repository: ModelConfigRepository | None = None,
        resolved: ResolvedModel | None = None,
        app_env: str | None = None,
        allow_private_endpoints: bool | None = None,
        address_resolver: AddressResolver | None = None,
    ):
        selection = resolved or cls.describe_active(
            repository,
            app_env=app_env,
            allow_private_endpoints=allow_private_endpoints,
            address_resolver=address_resolver,
        )
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
        if selection.uses_non_public_endpoint:
            if cls._direct_http_client is None:
                cls._direct_http_client = httpx.Client(trust_env=False)
            if cls._direct_async_http_client is None:
                cls._direct_async_http_client = httpx.AsyncClient(trust_env=False)
            kwargs["http_client"] = cls._direct_http_client
            kwargs["http_async_client"] = cls._direct_async_http_client
        return ChatOpenAI(**kwargs)
