# Rollback Runbook

Use this runbook when production deploy health degrades or synthetic checks fail.

## Trigger Conditions

- `/health` not returning HTTP 200 for 3 minutes.
- Synthetic login + CRUD checks fail twice in a row.
- Alert webhook reports sustained DB/auth failure spikes.

## Immediate Actions

1. Pause active rollout pipeline and disable auto-promote.
2. Capture current failing deploy ID/commit SHA.
3. Roll back production service to last known-good deploy in Render.

## Verification After Rollback

1. Check `GET /health` returns 200.
2. Check `GET /health/detailed` with `x-health-token`.
3. Check `GET /metrics` with `x-metrics-token` when configured.
4. Run:
   - `npm --prefix backend run synthetic:check` with production synthetic env vars.
5. Validate p95 latency and auth/db error counters normalize.

## Incident Follow-up

1. Mark failed commit as blocked for promotion.
2. Open incident ticket with:
   - failing commit SHA
   - first failure timestamp
   - observed customer impact
   - rollback completion timestamp
3. Add regression test for the root cause before re-attempting deploy.
