from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Any


def _base64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _base64url_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


class AdminSessionError(ValueError):
    """Raised when an administrator session is absent, invalid or expired."""


class AdminPasswordHasher:
    """Hashes the single persisted administrator password with a unique salt."""

    _prefix = "scrypt-v1"

    @staticmethod
    def _derive(password: str, salt: bytes) -> bytes:
        return hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt,
            n=2**14,
            r=8,
            p=1,
            dklen=32,
        )

    @classmethod
    def hash_password(cls, password: str) -> str:
        salt = secrets.token_bytes(16)
        digest = cls._derive(password, salt)
        return f"{cls._prefix}${_base64url_encode(salt)}${_base64url_encode(digest)}"

    @classmethod
    def verify_password(cls, password: str, encoded_hash: str) -> bool:
        try:
            prefix, encoded_salt, encoded_digest = encoded_hash.split("$", 2)
            if prefix != cls._prefix:
                return False
            salt = _base64url_decode(encoded_salt)
            expected_digest = _base64url_decode(encoded_digest)
            actual_digest = cls._derive(password, salt)
        except (TypeError, ValueError, UnicodeEncodeError):
            return False
        return hmac.compare_digest(actual_digest, expected_digest)


class AdminAuthenticator:
    def __init__(self, username: str, password: str, secret: str):
        self._username = username.encode("utf-8")
        self._salt = hashlib.sha256(f"admin-password:{secret}".encode("utf-8")).digest()
        self._password_digest = self._derive(password)

    def _derive(self, password: str) -> bytes:
        return hashlib.scrypt(
            password.encode("utf-8"),
            salt=self._salt,
            n=2**14,
            r=8,
            p=1,
            dklen=32,
        )

    def authenticate(self, username: str, password: str) -> bool:
        username_ok = hmac.compare_digest(username.encode("utf-8"), self._username)
        password_ok = hmac.compare_digest(self._derive(password), self._password_digest)
        return username_ok and password_ok


class AdminSessionManager:
    def __init__(self, secret: str, ttl_seconds: int):
        self._secret = secret.encode("utf-8")
        self._ttl_seconds = ttl_seconds

    def issue(self, username: str, now: int | None = None) -> tuple[str, int]:
        issued_at = int(time.time() if now is None else now)
        payload: dict[str, Any] = {
            "sub": username,
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
                raise AdminSessionError("invalid admin session signature")
            payload = json.loads(_base64url_decode(encoded_payload))
            username = payload["sub"]
            session_id = payload["sid"]
            expires_at = int(payload["exp"])
        except AdminSessionError:
            raise
        except (KeyError, TypeError, ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise AdminSessionError("invalid admin session token") from exc

        if not isinstance(username, str) or not username:
            raise AdminSessionError("invalid admin session token")
        if not isinstance(session_id, str) or not session_id:
            raise AdminSessionError("invalid admin session token")

        current_time = int(time.time() if now is None else now)
        if expires_at <= current_time:
            raise AdminSessionError("expired admin session token")
        return username
