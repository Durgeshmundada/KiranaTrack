# Deployment Guide

This guide deploys:
- Backend API to Render (`render.yaml`)
- Mobile app builds via EAS (`mobile/eas.json`)

## 0) First-Time Bootstrap (Required Once)

Before enabling scheduled synthetic monitoring, complete this bootstrap:
1. Create a dedicated synthetic monitor account (do not use a personal account).
2. Confirm the synthetic account can log in against production backend once.
3. Add GitHub Actions repository secrets:
   - `SYNTHETIC_API_BASE_URL`
   - `SYNTHETIC_EMAIL`
   - `SYNTHETIC_PASSWORD`
   - `SYNTHETIC_HEALTH_TOKEN` (optional)
4. If using staged rollout workflow, also add:
   - `STAGING_SYNTHETIC_API_BASE_URL`
   - `STAGING_SYNTHETIC_EMAIL`
   - `STAGING_SYNTHETIC_PASSWORD`
   - `STAGING_SYNTHETIC_HEALTH_TOKEN` (optional)
   - `PROD_SYNTHETIC_API_BASE_URL`
   - `PROD_SYNTHETIC_EMAIL`
   - `PROD_SYNTHETIC_PASSWORD`
   - `PROD_SYNTHETIC_HEALTH_TOKEN` (optional)

## 1) Supabase Prerequisites

1. Open Supabase dashboard for your project.
2. Confirm schema is applied:
   - Run `backend/supabase/schema.sql` in SQL Editor if not already applied.
3. Collect these values:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_JWT_SECRET` (Authentication -> JWT settings)
   - `SUPABASE_DB_URL` (direct URL, fallback)
   - `SUPABASE_DB_POOL_URL` (Transaction pooler URL, recommended)
   - `AUTH_SIGNUP_ENABLED` (`false` by default unless public signup is intended)
   - `TRUST_PROXY` (`1` on Render)
   - `HEALTH_DETAILS_TOKEN` (optional, required for `/health/detailed` in production when set)
   - `METRICS_ENABLED` (`true` in production)
   - `METRICS_TOKEN` (optional but recommended to protect `/metrics`)
   - `ALERT_WEBHOOK_URL` (optional ops alert webhook)
   - `ALERT_*` thresholds/cooldowns for alert policy

Important:
- Use `SUPABASE_DB_POOL_URL` in production to reduce connection issues and latency.
- Keep `SUPABASE_JWT_SECRET` set in production so auth verification stays local and fast.

## 2) Deploy Backend on Render

### Option A: Blueprint (recommended)
1. Push this repo to GitHub.
2. In Render, choose `New` -> `Blueprint`.
3. Select the repo and deploy with `render.yaml`.
4. Set required env vars in Render (marked `sync: false`):
   - `CORS_ORIGIN`
   - `SUPABASE_DB_URL`
   - `SUPABASE_DB_POOL_URL`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_JWT_SECRET`
   - `AUTH_SIGNUP_ENABLED`
   - `TRUST_PROXY`
   - `HEALTH_DETAILS_TOKEN` (optional)
   - `METRICS_ENABLED`
   - `METRICS_TOKEN` (optional)
   - `ALERT_WEBHOOK_URL` (optional)
   - `ALERT_COOLDOWN_MS`
   - `ALERT_EVALUATION_INTERVAL_MS`
   - `ALERT_P95_LATENCY_MS`
   - `ALERT_AUTH_FAILURES_THRESHOLD`
   - `ALERT_DB_ERRORS_THRESHOLD`
   - `ALERT_MIN_REQUESTS`
   - `GROQ_API_KEY` (if parser endpoints are needed)

### Option B: Manual Web Service
1. `New` -> `Web Service`.
2. Root directory: `backend`
3. Build command: `npm ci && npm run build`
4. Start command: `npm run start:prod`
5. Add same env vars listed above.
6. Health check path: `/health`

## 3) Configure Mobile for Production

Important:
- Expo Go is only for development and testing.
- Production app means EAS build output (`.aab` / `.ipa`) installed from Play/App Store or internal distribution.

