from __future__ import annotations

import base64
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.admin.repository import ModelConfigRepository
from app.admin.router import create_admin_router
from app.admin.schemas import ConnectionTestResult, RuntimeProvider, UsageRecord
from app.admin.settings import AdminSettings


ORIGIN = "http://testserver"
WRITE_HEADERS = {"Origin": ORIGIN}


class FakeCompatibleClient:
    async def list_models(self, provider: RuntimeProvider) -> list[str]:
        assert provider.api_key == "local-key-1234"
        return ["mock-chat", "mock-reasoner"]

    async def test_chat(self, provider: RuntimeProvider, model: str) -> ConnectionTestResult:
        assert provider.api_key == "local-key-1234"
        return ConnectionTestResult(
            ok=True,
            model=model,
            latency_ms=12,
            input_tokens=4,
            output_tokens=1,
        )


@pytest.fixture
def admin_app(tmp_path: Path) -> tuple[FastAPI, ModelConfigRepository]:
    encryption_key = base64.urlsafe_b64encode(b"a" * 32).decode("ascii")
    settings = AdminSettings(
        app_env="test",
        username="owner",
        password="correct-password",
        session_secret="admin-session-secret-with-at-least-32-characters",
        session_ttl_seconds=3600,
        encryption_key=encryption_key,
        database_path=tmp_path / "admin.db",
        allow_private_endpoints=True,
        login_rate_limit=5,
        login_rate_window_seconds=60,
    )
    repository = ModelConfigRepository(settings.database_path, settings.encryption_key)
    app = FastAPI()
    app.include_router(
        create_admin_router(
            settings=settings,
            repository=repository,
            compatible_client=FakeCompatibleClient(),  # type: ignore[arg-type]
            allowed_origins=(ORIGIN,),
        )
    )
    return app, repository


def _login(client: TestClient) -> None:
    response = client.post(
        "/api/admin/session",
        headers=WRITE_HEADERS,
        json={"username": "owner", "password": "correct-password"},
    )
    assert response.status_code == 204


def test_session_login_check_logout_and_origin_protection(admin_app) -> None:
    app, _ = admin_app
    with TestClient(app, base_url=ORIGIN) as client:
        assert client.get("/api/admin/session").json() == {"authenticated": False, "username": None}
        assert client.get("/api/admin/bootstrap").json() == {"registration_open": False}
        denied = client.post(
            "/api/admin/session",
            json={"username": "owner", "password": "correct-password"},
        )
        assert denied.status_code == 403
        invalid = client.post(
            "/api/admin/session",
            headers=WRITE_HEADERS,
            json={"username": "owner", "password": "wrong-password"},
        )
        assert invalid.status_code == 401
        _login(client)
        assert client.get("/api/admin/session").json() == {
            "authenticated": True,
            "username": "owner",
        }
        assert client.delete("/api/admin/session", headers=WRITE_HEADERS).status_code == 204
        assert client.get("/api/admin/session").json()["authenticated"] is False


def test_admin_complete_provider_flow_never_serializes_full_key(admin_app) -> None:
    app, repository = admin_app
    with TestClient(app, base_url=ORIGIN) as client:
        _login(client)
        created = client.post(
            "/api/admin/providers",
            headers=WRITE_HEADERS,
            json={
                "name": "Local Compatible",
                "preset": "custom",
                "base_url": "http://127.0.0.1:9901/v1",
                "api_key": "local-key-1234",
                "models": [],
                "is_enabled": True,
            },
        )
        assert created.status_code == 201
        assert "local-key-1234" not in created.text
        provider_id = created.json()["id"]

        listed = client.get("/api/admin/providers")
        assert listed.status_code == 200
        assert listed.json()[0]["api_key_last4"] == "1234"
        assert "local-key-1234" not in listed.text

        discovered = client.post(
            f"/api/admin/providers/{provider_id}/discover", headers=WRITE_HEADERS
        )
        assert discovered.status_code == 200
        assert discovered.json()["models"] == ["mock-chat", "mock-reasoner"]

        tested = client.post(
            f"/api/admin/providers/{provider_id}/test",
            headers=WRITE_HEADERS,
            json={"model": "mock-chat"},
        )
        assert tested.status_code == 200
        assert tested.json()["ok"] is True

        activated = client.post(
            f"/api/admin/providers/{provider_id}/activate",
            headers=WRITE_HEADERS,
            json={"model": "mock-chat"},
        )
        assert activated.status_code == 200
        assert activated.json()["is_active"] is True
        assert repository.get_active_runtime().active_model == "mock-chat"  # type: ignore[union-attr]

        updated = client.patch(
            f"/api/admin/providers/{provider_id}",
            headers=WRITE_HEADERS,
            json={"name": "Renamed", "api_key": ""},
        )
        assert updated.status_code == 200
        assert updated.json()["name"] == "Renamed"
        assert "local-key-1234" not in updated.text


