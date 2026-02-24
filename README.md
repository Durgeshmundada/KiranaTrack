# KiranaTrack

Production-structured full-stack project for supplier bill tracking, installment payments, out-of-stock notepad, udhaar tracking, and analytics.

## Stack
- Mobile: Expo + React Native + TypeScript + Expo Router + Zustand + i18n + animated UI
- Backend: Node.js + Express + TypeScript + Supabase Postgres + Zod validation

## Implemented Modules
- Animated dashboard with financial summary, overdue list, and recent activity
- Branded startup logo animation with credit line: "Made by Durgesh Mundada"
- Bills list with search + status filters
- Scan flow (camera/gallery, OCR simulation, Groq parsing fallback, confirm + save)
- Scan flow now supports backend parser endpoint for secure Groq key usage (`/api/parse/bill-image`)
- Bill detail with payment timeline and PIN-protected edit/delete
- Out-of-stock notepad with status cycle and bulk clear
- Udhaar customer list + customer detail with PIN-protected entry delete
- Analytics cards/charts (vendor outstanding, monthly spend, status mix, anomaly alerts)
- Settings: language switch (EN/HI/MR), overdue threshold, payment mode, PIN setup, backup export
- Backend REST APIs for bills, payments, vendors, outofstock, udhaar, analytics

## Project Structure
```
mobile/   # Expo app
backend/  # Express API
```

## Step-by-step: What You Need To Do
1. Create backend env file:
   - Copy `backend/.env.example` to `backend/.env`
   - Set `SUPABASE_DB_URL` to your Supabase direct Postgres URL (fallback)
   - Set `SUPABASE_DB_POOL_URL` to Supabase pooler transaction URL (recommended for lower latency/reliability)
   - Set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
   - Optional performance optimization: set `SUPABASE_JWT_SECRET` for local JWT verification in backend auth middleware
   - Set `GROQ_API_KEY` for parser endpoints
   - Run SQL from `backend/supabase/schema.sql` in Supabase SQL Editor
2. Create mobile env file:
   - Copy `mobile/.env.example` to `mobile/.env`
   - Set `EXPO_PUBLIC_API_BASE_URL` (for real device use your PC IP, not localhost)
   - `EXPO_PUBLIC_GROQ_API_KEY` is dev-only fallback and should remain empty for production
   - Do not put Supabase service key or DB URL in mobile env; secrets must stay backend-only
3. Install dependencies (already installed in this workspace, run only if needed):
   - `npm --prefix mobile install`
   - `npm --prefix backend install`
4. Start backend:
   - `npm --prefix backend run dev`
5. Start mobile app:
   - `npm --prefix mobile run start`
6. Open Expo Go on Android and scan the QR code.

## Validation Commands
- Mobile typecheck: `npm --prefix mobile run typecheck`
- Backend typecheck: `npm --prefix backend run typecheck`
- Workspace typecheck: `npm run typecheck`
- Backend latency benchmark (requires running backend + valid Supabase envs): `npm --prefix backend run bench:latency`

## Deployment
- Backend production deploy config: `render.yaml`
- Backend Docker image config: `backend/Dockerfile`
- Mobile EAS profiles: `mobile/eas.json`
- Full deployment runbook: `DEPLOYMENT.md`

## API Endpoints
- `POST /api/bills`
- `GET /api/bills`
- `GET /api/bills/:id`
- `PUT /api/bills/:id`
- `DELETE /api/bills/:id`
- `POST /api/bills/:id/payments`
- `PUT /api/payments/:id`
- `DELETE /api/payments/:id`
- `GET /api/vendors`
- `POST /api/vendors`
- `PUT /api/vendors/:id`
- `GET /api/outofstock`
- `POST /api/outofstock`
- `PUT /api/outofstock/:id`
- `DELETE /api/outofstock/:id`
- `DELETE /api/outofstock`
- `GET /api/udhaar`
- `POST /api/udhaar`
- `POST /api/udhaar/:id/entries`
- `DELETE /api/udhaar/entries/:id`
- `GET /api/analytics/summary`
- `GET /api/analytics/vendor-wise`
- `GET /api/analytics/monthly-spend`
- `GET /api/analytics/price-anomalies`
- `POST /api/parse/bill-image`
- `POST /api/parse/bill-text`

## Production Hardening Checklist
- Add real OCR integration (`react-native-ml-kit`) replacing mock OCR in `mobile/services/ocr.ts`
- Add Firebase Auth verification in `backend/src/middleware/auth.ts`
- Add Cloudinary upload in scan pipeline
- Add DB-level indexes tuned from real usage
- Add integration tests for critical payment flows
- Add CI (typecheck + test + build)
