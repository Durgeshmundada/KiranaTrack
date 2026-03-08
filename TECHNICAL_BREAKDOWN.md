# KiranaTrack - Complete Technical Breakdown
Generated on: 2026-03-03

## Scope and Method
- I recursively inspected project files in `d:\kirana-bill`.
- I analyzed all tracked source/config/docs files plus important local untracked artifacts (`mobile/.env`, `mobile/credentials.json`, `mobile/keystore/*.jks`, `.runlogs`, root `.vscode`).
- I intentionally did not reverse engineer third-party dependency trees (`mobile/node_modules`, `backend/node_modules`) or generated build mirrors (`backend/dist`) line-by-line because they are external/generated, not authored project logic.
- Validation run results:
  - `npm run test`: passed (mobile + backend).
  - `npm run typecheck`: passed (mobile + backend).

---

## PROJECT OVERVIEW
### What problem this project solves
KiranaTrack solves daily operational cash-flow tracking for small retail shops:
- Supplier bill capture and payment tracking.
- Out-of-stock notepad.
- Udhaar (customer credit/repayment) ledger.
- Basic analytics for outstanding and anomalies.
- Mobile-first workflow with backend persistence and auth.

### Architecture type
- Overall: modular monolith (single backend service + single mobile app).
- Backend style: layered (`routes -> services/utils -> db`).
- Frontend style: feature-oriented Expo Router app with global Zustand stores.
- Deployment style: one Node service (Render), one mobile artifact (EAS builds).

### Is it scalable?
Partially.
- Scales reasonably for low-medium traffic with Postgres + indexed queries + idempotency keys.
- Not horizontally strong for parser/metrics/rate-limit state because several controls are in-memory (per process).
- Parser queue is in-memory; jobs are lost on restart and not shared between instances.

### Major architecture weaknesses
- Security hygiene issue: plaintext Android keystore passwords in local `mobile/credentials.json`.
- Tracked sample env includes what appears to be a real OCR API key in `mobile/.env.example`.
- Incremental sync can retain stale deleted records until periodic full sync (6 hours).
- Parser queue and metrics are process-memory only (no Redis/queue backend).
- Large route files (`backend/src/routes/bills.ts`) reduce maintainability and test isolation.
- Outdated docs claim session-only auth while code now persists sessions.

### Senior-level improvements
1. Move parser queue and rate-limit counters to Redis/managed queue.
2. Implement deletion tombstone sync strategy (or CDC/webhooks) to avoid stale clients.
3. Split monolithic route files into service/repository/domain layers.
4. Remove secrets from examples and local plaintext credential patterns.
5. Add contract tests and mobile integration tests for core user journeys.
6. Centralize structured audit querying and admin observability dashboards.

---

## FOLDER + FILE BREAKDOWN (RECURSIVE)
For each entry: Purpose | Why it exists | Connection | What breaks if removed

### Root folders
- `.github/`: CI/CD workflows | Deployment/quality automation | GitHub Actions + backend scripts | CI/CD and synthetic checks stop.
- `.runlogs/` (local): runtime logs/artifacts | local troubleshooting | dev runs, GH workflow debug output | no runtime break; lose diagnostics.
- `.vscode/` (local): editor settings | developer ergonomics | IDE only | no runtime break.
- `backend/`: API service | business logic + DB writes | mobile services call its routes | app cannot persist/auth.
- `mobile/`: Expo app | user interface and client logic | talks to backend auth/data APIs | no user-facing product.

### Root files
- `.gitignore`: ignore rules | prevent accidental commits | git | secrets/build output may get committed if removed.
- `README.md`: onboarding + run guide | developer setup | all contributors | higher setup errors.
- `PROJECT_MAP.md`: architecture notes | faster navigation | docs only | no runtime break.
- `DEPLOYMENT.md`: deployment runbook | production consistency | Render/EAS workflows | higher ops risk.
- `ROLLBACK_RUNBOOK.md`: incident rollback steps | reduce MTTR | deployment incidents | slower recovery.
- `package.json`: workspace scripts | root commands | mobile/backend scripts | `npm run test/typecheck` at root breaks.
- `render.yaml`: Render blueprint | infra-as-code | backend deploy | one-click deployment flow breaks.

### `.github/workflows`
- `ci.yml`: typecheck + tests + gitleaks | quality gate | both packages | no automated regression/security scan.
- `deploy-staged-rollout.yml`: staged deploy + synthetic gate | safer prod release | Render hooks + synthetic script | no controlled promotion.
- `synthetic-uptime.yml`: 5-min synthetic checks | uptime regression detection | backend `synthetic:check` | production issues detected late.

### `backend` top-level
- `.dockerignore`: reduce image context | faster/safer docker build | Dockerfile build | bigger images/slower builds.
- `.env.example`: backend env contract | correct configuration | `src/config/env.ts` | setup confusion.
- `Dockerfile`: containerized build/run | production portability | Render/manual docker deploy | container deploy breaks.
- `package.json`: backend deps/scripts | run/build/test commands | CI/deploy/runtime | backend lifecycle commands fail.
- `package-lock.json`: dependency lock | reproducibility | npm install | non-deterministic dependency graph.
- `tsconfig.json`: TS compiler behavior | strictness/build output | build/typecheck | compile/typecheck breaks.
- `vitest.config.ts`: backend test config | test discovery/runtime | `npm --prefix backend test` | tests not discovered correctly.

### `backend/scripts`
- `smoke-e2e.mjs`: local end-to-end smoke suite | verify full API path | backend + supabase + mobile env | lose quick full-stack sanity check.
- `synthetic-check.mjs`: production synthetic monitor logic | uptime SLO protection | GH synthetic workflows | synthetic monitoring breaks.
- `bench-latency.mjs`: latency benchmark by endpoint | performance diagnostics | running backend+db | lose benchmark tooling.
- `load-test.mjs`: simple load harness | rough capacity check | target endpoint + token optional | no quick stress check.

