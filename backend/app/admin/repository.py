from __future__ import annotations

import json
import sqlite3
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

from app.admin.schemas import (
    AuditRecord,
    ProviderCreate,
    ProviderRecord,
    ProviderUpdate,
    RuntimeProvider,
    UsageGroup,
    UsageRecord,
    UsageSummary,
    validate_model_id,
)


class RepositoryError(RuntimeError):
    pass


class ProviderNotFoundError(RepositoryError):
    pass


class ProviderConflictError(RepositoryError):
    pass


class ActiveProviderError(ProviderConflictError):
    pass


class ProviderDisabledError(ProviderConflictError):
    pass


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _timestamp(value: datetime | None = None) -> str:
    return (value or _utc_now()).astimezone(timezone.utc).isoformat(timespec="milliseconds")


class ModelConfigRepository:
    def __init__(self, database_path: str | Path, encryption_key: str):
        self._database_path = Path(database_path)
        self._database_path.parent.mkdir(parents=True, exist_ok=True)
        self._fernet = Fernet(encryption_key.encode("ascii"))
        self._initialize()

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self._database_path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 10000")
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS model_providers (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL UNIQUE,
                    preset TEXT NOT NULL,
                    base_url TEXT NOT NULL,
                    api_key_ciphertext BLOB NOT NULL,
                    api_key_last4 TEXT NOT NULL,
                    models_json TEXT NOT NULL,
                    active_model TEXT,
                    is_enabled INTEGER NOT NULL DEFAULT 1,
                    is_active INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE UNIQUE INDEX IF NOT EXISTS idx_model_providers_single_active
                    ON model_providers(is_active) WHERE is_active = 1;

                CREATE TABLE IF NOT EXISTS model_usage (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    occurred_at TEXT NOT NULL,
                    endpoint TEXT NOT NULL,
                    provider_id TEXT,
                    provider_name TEXT NOT NULL,
                    model TEXT NOT NULL,
                    outcome TEXT NOT NULL,
                    latency_ms INTEGER NOT NULL,
                    input_tokens INTEGER NOT NULL,
                    output_tokens INTEGER NOT NULL,
                    request_id TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_model_usage_time
                    ON model_usage(occurred_at);
                CREATE INDEX IF NOT EXISTS idx_model_usage_provider_model
                    ON model_usage(provider_name, model, occurred_at);

                CREATE TABLE IF NOT EXISTS admin_audit (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    occurred_at TEXT NOT NULL,
                    action TEXT NOT NULL,
                    target_id TEXT,
                    result TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_admin_audit_time
                    ON admin_audit(occurred_at DESC);
                """
            )

    def _public_provider(self, row: sqlite3.Row) -> ProviderRecord:
        return ProviderRecord(
            id=row["id"],
            name=row["name"],
            preset=row["preset"],
            base_url=row["base_url"],
            api_key_last4=row["api_key_last4"],
            has_api_key=bool(row["api_key_ciphertext"]),
            models=json.loads(row["models_json"]),
            active_model=row["active_model"],
            is_enabled=bool(row["is_enabled"]),
            is_active=bool(row["is_active"]),
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
        )

    def create_provider(self, data: ProviderCreate) -> ProviderRecord:
        provider_id = str(uuid.uuid4())
        now = _timestamp()
        ciphertext = self._fernet.encrypt(data.api_key.encode("utf-8"))
        try:
            with self._connect() as connection:
                connection.execute(
                    """
                    INSERT INTO model_providers (
                        id, name, preset, base_url, api_key_ciphertext, api_key_last4,
                        models_json, active_model, is_enabled, is_active, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, 0, ?, ?)
                    """,
                    (
                        provider_id,
                        data.name,
                        data.preset,
                        data.base_url.rstrip("/"),
                        ciphertext,
                        data.api_key[-4:],
                        json.dumps(data.models, separators=(",", ":")),
                        int(data.is_enabled),
                        now,
                        now,
                    ),
                )
        except sqlite3.IntegrityError as exc:
            raise ProviderConflictError(f"provider name already exists: {data.name}") from exc
        return self.get_provider(provider_id)

    def list_providers(self) -> list[ProviderRecord]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM model_providers ORDER BY created_at, id"
            ).fetchall()
        return [self._public_provider(row) for row in rows]

    def get_provider(self, provider_id: str) -> ProviderRecord:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM model_providers WHERE id = ?", (provider_id,)
            ).fetchone()
        if row is None:
            raise ProviderNotFoundError(provider_id)
        return self._public_provider(row)

    def update_provider(self, provider_id: str, data: ProviderUpdate) -> ProviderRecord:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM model_providers WHERE id = ?", (provider_id,)
            ).fetchone()
            if row is None:
                raise ProviderNotFoundError(provider_id)

            fields = data.model_dump(exclude_unset=True)
            api_key = fields.get("api_key")
            ciphertext = row["api_key_ciphertext"]
            last4 = row["api_key_last4"]
            if api_key:
                ciphertext = self._fernet.encrypt(api_key.encode("utf-8"))
                last4 = api_key[-4:]

            models = fields.get("models")
            models_json = row["models_json"] if models is None else json.dumps(
                models, separators=(",", ":")
            )
            is_enabled = row["is_enabled"] if fields.get("is_enabled") is None else int(
                fields["is_enabled"]
            )
            is_active = row["is_active"] if is_enabled else 0
            active_model = row["active_model"] if is_enabled else None

            try:
                connection.execute(
                    """
                    UPDATE model_providers
                    SET name = ?, preset = ?, base_url = ?, api_key_ciphertext = ?,
                        api_key_last4 = ?, models_json = ?, active_model = ?,
                        is_enabled = ?, is_active = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        fields.get("name") or row["name"],
                        fields.get("preset") or row["preset"],
                        (fields.get("base_url") or row["base_url"]).rstrip("/"),
                        ciphertext,
                        last4,
                        models_json,
                        active_model,
                        is_enabled,
                        is_active,
                        _timestamp(),
                        provider_id,
                    ),
                )
            except sqlite3.IntegrityError as exc:
                raise ProviderConflictError("provider name already exists") from exc
        return self.get_provider(provider_id)

    def update_models(self, provider_id: str, models: list[str]) -> ProviderRecord:
        return self.update_provider(provider_id, ProviderUpdate(models=models))

    def delete_provider(self, provider_id: str) -> None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT is_active FROM model_providers WHERE id = ?", (provider_id,)
            ).fetchone()
            if row is None:
                raise ProviderNotFoundError(provider_id)
            if row["is_active"]:
                raise ActiveProviderError("the active provider cannot be deleted")
            connection.execute("DELETE FROM model_providers WHERE id = ?", (provider_id,))

    def activate_provider(self, provider_id: str, model: str) -> ProviderRecord:
        selected_model = validate_model_id(model)
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT * FROM model_providers WHERE id = ?", (provider_id,)
            ).fetchone()
            if row is None:
                raise ProviderNotFoundError(provider_id)
            if not row["is_enabled"]:
                raise ProviderDisabledError("provider must be enabled before activation")

            models: list[str] = json.loads(row["models_json"])
            if selected_model not in models:
                models.append(selected_model)
            connection.execute("UPDATE model_providers SET is_active = 0")
            connection.execute(
                """
                UPDATE model_providers
                SET is_active = 1, active_model = ?, models_json = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    selected_model,
                    json.dumps(models, separators=(",", ":")),
                    _timestamp(),
                    provider_id,
                ),
            )
        return self.get_provider(provider_id)

    def get_active_runtime(self) -> RuntimeProvider | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM model_providers WHERE is_active = 1"
            ).fetchone()
        if row is None:
            return None
        runtime = self._runtime_provider(row)
        if not runtime.active_model:
            raise RepositoryError("active provider has no selected model")
        return runtime

    def get_runtime(self, provider_id: str) -> RuntimeProvider:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM model_providers WHERE id = ?", (provider_id,)
            ).fetchone()
        if row is None:
            raise ProviderNotFoundError(provider_id)
        if not row["is_enabled"]:
            raise ProviderDisabledError("provider must be enabled before connecting")
        return self._runtime_provider(row)

    def _runtime_provider(self, row: sqlite3.Row) -> RuntimeProvider:
        try:
            api_key = self._fernet.decrypt(row["api_key_ciphertext"]).decode("utf-8")
        except (InvalidToken, UnicodeDecodeError) as exc:
            raise RepositoryError("provider credentials cannot be decrypted") from exc
        return RuntimeProvider(
            id=row["id"],
            name=row["name"],
            preset=row["preset"],
            base_url=row["base_url"],
            api_key=api_key,
            active_model=row["active_model"],
        )

    def record_usage(self, record: UsageRecord) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO model_usage (
                    occurred_at, endpoint, provider_id, provider_name, model, outcome,
                    latency_ms, input_tokens, output_tokens, request_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    _timestamp(record.occurred_at),
                    record.endpoint,
                    record.provider_id,
                    record.provider_name,
                    record.model,
                    record.outcome,
                    record.latency_ms,
                    record.input_tokens,
                    record.output_tokens,
                    record.request_id,
                ),
            )

    def usage_summary(self, window: str) -> UsageSummary:
        durations = {"24h": timedelta(hours=24), "7d": timedelta(days=7), "30d": timedelta(days=30)}
        if window not in durations:
            raise ValueError("window must be one of 24h, 7d or 30d")
        cutoff = _timestamp(_utc_now() - durations[window])
        aggregate_sql = """
            SELECT COUNT(*) AS total,
                   SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) AS successful,
                   AVG(latency_ms) AS average_latency,
                   COALESCE(SUM(input_tokens), 0) AS input_tokens,
                   COALESCE(SUM(output_tokens), 0) AS output_tokens
            FROM model_usage WHERE occurred_at >= ?
        """
        group_sql = """
            SELECT provider_name, model, COUNT(*) AS total,
                   SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) AS successful,
                   AVG(latency_ms) AS average_latency,
                   COALESCE(SUM(input_tokens), 0) AS input_tokens,
                   COALESCE(SUM(output_tokens), 0) AS output_tokens
            FROM model_usage WHERE occurred_at >= ?
            GROUP BY provider_name, model ORDER BY total DESC, provider_name, model
        """
        with self._connect() as connection:
            aggregate = connection.execute(aggregate_sql, (cutoff,)).fetchone()
            group_rows = connection.execute(group_sql, (cutoff,)).fetchall()

        total = int(aggregate["total"] or 0)
        successful = int(aggregate["successful"] or 0)
        groups = [
            UsageGroup(
                provider_name=row["provider_name"],
                model=row["model"],
                total_requests=row["total"],
                successful_requests=row["successful"],
                failed_requests=row["total"] - row["successful"],
                success_rate=row["successful"] / row["total"],
                average_latency_ms=round(float(row["average_latency"] or 0), 1),
                input_tokens=row["input_tokens"],
                output_tokens=row["output_tokens"],
            )
            for row in group_rows
        ]
        return UsageSummary(
            window=window,
            total_requests=total,
            successful_requests=successful,
            failed_requests=total - successful,
            success_rate=successful / total if total else 0,
            average_latency_ms=round(float(aggregate["average_latency"] or 0), 1),
            input_tokens=int(aggregate["input_tokens"] or 0),
            output_tokens=int(aggregate["output_tokens"] or 0),
            groups=groups,
        )

    def record_audit(self, action: str, target_id: str | None, result: str) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO admin_audit (occurred_at, action, target_id, result)
                VALUES (?, ?, ?, ?)
                """,
                (_timestamp(), action[:80], target_id, result[:40]),
            )

    def list_audit(self, limit: int = 50) -> list[AuditRecord]:
        safe_limit = min(max(limit, 1), 200)
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM admin_audit ORDER BY occurred_at DESC, id DESC LIMIT ?",
                (safe_limit,),
            ).fetchall()
        return [
            AuditRecord(
                id=row["id"],
                occurred_at=datetime.fromisoformat(row["occurred_at"]),
                action=row["action"],
                target_id=row["target_id"],
                result=row["result"],
            )
            for row in rows
        ]
