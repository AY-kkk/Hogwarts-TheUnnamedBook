# OpenAI-Compatible Model Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a secure single-instance administrator console that configures, discovers, tests and hot-switches arbitrary OpenAI Chat Completions compatible models and displays basic usage.

**Architecture:** FastAPI owns authentication, encrypted SQLite persistence, compatible-provider calls and runtime resolution. React renders a separate `/admin` application and never receives a full API key. The existing environment-variable model path remains only as a fallback when no database provider is active.

**Tech Stack:** Python 3.12+, FastAPI, sqlite3, cryptography/Fernet, OpenAI Python SDK, LangChain `ChatOpenAI`, React 19, TypeScript, Tailwind CSS, Vitest, Pytest, Playwright CLI.

## Global Constraints

- Single administrator identified by `ADMIN_USERNAME` and `ADMIN_PASSWORD`.
- Production requires a 32-character `ADMIN_SESSION_SECRET` and a valid Fernet `MODEL_CONFIG_ENCRYPTION_KEY`.
- Full API keys never appear in API responses, logs, audit records, frontend state or test output.
- Production provider URLs require HTTPS and reject private, loopback, link-local, reserved and unspecified destinations.
- `ALLOW_PRIVATE_MODEL_ENDPOINTS=true` is accepted only outside production for the local protocol simulator.
- One and only one provider/model pair may be active.
- Database activation affects new model calls without restarting or interrupting calls already in progress.
- Model discovery is optional; arbitrary valid model IDs remain manually configurable.
- Usage values are explicitly labelled estimates and never store prompts or generated text.
- No multi-admin roles, PostgreSQL, user administration, billing or report moderation in this plan.

---

### Task 1: Administrator settings and signed session

**Files:**
- Create: `backend/app/admin/__init__.py`
- Create: `backend/app/admin/settings.py`
- Create: `backend/app/admin/auth.py`
- Test: `backend/tests/test_admin_auth.py`
- Modify: `backend/.env.example`

**Interfaces:**
- Produces: `AdminSettings.from_env() -> AdminSettings`
- Produces: `AdminSessionManager.issue(username, now=None) -> tuple[str, int]`
- Produces: `AdminSessionManager.verify(token, now=None) -> str`
- Produces: `AdminAuthenticator.authenticate(username, password) -> bool`

- [ ] **Step 1: Write failing configuration and authentication tests**

```python
def test_production_admin_settings_require_strong_secrets(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("ADMIN_USERNAME", "owner")
    monkeypatch.setenv("ADMIN_PASSWORD", "short")
    with pytest.raises(RuntimeError, match="ADMIN_PASSWORD"):
        AdminSettings.from_env()

def test_signed_admin_session_expires():
    manager = AdminSessionManager("s" * 32, ttl_seconds=60)
    token, _ = manager.issue("owner", now=100)
    assert manager.verify(token, now=159) == "owner"
    with pytest.raises(AdminSessionError):
        manager.verify(token, now=160)
```

- [ ] **Step 2: Run RED tests**

Run: `cd backend && ../.venv-security/bin/python -m pytest -q tests/test_admin_auth.py`

Expected: collection fails because `app.admin.settings` and `app.admin.auth` do not exist.

- [ ] **Step 3: Implement settings, constant-time credentials and HMAC session**

```python
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

    @classmethod
    def from_env(cls) -> "AdminSettings": ...

class AdminAuthenticator:
    def authenticate(self, username: str, password: str) -> bool:
        username_ok = hmac.compare_digest(username, self._username)
        supplied = hashlib.scrypt(password.encode(), salt=self._salt, n=2**14, r=8, p=1)
        return username_ok and hmac.compare_digest(supplied, self._password_digest)
```

Use the same base64url HMAC structure as the anonymous session, but a distinct `admin` payload containing `sub`, `sid` and `exp`.

- [ ] **Step 4: Run GREEN tests and existing security tests**

Run: `cd backend && ../.venv-security/bin/python -m pytest -q tests/test_admin_auth.py tests/test_security.py`

Expected: all selected tests pass.

- [ ] **Step 5: Document exact admin environment variables and commit**

```bash
git add backend/app/admin backend/tests/test_admin_auth.py backend/.env.example
git commit -m "feat: add secure administrator sessions"
```

### Task 2: Encrypted SQLite provider repository

