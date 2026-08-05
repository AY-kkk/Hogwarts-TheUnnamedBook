# Production deployment topology

## Supported topology

The public MVP uses one frontend and one single-instance API service:

1. `hogwarts-frontend`: a static Vite build, suitable for Vercel or another static host.
2. `backend`: a containerized FastAPI service, suitable for any HTTPS container platform.

The model administrator persists encrypted configuration in SQLite. Run exactly one backend replica for this version and mount a persistent volume at `/app/data`. Multi-replica synchronization is intentionally outside the single-machine scope.

The frontend calls the API origin configured in `VITE_API_BASE_URL`. Production code does not silently fall back to localhost; a missing production value fails fast when an API endpoint is initialized.

## Frontend deployment

Build from the repository root:

```bash
npm run install:frontend
VITE_API_BASE_URL=https://api.example.com npm run build
```

Required frontend environment variables:

| Variable | Example | Secret |
|---|---|---|
| `VITE_API_BASE_URL` | `https://api.example.com` | No |

`VITE_*` variables are embedded into the browser bundle. Never place model API keys or private credentials in them.

The existing `vercel.json` builds `hogwarts-frontend` and rewrites frontend routes to `index.html`. It does not host or proxy the FastAPI application.

`/admin` uses an HttpOnly cookie. Put the frontend and API on the same registrable HTTPS domain, for example `game.example.com` and `api.example.com`, or reverse proxy `/api` from the frontend domain. Add the exact frontend origin to `CORS_ALLOWED_ORIGINS`.

## Backend deployment

Build the backend container from the repository root so the rules files are available to the image:

```bash
docker build -f backend/Dockerfile -t unnamed-book-api:local .
docker volume create unnamed-book-model-data
docker run --rm -p 3000:3000 \
  --env-file backend/.env \
  -v unnamed-book-model-data:/app/data \
  unnamed-book-api:local
```

Minimum runtime variables:

| Variable | Purpose | Secret |
|---|---|---|
| `APP_ENV` | `development`, `staging`, or `production` | No |
| `PORT` | Container listen port | No |
| `CORS_ALLOWED_ORIGINS` | Comma-separated frontend origins | No |
| `SESSION_SECRET` | Signs short-lived anonymous API sessions; minimum 32 random characters | Yes |
| `SESSION_TTL_SECONDS` | Anonymous session lifetime | No |
| `RATE_LIMIT_REQUESTS` | Requests allowed per session window | No |
| `RATE_LIMIT_WINDOW_SECONDS` | Rate-limit window length | No |
| `SESSION_ISSUE_LIMIT` | Session tokens issued per client/window | No |
| `MAX_REQUEST_BYTES` | Maximum declared request body size | No |
| `MAX_CONTEXT_CHARS` | Maximum serialized story context | No |
| `ADMIN_USERNAME` | Single administrator username | Yes |
| `ADMIN_PASSWORD` | Administrator password; production minimum 12 characters | Yes |
| `ADMIN_SESSION_SECRET` | Signs administrator cookies; production minimum 32 characters | Yes |
| `MODEL_CONFIG_ENCRYPTION_KEY` | Fernet key encrypting provider API keys | Yes |
| `MODEL_CONFIG_DB_PATH` | Persistent SQLite path; container default `/app/data/model-config.db` | No |
| `ALLOW_PRIVATE_MODEL_ENDPOINTS` | Development-only local endpoint opt-in; keep `false` in production | No |
| `LLM_PROVIDER` | Selected provider | No |
| `LLM_MODEL_NAME` | Selected model | No |
| Provider API key | Model authentication | Yes |

Secrets must be injected by the hosting platform. Do not upload a populated `.env` file.

Generate independent production values:

```bash
python -c 'import secrets; print(secrets.token_urlsafe(32))'
python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'
```

Use the first command separately for `SESSION_SECRET` and `ADMIN_SESSION_SECRET`. The Fernet output is only for `MODEL_CONFIG_ENCRYPTION_KEY`.

The browser obtains a signed, short-lived anonymous session from `POST /api/session` and sends it as a Bearer token. The application process enforces a per-session baseline limit. Multi-instance production deployments must also configure a shared gateway/edge rate limit because in-process counters are not shared between containers.

The container health endpoint is `GET /health`. Configure the platform health check to use this path.

## Model administrator

Open `https://game.example.com/admin`, sign in, and add a provider. The browser never receives the full API key.

| Template | Editable Base URL | Notes |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | Enter any Chat Completions model ID supported by the account |
| DeepSeek | `https://api.deepseek.com` | Official OpenAI-compatible endpoint |
| MiniMax China | `https://api.minimaxi.com/v1` | International accounts can use `https://api.minimax.io/v1` |
| GLM | `https://open.bigmodel.cn/api/paas/v4` | Standard GLM API; Coding Plan may provide a plan-specific endpoint |
| Custom | Provider supplied | Supports any OpenAI Chat Completions-compatible endpoint and arbitrary model ID |

Recommended first setup:

1. Save a provider without activating it.
2. Click model discovery. If the provider has no `/models` endpoint, enter the model ID manually.
3. Run the connection test with the selected model.
4. Activate it. New game requests use it immediately without restarting the API.
5. Open the usage panel after a game request to verify provider, model, latency and estimated Token values.

The existing `LLM_PROVIDER`, `LLM_MODEL_NAME` and provider key variables remain a fallback only while no database provider is active. A broken active database configuration fails closed instead of silently switching providers.

## Backup and recovery

Back up the SQLite file and `MODEL_CONFIG_ENCRYPTION_KEY` as one recovery unit. A database copy without its original Fernet key cannot decrypt provider credentials. Keep both in encrypted storage with separate access controls. Restore them together before starting the container.

## Local development

Use separate terminals:

```bash
npm run dev:backend
npm run dev:frontend
```

The frontend defaults to `http://localhost:3000` only in Vite development mode. Copy the example files when explicit local configuration is needed:

```bash
cp backend/.env.example backend/.env
cp hogwarts-frontend/.env.example hogwarts-frontend/.env.local
```

Replace placeholder secrets before starting the API.

To connect a local protocol simulator or local inference server, set `ALLOW_PRIVATE_MODEL_ENDPOINTS=true`. This flag is rejected when `APP_ENV=production`.

## Pre-production checks

- The frontend bundle contains the production HTTPS API origin and no provider key.
- `/health`, `/api/story/start`, `/api/chapter/title`, and `/api/chat` are reachable through HTTPS.
- The configured CORS allowlist contains only approved frontend origins.
- `/admin` can log in, save a provider, discover or manually enter a model, test and activate it.
- The backend has one writable persistent `/app/data` volume, and the SQLite file/key backup pair has been tested.
- Container logs are collected by the platform and do not expose request bodies or secrets.
- Character profiles and story history remain in the user's IndexedDB; the API is stateless and does not keep an in-memory profile registry.