### `backend/supabase`
- `schema.sql`: source-of-truth schema + indexes + triggers + RLS bootstrap | DB integrity | all backend queries | fresh environment provisioning breaks.
- `migrations/2026-02-24-hardening.sql`: incremental hardening index migration | upgrade path | existing DBs | drift or missed indexes if ignored.

### `backend/src/config`
- `env.ts`: validates/normalizes env and hard-fails unsafe prod config | safety gate | every backend module | server boot fails and/or unsafe defaults leak in.

### `backend/src/db`
- `postgres.ts`: PG pool, query wrapper, transaction helper, DB metrics | DB access abstraction | every route/service DB call | backend cannot query DB.
- `mappers.ts`: DB row -> API doc mappers | shape consistency | routes response mapping | response shapes drift/break.
- `id.ts`: 24-hex ID generator | shared ID format | inserts in routes/services | many creates fail without IDs.

### `backend/src/middleware`
- `auth.ts`: Bearer token verification (local JWT -> JWKS -> Supabase claims), cache, legacy ownership claim | route protection | all `/api/*` endpoints | APIs exposed or unusable auth.

### `backend/src/observability`
- `logger.ts`: JSON structured logger | log consistency | server + db + alerts + errors | logs become inconsistent/noisy.
- `metrics.ts`: in-memory counters/latency + Prometheus render | health/alert signal | server and alerts | `/metrics` empty/broken, no p95/auth/db signal.
- `alerts.ts`: threshold evaluation + webhook notifications | ops alerts | metrics snapshot | no automatic operational alerting.

### `backend/src/routes`
- `auth.ts`: `/auth/login` and `/auth/signup` with retries/timeouts | user auth lifecycle | mobile auth store | no backend auth fallback.
- `bills.ts`: bill CRUD, line items, payment creation, idempotency keys, soft-delete, audit | core supplier workflow | mobile bills/scan/payment screens | primary feature broken.
- `payments.ts`: payment edit/delete + edit logs + audit + overpay guard | payment integrity | bill detail screen | unsafe payment mutation.
- `vendors.ts`: vendor list/create/update with identity conflict logic | vendor master data | bill creation and detail screens | vendor mapping breaks.
- `outofstock.ts`: note CRUD + status cycling + clear all | notepad feature | notepad tab | out-of-stock module breaks.
- `udhaar.ts`: customer + entries + repayment guard + soft-delete + audit | credit ledger | udhaar screens | udhaar workflow breaks.
- `analytics.ts`: summary/vendor/monthly/anomaly endpoints | BI layer | analytics screen (partially) | backend analytics unavailable.
- `parse.ts`: parser endpoints + async job polling | OCR parse pipeline | scan flow | auto-parse fails entirely.
- `bills.integration.test.ts`: route integration-ish tests | regression coverage | CI test stage | less confidence on bill routes.
- `parse.integration.test.ts`: parse failure-path tests | error behavior guard | CI | parser error contract can regress silently.
- `payments.concurrency.integration.test.ts`: overpayment race guard test | transaction integrity confidence | CI | concurrency regressions likely.
- `udhaar.integration.test.ts`: repayment-overbalance test | business rule confidence | CI | repayment guard can regress.

### `backend/src/services`
- `audit.ts`: writes audit_events | traceability | bill/payment/udhaar mutating routes | lose audit trail.
- `billing.ts`: payment totals + status attachment helpers | reuse in bills route | bills listing/status | duplicated status logic if removed.
- `billLineItems.ts`: line-item sum/tolerance checks | amount validation | schema + bills route | invalid invoice totals may pass.
- `billLineItems.test.ts`: helper tests | safety net | CI | tolerance logic regressions.
- `paymentGuards.ts`: lock bill + prevent overpayment | financial guardrail | bills/payments routes | overpayment bugs.
- `paymentGuards.test.ts`: payment guard tests | safety | CI | less coverage for core rule.
- `vendorIdentity.ts`: detect same-name conflicting vendor identity | data consistency | vendors route | ambiguous duplicate vendors.
- `vendorIdentity.test.ts`: vendor identity tests | safety | CI | regressions in conflict rules.
- `ownerMigration.ts`: auto-claims `legacy-owner` rows to first authenticated user | migration compatibility | auth middleware | legacy data remains inaccessible.
- `groqParser.ts`: backend Groq text/image parse with retries/model fallback | parser brain | parse route + queue | parse results unavailable.
- `parserQueue.ts`: in-memory queue with retries/dead-letter/TTL | async parser behavior | parse route | async parse mode fails.

### `backend/src/utils`
- `http.ts`: response helpers, HttpError, PG/Zod error mapping, error middleware | consistent API errors | every route | inconsistent/unhandled errors.
- `authContext.ts`: typed auth user extraction | safety wrapper | protected routes | repetitive unsafe casts.
- `asyncHandler.ts`: async error wrapper | route ergonomics | all async routes | repetitive try/catch or missed errors.
- `billStatus.ts`: backend status computation | consistent status semantics | billing service/tests | status drift.
- `billStatus.test.ts`: status tests | confidence | CI | regressions undetected.

### `backend/src/validators`
- `schemas.ts`: Zod schemas for bodies/queries | API contract enforcement | all routes | unsafe inputs hit DB logic.
- `schemas.test.ts`: validation tests | schema confidence | CI | validation regressions.

### `backend/src/test`
- `testApp.ts`: helper to mount routes with mocked auth in tests | test harness | route integration tests | test setup duplication.

### `backend/src`
- `server.ts`: app bootstrap, middleware chain, routes, metrics/health, graceful shutdown | entrypoint | everything backend | backend cannot start.

