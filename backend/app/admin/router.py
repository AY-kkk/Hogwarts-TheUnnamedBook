from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field, field_validator

from app.admin.auth import AdminAuthenticator, AdminSessionError, AdminSessionManager
from app.admin.compatible_client import OpenAICompatibleClient, OpenAICompatibleError
from app.admin.endpoint_policy import EndpointPolicyError, validate_provider_url
from app.admin.repository import (
    ActiveProviderError,
    ModelConfigRepository,
    ProviderConflictError,
    ProviderDisabledError,
    ProviderNotFoundError,
    RepositoryError,
)
from app.admin.schemas import (
    ConnectionTestResult,
    ProviderCreate,
    ProviderRecord,
    ProviderUpdate,
    RuntimeProvider,
    validate_model_id,
)
from app.admin.settings import AdminSettings
from app.security import FixedWindowRateLimiter


ADMIN_COOKIE_NAME = "unnamed_book_admin"


class CompatibleClient(Protocol):
    async def list_models(self, provider: RuntimeProvider) -> list[str]: ...

    async def test_chat(
        self, provider: RuntimeProvider, model: str
    ) -> ConnectionTestResult: ...


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=1024)


class AdminSessionResponse(BaseModel):
    authenticated: bool
    username: str | None


class ModelSelectionRequest(BaseModel):
    model: str | None = None

    @field_validator("model")
    @classmethod
    def validate_model(cls, value: str | None) -> str | None:
        return None if value is None else validate_model_id(value)


class DiscoveredModelsResponse(BaseModel):
    models: list[str]


def _to_http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, ProviderNotFoundError):
        return HTTPException(status_code=404, detail="Provider not found")
    if isinstance(exc, (ActiveProviderError, ProviderConflictError, ProviderDisabledError)):
        return HTTPException(status_code=409, detail=str(exc))
    if isinstance(exc, EndpointPolicyError):
        return HTTPException(status_code=422, detail=str(exc))
    if isinstance(exc, OpenAICompatibleError):
        mapped_status = {
            "rate_limited": 429,
            "timeout": 504,
            "authentication_failed": 422,
        }.get(exc.code, 502)
        return HTTPException(
            status_code=mapped_status,
            detail={"code": exc.code, "message": str(exc)},
        )
    if isinstance(exc, ValueError):
        return HTTPException(status_code=422, detail=str(exc))
    if isinstance(exc, RepositoryError):
        return HTTPException(status_code=500, detail="Model configuration storage failed")
    return HTTPException(status_code=500, detail="Administrator operation failed")


