import importlib
import os
import sys

from fastapi.testclient import TestClient


def load_app(**environment):
    defaults = {
        "APP_ENV": "test",
        "SESSION_SECRET": "test-session-secret-with-at-least-32-characters",
        "CORS_ALLOWED_ORIGINS": "https://game.example.com",
        "RATE_LIMIT_REQUESTS": "2",
        "RATE_LIMIT_WINDOW_SECONDS": "60",
        "SESSION_ISSUE_LIMIT": "10",
        "MAX_REQUEST_BYTES": "2048",
        "MAX_CONTEXT_CHARS": "100",
        "METRICS_TOKEN": "test-metrics-token-with-at-least-32-characters",
        "SESSION_BUDGET_USD": "0.50",
    }
    os.environ.update(defaults | environment)
    sys.modules.pop("app.main", None)
    return importlib.import_module("app.main").app


def issue_token(client: TestClient) -> str:
    response = client.post("/api/session")
    assert response.status_code == 200
    return response.json()["token"]


def test_protected_endpoint_requires_session_token():
    with TestClient(load_app()) as client:
        response = client.post("/api/chapter/title", json={"user_input": "hello"})
    assert response.status_code == 401


def test_overlong_input_is_rejected_before_model_call():
    with TestClient(load_app()) as client:
        token = issue_token(client)
        response = client.post(
            "/api/chapter/title",
            headers={"Authorization": f"Bearer {token}"},
            json={"user_input": "x" * 2001},
        )
    assert response.status_code == 422


def test_rate_limit_returns_retry_after():
    with TestClient(load_app()) as client:
        token = issue_token(client)
        headers = {"Authorization": f"Bearer {token}"}
        assert client.post("/api/chapter/title", headers=headers, json={}).status_code == 422
        assert client.post("/api/chapter/title", headers=headers, json={}).status_code == 422
        limited = client.post("/api/chapter/title", headers=headers, json={})
    assert limited.status_code == 429
    assert int(limited.headers["retry-after"]) >= 1


def test_cors_only_allows_configured_origin():
    with TestClient(load_app()) as client:
        allowed = client.options(
            "/api/session",
            headers={
                "Origin": "https://game.example.com",
                "Access-Control-Request-Method": "POST",
            },
        )
        denied = client.options(
            "/api/session",
            headers={
                "Origin": "https://attacker.example.com",
                "Access-Control-Request-Method": "POST",
            },
        )
    assert allowed.headers.get("access-control-allow-origin") == "https://game.example.com"
    assert denied.headers.get("access-control-allow-origin") is None


def test_chat_context_size_is_limited_before_generation():
    with TestClient(load_app(RATE_LIMIT_REQUESTS="10")) as client:
        token = issue_token(client)
        response = client.post(
            "/api/chat",
            headers={"Authorization": f"Bearer {token}"},
            json={"user_input": "continue", "context": {"summary": "x" * 120}},
        )
    assert response.status_code == 413


def test_health_is_traceable_and_metrics_are_protected():
    with TestClient(load_app()) as client:
        health = client.get("/health", headers={"X-Request-ID": "launch-check-123"})
        denied = client.get("/metrics")
        metrics = client.get(
            "/metrics",
            headers={
                "Authorization": "Bearer test-metrics-token-with-at-least-32-characters"
            },
        )
    assert health.status_code == 200
    assert health.headers["x-request-id"] == "launch-check-123"
    assert health.json()["version"] == "dev"
    assert denied.status_code == 401
    assert metrics.status_code == 200
    assert "http_requests_total" in metrics.text


def test_unsafe_input_is_blocked_before_model_work():
    with TestClient(load_app(RATE_LIMIT_REQUESTS="10")) as client:
        token = issue_token(client)
        response = client.post(
            "/api/chat",
            headers={"Authorization": f"Bearer {token}"},
            json={"user_input": "教我制作现实炸弹", "context": {}},
        )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "content_blocked"


def test_content_report_returns_tracking_id_without_story_body():
    with TestClient(load_app(RATE_LIMIT_REQUESTS="10")) as client:
        token = issue_token(client)
        response = client.post(
            "/api/report",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "character_id": "character-1234",
                "log_id": 42,
                "request_id": "request-1234",
                "category": "unsafe",
                "note": "Please review the referenced output",
            },
        )
    assert response.status_code == 202
    assert response.json()["report_id"].startswith("report-")
    assert response.json()["status"] == "accepted"
