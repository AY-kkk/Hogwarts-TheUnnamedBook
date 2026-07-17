# Production rollback runbook

## Trigger

Rollback immediately for character data loss, authentication bypass, unsafe model output escaping controls, sustained 5xx errors, budget runaway or a legal takedown instruction.

## Procedure

1. Identify the last known-good production commit from the successful release workflow.
2. Open `Release or rollback`, choose `production`, select `rollback`, and paste that immutable 40-character commit SHA.
3. Obtain the protected-environment approval. The workflow rebuilds/publishes the old backend image and redeploys the matching frontend.
4. Confirm `/health` reports the expected version, then run session creation, role selection and one non-destructive story smoke check.
5. Confirm error and cost metrics return below thresholds. Announce completion and open a follow-up incident.

Target elapsed time is under 10 minutes after approval. A frontend rollback never downgrades or deletes IndexedDB. If an incompatible database schema shipped, publish a forward-fix with a higher schema version instead of forcing browser data backward.

## Drill record

| Date | Environment | From SHA | To SHA | Duration | Operator | Result |
|---|---|---|---|---:|---|---|
| TBD | staging | TBD | TBD | TBD | TBD | Not Run |
