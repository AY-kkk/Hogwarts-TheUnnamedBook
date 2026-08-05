from __future__ import annotations

import base64
import hashlib
import os
from dataclasses import dataclass
from pathlib import Path


def _positive_int(name: str, default: int) -> int:
    raw = os.getenv(name, str(default))
    try:
        value = int(raw)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be an integer") from exc
    if value <= 0:
        raise RuntimeError(f"{name} must be greater than zero")
    return value


def _boolean(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise RuntimeError(f"{name} must be true or false")


def _validate_fernet_key(value: str) -> str:
    try:
        decoded = base64.b64decode(value.encode("ascii"), altchars=b"-_", validate=True)
    except (UnicodeEncodeError, ValueError) as exc:
        raise RuntimeError("MODEL_CONFIG_ENCRYPTION_KEY must be a valid Fernet key") from exc
    if len(decoded) != 32:
        raise RuntimeError("MODEL_CONFIG_ENCRYPTION_KEY must be a valid Fernet key")
    return value


@dataclass(frozen=True)
class AdminSettings:
    app_env: str
    username: str
    password: str
    session_secret: str
    session_ttl_seconds: int
    encryption_key: str
    database_path: Path
    allow_private_endpoints: bool
    login_rate_limit: int
    login_rate_window_seconds: int

    @classmethod
    def from_env(cls) -> "AdminSettings":
        app_env = os.getenv("APP_ENV", "development").strip().lower()
        is_production = app_env == "production"

        username = os.getenv("ADMIN_USERNAME", "").strip()
        password = os.getenv("ADMIN_PASSWORD", "")
        session_secret = os.getenv("ADMIN_SESSION_SECRET", "").strip()
        encryption_key = os.getenv("MODEL_CONFIG_ENCRYPTION_KEY", "").strip()

        if is_production:
            if not username:
                raise RuntimeError("ADMIN_USERNAME is required in production")
            if len(password) < 12:
                raise RuntimeError("ADMIN_PASSWORD must contain at least 12 characters in production")
            if len(session_secret) < 32:
                raise RuntimeError(
                    "ADMIN_SESSION_SECRET must contain at least 32 characters in production"
                )
            if not encryption_key:
                raise RuntimeError("MODEL_CONFIG_ENCRYPTION_KEY is required in production")
        else:
            username = username or "admin"
            password = password or "change-this-local-password"
            session_secret = session_secret or "development-only-admin-session-secret"
            if not encryption_key:
                digest = hashlib.sha256(session_secret.encode("utf-8")).digest()
                encryption_key = base64.urlsafe_b64encode(digest).decode("ascii")

        allow_private = _boolean("ALLOW_PRIVATE_MODEL_ENDPOINTS")
        if is_production and allow_private:
            raise RuntimeError("ALLOW_PRIVATE_MODEL_ENDPOINTS cannot be enabled in production")

        return cls(
            app_env=app_env,
            username=username,
            password=password,
            session_secret=session_secret,
            session_ttl_seconds=_positive_int("ADMIN_SESSION_TTL_SECONDS", 28800),
            encryption_key=_validate_fernet_key(encryption_key),
            database_path=Path(os.getenv("MODEL_CONFIG_DB_PATH", "data/model-config.db")),
            allow_private_endpoints=allow_private,
            login_rate_limit=_positive_int("ADMIN_LOGIN_LIMIT", 5),
            login_rate_window_seconds=_positive_int("ADMIN_LOGIN_WINDOW_SECONDS", 300),
        )