def test_usage_audit_and_active_delete_conflict(admin_app) -> None:
    app, repository = admin_app
    with TestClient(app, base_url=ORIGIN) as client:
        _login(client)
        created = client.post(
            "/api/admin/providers",
            headers=WRITE_HEADERS,
            json={
                "name": "Usage Provider",
                "preset": "custom",
                "base_url": "http://127.0.0.1:9901/v1",
                "api_key": "local-key-1234",
                "models": ["mock-chat"],
                "is_enabled": True,
            },
        ).json()
        provider_id = created["id"]
        client.post(
            f"/api/admin/providers/{provider_id}/activate",
            headers=WRITE_HEADERS,
            json={"model": "mock-chat"},
        )
        repository.record_usage(
            UsageRecord(
                endpoint="chat",
                provider_id=provider_id,
                provider_name="Usage Provider",
                model="mock-chat",
                outcome="success",
                latency_ms=10,
                input_tokens=2,
                output_tokens=3,
                request_id="request-1",
            )
        )

        usage = client.get("/api/admin/usage?window=24h")
        audit = client.get("/api/admin/audit")
        deleted = client.delete(
            f"/api/admin/providers/{provider_id}", headers=WRITE_HEADERS
        )

        assert usage.status_code == 200
        assert usage.json()["total_requests"] == 1
        assert audit.status_code == 200
        assert any(item["action"] == "provider.activate" for item in audit.json())
        assert deleted.status_code == 409


def test_provider_routes_require_admin_cookie(admin_app) -> None:
    app, _ = admin_app
    with TestClient(app, base_url=ORIGIN) as client:
        response = client.get("/api/admin/providers")
    assert response.status_code == 401


def test_only_the_first_administrator_can_initialize_the_console(tmp_path: Path) -> None:
    encryption_key = base64.urlsafe_b64encode(b"b" * 32).decode("ascii")
    settings = AdminSettings(
        app_env="test",
        username=None,
        password=None,
        session_secret="admin-session-secret-with-at-least-32-characters",
        session_ttl_seconds=3600,
        encryption_key=encryption_key,
        database_path=tmp_path / "bootstrap.db",
        allow_private_endpoints=True,
        login_rate_limit=5,
        login_rate_window_seconds=60,
    )
    repository = ModelConfigRepository(settings.database_path, settings.encryption_key)
    app = FastAPI()
    app.include_router(
        create_admin_router(
            settings=settings,
            repository=repository,
            compatible_client=FakeCompatibleClient(),  # type: ignore[arg-type]
            allowed_origins=(ORIGIN,),
        )
    )

    with TestClient(app, base_url=ORIGIN) as client:
        assert client.get("/api/admin/bootstrap").json() == {"registration_open": True}

        initialized = client.post(
            "/api/admin/bootstrap",
            headers=WRITE_HEADERS,
            json={"username": "first-owner", "password": "correct-password"},
        )

        assert initialized.status_code == 201
        assert initialized.json() == {"authenticated": True, "username": "first-owner"}
        assert client.get("/api/admin/session").json() == {
            "authenticated": True,
            "username": "first-owner",
        }
        assert client.get("/api/admin/bootstrap").json() == {"registration_open": False}

        duplicate = client.post(
            "/api/admin/bootstrap",
            headers=WRITE_HEADERS,
            json={"username": "second-owner", "password": "another-correct-password"},
        )
        assert duplicate.status_code == 409
