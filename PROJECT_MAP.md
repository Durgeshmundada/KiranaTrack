# KiranaTrack Project Map

This document is a practical map of the full codebase so implementation can move faster with fewer blind spots.

## 1) Repository Layout

- `mobile/`: Expo React Native app (UI, routing, local state, API clients).
- `backend/`: Express TypeScript API (auth middleware, Postgres queries, parsers).
- `backend/supabase/schema.sql`: source-of-truth DB schema, indexes, triggers, RLS bootstrap.
- `.github/workflows/ci.yml`: CI for typecheck + tests across mobile/backend.
- `render.yaml`: Render backend deployment blueprint.
- `backend/Dockerfile`: container image build for backend.
- `mobile/eas.json`: EAS build profiles for mobile deployment.

## 2) Runtime Entry Points

- Mobile app entry:
  - `mobile/app/_layout.tsx`
  - Initializes fonts + auth store + app bootstrap + route guards + lock-on-open PIN overlay.
- Backend entry:
  - `backend/src/server.ts`
  - Boots Express middleware, auth, rate limits, routes, DB connection.

## 3) Mobile Route Map (Expo Router)

Public routes:
- `/` -> intro animation (`mobile/app/index.tsx`)
- `/login` -> sign in/up (`mobile/app/login.tsx`)

Protected routes:
- `/home` (`mobile/app/(tabs)/home.tsx`)
- `/bills` (`mobile/app/(tabs)/bills.tsx`)
- `/notepad` (`mobile/app/(tabs)/notepad.tsx`)
- `/udhaar` (`mobile/app/(tabs)/udhaar.tsx`)
- `/analytics` (`mobile/app/(tabs)/analytics.tsx`)
- `/scan` (`mobile/app/scan.tsx`)
- `/settings` (`mobile/app/settings.tsx`)
- `/bill/[id]` (`mobile/app/bill/[id].tsx`)
- `/udhaar/[id]` (`mobile/app/udhaar/[id].tsx`)
- `/vendor/[id]` (`mobile/app/vendor/[id].tsx`)

Guard behavior:
- In `mobile/app/_layout.tsx`, unauthenticated users are redirected from protected routes to `/login`.
- App launch can force intro first (`/`) before reaching target protected route.
- Tabs also enforce auth via `mobile/app/(tabs)/_layout.tsx`.

## 4) Auth + Session Model

Supabase client:
- `mobile/services/supabaseClient.ts`
- `persistSession: false` + in-memory storage.
- Effect: login is session-only (app restart requires login again).

Auth store:
- `mobile/store/authStore.ts`
- `initialize()` loads session + binds auth state listener.

Backend token verification:
- `backend/src/middleware/auth.ts`
- All `/api/*` routes require `Authorization: Bearer <token>`.
- Token validated through Supabase admin `getClaims()`.
- Has in-memory token cache + in-flight dedupe.

## 5) End-to-End Feature Paths

### Bills + Payments

UI:
- List: `mobile/app/(tabs)/bills.tsx`
- Detail: `mobile/app/bill/[id].tsx`

Store:
- `mobile/store/appStore.ts`:
  - `addBill`
  - `deleteBill`
  - `addPayment`
  - `editPayment`
  - `deletePayment`

Service/API:
- `mobile/services/backendData.ts` -> `mobile/services/backendClient.ts`
- Endpoints:
  - `GET /api/bills?includePayments=true`
  - `POST /api/bills`
  - `DELETE /api/bills/:id`
  - `POST /api/bills/:id/payments`
  - `PUT /api/payments/:id`
  - `DELETE /api/payments/:id`

Backend route handlers:
- `backend/src/routes/bills.ts`
- `backend/src/routes/payments.ts`

DB tables touched:
- `bills`
- `bill_line_items`
- `payments`
- `payment_edit_logs`
- `vendors` (indirect for vendor lookup/attach)

### Out-of-Stock Notepad

UI:
- `mobile/app/(tabs)/notepad.tsx`

Store:
- `addOutOfStockItem`
- `cycleOutOfStock`
- `deleteOutOfStockItem`
- `clearOutOfStock`

Service/API:
- `GET /api/outofstock`
- `POST /api/outofstock`
- `PUT /api/outofstock/:id`
- `DELETE /api/outofstock/:id`
- `DELETE /api/outofstock`

Backend:
- `backend/src/routes/outofstock.ts`

DB:
- `out_of_stock_items`

### Udhaar

UI:
- List: `mobile/app/(tabs)/udhaar.tsx`
- Detail: `mobile/app/udhaar/[id].tsx`

Store:
- `addCustomer`
- `addUdhaarEntry`
- `deleteUdhaarEntry`

Service/API:
- `GET /api/udhaar`
- `POST /api/udhaar`
- `POST /api/udhaar/:id/entries`
- `DELETE /api/udhaar/entries/:id`

Backend:
- `backend/src/routes/udhaar.ts`

DB:
- `udhaar_customers`
- `udhaar_entries`

### Analytics

UI:
- `mobile/app/(tabs)/analytics.tsx`
- Uses local selectors for charts/metrics.