def create_admin_router(
    *,
    settings: AdminSettings,
    repository: ModelConfigRepository,
    compatible_client: CompatibleClient | OpenAICompatibleClient,
    allowed_origins: Sequence[str],
) -> APIRouter:
    router = APIRouter(prefix="/api/admin", tags=["admin"])
    authenticator = AdminAuthenticator(
        settings.username, settings.password, settings.session_secret
    )
    sessions = AdminSessionManager(settings.session_secret, settings.session_ttl_seconds)
    login_limiter = FixedWindowRateLimiter(
        settings.login_rate_limit, settings.login_rate_window_seconds
    )
    normalized_origins = {origin.rstrip("/") for origin in allowed_origins}

    def require_origin(request: Request) -> None:
        origin = request.headers.get("origin", "").rstrip("/")
        if origin not in normalized_origins:
            raise HTTPException(status_code=403, detail="Invalid administrator request origin")

    def session_username(request: Request) -> str:
        token = request.cookies.get(ADMIN_COOKIE_NAME, "")
        if not token:
            raise HTTPException(status_code=401, detail="Administrator login required")
        try:
            return sessions.verify(token)
        except AdminSessionError as exc:
            raise HTTPException(
                status_code=401, detail="Invalid or expired administrator session"
            ) from exc

    @router.post("/session", status_code=status.HTTP_204_NO_CONTENT)
    def login(payload: LoginRequest, request: Request, response: Response) -> None:
        require_origin(request)
        client_host = request.client.host if request.client else "unknown"
        retry_after = login_limiter.consume(client_host)
        if retry_after is not None:
            raise HTTPException(
                status_code=429,
                detail="Administrator login rate limit exceeded",
                headers={"Retry-After": str(retry_after)},
            )
        if not authenticator.authenticate(payload.username, payload.password):
            repository.record_audit("session.login", None, "failure")
            raise HTTPException(status_code=401, detail="Invalid administrator credentials")
        token, ttl = sessions.issue(settings.username)
        response.set_cookie(
            ADMIN_COOKIE_NAME,
            token,
            max_age=ttl,
            httponly=True,
            secure=settings.app_env == "production",
            samesite="lax",
            path="/api/admin",
        )
        repository.record_audit("session.login", None, "success")

    @router.get("/session", response_model=AdminSessionResponse)
    def get_session(request: Request) -> AdminSessionResponse:
        token = request.cookies.get(ADMIN_COOKIE_NAME, "")
        if not token:
            return AdminSessionResponse(authenticated=False, username=None)
        try:
            username = sessions.verify(token)
        except AdminSessionError:
            return AdminSessionResponse(authenticated=False, username=None)
        return AdminSessionResponse(authenticated=True, username=username)

    @router.delete("/session", status_code=status.HTTP_204_NO_CONTENT)
    def logout(request: Request, response: Response) -> None:
        require_origin(request)
        username = session_username(request)
        response.delete_cookie(ADMIN_COOKIE_NAME, path="/api/admin")
        repository.record_audit("session.logout", username, "success")

    @router.get("/providers", response_model=list[ProviderRecord])
    def list_providers(_admin: str = Depends(session_username)) -> list[ProviderRecord]:
        return repository.list_providers()

    @router.post(
        "/providers", response_model=ProviderRecord, status_code=status.HTTP_201_CREATED
    )
    def create_provider(
        payload: ProviderCreate,
        request: Request,
        _admin: str = Depends(session_username),
    ) -> ProviderRecord:
        require_origin(request)
        try:
            normalized_url = validate_provider_url(
                payload.base_url,
                settings.app_env,
                settings.allow_private_endpoints,
            )
            provider = repository.create_provider(
                payload.model_copy(update={"base_url": normalized_url})
            )
        except Exception as exc:
            repository.record_audit("provider.create", None, "failure")
            raise _to_http_error(exc) from exc
        repository.record_audit("provider.create", provider.id, "success")
        return provider

    @router.patch("/providers/{provider_id}", response_model=ProviderRecord)
    def update_provider(
        provider_id: str,
        payload: ProviderUpdate,
        request: Request,
        _admin: str = Depends(session_username),
    ) -> ProviderRecord:
        require_origin(request)
        try:
            if payload.base_url is not None:
                normalized = validate_provider_url(
                    payload.base_url,
                    settings.app_env,
                    settings.allow_private_endpoints,
                )
                payload = payload.model_copy(update={"base_url": normalized})
            provider = repository.update_provider(provider_id, payload)
        except Exception as exc:
            repository.record_audit("provider.update", provider_id, "failure")
            raise _to_http_error(exc) from exc
        repository.record_audit("provider.update", provider_id, "success")
        return provider

    @router.delete("/providers/{provider_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_provider(
        provider_id: str,
        request: Request,
        _admin: str = Depends(session_username),
    ) -> None:
        require_origin(request)
        try:
            repository.delete_provider(provider_id)
        except Exception as exc:
            repository.record_audit("provider.delete", provider_id, "failure")
            raise _to_http_error(exc) from exc
        repository.record_audit("provider.delete", provider_id, "success")

    @router.post(
        "/providers/{provider_id}/discover", response_model=DiscoveredModelsResponse
    )
    async def discover_models(
        provider_id: str,
        request: Request,
        _admin: str = Depends(session_username),
    ) -> DiscoveredModelsResponse:
        require_origin(request)
        try:
            runtime = repository.get_runtime(provider_id)
            models = await compatible_client.list_models(runtime)
            repository.update_models(provider_id, models)
        except Exception as exc:
            repository.record_audit("provider.discover", provider_id, "failure")
            raise _to_http_error(exc) from exc
        repository.record_audit("provider.discover", provider_id, "success")
        return DiscoveredModelsResponse(models=models)

    @router.post("/providers/{provider_id}/test", response_model=ConnectionTestResult)
    async def test_provider(
        provider_id: str,
        payload: ModelSelectionRequest,
        request: Request,
        _admin: str = Depends(session_username),
    ) -> ConnectionTestResult:
        require_origin(request)
        try:
            provider = repository.get_provider(provider_id)
            model = payload.model or provider.active_model or next(iter(provider.models), None)
            if not model:
                raise ValueError("A model ID is required for the connection test")
            runtime = repository.get_runtime(provider_id)
            result = await compatible_client.test_chat(runtime, model)
        except Exception as exc:
            repository.record_audit("provider.test", provider_id, "failure")
            raise _to_http_error(exc) from exc
        repository.record_audit("provider.test", provider_id, "success")
        return result

    @router.post("/providers/{provider_id}/activate", response_model=ProviderRecord)
    def activate_provider(
        provider_id: str,
        payload: ModelSelectionRequest,
        request: Request,
        _admin: str = Depends(session_username),
    ) -> ProviderRecord:
        require_origin(request)
        if not payload.model:
            raise HTTPException(status_code=422, detail="A model ID is required for activation")
        try:
            provider = repository.activate_provider(provider_id, payload.model)
        except Exception as exc:
            repository.record_audit("provider.activate", provider_id, "failure")
            raise _to_http_error(exc) from exc
        repository.record_audit("provider.activate", provider_id, "success")
        return provider

    @router.get("/usage")
    def usage(window: str = "24h", _admin: str = Depends(session_username)):
        try:
            return repository.usage_summary(window)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @router.get("/audit")
    def audit(limit: int = 50, _admin: str = Depends(session_username)):
        return repository.list_audit(limit)

    return router