### `mobile` top-level config/docs/assets meta
- `.env.example`: mobile env contract | setup clarity | all services reading `EXPO_PUBLIC_*` | misconfigured clients.
- `.gitignore`: ignore generated/secrets/native artifacts | repo hygiene | git | secrets/native artifacts may leak.
- `app.json`: Expo app metadata | build/runtime config | Expo/EAS | app build metadata invalid.
- `eas.json`: build profiles | release packaging | EAS CLI | standardized builds break.
- `package.json`: mobile deps/scripts | app run/test/typecheck | Expo/Vitest | mobile commands fail.
- `package-lock.json`: dependency lock | reproducibility | npm install | dependency drift.
- `tsconfig.json`: TS config | editor/type safety | build/typecheck | TS checks degrade.
- `vitest.config.ts`: mobile test config | test runner setup | utils/store tests | tests not discovered.
- `expo-env.d.ts` (local generated): Expo type refs | TS helper | TS include | minimal, can regenerate.
- `.vscode/extensions.json` + `.vscode/settings.json`: editor prefs | dev ergonomics | IDE only | no runtime impact.

### `mobile/app` routing/screens
- `_layout.tsx`: global theme/fonts/bootstrap/auth guards/offline detection/PIN lock | app orchestration | authStore + appStore + routing | auth flow, lock, bootstrap break.
- `index.tsx`: animated intro/splash redirect to login/home | branded entry flow | auth state + router | launch UX and initial navigation break.
- `login.tsx`: sign-in/sign-up UI and flows | account entrypoint | authStore + supabase config | users cannot authenticate.
- `(tabs)/_layout.tsx`: tab navigator and auth guard | tab shell | authStore + tab screens | tab routing breaks.
- `(tabs)/home.tsx`: dashboard summary + overdue + recent activity + quick actions | main daily overview | selectors + appStore | core snapshot UX gone.
- `(tabs)/bills.tsx`: bill list/search/filter | bill discovery | appStore + BillCard | bill browsing breaks.
- `(tabs)/notepad.tsx`: out-of-stock management | inventory reminder workflow | appStore out-of-stock actions | notepad feature broken.
- `(tabs)/udhaar.tsx`: customer list/create and balances | credit customer management | appStore udhaar | udhaar list workflow broken.
- `(tabs)/analytics.tsx`: analytics screen with remote-first/local fallback calculations | decision support | backend analytics + selectors | analytics UX unavailable.
- `scan.tsx`: capture/upload OCR parse confirm and save bill | ingestion pipeline UI | billPipeline + appStore.addBill | new bill creation flow broken.
- `settings.tsx`: language/security/sync/health/backup/signout controls | admin controls | appStore + authStore + backend health | operational controls missing.
- `bill/[id].tsx`: bill detail + payment CRUD + secure actions | payment operations | appStore payment APIs + PIN overlay | bill payment management broken.
- `udhaar/[id].tsx`: customer ledger detail + add/delete entries | udhaar transaction operations | appStore udhaar actions + PIN | customer ledger editing breaks.
- `vendor/[id].tsx`: vendor profile with related bills | vendor deep-link | appStore vendors+bills | vendor drill-down unavailable.
- `+not-found.tsx`: fallback route | graceful bad path handling | Expo Router | poor handling for unknown routes.
- `+html.tsx`: web-only root HTML template | web target support | Expo web build | web output defaults only.

### `mobile/components/common`
- `ScreenContainer.tsx`: shared gradient/background/scroll scaffold | visual consistency | all screens | duplicated layout code.
- `ScreenHeader.tsx`: standardized title/subtitle/offline indicator | consistent headers | most screens | duplicated header logic.
- `EmptyState.tsx`: reusable empty-state card | UX consistency | list screens | repeated empty UI patterns.

### `mobile/components/bill`
- `BillCard.tsx`: reusable bill summary card | consistent bill row UI | bills/vendor screens | repeated bill item UI.
- `PaymentEntry.tsx`: payment row UI with edit/delete actions | payment timeline display | bill detail | payment list readability drops.

### `mobile/components/ui`
- `AppText.tsx`: typography variant wrapper | consistent text styles | entire UI | typography inconsistency.
- `GlassCard.tsx`: reusable card shell (BlurView fallback) | unified card visual language | most screens/components | style duplication.
- `GradientButton.tsx`: animated CTA button | common button behavior | most actions | inconsistent actions/press feedback.
- `MetricCard.tsx`: dashboard metric tile | dashboard design reuse | home screen | repeated custom metric UI.
- `BalanceBar.tsx`: paid vs total progress | payment visualization | bill/home cards | less readable payment progress.
- `StatusBadge.tsx`: status pill renderer | status consistency | bills/home/bill detail | repeated status style logic.
- `SkeletonLoader.tsx`: loading placeholders | perceived performance | scan/possible loading states | rough loading UX.
- `PinOverlay.tsx`: secure-action PIN gate | local action protection | bill detail/udhaar/settings/root lock | PIN-gated actions lose protection.

