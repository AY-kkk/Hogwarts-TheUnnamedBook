# Production deployment topology

## Supported topology

The public MVP uses two independently deployable services:

1. `hogwarts-frontend`: a static Vite build, suitable for Vercel or another static host.
2. `backend`: a containerized FastAPI service, suitable for any HTTPS container platform.

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

## Backend deployment

Build the backend container from the repository root so the rules files are available to the image:

```bash
docker build -f backend/Dockerfile -t unnamed-book-api:local .
docker run --rm -p 3000:3000 --env-file backend/.env unnamed-book-api:local
```

Minimum runtime variables:

| Variable | Purpose | Secret |
|---|---|---|
| `APP_ENV` | `development`, `staging`, or `production` | No |
| `PORT` | Container listen port | No |
| `CORS_ALLOWED_ORIGINS` | Comma-separated frontend origins | No |
| `LLM_PROVIDER` | Selected provider | No |
| `LLM_MODEL_NAME` | Selected model | No |
| Provider API key | Model authentication | Yes |

Secrets must be injected by the hosting platform. Do not upload a populated `.env` file.

The container health endpoint is `GET /health`. Configure the platform health check to use this path.

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

## Pre-production checks

- The frontend bundle contains the production HTTPS API origin and no provider key.
- `/health`, `/api/wizard-profile`, `/api/story/start`, `/api/chapter/title`, and `/api/chat` are reachable through HTTPS.
- The configured CORS allowlist contains only approved frontend origins.
- Container logs are collected by the platform and do not expose request bodies or secrets.
- The current in-memory profile store is not considered production persistence; it must be removed or redesigned by the P0 data-isolation task before release.
