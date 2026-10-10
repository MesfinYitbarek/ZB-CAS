# AGENTS.md — ZB-CAS

Zemen Bank Competency Assessment System. Full-stack: React/Vite frontend (`frontend/`) + Node.js/Express/PostgreSQL backend (`backend/`). Two independent npm packages — no workspace config, no CI (`.github/` absent), no lint/format/typecheck scripts anywhere.

## Key Facts

- **Both packages are ES modules** (`"type": "module"`). Use `import`/`export`, never `require`.
- **Express 5.x** (not 4.x): `asyncHandler` wraps route handlers, errors pass via `next()`. `app.del()` / `req.param()` do not exist.
- **PostgreSQL + Prisma.** Backend hard-exits if `DATABASE_URL` is unreachable (`src/config/database.js`). Client singleton: `src/config/prisma.js`. Schema: `prisma/schema.prisma` with committed migrations — run `npx prisma migrate dev` after schema changes. Model accessor for `FAQ` is `prisma.fAQ`.
- **Auth defaults to LDAP.** `AUTH_MODE=local` in `backend/.env` is required for local bcrypt login (`authController.js:101`); without it login binds against Active Directory and local accounts fail.
- **Access tokens live in-memory only** (`useRef` in `AuthContext.jsx`) — never `localStorage`. `registerTokenGetter`/`registerTokenSetter` in `frontend/src/utils/api.js` bridge the token to Axios.
- **The only README (`frontend/README.md`) is stale** — it documents the old MongoDB/Mongoose + jsPDF stack (`MONGO_URI`, `EMAIL_HOST`, `cp .env.example .env`, `zb-cas.test.js`). None of that matches the code. Don't trust it for setup, env vars, or API details.

## Dev Commands

```bash
# Backend (port 5000) — run everything from backend/
cd backend
# There is NO .env.example. Create backend/.env from scratch. Minimum:
#   DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET (32+ chars each),
#   CLIENT_ORIGIN=http://localhost:3000, AUTH_MODE=local
# Optional: SMTP_HOST/PORT/SECURE/USER/PASS + EMAIL_FROM, RATE_LIMIT_*,
#   LDAP_URL/LDAP_STARTTLS/LDAP_BASE_DN, CLIENT_URL, ZB_SP_URL/ZB_SP_API_KEY
npm install
npm run dev                        # nodemon src/app.js

# ⚠ npm run seed:admin does NOT just create an admin — it runs seed/seed.js,
#   the full demo seed that WIPES all data (deleteMany on ~20 tables) and
#   creates demo users (admin selam.tesfaye / Admin@123).
#   Non-destructive admin-only seed: node seed/seedAdmin.js
#   (creates hr.admin / Zemen@2026, overridable via ADMIN_* env vars — despite
#   its own header claiming "npm run seed:admin"). All seeds assume CWD=backend/.

# Backend tests — single file backend/test/test.js (113 tests, ~1 min, no DB needed)
npm test                           # always runs with --coverage (script flag);
                                   # output lands in backend/coverage/
npm test -- -t "JWT"               # run tests matching a name
# Jest runs with --experimental-vm-modules via the script — plain `npx jest`
# may fail. supertest is NOT used; @jest/globals arrives via npm install.

# Frontend (port 3000)
cd frontend
npm install
# The repo's frontend/.env sets VITE_API_URL=/cas/api (relative, for the
# production /cas/ base). There is no Vite proxy, so this 404s in dev.
# .env.local overrides .env — create it for local dev:
echo "VITE_API_URL=http://localhost:5000/api" > .env.local
npm run dev
```

## Architecture