**Files:**
- Create: `backend/app/admin/schemas.py`
- Create: `backend/app/admin/repository.py`
- Test: `backend/tests/test_model_repository.py`
- Modify: `backend/requirements.txt`
- Modify: `backend/requirements-dev.txt`

**Interfaces:**
- Produces: `ProviderCreate`, `ProviderUpdate`, `ProviderRecord`, `UsageRecord`, `UsageSummary`
- Produces: `ModelConfigRepository.create_provider(data) -> ProviderRecord`
- Produces: `update_provider`, `list_providers`, `get_provider`, `delete_provider`, `activate_provider`
- Produces: `get_active_runtime() -> RuntimeProvider | None`
- Produces: `record_usage(record) -> None`, `usage_summary(window) -> UsageSummary`, `list_audit(limit) -> list[AuditRecord]`

- [ ] **Step 1: Write failing encryption, redaction and activation tests**

```python
def test_repository_encrypts_key_and_redacts_reads(tmp_path, fernet_key):
    repo = ModelConfigRepository(tmp_path / "models.db", fernet_key)
    provider = repo.create_provider(ProviderCreate(
        name="DeepSeek", preset="deepseek", base_url="https://api.deepseek.com",
        api_key="secret-value-1234", models=["deepseek-chat"], is_enabled=True,
    ))
    assert provider.api_key_last4 == "1234"
    assert "secret-value-1234" not in (tmp_path / "models.db").read_bytes().decode("latin1")
    assert repo.get_active_runtime() is None

def test_activation_is_atomic_and_active_provider_cannot_be_deleted(repo):
    first = create_provider(repo, "One")
    second = create_provider(repo, "Two")
    repo.activate_provider(first.id, "model-one")
    repo.activate_provider(second.id, "model-two")
    assert [row.is_active for row in repo.list_providers()] == [False, True]
    with pytest.raises(ActiveProviderError):
        repo.delete_provider(second.id)
```

- [ ] **Step 2: Run RED repository tests**

Run: `cd backend && ../.venv-security/bin/python -m pytest -q tests/test_model_repository.py`

Expected: collection fails because repository types are missing.

- [ ] **Step 3: Add `cryptography==46.0.5` and implement focused sqlite3 repository**

```python
class ModelConfigRepository:
    def __init__(self, database_path: Path, encryption_key: str):
        self._database_path = database_path
        self._fernet = Fernet(encryption_key.encode("ascii"))
        self._initialize()

    def activate_provider(self, provider_id: str, model: str) -> ProviderRecord:
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute("UPDATE model_providers SET is_active = 0")
            changed = connection.execute(
                "UPDATE model_providers SET is_active = 1, active_model = ? WHERE id = ? AND is_enabled = 1",
                (model, provider_id),
            )
            if changed.rowcount != 1:
                raise ProviderNotFoundError(provider_id)
        return self.get_provider(provider_id)
```

Use parameterized SQL everywhere, set `PRAGMA foreign_keys=ON`, create indexes on usage timestamp/provider/model, and never include ciphertext in public records.

- [ ] **Step 4: Run GREEN tests plus dependency audit**

Run: `cd backend && ../.venv-security/bin/python -m pytest -q tests/test_model_repository.py`

Run: `.venv-security/bin/python -m pip_audit --local --progress-spinner=off`

Expected: repository tests pass and no known vulnerabilities are reported.

- [ ] **Step 5: Commit encrypted persistence**

```bash
git add backend/app/admin/schemas.py backend/app/admin/repository.py backend/tests/test_model_repository.py backend/requirements*.txt
git commit -m "feat: persist encrypted model provider settings"
```

### Task 3: Safe OpenAI-compatible discovery and connection test

**Files:**
- Create: `backend/app/admin/endpoint_policy.py`
- Create: `backend/app/admin/compatible_client.py`
- Test: `backend/tests/test_compatible_client.py`

**Interfaces:**
- Produces: `validate_provider_url(url, app_env, allow_private) -> str`
- Produces: `OpenAICompatibleClient.list_models(runtime) -> list[str]`
- Produces: `OpenAICompatibleClient.test_chat(runtime, model) -> ConnectionTestResult`
- Consumes: `RuntimeProvider` from Task 2

- [ ] **Step 1: Write URL-policy and protocol tests before implementation**