1. Create EAS environment variables (Environment: `production`):
   - `EXPO_PUBLIC_API_BASE_URL` -> your deployed backend URL (for example `https://kiranatrack-backend.onrender.com`)
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - `EXPO_PUBLIC_ENABLE_DIRECT_GROQ_FALLBACK=false`
2. Set EAS env vars:
   - `eas env:create --environment production --name EXPO_PUBLIC_API_BASE_URL --value <BACKEND_URL>`
   - `eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value <SUPABASE_URL>`
   - `eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <SUPABASE_ANON_KEY>`
   - `eas env:create --environment production --name EXPO_PUBLIC_ENABLE_DIRECT_GROQ_FALLBACK --value false`
3. Install EAS CLI (if needed):
   - `npm install -g eas-cli`
4. Login:
   - `eas login`
5. Build:
   - Android AAB: `eas build --platform android --profile production`
   - iOS: `eas build --platform ios --profile production`

## 4) Post-Deploy Verification

Backend:
1. Verify health:
   - `GET <BACKEND_URL>/health`
2. Verify detailed health:
   - `GET <BACKEND_URL>/health/detailed` with `x-health-token` header
3. Verify metrics:
   - `GET <BACKEND_URL>/metrics` (with `x-metrics-token` in production if configured)
4. Run smoke test from local machine (after setting backend URL and valid env):
   - `npm --prefix backend run smoke:e2e`
5. Run synthetic check against deployed URL:
   - `SYNTHETIC_API_BASE_URL=<BACKEND_URL> SYNTHETIC_EMAIL=<EMAIL> SYNTHETIC_PASSWORD=<PASSWORD> SYNTHETIC_VENDOR_NAME="KiranaTrack Synthetic Monitor Vendor" npm --prefix backend run synthetic:check`

Latency:
1. Run benchmark:
   - `npm --prefix backend run bench:latency`
2. If latency is still high:
   - confirm `SUPABASE_DB_POOL_URL` is set and used
   - confirm `SUPABASE_JWT_SECRET` is set
   - keep backend and Supabase in nearby regions

## 5) Production Checklist

- `NODE_ENV=production`
- `CORS_ORIGIN` set to allowed origins (not `*` in strict production)
- `SUPABASE_DB_POOL_URL` set (required in production backend)
- `SUPABASE_JWT_SECRET` set (required in production backend)
- Parser key configured only on backend (`GROQ_API_KEY`)
- No service role key in mobile app
- Rate limits verified for expected traffic

## 6) Synthetic Uptime Monitoring

GitHub workflow:
- `.github/workflows/synthetic-uptime.yml`

Required repository secrets:
- `SYNTHETIC_API_BASE_URL`
- `SYNTHETIC_EMAIL`
- `SYNTHETIC_PASSWORD`
- `SYNTHETIC_HEALTH_TOKEN` (optional)

What it does:
- Runs every 5 minutes.
- Checks `/health` (and `/health/detailed` if token provided).
- Executes login + create/update/delete checks on vendor/bill/payment flows.
- Reuses a fixed synthetic vendor name so monitoring does not create endless vendor records.
- Fails fast on any auth/API regression.

## 7) Staged Rollout and Rollback

GitHub workflow:
- `.github/workflows/deploy-staged-rollout.yml`

Required repository secrets:
- `RENDER_STAGING_DEPLOY_HOOK`
- `RENDER_PROD_DEPLOY_HOOK`
- `STAGING_SYNTHETIC_API_BASE_URL`
- `STAGING_SYNTHETIC_EMAIL`
- `STAGING_SYNTHETIC_PASSWORD`
- `STAGING_SYNTHETIC_HEALTH_TOKEN` (optional)
- `PROD_SYNTHETIC_API_BASE_URL`
- `PROD_SYNTHETIC_EMAIL`
- `PROD_SYNTHETIC_PASSWORD`
- `PROD_SYNTHETIC_HEALTH_TOKEN` (optional)

Rollout sequence:
1. Trigger staging deploy.
2. Run synthetic checks on staging.
3. Trigger production deploy only if staging synthetic passes.
4. Run production synthetic checks immediately after deploy.

Rollback runbook:
1. Open Render production service -> Deploys.
2. Select last known-good deploy.
3. Click `Rollback` and wait for health to recover.
4. Re-run synthetic check and verify `/health`, `/health/detailed`, `/metrics`.
5. Record incident with failing commit hash and root cause before next rollout.
