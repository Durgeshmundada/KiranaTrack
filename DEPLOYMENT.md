# Deployment Guide

This guide deploys:
- Backend API to Render (`render.yaml`)
- Mobile app builds via EAS (`mobile/eas.json`)

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
   - `GET <BACKEND_URL>/health/detailed`
3. Run smoke test from local machine (after setting backend URL and valid env):
   - `npm --prefix backend run smoke:e2e`

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