```python
def test_production_rejects_loopback_and_http(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", lambda *args: [(2, 1, 6, "", ("127.0.0.1", 0))])
    with pytest.raises(EndpointPolicyError):
        validate_provider_url("https://provider.example/v1", "production", False)
    with pytest.raises(EndpointPolicyError):
        validate_provider_url("http://public.example/v1", "production", False)

@pytest.mark.asyncio
async def test_discovers_and_sorts_models(mock_transport, runtime_provider):
    client = OpenAICompatibleClient(transport=mock_transport([
        {"id": "z-model", "object": "model"}, {"id": "a-model", "object": "model"}
    ]))
    assert await client.list_models(runtime_provider) == ["a-model", "z-model"]
```

- [ ] **Step 2: Run RED client tests**

Run: `cd backend && ../.venv-security/bin/python -m pytest -q tests/test_compatible_client.py`

Expected: collection fails for missing policy/client modules.

- [ ] **Step 3: Implement DNS-aware policy and SDK wrapper**

```python
async def list_models(self, provider: RuntimeProvider) -> list[str]:
    client = AsyncOpenAI(api_key=provider.api_key, base_url=provider.base_url, http_client=self._http_client())
    page = await asyncio.wait_for(client.models.list(), timeout=self._timeout_seconds)
    return sorted({item.id.strip() for item in page.data if item.id and item.id.strip()})

async def test_chat(self, provider: RuntimeProvider, model: str) -> ConnectionTestResult:
    started = time.perf_counter()
    response = await asyncio.wait_for(
        client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": "Reply with OK."}],
            max_tokens=8,
        ),
        timeout=self._timeout_seconds,
    )
    return ConnectionTestResult(ok=True, model=response.model or model, latency_ms=...)
```

Map authentication, rate-limit, timeout and malformed response errors to stable codes while retaining only safe messages.

- [ ] **Step 4: Run GREEN tests**

Run: `cd backend && ../.venv-security/bin/python -m pytest -q tests/test_compatible_client.py`

Expected: success and failure protocol cases pass.

- [ ] **Step 5: Commit compatible-client support**

```bash
git add backend/app/admin/endpoint_policy.py backend/app/admin/compatible_client.py backend/tests/test_compatible_client.py
git commit -m "feat: discover and test OpenAI-compatible models"
```

### Task 4: Authenticated administrator API

**Files:**
- Create: `backend/app/admin/router.py`
- Test: `backend/tests/test_admin_api.py`
- Modify: `backend/app/main.py`

**Interfaces:**
- Produces all `/api/admin/*` endpoints defined by the design specification.
- Consumes `AdminSettings`, `AdminSessionManager`, `AdminAuthenticator`, `ModelConfigRepository`, `OpenAICompatibleClient`.

- [ ] **Step 1: Write a failing API flow test**

```python
def test_admin_can_login_create_discover_test_and_activate(admin_client, provider_transport):
    login = admin_client.post("/api/admin/session", json={"username": "owner", "password": "correct-password"})
    assert login.status_code == 204
    created = admin_client.post("/api/admin/providers", json={
        "name": "Local Compatible", "preset": "custom", "base_url": "http://127.0.0.1:9901/v1",
        "api_key": "local-key-1234", "models": [], "is_enabled": True,
    })
    assert created.status_code == 201
    assert "local-key-1234" not in created.text
    provider_id = created.json()["id"]
    assert admin_client.post(f"/api/admin/providers/{provider_id}/discover").json()["models"] == ["mock-chat"]
    assert admin_client.post(f"/api/admin/providers/{provider_id}/test", json={"model": "mock-chat"}).json()["ok"] is True
    assert admin_client.post(f"/api/admin/providers/{provider_id}/activate", json={"model": "mock-chat"}).status_code == 200
```

- [ ] **Step 2: Run RED API test**

Run: `cd backend && ../.venv-security/bin/python -m pytest -q tests/test_admin_api.py`

Expected: admin endpoints return 404.

- [ ] **Step 3: Implement dependency-injected router and secure cookie**

```python
router = APIRouter(prefix="/api/admin", tags=["admin"])

@router.post("/session", status_code=204)
def login(payload: LoginRequest, response: Response, request: Request):
    if not authenticator.authenticate(payload.username, payload.password):
        raise HTTPException(status_code=401, detail="Invalid administrator credentials")
    token, ttl = sessions.issue(payload.username)
    response.set_cookie("unnamed_book_admin", token, httponly=True, secure=settings.app_env == "production",
                        samesite="lax", max_age=ttl, path="/api/admin")

@router.post("/providers/{provider_id}/activate")
def activate(provider_id: str, payload: ActivateRequest, admin: str = Depends(require_admin)):
    return repository.activate_provider(provider_id, payload.model)
```