### `mobile/services`
- `apiClient.ts`: base request wrapper with timeout/retry/error normalization | network reliability | backend client/auth/parser/health | raw fetch duplication.
- `backendClient.ts`: auth header resolution, token refresh, multi-base-url fallback routing | robust API transport | all authed backend calls | authenticated API access breaks.
- `backendAuth.ts`: unauthenticated backend login/signup bridge | auth fallback path | authStore | no backend auth fallback.
- `backendData.ts`: typed API adapters for domain entities | domain data gateway | appStore/screens | every feature API mapping breaks.
- `backendHealth.ts`: settings health check helper | operator feedback | settings screen | health check button useless.
- `backendParser.ts`: calls parser endpoints + async job polling | scan parser backend integration | billPipeline | parser backend integration breaks.
- `billPipeline.ts`: parse fallback orchestration (backend vision -> backend text -> optional direct groq -> regex/manual) | resilient scan flow | scan screen | parse orchestration lost.
- `groqParser.ts`: direct mobile Groq parser fallback logic | dev-only fallback | billPipeline (when enabled) | direct fallback unavailable.
- `ocr.ts`: OCR.space fallback connector | parser fallback source text | billPipeline | less robust parse fallback.
- `regexParser.ts`: minimal last-resort text parser | safety fallback | billPipeline | fewer salvageable parses.
- `imageHash.ts`: image fingerprint helper | duplicate detection/idempotency | scan/save bill | duplicate-image safety weaker.
- `sessionStorage.ts`: SecureStore-first with AsyncStorage fallback for session data | token/session durability | authStore + supabaseClient | session persistence weaker/broken.
- `supabaseClient.ts`: Supabase client and config guard | auth backbone | authStore/login | Supabase auth path breaks.
- `crashReporting.ts`: global crash webhook reporting | release diagnostics | root layout init | no remote crash telemetry.

### `mobile/store`
- `authStore.ts`: auth state machine (initialize/signin/signup/signout, supabase + backend fallback) | session control | login, root layout, backend client | app auth lifecycle broken.
- `appStore.ts`: main domain store + sync/write actions | central client state | almost all screens/services | app business features collapse.
- `selectors.ts`: derived calculations (status/summary/trends) | logic reuse | home/bills/analytics/udhaar | duplicate/inconsistent computed data.
- `authStore.e2e.test.ts`: auth persistence behavior test | confidence on restart flow | CI | higher auth regression risk.
- `appStore.e2e.test.ts`: store flow tests | confidence on sync/payment behavior | CI | higher state regression risk.

### `mobile/utils`
- `currency.ts`: paise/rupee conversion and formatting | money formatting consistency | many screens/services | currency display/math drifts.
- `date.ts`: display/date helpers | date consistency | list/detail/analytics selectors | repeated date parsing bugs.
- `dateInput.ts`: strict `YYYY-MM-DD` parser -> ISO | form validation consistency | scan/payment/udhaar forms | date format bugs increase.
- `errors.ts`: user-friendly error mapping | UX clarity | many catch blocks | raw/poor error messages.
- `pin.ts`: PIN hash/verify/lockout logic | local security layer | PinOverlay/settings/root lock | PIN functionality breaks.
- `status.ts`: bill status arithmetic | feature consistency | selectors/screens | status logic diverges.
- `currency.test.ts`, `dateInput.test.ts`, `errors.test.ts`, `status.test.ts`: utility tests | confidence | CI | increased regression risk.

### `mobile/i18n`
- `index.ts`: i18n bootstrapping and language selection | localization system | settings + all `t()` usage | localization breaks.
- `en.json`: English string table | default locale | UI labels | missing labels.
- `hi.json`: Hindi string table placeholder/corrupted text currently | multilingual support | localization | Hindi UX currently unusable quality.
- `mr.json`: Marathi string table placeholder/corrupted text currently | multilingual support | localization | Marathi UX currently unusable quality.

### `mobile/theme`
- `tokens.ts`: palette/gradients/spacing/typography/shadows | design system core | all UI components | style consistency collapses.

### `mobile/types`
- `models.ts`: shared domain types | compile-time contracts | store/services/components | type safety and contract coherence break.

### `mobile/data`
- `mockData.ts`: demo data fixtures | local/dev demo scaffolding | optional/dev | no production runtime break.

### `mobile/assets`
- `assets/fonts/SpaceMono-Regular.ttf`: optional font asset | web/native typography fallback | assets pipeline | minor visual impact.
- `assets/images/icon.png`, `adaptive-icon.png`, `splash-icon.png`, `favicon.png`: app identity assets | app package branding | Expo build metadata | app icons/splash/favicons break.

### Local/untracked sensitive artifacts
- `mobile/.env`: active local mobile secrets/config | local development runtime | mobile services | app may fail locally without it.
- `backend/.env` (present locally): active backend secrets/config | backend runtime | backend boot/auth/db | backend local run fails.
- `mobile/credentials.json`: EAS local keystore credentials with plaintext passwords | signing automation | EAS local credentials source | local build signing fails if removed, but keeping plaintext is high risk.
- `mobile/keystore/kiranatrack-upload.jks`: Android upload key | release signing | EAS build | cannot sign/update Play artifacts if lost.
- `.runlogs/*`: logs/workflow snapshots | diagnostics | dev only | no runtime break.
- root `.vscode/*`: editor setup | dev convenience | IDE only | no runtime break.

### Generated/third-party directories (scanned at folder level)
- `backend/dist/` (40 files): transpiled backend output | `start:prod` runtime artifact | generated from `src` | prod start command fails if absent.
- `backend/node_modules/`, `mobile/node_modules/`: third-party dependencies | runtime/build/test dependencies | npm install outputs | app/backend cannot run without them.

---

## FRONTEND ANALYSIS
### Framework/library and why
- Expo + React Native + TypeScript + Expo Router + Zustand.
- Why: fast mobile iteration, OTA-friendly workflow, strong TS safety, file-based routing, lightweight state management.

### Routing
- File-based via Expo Router.
- Root guard in `mobile/app/_layout.tsx` decides intro/login/protected routes.
- Tab guard in `mobile/app/(tabs)/_layout.tsx` re-checks auth.

### State management
- Zustand stores:
  - `authStore`: session lifecycle and backend/supabase auth fallback.
  - `appStore`: domain entities + sync/write operations + settings.
- Persist middleware for app data (`AsyncStorage`), plus secure session storage abstraction.

