from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass


def _positive_int(name: str, default: int) -> int:
    raw = os.getenv(name, str(default))
    try:
        value = int(raw)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be an integer") from exc
    if value <= 0:
        raise RuntimeError(f"{name} must be greater than zero")
    return value


@dataclass(frozen=True)
class SecuritySettings:
    app_env: str
    session_secret: str
    session_ttl_seconds: int
    rate_limit_requests: int
    rate_limit_window_seconds: int
    session_issue_limit: int
    max_request_bytes: int
    max_context_chars: int
    cors_allowed_origins: tuple[str, ...]

    @classmethod
    def from_env(cls) -> "SecuritySettings":
        app_env = os.getenv("APP_ENV", "development").strip().lower()
        session_secret = os.getenv("SESSION_SECRET", "").strip()
        if not session_secret and app_env != "production":
            session_secret = "development-only-session-secret"
        if app_env == "production" and len(session_secret) < 32:
            raise RuntimeError("SESSION_SECRET must contain at least 32 characters in production")

        origins = tuple(
            origin.strip().rstrip("/")
            for origin in os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",")
            if origin.strip()
        )
        if not origins or "*" in origins:
            raise RuntimeError("CORS_ALLOWED_ORIGINS must contain explicit origins and cannot use '*'")

        return cls(
            app_env=app_env,
            session_secret=session_secret,
            session_ttl_seconds=_positive_int("SESSION_TTL_SECONDS", 3600),
            rate_limit_requests=_positive_int("RATE_LIMIT_REQUESTS", 30),
            rate_limit_window_seconds=_positive_int("RATE_LIMIT_WINDOW_SECONDS", 60),
            session_issue_limit=_positive_int("SESSION_ISSUE_LIMIT", 10),
            max_request_bytes=_positive_int("MAX_REQUEST_BYTES", 65536),
            max_context_chars=_positive_int("MAX_CONTEXT_CHARS", 24000),
            cors_allowed_origins=origins,
        )


def _base64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _base64url_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


class SessionTokenError(ValueError):
    pass


class SessionTokenManager:
    def __init__(self, secret: str, ttl_seconds: int):
        self._secret = secret.encode("utf-8")
        self._ttl_seconds = ttl_seconds

    def issue(self, now: int | None = None) -> tuple[str, int]:
        issued_at = int(time.time() if now is None else now)
        payload = {
            "sid": secrets.token_urlsafe(18),
            "exp": issued_at + self._ttl_seconds,
        }
        encoded_payload = _base64url_encode(
            json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
        )
        signature = _base64url_encode(
            hmac.new(self._secret, encoded_payload.encode("ascii"), hashlib.sha256).digest()
        )
        return f"{encoded_payload}.{signature}", self._ttl_seconds

    def verify(self, token: str, now: int | None = None) -> str:
        try:
            encoded_payload, encoded_signature = token.split(".", 1)
            expected_signature = _base64url_encode(
                hmac.new(self._secret, encoded_payload.encode("ascii"), hashlib.sha256).digest()
            )
            if not hmac.compare_digest(encoded_signature, expected_signature):
                raise SessionTokenError("invalid session signature")
            payload = json.loads(_base64url_decode(encoded_payload))
            session_id = payload["sid"]
            expires_at = int(payload["exp"])
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
            if isinstance(exc, SessionTokenError):
                raise
            raise SessionTokenError("invalid session token") from exc

        current_time = int(time.time() if now is None else now)
        if not isinstance(session_id, str) or not session_id or expires_at <= current_time:
            raise SessionTokenError("expired session token")
        return session_id


class FixedWindowRateLimiter:
    def __init__(self, request_limit: int, window_seconds: int):
        self._request_limit = request_limit
        self._window_seconds = window_seconds
        self._requests: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def consume(self, key: str, now: float | None = None) -> int | None:
        current_time = time.monotonic() if now is None else now
        cutoff = current_time - self._window_seconds
        with self._lock:
            timestamps = self._requests[key]
            while timestamps and timestamps[0] <= cutoff:
                timestamps.popleft()
            if len(timestamps) >= self._request_limit:
                return max(1, int(self._window_seconds - (current_time - timestamps[0])))
            timestamps.append(current_time)
        return None
