# Public MVP observability and cost controls

## Signals

- Every HTTP response includes `X-Request-ID`; valid caller-supplied IDs are preserved.
- JSON logs contain request ID, route, status, latency, optional pseudonymous character UUID, model, outcome and estimated cost.
- Logs intentionally exclude profile fields, user input, story context, generated narrative, API keys and session tokens.
- `GET /metrics` exposes Prometheus text only to `Authorization: Bearer $METRICS_TOKEN`.
- `GET /health` exposes application version, uptime and selected model/provider without credentials.

Token and cost counts are estimates based on four characters per token because the current orchestration layer does not expose consistent provider usage metadata. Finance must replace the configured rates whenever the production model or provider price changes.

## Required alerts

| Alert | Initial threshold | Window | Owner |
|---|---:|---:|---|
| HTTP 5xx ratio | > 2% | 5 minutes | On-call engineer (TBD) |
| AI error/timeout ratio | > 5% | 10 minutes | AI on-call (TBD) |
| p95 API duration | > 30 seconds | 10 minutes | Backend owner (TBD) |
| Estimated hourly model cost | > USD 10 | 1 hour | Product + finance (TBD) |
| Budget rejections | > 10 | 15 minutes | Product + abuse operations (TBD) |
| No successful health scrape | 2 consecutive checks | 2 minutes | Platform owner (TBD) |

## Budget behavior

- Each anonymous session receives the `SESSION_BUDGET_USD` ceiling.
- A conservative estimated maximum is reserved before each model workflow so concurrent calls cannot all pass the same remaining budget.
- Successful calls settle to estimated input/output usage. Failed, cancelled and timed-out calls conservatively charge the reservation because the upstream provider may already have billed work.
- Exceeding the ceiling returns HTTP 429 before a new model call begins.
- In-process budget state is a single-container baseline. Multi-instance production must enforce the same ceiling through a shared store or API gateway.

## Dashboard minimum

Display request volume/status, latency, AI outcomes by endpoint/model, estimated model cost, budget rejections, deployed version and health. The dashboard and alert receiver must be linked in the release checklist before Go/No-Go.
