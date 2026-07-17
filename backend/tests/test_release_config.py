from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

import pytest


SCRIPT = Path(__file__).resolve().parents[2] / ".github" / "scripts" / "check_release_config.py"
SPEC = spec_from_file_location("check_release_config", SCRIPT)
assert SPEC and SPEC.loader
MODULE = module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def valid_environment(**changes):
    environment = {
        "VITE_API_BASE_URL": "https://api.example.com",
        "VITE_OPERATOR_NAME": "Example Operator",
        "VITE_PRIVACY_CONTACT": "privacy@example.com",
        "VITE_MODEL_DATA_DESTINATIONS": "Provider region",
        "VITE_MINIMUM_AGE": "16",
        "IP_AUTHORIZATION_REFERENCE": "ip-review-123",
        "LEGAL_REVIEW_REFERENCE": "legal-review-123",
        "RELEASE_ONCALL_OWNER": "oncall@example.com",
        "VERCEL_ORG_ID": "org-123",
        "VERCEL_PROJECT_ID": "project-123",
    }
    environment.update(changes)
    return environment


def test_protected_release_configuration_accepts_complete_values():
    MODULE.validate_release_config(valid_environment())


@pytest.mark.parametrize("age", ["12", "19", "sixteen"])
def test_age_gate_configuration_fails_closed(age):
    with pytest.raises(ValueError, match="VITE_MINIMUM_AGE"):
        MODULE.validate_release_config(valid_environment(VITE_MINIMUM_AGE=age))


@pytest.mark.parametrize("url", ["http://api.example.com", "https://localhost:3000"])
def test_public_api_must_use_a_non_local_https_endpoint(url):
    with pytest.raises(ValueError, match="non-local HTTPS"):
        MODULE.validate_release_config(valid_environment(VITE_API_BASE_URL=url))