### Forms
- Local component state + imperative validation (`Alert` on failure).
- Most forms are controlled `TextInput` fields.

### Validation logic
- Frontend: lightweight checks (email, password length, amount > 0, date format).
- Backend: strict Zod + database constraints for authoritative validation.

### API calling flow
1. Screen/action calls appStore method.
2. appStore method calls `backendData` service.
3. `backendData` calls `authApiRequest` in `backendClient`.
4. `backendClient` injects token, handles refresh/fallback base URLs.
5. Backend route validates and writes DB.
6. Response mapped to typed models and merged into store.

### Component hierarchy (high-level)
- `app/_layout.tsx`
  - route stack + theme + global `PinOverlay`
  - tab layout
    - screen components
      - common wrappers (`ScreenContainer`, `ScreenHeader`)
      - feature components (`BillCard`, `PaymentEntry`)
      - primitives (`AppText`, `GlassCard`, `GradientButton`)

### Folder structure reasoning
- `app/`: route concerns.
- `components/`: reusable UI by concern (`common`, `ui`, `bill`).
- `services/`: transport/integration boundaries.
- `store/`: state and actions.
- `utils/`: pure helper logic.
- `types/`: shared contracts.
- `theme/`: design tokens.

### Reusability patterns
- Good reuse in primitives (`AppText`, `GlassCard`, `GradientButton`) and selectors.
- Business rules partly centralized (status, currency, date parsing).

### Frontend performance concerns
- Large store updates can re-render broad trees if selectors are not scoped carefully.
- Some screens do heavy array sorting/filtering on every render path (acceptable now, may degrade at scale).
- OCR/base64 operations are heavy; image optimization partially mitigates.

### Frontend security concerns
- Local secure action uses PIN; good for casual protection, not a substitute for server auth.
- Session storage fallback to AsyncStorage if SecureStore unavailable is weaker.
- Exposed `EXPO_PUBLIC_*` values are inherently client-visible; no real secrets should ever be there.
- Critical hygiene issue: tracked `.env.example` contains what looks like a real OCR key.

### Line-by-line style walkthrough of important frontend files
#### `mobile/app/_layout.tsx`
- Startup orchestration:
  - font load + crash reporting init.
  - auth initialization once ready.
  - state bootstrap tied to authenticated user.
  - route guarding between intro/login/protected.
- Security/runtime hooks:
  - NetInfo listener toggles offline mode and sync-on-reconnect.
  - AppState listener enforces PIN lock on foreground when enabled.
- Why this matters: it is the single most important lifecycle coordinator.

#### `mobile/app/scan.tsx`
- Capture/upload image.
- Run parser pipeline with multiple fallbacks.
- Normalize parsed fields and allow manual correction.
- Validate date/amount, apply line-item fallback logic, persist bill with idempotency key.
- Why this matters: highest-complexity frontend workflow and major error surface.

#### `mobile/store/appStore.ts`
- Defines canonical app state, synchronization strategy, and all mutating actions.
- Contains incremental sync + periodic full sync policy.
- Enforces online requirement for all writes.
- Why this matters: domain consistency lives here; bugs here affect all screens.

#### `mobile/services/backendClient.ts`
- Manages auth headers and refresh behavior.
- Handles multiple candidate base URLs and cooldown on failed URLs.
- Why this matters: connectivity and session reliability hinge on this file.

---

## BACKEND ANALYSIS
### Framework and why
- Node.js + Express + TypeScript + pg + Supabase JS + Zod.
- Why: minimal overhead, clear SQL control, straightforward API layer.

### Middleware order and rationale
Current order in `backend/src/server.ts`:
1. Request ID injection.
2. Request timing/metrics/logging hook.
3. CORS.
4. Helmet.
5. Compression.
6. JSON body parser.
7. Auth middleware.
8. Global rate limiter.
9. Route mounts (+ stricter limiter on `/auth` and `/api/parse`).
10. Error middleware.

Why this order is mostly right:
- Request ID early for end-to-end traceability.
- Security headers before route handling.
- Auth before protected route logic.
- Error middleware last.

### Request lifecycle
- Incoming request enters middleware chain.
- For `/api/*`, auth middleware verifies Bearer token and enriches request with `authUserId`.
- Route parses body/query via Zod and executes DB operations (often in transaction).
- Domain mapping returns stable API document shape.
- Error middleware maps validation/PG/custom errors to consistent JSON.

### Route structure
- Grouped by business entity (`bills`, `payments`, `vendors`, etc.) plus `auth`, `analytics`, `parse`.
- `bills.ts` handles both bill and payment-create route for bill context.

### Controller logic quality
- Strong transaction usage for money-sensitive writes.
- Idempotency keys for bill/payment create are a good senior touch.
- Weakness: `bills.ts` is too large, mixing multiple responsibilities.

### Error handling strategy
- Centralized `HttpError`, Zod handling, and PG code/constraint mapping.
- Request IDs returned in error payloads: good for support/debug.

### Logging strategy
- Structured JSON logs with level filtering.
- Request completion logs include latency/status/user-agent/ip.

### Security layers
- Auth: JWT verification via local secret -> JWKS -> getClaims fallback.
- Rate limits: global + auth route + parser route.
- Helmet + CORS constraints (strict in production by env validation).
- SQL injection defense via parameterized queries.
- PIN in frontend adds local action gating (not backend auth).

### Data validation
- Zod schemas for all key payloads and query params.
- DB constraints + unique indexes + FK + checks provide second layer.

### Environment variable usage
- Strict validated schema; production hard-fails if critical settings missing (`SUPABASE_DB_POOL_URL`, `SUPABASE_JWT_SECRET`, explicit `CORS_ORIGIN`).

### Modularization strategy
- Good separation for `config`, `db`, `middleware`, `observability`, `routes`, `services`, `utils`.
- Needs finer split in large route files.

