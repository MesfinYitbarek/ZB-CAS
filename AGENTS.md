# AGENTS.md — ZB-CAS

Zemen Bank Competency Assessment System. Full-stack: React/Vite frontend (`frontend/`) + Node.js/Express/PostgreSQL backend (`backend/`). Two independent npm packages — no monorepo workspace config.

## Key Facts

- **Both packages use ES modules** (`"type": "module"`). Use `import`/`export`, not `require`.
- **Express 5.x** (not 4.x). Middleware error handling differs — `asyncHandler` wraps route handlers, errors pass via `next()`.
- **No lint, typecheck, or formatter scripts exist.** Run `npm test` in `backend/` to verify backend changes. Frontend has no test config.
- **PostgreSQL + Prisma ORM required.** Backend hard-exits (`process.exit(1)`) if the `DATABASE_URL` is unreachable. Prisma client singleton: `backend/src/config/prisma.js`. Schema: `backend/prisma/schema.prisma` (run `npx prisma migrate dev` after schema changes; model accessor for `FAQ` is `prisma.fAQ`).
- **Access tokens live in-memory only** (React `useRef` in `AuthContext.jsx`). Never store in `localStorage`. The `registerTokenGetter` pattern in `frontend/src/utils/api.js` bridges the token to Axios.

## Dev Commands

```bash
# Backend (port 5000)
cd backend
cp .env.example .env   # create from scratch if missing — no example file committed
npm install
npm run seed:admin      # create initial HR_ADMIN user (required before first use)
npm run dev             # nodemon hot-reload

# Backend tests
cd backend
npm install --save-dev jest @jest/globals supertest
npm test                # node --experimental-vm-modules jest --coverage (single file: test/test.js)

# Frontend (port 3000)
cd frontend
npm install
echo "VITE_API_URL=http://localhost:5000/api" > .env.local
npm run dev
```

## Architecture

- **Backend entrypoint:** `backend/src/app.js` — boots Express + Socket.IO + PostgreSQL (Prisma) + cron scheduler.
- **Frontend entrypoint:** `frontend/src/main.jsx` → `App.jsx` (BrowserRouter, lazy-loaded pages, role-based `ProtectedRoute`).
- **API base:** All routes prefixed `/api`. Axios instance in `frontend/src/utils/api.js` sets `withCredentials: true` for refresh cookies.
- **Auth flow:** Login returns access token (JSON body) + refresh token (httpOnly cookie scoped to `/api/auth`). On 401, the Axios interceptor calls `/api/auth/refresh` (cookie auto-sent) and retries — but **auth routes themselves bypass this interceptor** to avoid redirect loops on bad credentials.
- **RBAC:** Three roles (`HR_ADMIN`, `SUPERVISOR`, `EMPLOYEE`). A user can hold multiple roles and switch via `/api/auth/switch-role`. Backend trusts the `role` claim in the JWT — the DB is the source of truth at role-switch time.
- **Middleware chain:** helmet → cors → compression → rateLimiter → body parser → cookieParser → hpp → `protect()` → `authorize()` → controller.
- **Assessment lifecycle:** `DRAFT → SCHEDULED → ACTIVE → COMPLETED → ARCHIVED`. Auto-transitions driven by `node-cron` scheduler (`backend/src/services/schedulerService.js`).
- **Real-time:** Socket.IO mounted on the same HTTP server (`backend/src/services/socketService.js`).
- **Deployment:** Backend → Railway/Render/EC2 (`npm start`). Frontend → Vercel (`vercel.json` has SPA rewrite). Set `trust proxy 1` is already configured for hosted platforms.

## Pitfalls

- **No `.env.example` is committed.** Copy the env template from `README.md` manually, or create `.env` from the documented vars.
- **Refresh token cookie is path-scoped** to `/api/auth`. If you add new auth-adjacent endpoints, they must live under that prefix or the cookie won't be sent.
- **`VITE_API_URL` must be set at build time** for frontend production builds. The fallback `http://localhost:5000/api` only works locally.
- **Express 5 does not support `app.del()`** or the old 4.x `req.param()`. Use standard methods.
- **Backend tests import ESM modules directly.** Jest needs `--experimental-vm-modules` or the test file mocks `process.env` before importing. The single test file (`test/test.js`) sets env vars at the top — don't reorder imports.
- **Frontend `App.jsx` has duplicate `/activity-log` routes** (lines 314-329 and 341-347). This is a known issue — only the first match renders. Clean up if touching that file.
- **`useAssessmentSecurity` hook** monitors tab-switch, copy/paste, DevTools shortcuts, and fullscreen. Violations are persisted via auto-save. Don't remove or weaken these guards.
- **Migration notes:** `src/models/*.js` are dead Mongoose code — no active file imports them (verified). Backend serializes Prisma rows with an `_id` alias (`{...row, _id: row.id}`) so the frontend needs no changes. The `Report` model is a flat table; `toLegacyReport` in `reportService.js` maps it back to the legacy embedded shape for PDF/Excel. Competency target groups live in the `CompetencyTargetGroup` junction, and assessment questions in the `AssessmentQuestion` junction. **Assessment target audience:** there is NO `audience` field/relation on the Prisma `Assessment` model (it was a Mongoose subdocument). Use the scalar `audienceType` (`ALL_DEPARTMENTS`/`DEPARTMENT_ALL`/`SPECIFIC_EMPLOYEES`), the 1:1 `targetAudience` relation (`AssessTargetAudience` with a `type` field), and the direct relations `audienceDepartments` / `audienceEmployees` junctions. Filters must query those direct relations (e.g. `{ audienceDepartments: { some: { department } } }`), NOT an `audience` wrapper — Prisma throws "unknown argument 'audience'".
