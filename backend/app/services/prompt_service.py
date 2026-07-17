from __future__ import annotations

import json
from pathlib import Path
from string import Formatter
from typing import Any


class PromptConfigurationError(RuntimeError):
    pass


class PromptService:
    def __init__(self, manifest_path: Path | None = None):
        if manifest_path is not None:
            prompts_dir = manifest_path.parent
            project_root = manifest_path.parent
        else:
            backend_root = Path(__file__).resolve().parents[2]
            if (backend_root / "prompts").is_dir():
                prompts_dir = backend_root / "prompts"
                project_root = backend_root.parent
            else:
                prompts_dir = backend_root / "backend" / "prompts"
                project_root = backend_root

        self.prompts_dir = prompts_dir
        self.project_root = project_root
        self.manifest_path = manifest_path or prompts_dir / "manifest.json"
        self._manifest = self._load_manifest()
        self.prompt_version = self._required_string("prompt_version")
        self.rules_version = self._required_string("rules_version")
        self.state_schema_version = self._required_string("state_schema_version")
        self._templates = self._load_templates()
        self._rules = self._load_rules()

    def _load_manifest(self) -> dict[str, Any]:
        try:
            value = json.loads(self.manifest_path.read_text(encoding="utf-8"))
        except FileNotFoundError as exc:
            raise PromptConfigurationError(f"Prompt manifest not found: {self.manifest_path}") from exc
        except json.JSONDecodeError as exc:
            raise PromptConfigurationError(f"Prompt manifest is invalid JSON: {exc}") from exc
        if not isinstance(value, dict):
            raise PromptConfigurationError("Prompt manifest must be a JSON object")
        return value

    def _required_string(self, key: str) -> str:
        value = self._manifest.get(key)
        if not isinstance(value, str) or not value.strip():
            raise PromptConfigurationError(f"Manifest field '{key}' must be a non-empty string")
        return value

    def _read_required_file(self, file_path: Path) -> str:
        try:
            content = file_path.read_text(encoding="utf-8").strip()
        except FileNotFoundError as exc:
            raise PromptConfigurationError(f"Required prompt/rule file not found: {file_path}") from exc
        if not content:
            raise PromptConfigurationError(f"Required prompt/rule file is empty: {file_path}")
        return content

    def _load_templates(self) -> dict[str, str]:
        prompt_specs = self._manifest.get("prompts")
        if not isinstance(prompt_specs, dict) or not prompt_specs:
            raise PromptConfigurationError("Manifest must define at least one prompt")

        templates: dict[str, str] = {}
        for name, spec in prompt_specs.items():
            if not isinstance(spec, dict) or not isinstance(spec.get("file"), str):
                raise PromptConfigurationError(f"Prompt '{name}' must define a file")
            template = self._read_required_file(self.prompts_dir / spec["file"])
            expected_variables = spec.get("variables", [])
            actual_variables = {
                field_name
                for _, field_name, _, _ in Formatter().parse(template)
                if field_name is not None
            }
            if set(expected_variables) != actual_variables:
                raise PromptConfigurationError(
                    f"Prompt '{name}' variables mismatch: expected {sorted(expected_variables)}, "
                    f"found {sorted(actual_variables)}"
                )
            templates[name] = template
        return templates

    def _load_rules(self) -> dict[str, str]:
        rule_specs = self._manifest.get("rules")
        if not isinstance(rule_specs, dict) or not rule_specs:
            raise PromptConfigurationError("Manifest must define rule files")
        rules: dict[str, str] = {}
        for name, relative_path in rule_specs.items():
            if not isinstance(relative_path, str):
                raise PromptConfigurationError(f"Rule '{name}' must define a file path")
            rules[name] = self._read_required_file(self.project_root / relative_path)
        return rules

    def get_template(self, name: str) -> str:
        try:
            return self._templates[name]
        except KeyError as exc:
            raise PromptConfigurationError(f"Unknown prompt: {name}") from exc

    def get_rule(self, name: str) -> str:
        try:
            return self._rules[name]
        except KeyError as exc:
            raise PromptConfigurationError(f"Unknown rule: {name}") from exc

    def metadata(self) -> dict[str, str]:
        return {
            "prompt_version": self.prompt_version,
            "rules_version": self.rules_version,
            "state_schema_version": self.state_schema_version,
        }


prompt_service = PromptService()
