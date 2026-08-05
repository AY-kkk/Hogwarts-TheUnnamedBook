from __future__ import annotations

import asyncio
import time
from collections.abc import Callable

import httpx
from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    AsyncOpenAI,
    AuthenticationError,
    RateLimitError,
)

from app.admin.endpoint_policy import (
    AddressResolver,
    provider_url_uses_non_public_address,
    validate_provider_url,
)
from app.admin.schemas import ConnectionTestResult, RuntimeProvider, validate_model_id


class OpenAICompatibleError(RuntimeError):
    def __init__(self, code: str, message: str, *, status_code: int | None = None):
        super().__init__(message)
        self.code = code
        self.status_code = status_code


class OpenAICompatibleClient:
    def __init__(
        self,
        *,
        app_env: str,
        allow_private_endpoints: bool,
        timeout_seconds: float = 15,
        transport: httpx.AsyncBaseTransport | None = None,
        address_resolver: AddressResolver | None = None,
    ):
        self._app_env = app_env
        self._allow_private_endpoints = allow_private_endpoints
        self._timeout_seconds = timeout_seconds
        self._transport = transport
        self._address_resolver = address_resolver

    def _endpoint(self, provider: RuntimeProvider) -> tuple[str, bool]:
        base_url = validate_provider_url(
            provider.base_url,
            self._app_env,
            self._allow_private_endpoints,
            address_resolver=self._address_resolver,
        )
        uses_non_public_address = provider_url_uses_non_public_address(
            base_url,
            address_resolver=self._address_resolver,
        )
        trust_environment = not (
            self._allow_private_endpoints and uses_non_public_address
        )
        return base_url, trust_environment

    def _http_client(self, *, trust_environment: bool) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            transport=self._transport,
            timeout=httpx.Timeout(self._timeout_seconds),
            follow_redirects=False,
            trust_env=trust_environment,
        )

    async def _run(self, operation: Callable[[], object]):
        try:
            return await asyncio.wait_for(operation(), timeout=self._timeout_seconds + 1)  # type: ignore[misc]
        except AuthenticationError as exc:
            raise OpenAICompatibleError(
                "authentication_failed",
                "The provider rejected the API key.",
                status_code=401,
            ) from exc
        except RateLimitError as exc:
            raise OpenAICompatibleError(
                "rate_limited",
                "The provider rate limit was reached.",
                status_code=429,
            ) from exc
        except (APITimeoutError, asyncio.TimeoutError) as exc:
            raise OpenAICompatibleError(
                "timeout",
                "The provider did not respond before the timeout.",
                status_code=504,
            ) from exc
        except APIStatusError as exc:
            if exc.status_code in {401, 403}:
                code = "authentication_failed"
                message = "The provider rejected the API credentials."
            elif exc.status_code == 404:
                code = "endpoint_not_supported"
                message = "The provider does not expose this compatible endpoint."
            else:
                code = "upstream_error"
                message = "The provider returned an error response."
            raise OpenAICompatibleError(code, message, status_code=exc.status_code) from exc
        except APIConnectionError as exc:
            raise OpenAICompatibleError(
                "connection_failed",
                "The provider could not be reached.",
                status_code=502,
            ) from exc

    async def list_models(self, provider: RuntimeProvider) -> list[str]:
        base_url, trust_environment = self._endpoint(provider)
        http_client = self._http_client(trust_environment=trust_environment)
        client = AsyncOpenAI(
            api_key=provider.api_key,
            base_url=base_url,
            http_client=http_client,
            max_retries=0,
        )
        try:
            page = await self._run(client.models.list)
            data = getattr(page, "data", None)
            if not isinstance(data, list):
                raise OpenAICompatibleError(
                    "invalid_response", "The provider returned an invalid model list."
                )
            return sorted(
                {
                    item.id.strip()
                    for item in data
                    if isinstance(getattr(item, "id", None), str) and item.id.strip()
                }
            )
        finally:
            await client.close()

    async def test_chat(self, provider: RuntimeProvider, model: str) -> ConnectionTestResult:
        selected_model = validate_model_id(model)
        base_url, trust_environment = self._endpoint(provider)
        http_client = self._http_client(trust_environment=trust_environment)
        client = AsyncOpenAI(
            api_key=provider.api_key,
            base_url=base_url,
            http_client=http_client,
            max_retries=0,
        )
        started = time.perf_counter()
        try:
            response = await self._run(
                lambda: client.chat.completions.create(
                    model=selected_model,
                    messages=[{"role": "user", "content": "Reply with exactly OK."}],
                    max_tokens=8,
                )
            )
            choices = getattr(response, "choices", None)
            if not choices or not getattr(choices[0], "message", None):
                raise OpenAICompatibleError(
                    "invalid_response", "The provider returned an invalid chat response."
                )
            usage = getattr(response, "usage", None)
            return ConnectionTestResult(
                ok=True,
                model=getattr(response, "model", None) or selected_model,
                latency_ms=max(0, round((time.perf_counter() - started) * 1000)),
                input_tokens=int(getattr(usage, "prompt_tokens", 0) or 0),
                output_tokens=int(getattr(usage, "completion_tokens", 0) or 0),
            )
        finally:
            await client.close()
