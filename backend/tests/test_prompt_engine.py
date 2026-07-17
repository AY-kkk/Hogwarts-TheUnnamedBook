import json
from pathlib import Path

import pytest

from app.services.orchestration import append_trace, next_step_for_intent
from app.services.prompt_service import PromptConfigurationError, PromptService, prompt_service


def test_production_manifest_loads_versioned_prompts_and_rules():
    assert prompt_service.prompt_version.startswith("prompt-")
    assert prompt_service.rules_version.startswith("rules-")
    assert "{user_input}" in prompt_service.get_template("intent")
    assert "#9. 状态更新协议" in prompt_service.get_rule("core")


@pytest.mark.parametrize(
    ("intent", "expected"),
    [
        ("action", "simulate_mechanics"),
        ("chat", "generate_narrative"),
        ("invalid", "handle_invalid"),
    ],
)
def test_intent_routes_are_explicit(intent, expected):
    assert next_step_for_intent(intent) == expected


def test_unknown_intent_fails_closed():
    with pytest.raises(ValueError):
        next_step_for_intent("surprise")


def test_trace_preserves_execution_order():
    trace = append_trace(None, "intent")
    trace = append_trace(trace, "simulator")
    trace = append_trace(trace, "narrator")
    assert trace == ["intent", "simulator", "narrator"]


def test_missing_required_prompt_file_fails_startup(tmp_path: Path):
    (tmp_path / "core.md").write_text("rules", encoding="utf-8")
    manifest = {
        "prompt_version": "p1",
        "rules_version": "r1",
        "rules": {"core": "core.md"},
        "prompts": {"missing": {"file": "missing.md", "variables": []}},
    }
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    with pytest.raises(PromptConfigurationError, match="not found"):
        PromptService(manifest_path)


def test_template_variable_mismatch_fails_startup(tmp_path: Path):
    (tmp_path / "core.md").write_text("rules", encoding="utf-8")
    (tmp_path / "prompt.md").write_text("Hello {name}", encoding="utf-8")
    manifest = {
        "prompt_version": "p1",
        "rules_version": "r1",
        "rules": {"core": "core.md"},
        "prompts": {"hello": {"file": "prompt.md", "variables": []}},
    }
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    with pytest.raises(PromptConfigurationError, match="variables mismatch"):
        PromptService(manifest_path)