---

## DATABASE ANALYSIS
### Database and why
- Supabase Postgres (SQL, relational).
- Chosen for transactional consistency, joins, constraints, and managed infra.

### SQL or NoSQL
- SQL.
- Appropriate because entities are relational and require transactional correctness (bills/payments/udhaar).

### Schema by table (purpose)
- `vendors`: supplier master.
- `bills`: invoice header per vendor.
- `bill_line_items`: bill item details.
- `payments`: bill installment/payments.
- `payment_edit_logs`: payment change history.
- `out_of_stock_items`: shopping/restock tracker.
- `udhaar_customers`: credit customers.
- `udhaar_entries`: credit/repayment rows.
- `audit_events`: immutable action audit trail.

### Field rationale highlights
- IDs are 24-hex text for cross-tier compatibility.
- `owner_user_id` on tenant tables for user scoping.
- `deleted_at` for soft deletes on key mutable financial tables.
- `client_request_id` for idempotent create operations.

### Indexing strategy
- Owner/date/vendor filters indexed.
- Unique constraints for duplicate prevention (vendor name per owner, bill number per vendor active, payment client request id, image hash active).
- Audit and udhaar indexes support common query paths.

### Normalization level
- Roughly 3NF across core domain tables.
- Denormalized aggregates are computed in queries rather than stored.

### Relations
- `vendors 1->many bills`
- `bills 1->many bill_line_items`
- `bills 1->many payments`
- `payments 1->many payment_edit_logs`
- `udhaar_customers 1->many udhaar_entries`
- `audit_events` references entity IDs logically (not FK-enforced to every entity table).

### Text relational diagram
```
owners (via owner_user_id)
  |- vendors(id)
      |- bills(id, vendor_id)
          |- bill_line_items(id, bill_id)
          |- payments(id, bill_id)
              |- payment_edit_logs(id, payment_id)
  |- out_of_stock_items(id)
  |- udhaar_customers(id)
      |- udhaar_entries(id, customer_id)

Cross-cutting:
audit_events(id, owner_user_id, entity_type, entity_id, action, payload)
```

### Authentication data storage
- Primary auth identities are in Supabase Auth.
- App DB stores `owner_user_id` (Supabase user id reference string), not passwords.

### Security risks
- Service role usage is powerful; backend compromise means full DB blast radius.
- RLS policy `service_role_all` is broad by design.
- Legacy ownership auto-claim can do large updates on first auth for a user.

### Migration handling
- SQL-first migration model (`schema.sql` + migration scripts), manual/apply-by-runbook.
- No automated migration runner included in backend startup.

### What breaks if schema changes
- Any renamed/removed column in table maps breaks route SQL immediately.
- Index/constraint name changes can break PG error-to-message mapping.
- Soft-delete and idempotency semantics rely on specific `deleted_at` and `client_request_id` fields.

---

## AUTHENTICATION & SECURITY
### How login works internally
- Preferred path: mobile uses Supabase signIn/signUp directly.
- Fallback path: on upstream/network failures, authStore uses backend `/auth/login` or `/auth/signup`.
- Backend auth route uses Supabase service-role client to perform auth operations with retry policy.

### Password hashing
- Passwords are handled by Supabase Auth; hashing is managed upstream (not custom in this codebase).

### Token generation logic
- Access/refresh tokens issued by Supabase.
- Backend verifies tokens; does not mint custom JWTs.

### Token expiration handling
- Backend checks token validity and responds 401.
- Mobile backend client tries token refresh through Supabase on 401 before failing.

### Token storage
- Supabase client uses `SecureStore` via custom auth storage abstraction.
- Fallback to AsyncStorage if SecureStore unavailable.
- Additional backend session bridge payload persisted in secure session storage key.

### Vulnerabilities (brutally honest)
1. High: local `mobile/credentials.json` stores keystore passwords in plaintext.
2. High: `mobile/.env.example` contains a real-looking OCR API key.
3. Medium: incremental sync + soft-delete can show stale/deleted records until full sync.
4. Medium: in-memory parser queue/rate-limiter/metrics are not distributed and reset on restart.
5. Medium: frontend includes optional direct Groq key path (dev-only guarded, but risky if misconfigured).
6. Low-Medium: auth and app docs out of sync with current persistence behavior.

### OWASP alignment
- SQL injection: mostly mitigated by parameterized queries.
- XSS: low risk in RN native; web target still should sanitize any injected HTML (not currently used).
- CSRF: low because Bearer token auth, not cookie-based session auth.
- Broken auth: guarded reasonably; token refresh and verification chain are strong.
- Sensitive data exposure: problematic local credentials and env hygiene.

### Production hardening improvements
1. Remove any real keys from `.env.example` immediately.
2. Store EAS credentials via secure CI secret store, not plaintext local JSON in shared repo folder.
3. Add secret scanning pre-commit + CI fail on detected keys in examples.
4. Move parser queue to durable external queue.
5. Add distributed rate limiting and centralized metrics storage.
6. Add explicit sync tombstone/deletion propagation strategy.

---

## DEVOPS & DEPLOYMENT
### Local run
- Backend: `npm --prefix backend run dev`.
- Mobile: `npm --prefix mobile run start`.
- Root convenience scripts available.

### Build process
- Backend build: `tsc` -> `backend/dist`.
- Backend container: multi-stage Docker build.
- Mobile production build: EAS profiles (`preview`, `production`).

### Environment configuration
- Strong backend env validation in code.
- Mobile uses `EXPO_PUBLIC_*` env vars (client-visible).

### Deployment method
- Backend: Render blueprint (`render.yaml`) with envs.
- Mobile: EAS build and submit flows.