Add CORS credentials, `PATCH` and `DELETE` methods, then include the router in `app.main`. Convert repository/policy/upstream errors to 400/401/404/409/422/429/502/504 consistently.

- [ ] **Step 4: Run GREEN API and existing security tests**

Run: `cd backend && ../.venv-security/bin/python -m pytest -q tests/test_admin_api.py tests/test_security.py`

Expected: all selected tests pass and the API never serializes a full key.

- [ ] **Step 5: Commit administrator API**

```bash
git add backend/app/admin/router.py backend/app/main.py backend/tests/test_admin_api.py
git commit -m "feat: add model administration API"
```

### Task 5: Runtime hot-switch and persistent usage

**Files:**
- Create: `backend/app/services/runtime_model.py`
- Test: `backend/tests/test_runtime_model.py`
- Modify: `backend/app/services/llm_factory.py`
- Modify: `backend/app/services/agents/intent_agent.py`
- Modify: `backend/app/services/agents/narrator_agent.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/observability.py`
- Test: `backend/tests/test_observability.py`

**Interfaces:**
- Produces: `RuntimeModelResolver.resolve() -> ResolvedModel`
- Produces: `LLMFactory.describe_active() -> ResolvedModel`
- Extends budget reservation with immutable provider/model metadata and a start timestamp.

- [ ] **Step 1: Write failing hot-switch and usage tests**

```python
def test_factory_reads_active_provider_for_each_new_call(repo, monkeypatch):
    first = create_and_activate(repo, "First", "https://first.example/v1", "model-a")
    one = LLMFactory.create_llm(repository=repo)
    repo.activate_provider(create_provider(repo, "Second").id, "model-b")
    two = LLMFactory.create_llm(repository=repo)
    assert one.model_name == "model-a"
    assert str(one.openai_api_base).startswith("https://first.example")
    assert two.model_name == "model-b"

def test_usage_summary_contains_no_story_content(repo):
    repo.record_usage(UsageRecord(endpoint="chat", provider_name="DeepSeek", model="deepseek-chat",
                                  outcome="success", latency_ms=120, input_tokens=25, output_tokens=50,
                                  request_id="request-1234"))
    summary = repo.usage_summary("24h")
    assert summary.total_requests == 1
    assert summary.input_tokens == 25
    assert "story" not in json.dumps(summary.model_dump())
```

- [ ] **Step 2: Run RED runtime tests**

Run: `cd backend && ../.venv-security/bin/python -m pytest -q tests/test_runtime_model.py tests/test_observability.py`

Expected: new resolver and usage contract are missing.

- [ ] **Step 3: Implement per-call resolution and lazy agents**

```python
class RuntimeModelResolver:
    def resolve(self) -> ResolvedModel:
        active = self._repository.get_active_runtime()
        if active:
            return ResolvedModel(provider_id=active.id, provider_name=active.name, model=active.active_model,
                                 base_url=active.base_url, api_key=active.api_key, source="database")
        return ResolvedModel.from_environment()

class IntentAnalyzer:
    async def analyze(self, user_input: str, context: dict[str, Any]) -> dict[str, Any]:
        llm = LLMFactory.create_llm()
        chain = self.prompt | llm | self.parser
        return await chain.ainvoke(...)
```

Apply the same lazy creation to `NarratorAgent`. Capture `ResolvedModel` when budget is reserved and persist outcome/latency/token estimates when settled. Use the captured model in response metadata and `/health` instead of module-level environment constants.

- [ ] **Step 4: Run GREEN runtime tests and all backend tests**

Run: `cd backend && ../.venv-security/bin/python -m pytest -q tests`

Expected: all backend tests pass.

- [ ] **Step 5: Commit hot-switch and usage integration**

```bash
git add backend/app/services/runtime_model.py backend/app/services/llm_factory.py backend/app/services/agents backend/app/main.py backend/app/observability.py backend/tests
git commit -m "feat: hot-switch active models and record usage"
```

### Task 6: Typed administrator frontend client

**Files:**
- Create: `hogwarts-frontend/src/services/adminApi.ts`
- Test: `hogwarts-frontend/src/services/adminApi.test.ts`

