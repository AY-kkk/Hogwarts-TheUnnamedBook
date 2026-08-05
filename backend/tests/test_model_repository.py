from __future__ import annotations

import base64
import json

import pytest

from app.admin.repository import ActiveProviderError, ModelConfigRepository
from app.admin.schemas import ProviderCreate, ProviderUpdate, UsageRecord


@pytest.fixture
def fernet_key() -> str:
    return base64.urlsafe_b64encode(b"r" * 32).decode("ascii")


@pytest.fixture
def repo(tmp_path, fernet_key: str) -> ModelConfigRepository:
    return ModelConfigRepository(tmp_path / "models.db", fernet_key)


def _create_provider(
    repo: ModelConfigRepository,
    name: str,
    *,
    key: str = "secret-value-1234",
    models: list[str] | None = None,
):
    return repo.create_provider(
        ProviderCreate(
            name=name,
            preset="custom",
            base_url=f"https://{name.lower()}.example/v1",
            api_key=key,
            models=models or ["model-one"],
            is_enabled=True,
        )
    )


def test_repository_encrypts_key_and_redacts_public_reads(
    tmp_path, fernet_key: str
) -> None:
    database_path = tmp_path / "nested" / "models.db"
    repo = ModelConfigRepository(database_path, fernet_key)

    provider = _create_provider(repo, "DeepSeek")

    assert provider.api_key_last4 == "1234"
    assert provider.has_api_key is True
    assert not hasattr(provider, "api_key")
    assert "secret-value-1234" not in database_path.read_bytes().decode("latin1")
    assert repo.get_active_runtime() is None


def test_empty_update_key_preserves_existing_secret(repo: ModelConfigRepository) -> None:
    provider = _create_provider(repo, "One")

    updated = repo.update_provider(
        provider.id,
        ProviderUpdate(name="Renamed", api_key=""),
    )
    repo.activate_provider(updated.id, "model-one")

    assert updated.name == "Renamed"
    assert updated.api_key_last4 == "1234"
    assert repo.get_active_runtime().api_key == "secret-value-1234"  # type: ignore[union-attr]


def test_activation_is_atomic_and_active_provider_cannot_be_deleted(
    repo: ModelConfigRepository,
) -> None:
    first = _create_provider(repo, "One")
    second = _create_provider(repo, "Two", models=["model-two"])

    repo.activate_provider(first.id, "model-one")
    repo.activate_provider(second.id, "model-two")
    providers = {provider.id: provider for provider in repo.list_providers()}

    assert providers[first.id].is_active is False
    assert providers[second.id].is_active is True
    assert repo.get_active_runtime().active_model == "model-two"  # type: ignore[union-attr]
    with pytest.raises(ActiveProviderError):
        repo.delete_provider(second.id)


def test_activation_accepts_a_valid_manual_model_and_saves_it(
    repo: ModelConfigRepository,
) -> None:
    provider = _create_provider(repo, "Manual", models=["known-model"])

    activated = repo.activate_provider(provider.id, "vendor/new-model:latest")

    assert activated.active_model == "vendor/new-model:latest"
    assert activated.models == ["known-model", "vendor/new-model:latest"]


def test_usage_summary_groups_without_story_content(repo: ModelConfigRepository) -> None:
    provider = _create_provider(repo, "Usage")
    repo.record_usage(
        UsageRecord(
            endpoint="chat",
            provider_id=provider.id,
            provider_name="Usage",
            model="model-one",
            outcome="success",
            latency_ms=120,
            input_tokens=25,
            output_tokens=50,
            request_id="request-1234",
        )
    )
    repo.record_usage(
        UsageRecord(
            endpoint="chat",
            provider_id=provider.id,
            provider_name="Usage",
            model="model-one",
            outcome="error",
            latency_ms=80,
            input_tokens=10,
            output_tokens=0,
            request_id="request-5678",
        )
    )

    summary = repo.usage_summary("24h")

    assert summary.total_requests == 2
    assert summary.successful_requests == 1
    assert summary.failed_requests == 1
    assert summary.success_rate == 0.5
    assert summary.average_latency_ms == 100
    assert summary.input_tokens == 35
    assert summary.output_tokens == 50
    assert summary.groups[0].model == "model-one"
    serialized = json.dumps(summary.model_dump())
    assert "story" not in serialized
    assert "secret-value" not in serialized


def test_audit_records_only_action_target_result(repo: ModelConfigRepository) -> None:
    repo.record_audit("provider.create", "provider-1", "success")

    audit = repo.list_audit(limit=10)

    assert len(audit) == 1
    assert audit[0].action == "provider.create"
    assert audit[0].target_id == "provider-1"
    assert audit[0].result == "success"