- **Backend entrypoint:** `backend/src/app.js` — boots Express + Socket.IO + Prisma connectivity check + node-cron scheduler (`startScheduler`). Swagger UI at `GET /api/docs`, health check at `GET /api/health`.
- **Frontend entrypoint:** `frontend/src/main.jsx` → `App.jsx` (`BrowserRouter` with `basename=import.meta.env.BASE_URL`, every page `React.lazy()`, role-based `ProtectedRoute`).
- **API base:** all routes prefixed `/api` (route files in `backend/src/routes/`, mounted in `app.js`).
- **Auth flow:** login returns access token (JSON body) + refresh token (httpOnly cookie). On 401 the Axios interceptor refreshes and retries — but auth endpoints (`/auth/login`, `/refresh`, `/logout`, `/forgot-password`, `/reset-password`) bypass the interceptor to avoid redirect loops on bad credentials. Refresh cookie: `path: '/'`, `sameSite: 'none'` + `secure` in production (cross-origin deploys; see comments in `src/utils/jwt.js`).
- **RBAC:** three roles (`HR_ADMIN`, `SUPERVISOR`, `EMPLOYEE`); a user can hold multiple roles and switch via `/api/auth/switch-role`. Backend trusts the `role` claim in the JWT — DB is source of truth at switch time.
- **Middleware chain:** helmet → cors → compression → rateLimiter → json/urlencoded (1 MB) → cookieParser → hpp → per-route `protect()` → `authorize()` → controller.
- **Assessment lifecycle:** `DRAFT → SCHEDULED → ACTIVE → COMPLETED` (COMPLETED terminal; legacy `ARCHIVED` removed). Auto-transitions driven by `node-cron` (`services/schedulerService.js`). ACTIVE deadlines extendable via `PATCH /api/assessments/:id/deadline` (`extendDeadline` — re-arms timers via `clearAssessmentTimers` + `scheduleAssessmentTimers`); the Edit-Assessment form is DRAFT-only.
- **Real-time:** Socket.IO on the same HTTP server (`services/socketService.js`); CORS origin from `CLIENT_URL`.
- **Deployment:** backend `npm start` (hosted behind a proxy — `app.set('trust proxy', 1)`); frontend Vercel (`vercel.json` SPA rewrite), `vite build` uses `base: '/cas/'`.

## Pitfalls

- **Prisma audience queries:** there is NO `audience` field/relation on `Assessment` (Mongoose-era subdocument). Use the scalar `audienceType` (`ALL_DEPARTMENTS`/`DEPARTMENT_ALL`/`SPECIFIC_EMPLOYEES`), the 1:1 `targetAudience` (`AssessTargetAudience`), and the junction relations `audienceDepartments` / `audienceEmployees`. Filter with `{ audienceDepartments: { some: { ... } } }` — an `audience` wrapper throws "unknown argument 'audience'".
- **`_id` alias:** backend serializes Prisma rows as `{ ...row, _id: row.id }` (~78 sites) so the frontend still reads `_id`, not `id`.
- **Dead/legacy code:** no `src/models/` exists (Mongoose fully removed); `services/reportService.js` is dead (nothing imports it); legacy `Report`/`ReportCompetency` tables are only written by the demo seeds. No PDF code exists anywhere (pdfkit/jspdf removed; `exportToExcel` in `frontend/src/utils/exportUtils.js` remains for Activity Log).
- **Test file quirks:** `test/test.js` sets `process.env` at the top, then loads app modules via dynamic `await import(...)` (JWT/middleware are intentionally NOT static imports — reordering breaks them). Some imports are cache-busted with query strings (`../src/utils/jwt.js?v=expired`) to re-read env. Coverage thresholds aren't configured; `--coverage` just reports.
- **`useAssessmentSecurity` hook** monitors tab-switch, copy/paste, DevTools shortcuts, and fullscreen; violations are persisted via auto-save. Don't remove or weaken these guards.
- **Junction tables:** competency target groups live in `CompetencyTargetGroup`, assessment questions in `AssessmentQuestion`.

## Reports Module (two-tier, live-first)

- **Tier 1 — LIVE analytics.** `GET /api/reports/stats`, `/heatmap`, `/department/:department`, `/filter-options` → `analyticsController.js` → `services/analyticsService.js`, computed on-request from the live `Result` table, scoped to `status: 'COMPLETED'` assessments and `status: 'FINAL'` results (`buildResultFilter` gate). `scoreMin`/`scoreMax`/`overallLevel` filters apply AFTER grouping (per user×assessment mean) in `computeLiveStats`. Levels use `assignLevel` thresholds 80/60/40 (`utils/scoring.js`).
- **Tier 2 — named on-demand reports (Excel only, live-sourced).** `POST /api/reports/generate`, `/pivot-preview`, `GET /generated`, `/generated/:id`, `/generated/:id/preview`, `/generated/:id/download`, `DELETE /generated/:id` → `generatedReportController.js` → `services/generatedReportService.js`. Each report is a `GeneratedReport` row (type INDIVIDUAL/ORGANIZATION/CUSTOM_PIVOT, frozen `filters`/`pivot` JSON) with the `.xlsx` under `backend/storage/reports/`. Datasets come from the live `Result` table via `buildResultFilter` + `fetchLiveResults`. Generation is synchronous (async queue is future work).
- **Old snapshot surface is deleted:** `/custom/pivot`, `/export/*`, `/individual/:userId`, `/`, `/:reportId`, and the PDF builders; `reportController.js` now only serves `/employees`. Frontend has one page `pages/reports/generated/GeneratedPage.jsx` (+ `NewReportModal`, `GeneratedDetailModal`, reusing `EmployeePicker`); the old Individual/All/Builder tabs, `ReportTables`, and `ReportDetailModal` are gone.
