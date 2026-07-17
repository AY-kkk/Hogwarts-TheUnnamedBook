#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -n "${PYTHON_BIN:-}" ]]; then
  PYTHON="$PYTHON_BIN"
elif [[ -x "$ROOT/.venv/bin/python" ]]; then
  PYTHON="$ROOT/.venv/bin/python"
elif [[ -x "$ROOT/.venv-security/bin/python" ]]; then
  PYTHON="$ROOT/.venv-security/bin/python"
else
  PYTHON="python3"
fi

export PYTHONPATH="$ROOT/backend"
export APP_ENV="test"
export SESSION_SECRET="quality-gate-session-secret-32-characters"
export METRICS_TOKEN="quality-gate-metrics-token-32-characters"
export CORS_ALLOWED_ORIGINS="https://frontend.invalid.example"
export VITE_API_BASE_URL="https://api.invalid.example"
export VITE_OPERATOR_NAME="Quality Gate Operator"
export VITE_PRIVACY_CONTACT="privacy@example.com"
export VITE_MODEL_DATA_DESTINATIONS="Quality Gate Model Region"
export VITE_MINIMUM_AGE="16"

echo "[1/8] Backend tests"
"$PYTHON" -m pytest -q backend/tests

echo "[2/8] Backend bytecode compilation"
"$PYTHON" -m compileall -q backend/app

echo "[3/8] Python dependency audit"
"$PYTHON" -m pip check
"$PYTHON" -m pip_audit --local --progress-spinner=off

echo "[4/8] Frontend tests"
npm --prefix hogwarts-frontend test

echo "[5/8] Frontend lint"
npm --prefix hogwarts-frontend run lint

echo "[6/8] Frontend production build"
npm --prefix hogwarts-frontend run build

echo "[7/8] Node dependency audit"
npm --prefix hogwarts-frontend audit --audit-level=high

echo "[8/8] Secret and release-config checks"
"$PYTHON" scripts/scan_secrets.py
"$PYTHON" - <<'PY'
from pathlib import Path
import yaml

for path in [*Path('.github/workflows').glob('*.yml'), Path('.github/dependabot.yml')]:
    yaml.safe_load(path.read_text(encoding='utf-8'))
    print(f"Valid YAML: {path}")
PY
IP_AUTHORIZATION_REFERENCE="quality-gate-ip-review" \
LEGAL_REVIEW_REFERENCE="quality-gate-legal-review" \
RELEASE_ONCALL_OWNER="quality-gate-oncall" \
VERCEL_ORG_ID="quality-gate-org" \
VERCEL_PROJECT_ID="quality-gate-project" \
"$PYTHON" .github/scripts/check_release_config.py

echo "Quality gate passed"
