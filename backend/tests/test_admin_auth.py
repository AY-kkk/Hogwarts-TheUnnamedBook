from __future__ import annotations

import base64

import pytest

from app.admin.auth import AdminAuthenticator, AdminSessionError, AdminSessionManager
from app.admin.settings import AdminSettings


ADMIN_ENV_KEYS = (
    "ADMIN_USERNAME",
    "ADMIN_PASSWORD",
    "ADMIN_SESSION_SECRET",
    "ADMIN_SESSION_TTL_SECONDS",
    "MODEL_CONFIG_ENCRYPTION_KEY",
    "MODEL_CONFIG_DB_PATH",
    "ALLOW_PRIVATE_MODEL_ENDPOINTS",
)


def _clear_admin_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in ADMIN_ENV_KEYS:
        monkeypatch.delenv(key, raising=False)


def _fernet_key() -> str:
    return base64.urlsafe_b64encode(b"k" * 32).decode("ascii")


def test_production_admin_settings_require_all_strong_secrets(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _clear_admin_env(monkeypatch)
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("ADMIN_USERNAME", "owner")
    monkeypatch.setenv("ADMIN_PASSWORD", "short")
    monkeypatch.setenv("ADMIN_SESSION_SECRET", "s" * 32)
    monkeypatch.setenv("MODEL_CONFIG_ENCRYPTION_KEY", _fernet_key())

    with pytest.raises(RuntimeError, match="ADMIN_PASSWORD"):
        AdminSettings.from_env()


@pytest.mark.parametrize(
    ("missing_key", "message"),
    [
        ("ADMIN_USERNAME", "ADMIN_USERNAME"),
        ("ADMIN_PASSWORD", "ADMIN_PASSWORD"),
        ("ADMIN_SESSION_SECRET", "ADMIN_SESSION_SECRET"),
        ("MODEL_CONFIG_ENCRYPTION_KEY", "MODEL_CONFIG_ENCRYPTION_KEY"),
    ],
)
def test_production_admin_settings_reject_missing_values(
    monkeypatch: pytest.MonkeyPatch,
    missing_key: str,
    message: str,
) -> None:
    values = {
        "ADMIN_USERNAME": "owner",
        "ADMIN_PASSWORD": "correct-password",
        "ADMIN_SESSION_SECRET": "s" * 32,
        "MODEL_CONFIG_ENCRYPTION_KEY": _fernet_key(),
    }
    _clear_admin_env(monkeypatch)
    monkeypatch.setenv("APP_ENV", "production")
    for key, value in values.items():
        if key != missing_key:
            monkeypatch.setenv(key, value)

    with pytest.raises(RuntimeError, match=message):
        AdminSettings.from_env()


def test_development_settings_have_local_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_admin_env(monkeypatch)
    monkeypatch.setenv("APP_ENV", "development")

    settings = AdminSettings.from_env()

    assert settings.username == "admin"
    assert settings.password
    assert len(base64.urlsafe_b64decode(settings.encryption_key)) == 32
    assert settings.allow_private_endpoints is False


def test_authenticator_accepts_only_exact_credentials() -> None:
    authenticator = AdminAuthenticator("owner", "correct-password", "s" * 32)

    assert authenticator.authenticate("owner", "correct-password") is True
    assert authenticator.authenticate("Owner", "correct-password") is False
    assert authenticator.authenticate("owner", "wrong-password") is False


def test_signed_admin_session_expires_at_boundary() -> None:
    manager = AdminSessionManager("s" * 32, ttl_seconds=60)
    token, ttl = manager.issue("owner", now=100)

    assert ttl == 60
    assert manager.verify(token, now=159) == "owner"
    with pytest.raises(AdminSessionError, match="expired"):
        manager.verify(token, now=160)


def test_signed_admin_session_rejects_tampering() -> None:
    manager = AdminSessionManager("s" * 32, ttl_seconds=60)
    token, _ = manager.issue("owner", now=100)
    payload, signature = token.split(".", 1)
    replacement = "A" if payload[-1] != "A" else "B"
    tampered = f"{payload[:-1]}{replacement}.{signature}"

    with pytest.raises(AdminSessionError, match="signature"):
        manager.verify(tampered, now=101)