**Interfaces:**
- Produces: `adminLogin`, `adminLogout`, `getAdminSession`, provider CRUD, `discoverModels`, `testProvider`, `activateProvider`, `getUsage`, `getAudit`.
- All calls use `credentials: 'include'`; 401 responses become `AdminAuthenticationError`.

- [ ] **Step 1: Write failing client tests with a fetch stub**

```typescript
it('uses credentialed requests and never sends an omitted edit key', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(providerFixture));
  await updateProvider('provider-1', { name: 'DeepSeek', api_key: '' });
  const [, init] = fetchMock.mock.calls[0];
  expect(init?.credentials).toBe('include');
  expect(JSON.parse(String(init?.body))).not.toHaveProperty('api_key');
});
```

- [ ] **Step 2: Run RED frontend client test**

Run: `npm --prefix hogwarts-frontend test -- src/services/adminApi.test.ts`

Expected: import fails because `adminApi.ts` does not exist.

- [ ] **Step 3: Implement explicit types and request helper**

```typescript
async function adminRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(apiUrl(`/api/admin${path}`), {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  if (response.status === 401) throw new AdminAuthenticationError();
  if (!response.ok) throw new Error(await getAdminError(response));
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
```

- [ ] **Step 4: Run GREEN client tests**

Run: `npm --prefix hogwarts-frontend test -- src/services/adminApi.test.ts`

Expected: all admin client tests pass.

- [ ] **Step 5: Commit typed frontend client**

```bash
git add hogwarts-frontend/src/services/adminApi.ts hogwarts-frontend/src/services/adminApi.test.ts
git commit -m "feat: add typed model admin client"
```

### Task 7: Responsive React administrator console

**Files:**
- Create: `hogwarts-frontend/src/components/admin/AdminApp.tsx`
- Create: `hogwarts-frontend/src/components/admin/AdminLogin.tsx`
- Create: `hogwarts-frontend/src/components/admin/ProviderEditor.tsx`
- Create: `hogwarts-frontend/src/components/admin/ProviderList.tsx`
- Create: `hogwarts-frontend/src/components/admin/UsageDashboard.tsx`
- Create: `hogwarts-frontend/src/components/admin/AdminAudit.tsx`
- Create: `hogwarts-frontend/src/components/admin/admin.css`
- Test: `hogwarts-frontend/src/components/admin/AdminApp.test.tsx`
- Modify: `hogwarts-frontend/src/main.tsx`

**Interfaces:**
- Consumes all Task 6 service functions.
- `/admin` renders `AdminApp`; every other path renders the existing player `App` unchanged.

- [ ] **Step 1: Write failing login, manual-model and activation UI tests**

```tsx
it('allows a signed-in administrator to save and activate a manual model', async () => {
  mockAdminSession({ authenticated: true, username: 'owner' });
  render(<AdminApp />);
  await user.click(await screen.findByRole('button', { name: '添加供应商' }));
  await user.selectOptions(screen.getByLabelText('供应商模板'), 'deepseek');
  await user.type(screen.getByLabelText('模型 ID'), 'deepseek-chat');
  await user.click(screen.getByRole('button', { name: '保存配置' }));
  await user.click(await screen.findByRole('button', { name: '激活 deepseek-chat' }));
  expect(await screen.findByText('当前激活')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run RED UI tests**

Run: `npm --prefix hogwarts-frontend test -- src/components/admin/AdminApp.test.tsx`

Expected: admin components are missing.

- [ ] **Step 3: Implement login and dashboard composition**

```tsx
export function AdminApp() {
  const [session, setSession] = useState<AdminSession | null>(null);
  if (session === null) return <AdminBoot onSession={setSession} />;
  if (!session.authenticated) return <AdminLogin onAuthenticated={setSession} />;
  return <AdminDashboard session={session} />;
}

const root = window.location.pathname.startsWith('/admin') ? <AdminApp /> : <App />;
createRoot(document.getElementById('root')!).render(<StrictMode>{root}</StrictMode>);
```

Use labelled controls, keyboard focus rings, `aria-live` result regions, disabled loading buttons, masked keys and a confirmation dialog for deletion. Presets prefill URLs but remain editable. Usage tabs request `24h`, `7d` and `30d` aggregates.

- [ ] **Step 4: Run GREEN UI tests, lint and production build**

Run: `npm --prefix hogwarts-frontend test -- src/components/admin/AdminApp.test.tsx`

Run: `npm --prefix hogwarts-frontend run lint && VITE_API_BASE_URL=https://api.example.com VITE_OPERATOR_NAME=Operator VITE_PRIVACY_CONTACT=privacy@example.com VITE_MODEL_DATA_DESTINATIONS=Provider VITE_MINIMUM_AGE=16 npm --prefix hogwarts-frontend run build`