### Hosting service analysis
- Render starter plan likely acceptable for small-medium workloads.
- Supabase managed Postgres/Auth used for persistence and identity.

### CI/CD
- Present:
  - CI quality workflow.
  - staged rollout workflow.
  - scheduled synthetic uptime workflow.

### Git branching strategy
- Not explicitly documented.
- CI triggers on `main`/`master` and PR; likely trunk-based in practice.

### Production readiness level
- Moderate.
- Strong fundamentals (validation, constraints, audit, observability) but blocked by secret hygiene issues and stateful in-memory infra components.

---

## MOBILE CONVERSION
- This is not a web-to-mobile conversion.
- It is a native-first Expo React Native app.
- So PWA/WebView conversion limitations are mostly not applicable.
- Trade-off: faster RN iteration but still dependent on JS bridge/runtime performance and Expo ecosystem constraints.

---

## BUGS & STRUGGLES YOU LIKELY FACED (AND WHY)
### Likely common bugs
1. Duplicate create races for bills/payments before idempotency keys were added.
2. Payment over-collection conflicts under concurrent operations.
3. Parser timeouts/unreliable OCR results.
4. Auth session confusion during network flakiness and token refresh transitions.
5. Deleted entity appearing on secondary devices until full sync refresh.

### Logical mistakes likely
- Over-reliance on local computed analytics while backend analytics exist.
- Mixing transport/domain/transaction logic in very large route files.
- Documentation drift vs actual auth persistence behavior.

### Security flaws
- Plaintext signing credentials file locally.
- Real-looking API key in tracked sample env.

### Performance bottlenecks
- Process-level queue for parser, no horizontal coordination.
- Large in-memory metrics arrays and expensive percentile sorting each snapshot (fine now, weak at high scale).
- App-side large-array map/filter/sort on each render path.

### Race/async risks
- Incremental sync merge strategy can conflict with near-simultaneous writes from multiple devices.
- Parser jobs vanish if process restarts mid-processing.
- Auth fallback + refresh path can produce edge-state complexity.

### Memory/resource risks
- In-memory counters and queue grow until capped/TTL; bounded but still per-process memory state.

### Senior fixes
1. Introduce durable queue + job store for parser (Redis/PG queue).
2. Introduce server-driven sync versioning/tombstones.
3. Split route files into service/repository layers.
4. Add stricter integration/e2e tests around sync/deletion/conflict behavior.
5. Remove credential anti-patterns and enforce security checks in CI.

---
## INTERVIEW PREPARATION (30 DEEP QUESTIONS)
Each includes: Answer, Trap follow-up, Confident answer strategy.

1. Why use Postgres instead of NoSQL here?
Answer: transactional integrity for bills/payments/repayments and relational joins.
Trap: Could Mongo do this too?
Confident: yes, but SQL constraints + transactions reduce financial consistency risk.

2. How do you prevent duplicate bill creation?
Answer: idempotency via `client_request_id` and unique indexes plus conflict handling.
Trap: What about concurrent requests?
Confident: unique constraints are DB-enforced race-proof; app returns existing record path.

3. How is overpayment prevented?
Answer: transaction lock + sum query + guard (`assertPaymentWithinBillLimit`).
Trap: Two payments at same time?
Confident: row locking + transactional checks enforce serial correctness.

4. Why soft-delete bills/payments?
Answer: preserve auditability/history and avoid hard data loss.
Trap: Then why not hard-delete all?
Confident: financial systems need traceability and reversible analysis.

5. How does auth verification work server-side?
Answer: local JWT secret verify, fallback JWKS, final fallback Supabase getClaims.
Trap: Why multiple methods?
Confident: latency + resiliency; local fast path with robust fallback.

6. What is the risk of service-role backend auth usage?
Answer: backend compromise can fully control auth/admin operations.
Trap: How do you mitigate?
Confident: strict secret management, network hardening, least privilege and monitoring.

7. How does mobile handle offline mode?
Answer: NetInfo sets offline state; writes are blocked; sync occurs on reconnect.
Trap: What if user edits offline?
Confident: currently unsupported for write paths by design to avoid conflict complexity.

8. Explain your sync strategy.
Answer: incremental fetch by `updatedAfter` with periodic full sync every 6h.
Trap: How are deletions propagated?
Confident: current gap; needs tombstones or deletion feed (acknowledge honestly).

9. Why maintain both frontend and backend validation?
Answer: UX feedback on client, authoritative enforcement on server.
Trap: Is client validation enough?
Confident: never, server/db constraints are mandatory.

10. How are DB errors translated to API messages?
Answer: centralized PG error code/constraint mapping in error middleware.
Trap: Can this become stale?
Confident: yes if constraints renamed; tests and constants should track it.

11. How are parser failures handled?
Answer: layered fallback (backend image -> backend text -> optional direct Groq -> regex -> manual).
Trap: What if all fail?
Confident: manual data entry still saves workflow continuity.

12. Why is parser queue in-memory and what are limits?
Answer: simple initial design, but non-durable and non-distributed.
Trap: Production-ready?
Confident: not for scale; should move to durable queue.

13. How is observability implemented?
Answer: structured logs + in-memory metrics + Prometheus endpoint + alert webhooks.
Trap: Any downside?
Confident: memory-local metrics reset on restart; not aggregated cross-instance.

14. How do you secure `/metrics` and `/health/detailed`?
Answer: optional token gate + 404-style concealment in production.
Trap: Why 404 not 401?
Confident: reduces endpoint discoverability; still combine with network controls.

15. Why use Zod schemas?
Answer: runtime validation with typed outputs and consistent failure handling.
Trap: Does Zod replace DB constraints?
Confident: no, DB constraints remain the final authority.

