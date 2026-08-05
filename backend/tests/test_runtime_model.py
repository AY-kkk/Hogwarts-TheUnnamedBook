from __future__ import annotations

import base64
import importlib
import sys

import pytest

from app.admin.repository import ModelConfigRepository
from app.admin.endpoint_policy import EndpointPolicyError
from app.admin.schemas import ProviderCreate
from app.observability import request_id_context
from app.services.runtime_model import (
    RuntimeModelResolver,
    bind_runtime_model,
    reset_runtime_model,
)


@pytest.fixture
def repo(tmp_path) -> ModelConfigRepository:
    key = base64.urlsafe_b64encode(b"m" * 32).decode("ascii")
    return ModelConfigRepository(tmp_path / "runtime.db", key)


def _provider(
    repo: ModelConfigRepository,
    name: str,
    base_url: str,
    model: str,
):
    provider = repo.create_provider(
        ProviderCreate(
            name=name,
            preset="custom",
            base_url=base_url,
            api_key=f"{name.lower()}-secret-key",
            models=[model],
            is_enabled=True,
        )
    )
    repo.activate_provider(provider.id, model)
    return provider


def _public_address(_hostname: str) -> list[str]:
    return ["93.184.216.34"]


def test_resolver_reads_active_provider_for_each_new_request(repo: ModelConfigRepository) -> None:
    first = _provider(repo, "First", "https://first.example/v1", "model-a")
    resolver = RuntimeModelResolver(repo, address_resolver=_public_address)

    one = resolver.resolve()
    second = _provider(repo, "Second", "https://second.example/v1", "model-b")
    two = resolver.resolve()

    assert one.provider_id == first.id
    assert one.model == "model-a"
    assert one.base_url == "https://first.example/v1"
    assert two.provider_id == second.id
    assert two.model == "model-b"
    assert "secret-key" not in repr(two)


def test_bound_request_keeps_original_model_during_hot_switch(
    repo: ModelConfigRepository,
) -> None:
    _provider(repo, "First", "https://first.example/v1", "model-a")
    resolver = RuntimeModelResolver(repo, address_resolver=_public_address)
    original = resolver.resolve()
    token = bind_runtime_model(original)
    try:
        _provider(repo, "Second", "https://second.example/v1", "model-b")
        assert resolver.resolve().model == "model-a"
    finally:
        reset_runtime_model(token)

    assert resolver.resolve().model == "model-b"


def test_environment_fallback_is_used_only_without_active_database_provider(
    repo: ModelConfigRepository,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "deepseek")
    monkeypatch.setenv("LLM_MODEL_NAME", "deepseek-chat")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "environment-key")
    monkeypatch.setenv("DEEPSEEK_BASE_URL", "https://api.deepseek.example/v1")

    fallback = RuntimeModelResolver(repo).resolve()
    _provider(repo, "Database", "https://database.example/v1", "database-model")
    database = RuntimeModelResolver(repo, address_resolver=_public_address).resolve()

    assert fallback.source == "environment"
    assert fallback.model == "deepseek-chat"
    assert database.source == "database"
    assert database.model == "database-model"


def test_runtime_resolution_rejects_a_provider_that_rebinds_to_private_dns(
    repo: ModelConfigRepository,
) -> None:
    _provider(repo, "Rebound", "https://rebound.example/v1", "model-a")
    resolver = RuntimeModelResolver(
        repo,
        app_env="production",
        allow_private_endpoints=False,
        address_resolver=lambda _hostname: ["127.0.0.1"],
    )

    with pytest.raises(EndpointPolicyError, match="private or non-public"):
        resolver.resolve()


def test_local_runtime_uses_a_direct_client_only_with_explicit_opt_in(
    repo: ModelConfigRepository,
) -> None:
    _provider(repo, "Local", "http://127.0.0.1:9901/v1", "model-a")
    resolved = RuntimeModelResolver(
        repo,
        app_env="development",
        allow_private_endpoints=True,
        address_resolver=lambda _hostname: ["127.0.0.1"],
    ).resolve()

    assert resolved.uses_non_public_endpoint is True


def test_llm_factory_builds_database_compatible_client_per_call(
    repo: ModelConfigRepository,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.services import llm_factory

    _provider(repo, "First", "https://first.example/v1", "model-a")
    calls: list[dict] = []

    def fake_chat_openai(**kwargs):
        calls.append(kwargs)
        return kwargs

    monkeypatch.setattr(llm_factory, "ChatOpenAI", fake_chat_openai)

    one = llm_factory.LLMFactory.create_llm(
        repository=repo,
        address_resolver=_public_address,
    )
    _provider(repo, "Second", "https://second.example/v1", "model-b")
    two = llm_factory.LLMFactory.create_llm(
        repository=repo,
        address_resolver=_public_address,
    )

    assert one["model"] == "model-a"
    assert one["base_url"] == "https://first.example/v1"
    assert two["model"] == "model-b"
    assert two["base_url"] == "https://second.example/v1"
    assert len(calls) == 2


def test_agents_do_not_create_model_clients_during_construction(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.services.agents.intent_agent import IntentAnalyzer
    from app.services.agents.narrator_agent import NarratorAgent
    from app.services.llm_factory import LLMFactory

    monkeypatch.setattr(
        LLMFactory,
        "create_llm",
        staticmethod(lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("too early"))),
    )

    IntentAnalyzer()
    NarratorAgent()


def test_budget_settlement_persists_captured_provider_usage(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    key = base64.urlsafe_b64encode(b"u" * 32).decode("ascii")
    environment = {
        "APP_ENV": "test",
        "SESSION_SECRET": "test-session-secret-with-at-least-32-characters",
        "CORS_ALLOWED_ORIGINS": "http://testserver",
        "METRICS_TOKEN": "test-metrics-token-with-at-least-32-characters",
        "MODEL_CONFIG_DB_PATH": str(tmp_path / "usage.db"),
        "MODEL_CONFIG_ENCRYPTION_KEY": key,
        "SESSION_BUDGET_USD": "5",
        "LLM_PROVIDER": "openai",
        "LLM_MODEL_NAME": "environment-model",
    }
    for name, value in environment.items():
        monkeypatch.setenv(name, value)
    sys.modules.pop("app.main", None)
    main = importlib.import_module("app.main")
    monkeypatch.setattr(main.LLMFactory, "_address_resolver", _public_address)
    provider = _provider(
        main.model_repository,
        "Captured",
        "https://captured.example/v1",
        "captured-model",
    )
    request_token = request_id_context.set("request-captured-1")
    try:
        reservation = main.reserve_ai_budget("session-1", 9, 20)
        assert reservation.resolved_model.model == "captured-model"
        main.settle_ai_budget(reservation, "chat", 9, 5, "success")
    finally:
        request_id_context.reset(request_token)

    summary = main.model_repository.usage_summary("24h")
    assert summary.total_requests == 1
    assert summary.input_tokens == 3
    assert summary.output_tokens == 2
    assert summary.groups[0].provider_name == "Captured"
    assert summary.groups[0].model == "captured-model"
    assert provider.id == main.model_repository.get_active_runtime().id
