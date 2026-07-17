# Staging and production environments

Create protected GitHub environments named `staging` and `production`. Production must require at least one reviewer who is not the release initiator.

## Environment variables

| GitHub environment variable | Staging | Production |
|---|---|---|
| `VITE_API_BASE_URL` | Staging API HTTPS origin | Production API HTTPS origin |
| `VITE_OPERATOR_NAME` | Reviewed staging label | Legal operator name |
| `VITE_PRIVACY_CONTACT` | Test contact | Published privacy contact |
| `VITE_MODEL_DATA_DESTINATIONS` | Staging provider/region | Production provider/region |
| `VITE_MINIMUM_AGE` | Reviewed test threshold | Legally reviewed threshold (13-18) |
| `BACKEND_HEALTH_URL` | Staging API origin | Production API origin |
| `IP_AUTHORIZATION_REFERENCE` | Internal evidence reference | Approved release evidence reference |
| `LEGAL_REVIEW_REFERENCE` | Staging review ticket | Final legal sign-off reference |
| `RELEASE_ONCALL_OWNER` | Named staging owner | Named production on-call owner |

## Environment secrets

- `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`
- `BACKEND_DEPLOY_HOOK_URL`, `BACKEND_DEPLOY_HOOK_TOKEN`

The backend deployment hook must accept authenticated JSON containing immutable `image` and `sha` values and deploy exactly that image. Model keys, session/metrics secrets, CORS configuration and budgets belong in the backend platform's environment, not GitHub workflow source.

## Promotion

1. Merge only after CI passes.
2. Run `Release or rollback` for `staging` with a full 40-character commit SHA.
3. Complete smoke, product, data migration and monitoring checks in staging.
4. Run the same commit SHA for `production`; the protected environment reviewer approves it.
5. Record the workflow URL and deployed SHA in the Go/No-Go checklist.

Staging and production use the same source commit and container. Only endpoints, credentials, legal labels, model configuration, limits and alert destinations differ.
