from __future__ import annotations

import asyncio
import base64

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.admin.compatible_client import OpenAICompatibleClient
from app.admin.repository import ModelConfigRepository
from app.admin.router import create_admin_router
from app.admin.schemas import UsageRecord
from app.admin.settings import AdminSettings
from app.services.llm_factory import LLMFactory
from tests.support.openai_compatible_server import openai_compatible_server


def test_complete_admin_to_runtime_flow(tmp_path) -> None:
    origin = "http://testserver"
    encryption_key = base64.urlsafe_b64encode(b"e" * 32).decode("ascii")
    settings = AdminSettings(
        app_env="test",
        username="owner",
        password="correct-password",
        session_secret="admin-session-secret-with-at-least-32-characters",
        session_ttl_seconds=3600,
        encryption_key=encryption_key,
        database_path=tmp_path / "e2e.db",
        allow_private_endpoints=True,
        login_rate_limit=5,
        login_rate_window_seconds=60,
    )
    repository = ModelConfigRepository(settings.database_path, settings.encryption_key)
    compatible_client = OpenAICompatibleClient(
        app_env=settings.app_env,
        allow_private_endpoints=settings.allow_private_endpoints,
    )
    app = FastAPI()
    app.include_router(
        create_admin_router(
            settings=settings,
            repository=repository,
            compatible_client=compatible_client,
            allowed_origins=(origin,),
        )
    )

    with openai_compatible_server() as upstream, TestClient(app, base_url=origin) as client:
        headers = {"Origin": origin}
        login = client.post(
            "/api/admin/session",
            headers=headers,
            json={"username": "owner", "password": "correct-password"},
        )
        assert login.status_code == 204
        created = client.post(
            "/api/admin/providers",
            headers=headers,
            json={
                "name": "Local Protocol Proof",
                "preset": "custom",
                "base_url": upstream.base_url,
                "api_key": upstream.api_key,
                "models": [],
                "is_enabled": True,
            },
        )
        assert created.status_code == 201
        assert upstream.api_key not in created.text
        provider_id = created.json()["id"]

        discovered = client.post(
            f"/api/admin/providers/{provider_id}/discover", headers=headers
        )
        assert discovered.status_code == 200, (discovered.text, upstream.requests)
        assert discovered.json()["models"] == [upstream.model]
        tested = client.post(
            f"/api/admin/providers/{provider_id}/test",
            headers=headers,
            json={"model": upstream.model},
        )
        assert tested.status_code == 200
        assert tested.json()["ok"] is True
        activated = client.post(
            f"/api/admin/providers/{provider_id}/activate",
            headers=headers,
            json={"model": upstream.model},
        )
        assert activated.status_code == 200
        assert activated.json()["is_active"] is True

        resolved = LLMFactory.describe_active(
            repository,
            app_env=settings.app_env,
            allow_private_endpoints=settings.allow_private_endpoints,
        )
        assert resolved.model == upstream.model
        message = asyncio.run(
            LLMFactory.create_llm(
                repository=repository,
                app_env=settings.app_env,
                allow_private_endpoints=settings.allow_private_endpoints,
            ).ainvoke("Say hello to Hogwarts")
        )
        assert message.content == "Mock provider is ready."

        repository.record_usage(
            UsageRecord(
                endpoint="chat",
                provider_id=provider_id,
                provider_name="Local Protocol Proof",
                model=upstream.model,
                outcome="success",
                latency_ms=8,
                input_tokens=4,
                output_tokens=5,
                request_id="e2e-request-1",
            )
        )
        usage = client.get("/api/admin/usage?window=24h")
        audit = client.get("/api/admin/audit")

        assert usage.json()["total_requests"] == 1
        assert any(row["action"] == "provider.activate" for row in audit.json())
        assert upstream.chat_requests >= 2
