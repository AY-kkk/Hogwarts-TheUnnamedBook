from __future__ import annotations

import asyncio
import socket

import httpx
import pytest

from app.admin.compatible_client import OpenAICompatibleClient, OpenAICompatibleError
from app.admin.endpoint_policy import EndpointPolicyError, validate_provider_url
from app.admin.schemas import RuntimeProvider


@pytest.fixture
def runtime_provider() -> RuntimeProvider:
    return RuntimeProvider(
        id="provider-1",
        name="Compatible",
        preset="custom",
        base_url="https://provider.example/v1",
        api_key="top-secret-key",
        active_model="mock-chat",
    )


def test_production_rejects_loopback_http_and_url_credentials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *args, **kwargs: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 443))],
    )
    with pytest.raises(EndpointPolicyError, match="private"):
        validate_provider_url("https://provider.example/v1", "production", False)
    with pytest.raises(EndpointPolicyError, match="HTTPS"):
        validate_provider_url("http://public.example/v1", "production", False)
    with pytest.raises(EndpointPolicyError, match="credentials"):
        validate_provider_url("https://user:pass@public.example/v1", "production", False)


def test_development_allows_local_http_only_with_explicit_opt_in() -> None:
    with pytest.raises(EndpointPolicyError, match="private"):
        validate_provider_url("http://127.0.0.1:9901/v1", "development", False)
    assert (
        validate_provider_url("http://127.0.0.1:9901/v1/", "development", True)
        == "http://127.0.0.1:9901/v1"
    )


def test_discovers_deduplicated_sorted_models(runtime_provider: RuntimeProvider) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v1/models"
        assert request.headers["Authorization"] == "Bearer top-secret-key"
        return httpx.Response(
            200,
            json={
                "object": "list",
                "data": [
                    {"id": "z-model", "object": "model", "created": 0, "owned_by": "mock"},
                    {"id": "a-model", "object": "model", "created": 0, "owned_by": "mock"},
                    {"id": "z-model", "object": "model", "created": 0, "owned_by": "mock"},
                ],
            },
        )

    client = OpenAICompatibleClient(
        app_env="development",
        allow_private_endpoints=False,
        transport=httpx.MockTransport(handler),
        address_resolver=lambda _: ["8.8.8.8"],
    )

    assert asyncio.run(client.list_models(runtime_provider)) == ["a-model", "z-model"]


def test_minimal_chat_connection_reports_model_usage_and_latency(
    runtime_provider: RuntimeProvider,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v1/chat/completions"
        assert b"mock-chat" in request.content
        return httpx.Response(
            200,
            json={
                "id": "chatcmpl-1",
                "object": "chat.completion",
                "created": 1,
                "model": "mock-chat-v2",
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": "OK"},
                        "finish_reason": "stop",
                    }
                ],
                "usage": {"prompt_tokens": 5, "completion_tokens": 1, "total_tokens": 6},
            },
        )

    client = OpenAICompatibleClient(
        app_env="development",
        allow_private_endpoints=False,
        transport=httpx.MockTransport(handler),
        address_resolver=lambda _: ["8.8.8.8"],
    )

    result = asyncio.run(client.test_chat(runtime_provider, "mock-chat"))

    assert result.ok is True
    assert result.model == "mock-chat-v2"
    assert result.input_tokens == 5
    assert result.output_tokens == 1
    assert result.latency_ms >= 0


@pytest.mark.parametrize(
    ("status_code", "expected_code"),
    [(401, "authentication_failed"), (429, "rate_limited"), (500, "upstream_error")],
)
def test_upstream_errors_are_stable_and_redacted(
    runtime_provider: RuntimeProvider,
    status_code: int,
    expected_code: str,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            status_code,
            json={"error": {"message": "top-secret-key must never escape", "type": "vendor_error"}},
        )

    client = OpenAICompatibleClient(
        app_env="development",
        allow_private_endpoints=False,
        transport=httpx.MockTransport(handler),
        address_resolver=lambda _: ["8.8.8.8"],
    )

    with pytest.raises(OpenAICompatibleError) as caught:
        asyncio.run(client.list_models(runtime_provider))

    assert caught.value.code == expected_code
    assert "top-secret" not in str(caught.value)