Expected: tests, lint and build pass with no TypeScript errors.

- [ ] **Step 5: Commit administrator UI**

```bash
git add hogwarts-frontend/src/components/admin hogwarts-frontend/src/main.tsx
git commit -m "feat: add model administration console"
```

### Task 8: Protocol simulator, documentation and end-to-end proof

**Files:**
- Create: `backend/tests/support/openai_compatible_server.py`
- Create: `backend/tests/test_admin_e2e.py`
- Modify: `docs/deployment/production.md`
- Modify: `docs/launch/verification_report.md`
- Modify: `scripts/quality_gate.sh`

**Interfaces:**
- Simulator serves `GET /v1/models` and `POST /v1/chat/completions` with OpenAI-compatible JSON.
- E2E proves login → provider creation → discovery → test → activation → runtime model resolution → usage query.

- [ ] **Step 1: Write the failing full-flow test**

```python
def test_complete_admin_to_runtime_flow(admin_client, compatible_server):
    admin_client.post("/api/admin/session", json={"username": "owner", "password": "correct-password"})
    provider = admin_client.post("/api/admin/providers", json=compatible_server.provider_payload).json()
    models = admin_client.post(f"/api/admin/providers/{provider['id']}/discover").json()["models"]
    assert models == ["mock-chat"]
    assert admin_client.post(f"/api/admin/providers/{provider['id']}/test", json={"model": "mock-chat"}).json()["ok"]
    admin_client.post(f"/api/admin/providers/{provider['id']}/activate", json={"model": "mock-chat"})
    assert LLMFactory.describe_active().model == "mock-chat"
```

- [ ] **Step 2: Run RED E2E test, then implement simulator fixtures**

Run: `cd backend && ../.venv-security/bin/python -m pytest -q tests/test_admin_e2e.py`

Expected: fails until the complete integration is wired.

- [ ] **Step 3: Run the full quality gate**

Run: `npm run quality`

Expected: all backend/frontend tests, audits, lint, build, secret scan, YAML and release configuration checks pass.

- [ ] **Step 4: Start local services and verify in a headed browser**

Run the simulator on `127.0.0.1:9901`, FastAPI on `127.0.0.1:3000` with test admin/encryption settings, and Vite on `127.0.0.1:4173`. Use Playwright CLI to:

1. Open `http://127.0.0.1:4173/admin`.
2. Log in as the local test administrator.
3. Add a custom provider pointing to `http://127.0.0.1:9901/v1`.
4. Discover `mock-chat`, test it and activate it.
5. Confirm the active-model banner and usage table.
6. Confirm browser console has zero errors and capture `output/playwright/model-admin.png`.

- [ ] **Step 5: Update deployment and verification documentation**

Document environment generation, persistent volume path, API-key backup coupling, provider setup and DeepSeek/MiniMax/GLM/custom examples without real keys.

- [ ] **Step 6: Commit end-to-end evidence**

```bash
git add backend/tests/support backend/tests/test_admin_e2e.py docs scripts/quality_gate.sh
git commit -m "test: verify model admin end to end"
```

### Task 9: Completion audit and final handoff

**Files:**
- Verify all files named in Tasks 1-8.
- No new production files unless a failed requirement requires a focused fix and regression test.

- [ ] **Step 1: Map every design success criterion to evidence**

Check authentication, CRUD, templates, discovery/manual entry, connection test, activation, hot switching, usage, encryption/redaction, environment fallback, simulator E2E and browser rendering against tests or runtime evidence.

- [ ] **Step 2: Verify repository state and commits**

Run: `git status --short && git log --oneline -12`

Expected: clean working tree and one focused commit per completed task.

- [ ] **Step 3: Present the running console**

Leave the local admin frontend and backend running, provide `http://127.0.0.1:4173/admin`, display the screenshot, state the local demo credentials, and explain that a real provider Key must be entered by the owner for an external live request.