16. How do you avoid SQL injection?
Answer: parameterized SQL via `dbQuery(text, values)` everywhere.
Trap: Any dynamic SQL risk?
Confident: dynamic fragments are limited to known safe clauses; values remain parameterized.

17. Why keep audit_events?
Answer: immutable change history for sensitive entities.
Trap: Could logs alone be enough?
Confident: logs are ephemeral/noisy; audit table is queryable and domain-scoped.

18. What is owner auto-claim migration?
Answer: first authenticated user claims legacy rows with `owner_user_id='legacy-owner'`.
Trap: Risk?
Confident: large updates/locking risk on first run; one-time migration script would be cleaner.

19. Why is frontend analytics partly local?
Answer: fallback resilience and low latency, but causes potential drift from backend truth.
Trap: Best approach?
Confident: pick one source-of-truth or clearly display fallback state.

20. How are payment edits audited?
Answer: writes to `payment_edit_logs` and `audit_events` before response.
Trap: What about deletions?
Confident: soft delete plus audit event preserve mutation trail.

21. How do you handle token expiration in mobile API calls?
Answer: backend client retries once after `refreshSession` on 401.
Trap: If refresh fails?
Confident: surface session-expired message and force re-login.

22. What role do unique indexes play here?
Answer: enforce business uniqueness under concurrency (vendor name, bill/payment idempotency).
Trap: Can app-only checks replace indexes?
Confident: no, only DB uniqueness is race-safe.

23. Why use strict env validation on startup?
Answer: fail fast against unsafe prod misconfiguration.
Trap: Too strict?
Confident: strictness is intentional for security-critical settings.

24. How would you scale this backend?
Answer: statelessize shared state (queue/rate limit/metrics), add cache/queue infra, tune DB pooling.
Trap: First bottleneck?
Confident: parser queue and DB connection contention.

25. How do you ensure mobile secrets are safe?
Answer: do not place secrets in `EXPO_PUBLIC_*`; keep server-only keys backend-side.
Trap: Any violations now?
Confident: yes, hygiene issue exists in env example/local credentials and must be fixed.

26. Why are there both route tests and utility tests?
Answer: utility tests guard pure logic; integration tests guard route behavior and contracts.
Trap: What is missing?
Confident: UI integration tests and true DB-backed integration in CI are still limited.

27. How is graceful shutdown handled?
Answer: stop accepting connections, stop alert loop, close DB pool, exit.
Trap: Any data-loss concern?
Confident: in-memory parser jobs/metrics can be lost; durable infra needed.

28. How does CORS work in production?
Answer: explicit origins enforced by env validation, wildcard disallowed in production.
Trap: If CORS misconfigured?
Confident: startup fails fast in production.

29. Explain one major tradeoff you intentionally made.
Answer: prioritized shipping speed with in-memory parser queue vs operational durability.
Trap: Would you keep it now?
Confident: no, now replace with durable queue for production scale.

30. What is your highest-priority fix list before enterprise production?
Answer: secret hygiene, durable queue, deletion sync strategy, test expansion, route refactor.
Trap: Order and why?
Confident: security first, then data consistency, then scalability/maintainability.

### Weak areas you should strengthen before interviews
1. Distributed systems implications of in-memory state.
2. Mobile multi-device sync conflict/tombstone design.
3. Deep Postgres transaction/isolation behavior.
4. Security operations (key management, credential lifecycle).
5. Test strategy layering (unit/integration/e2e contract).

---

## CODE QUALITY REVIEW
### Level assessment
- Overall: mid-level to upper-mid.
- Why:
  - Strong: env validation, SQL constraints, idempotency, audit logging, observability hooks.
  - Weak: oversized route files, some architecture drift, secret hygiene mistakes, incomplete sync model.

### Refactoring suggestions
1. Split `backend/src/routes/bills.ts` into `billController + billService + billRepository`.
2. Create reusable query modules for analytics and payment guards.
3. Introduce API contract types shared between backend and mobile.
4. Implement sync engine module with explicit delete tombstones/version vectors.
5. Add dedicated parser worker service if parse volume grows.

### Design pattern suggestions
- Use repository pattern for DB access.
- Use command handlers for mutable actions (create payment, delete bill, etc.).
- Use policy/guard layer for financial and auth business rules.

### Clean code violations
- Some files too large and multi-purpose.
- Repeated SQL snippets and repeated mapping logic.
- Mixed concerns in mobile screens (UI + orchestration + validation + error handling).

### SOLID analysis (quick)
- S: partially violated in big route files and scan screen.
- O: moderate; adding new entity requires touching many layers manually.
- L: N/A mostly functional modules.
- I: mostly fine (small helper interfaces).
- D: moderate; many modules depend directly on concrete services instead of abstractions.

---

## PRODUCTION READINESS SCORE
Score: 6.5 / 10

### Why not higher
- Secret hygiene problems are serious.
- In-memory queue/metrics/rate-limit do not scale cleanly.
- Incremental sync deletion gap can create data inconsistency across devices.

### Why not lower
- Core transactional integrity is better than typical junior projects.
- Good use of validation, indexes, audit trail, health/metrics, CI + synthetic monitoring.
- Typecheck/tests currently pass.

---

## Brutally Honest Priority Fixes (Top 10)
1. Remove OCR key from tracked `.env.example` and rotate key.
2. Remove plaintext `mobile/credentials.json` from shared working tree usage; migrate to secure credential management.
3. Add tombstone/deletion sync mechanism.
4. Replace in-memory parser queue with durable shared queue.
5. Replace in-memory rate-limit/metrics for scaled deployments.
6. Refactor `bills.ts` into layered modules.
7. Add true DB-backed integration tests in CI for key financial flows.
8. Add mobile UI integration tests for login/scan/payment critical path.
9. Align docs with actual auth persistence behavior.
10. Add security policy docs (key rotation, incident handling, credential handling).