Backend analytics endpoints exist:
- `GET /api/analytics/summary`
- `GET /api/analytics/vendor-wise`
- `GET /api/analytics/monthly-spend`
- `GET /api/analytics/price-anomalies`

Note:
- Mobile analytics screen currently computes from local store data instead of calling backend analytics routes.

### OCR + Parse Pipeline

UI:
- `mobile/app/scan.tsx`

Pipeline:
- `mobile/services/billPipeline.ts`
- Order:
  - Backend parse image (`mobile/services/backendParser.ts`) via `POST /api/parse/bill-image`
  - Optional direct Groq Vision fallback (`mobile/services/groqParser.ts`)
  - OCR fallback (`mobile/services/ocr.ts`) then direct Groq text fallback
  - Regex fallback (`mobile/services/regexParser.ts`)
  - Manual mode

Backend parse routes:
- `backend/src/routes/parse.ts`
- `POST /api/parse/bill-image`
- `POST /api/parse/bill-text`
- Implemented in `backend/src/services/groqParser.ts`

Important current behavior:
- `mobile/services/ocr.ts` currently returns empty string (OCR engine not wired).
- In `mobile/app/scan.tsx`, bill save currently writes one synthetic line item (`Parsed total line`) instead of parsed detailed items.

## 6) Backend API Surface

Mounted in `backend/src/server.ts`:
- `/health`
- `/health/detailed`
- `/api/bills`
- `/api/payments`
- `/api/vendors`
- `/api/outofstock`
- `/api/udhaar`
- `/api/analytics`
- `/api/parse`

Middleware order:
- request id injection
- CORS
- helmet
- compression
- JSON body parser
- morgan
- auth middleware
- global rate limiter
- routes
- error middleware

## 7) Database Model (Supabase Postgres)

Core tables:
- `vendors`
- `bills`
- `bill_line_items`
- `payments`
- `payment_edit_logs`
- `out_of_stock_items`
- `udhaar_customers`
- `udhaar_entries`

Key integrity:
- ObjectId-like primary keys (`24 hex chars`)
- FK constraints with cascades where expected
- trigger-based `updated_at` maintenance
- indexes for common filters/joins

RLS:
- Existing tables in `public` have RLS enabled in schema script.
- `service_role_all` policy created for each table.
- Event trigger auto-enables RLS and policy for new public tables.

## 8) Environment Variable Map

Backend (`backend/.env`):
- `SUPABASE_DB_URL` (required)
- `SUPABASE_DB_POOL_URL` (optional, recommended)
- `SUPABASE_URL` (required)
- `SUPABASE_SERVICE_ROLE_KEY` (required)
- `SUPABASE_JWT_SECRET` (optional, enables fast local JWT verification)
- `GROQ_API_KEY` (optional but required for parser route success)
- `PORT`, `CORS_ORIGIN`, rate-limit and parser tuning vars

Mobile (`mobile/.env`):
- `EXPO_PUBLIC_API_BASE_URL`
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- Optional parse tuning and direct Groq fallback vars

Critical networking edge:
- For physical device testing, `EXPO_PUBLIC_API_BASE_URL` must be your computer LAN IP, not `localhost`.
- If direct DB port `5432` is slow/blocked, use Supabase pooler URL on `6543`.

## 9) State and Data Persistence

Auth state:
- Session-only (not persisted across app relaunch).

App state:
- `mobile/store/appStore.ts` uses Zustand `persist` with AsyncStorage.
- Persists:
  - settings
  - vendors
  - bills
  - outOfStockItems
  - customers
  - sync metadata

## 10) Test + CI Coverage

Passing now:
- `npm run typecheck`
- `npm run test`

Test scope today:
- mobile utility tests
- backend bill status + schema validation tests
- optional backend smoke script: `npm --prefix backend run smoke:e2e`

Coverage gap:
- no automated integration/UI tests for screen flows.
- no automated regression tests for route guards and scan-save UX flows.

## 11) High-Impact Edges To Watch

- Session-only auth means users must log in after restart by design.
- `scan.tsx` save uses synthetic line item, not parsed line item details.
- `mobile/services/ocr.ts` is placeholder; true OCR quality depends on backend image parse or direct Groq fallback.
- `vendor?.id ?? ''` navigation in bill detail can produce invalid vendor route when vendor lookup fails.
- Mobile analytics screen is local-only; backend analytics endpoints are currently unused by that screen.

## 12) Work Sequence Recommendation

1. Lock contracts:
   - Freeze API response contracts in `backend/src/routes/*` and `mobile/services/backendData.ts`.
2. Fix scan fidelity:
   - Save parsed line items in `mobile/app/scan.tsx`.
   - Integrate real OCR engine in `mobile/services/ocr.ts`.
3. Harden routing:
   - Handle missing vendor route target gracefully in `mobile/app/bill/[id].tsx`.
4. Add integration tests:
   - Add API integration tests for add/edit/delete payment, udhaar entry delete, and parse timeout behavior.
5. Add UI regression checks:
   - Cover startup intro/login flow and save-failed surfacing behavior.
