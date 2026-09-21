# ZB-CAS — Zemen Bank Competency Assessment System

A full-stack web application for managing employee competency assessments at Zemen Bank. Built with a React/Vite frontend and a Node.js/Express/MongoDB backend.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Architecture Overview](#architecture-overview)
3. [Getting Started](#getting-started)
4. [Environment Variables](#environment-variables)
5. [Project Structure](#project-structure)
6. [Role-Based Access Control](#role-based-access-control)
7. [Authentication Flow](#authentication-flow)
8. [Features](#features)
9. [Security](#security)
10. [Testing](#testing)
11. [Performance](#performance)
12. [API Reference](#api-reference)
13. [Design System](#design-system)
14. [Deployment](#deployment)
15. [Troubleshooting](#troubleshooting)

---

## Tech Stack

### Frontend
| Technology | Version | Purpose |
|-----------|---------|---------|
| React | 18.x | UI library |
| Vite | 7.x | Build tool & dev server |
| Tailwind CSS | 3.x | Utility-first CSS |
| React Router | 6.x | Client-side routing |
| Axios | 1.6.x | HTTP client with interceptors |
| Recharts | 2.9.x | Analytics charts |
| Lucide React | 0.263.x | Icon library |
| jsPDF + autotable | 4.x / 5.x | PDF export |

### Backend
| Technology | Version | Purpose |
|-----------|---------|---------|
| Node.js | 18+ | Runtime |
| Express | 5.0.1 (pinned) | Web framework |
| MongoDB + Mongoose | 8.10.x | Database + ODM |
| bcryptjs | 2.4.3 (pinned) | Password hashing (cost 12) |
| jsonwebtoken | 9.0.2 (pinned) | JWT access & refresh tokens |
| helmet | 8.x | Security headers |
| express-rate-limit | 7.5.x | Rate limiting |
| express-mongo-sanitize | 2.2.x | NoSQL injection prevention |
| hpp | 0.2.3 | HTTP parameter pollution prevention |
| nodemailer | 7.x | Transactional email |
| pdfkit / exceljs | latest | Report generation |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    React Frontend                   │
│  AuthContext (in-memory token) + Axios interceptors │
└───────────────────────┬─────────────────────────────┘
                        │ HTTPS / REST
┌───────────────────────▼─────────────────────────────┐
│               Express API (Node.js)                 │
│  helmet → cors → compression → rateLimiter          │
│  → cookieParser → mongoSanitize → hpp               │
│  → protect (JWT) → authorize (RBAC) → controller   │
└───────────────────────┬─────────────────────────────┘
                        │ Mongoose
┌───────────────────────▼─────────────────────────────┐
│               MongoDB Atlas (TLS)                   │
│  connection pool: min=2, max=10                     │
└─────────────────────────────────────────────────────┘
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- MongoDB Atlas cluster (or local MongoDB 6+)
- An SMTP provider (Gmail, SendGrid, etc.)

### Backend

```bash
cd backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env — see Environment Variables section below

# Seed the initial HR Admin account
npm run seed:admin

# Start development server (with hot reload)
npm run dev
```

The API will be available at `http://localhost:5000`.

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Configure environment
echo "VITE_API_URL=http://localhost:5000/api" > .env.local

# Start development server
npm run dev
```

The app will open at `http://localhost:3000`.

---

## Environment Variables

### Backend — `.env`

```env
# Server
NODE_ENV=development          # development | production
PORT=5000

# MongoDB
MONGO_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/zb-cas

# JWT — use long, random secrets (min 32 chars each)
JWT_SECRET=<random-secret-min-32-chars>
JWT_REFRESH_SECRET=<different-random-secret-min-32-chars>
JWT_EXPIRES_IN=15m            # Access token lifetime (keep short)
JWT_REFRESH_EXPIRES_IN=30d    # Refresh token lifetime

# CORS
CLIENT_ORIGIN=http://localhost:3000   # Production: https://your-domain.com

# Rate limiting
RATE_LIMIT_WINDOW_MS=900000   # 15 minutes
RATE_LIMIT_MAX=100            # Requests per window (general)
AUTH_RATE_LIMIT_MAX=10        # Login attempts per 10 minutes

# Email (SMTP)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=noreply@zemenbank.com
EMAIL_PASS=<app-password>
EMAIL_FROM="Zemen Bank CAS <noreply@zemenbank.com>"

# Logging
LOG_LEVEL=debug               # error | warn | info | debug
```

### Frontend — `.env.local`

```env
VITE_API_URL=http://localhost:5000/api
```

---

## Project Structure

```
zb-cas/
├── backend/
│   └── src/
│       ├── app.js                  # Express app setup & middleware chain
│       ├── config/
│       │   ├── database.js         # MongoDB connection (pooled)
│       │   └── email.js            # Nodemailer transport
│       ├── controllers/            # Route handlers (one per domain)
│       ├── middleware/
│       │   ├── auth.js             # protect() + authorize() guards
│       │   ├── errorHandler.js     # Global error handler
│       │   └── security.js        # helmet, cors, rate limiters, sanitizers
│       ├── models/                 # Mongoose schemas
│       │   ├── User.js
│       │   ├── Assessment.js
│       │   ├── SecurityViolation.js
│       │   └── ...
│       ├── routes/                 # Express routers
│       ├── services/               # Business logic (email, scoring, reports)
│       └── utils/
│           ├── AppError.js         # Operational error class
│           ├── asyncHandler.js     # Async try/catch wrapper
│           ├── jwt.js              # Token sign/verify helpers
│           └── logger.js           # Structured JSON logger
│
└── frontend/
    └── src/
        ├── components/             # Reusable UI components
        ├── context/
        │   ├── AuthContext.jsx     # In-memory token + auth state
        │   └── ToastContext.jsx    # Global notifications
        ├── hooks/
        │   └── useAssessmentSecurity.js  # Anti-cheating hook
        ├── pages/                  # Route-level page components
        ├── utils/
        │   ├── api.js              # Axios instance + refresh interceptor
        │   └── exportUtils.js      # PDF/Excel export helpers
        ├── App.jsx                 # Router + protected routes
        └── main.jsx                # React entry point
```

---

## Role-Based Access Control

The system has three roles. A user can hold multiple roles simultaneously and switch between them without re-logging in.

| Feature | HR_ADMIN | SUPERVISOR | EMPLOYEE |
|---------|----------|------------|----------|
| User management (CRUD) | ✅ | — | — |
| Competency framework | ✅ | — | — |
| Question bank | ✅ | — | — |
| Recommendations | ✅ | — | — |
| Assessment lifecycle management | ✅ | — | — |
| Manual scoring (short answer) | ✅ | — | — |
| Reports & analytics (all) | ✅ | ✅ | — |
| View direct reports | — | ✅ | — |
| Complete supervisor evaluations | — | ✅ | — |
| Take self-assessments | — | — | ✅ |
| View personal results + PDP | — | — | ✅ |
| Submit feedback | — | — | ✅ |
| Activity log | ✅ | — | — |

---

## Authentication Flow

```
1. User POSTs credentials to POST /api/auth/login
2. Server verifies password (bcrypt), checks account status & lockout
3. Server issues:
     - Access token  (15 min, signed JWT, returned in JSON body)
     - Refresh token (30 days, signed JWT, set as httpOnly cookie)
4. Frontend stores access token in memory (React useRef — never localStorage)
5. Every API request attaches: Authorization: Bearer <accessToken>
6. On 401 response, Axios interceptor:
     a. Calls POST /api/auth/refresh (cookie sent automatically)
     b. Gets new access token
     c. Retries original request
     d. On refresh failure → clears session, redirects to /login
7. On logout:
     - Server invalidates refresh token in DB
     - Cookie is cleared
     - Frontend clears in-memory token and session state
```

**Role switching** (multi-role users):
```
POST /api/auth/switch-role  { role: "SUPERVISOR" }
→ Server validates role is in user.roles (DB source of truth)
→ Issues new token pair with new activeRole embedded
→ Old refresh token invalidated
```

---

## Features

### Assessment Types
- **Self Assessment** — Employee evaluates own competencies
- **Supervisor Only** — Supervisor evaluates an employee
- **Combined** — Weighted blend (configurable %; e.g. 20% self / 80% supervisor, must sum to 100%)

### Question Types
- **MCQ** — Multiple choice, single correct answer
- **Rating** — 1–5 scale
- **True/False** — Binary
- **Short Answer** — Free text, requires manual HR scoring

### Assessment Lifecycle
`DRAFT → SCHEDULED → ACTIVE → COMPLETED`

Auto-transition: the system promotes `SCHEDULED` assessments when their `startDate` passes, and completes `ACTIVE` ones when their `endDate` passes.

### Report Generation
- Individual employee results
- Department-level analytics
- Competency heatmaps
- Exportable as PDF and Excel

### Personal Development Plan (PDP)
Generated automatically from results + competency-level recommendations.

---

## Security

ZB-CAS has been hardened against the OWASP Top 10. Key measures:

### Authentication & Token Security
- Access tokens expire in **15 minutes** (short-lived by design)
- Refresh tokens stored in **httpOnly, Secure, SameSite=Strict** cookies scoped to `/api/auth`
- Refresh tokens **rotate on every use** — replay attacks are rejected
- Server-side token invalidation on logout and role switch
- Access token held **in-memory only** on the frontend (`useRef`) — never in `localStorage` or `sessionStorage`

### Input Validation & Injection Prevention
- `express-mongo-sanitize` strips `$` operators from `req.body`, `req.params`, and `req.query`
- All user-supplied strings used in `RegExp` are escaped via `escapeRegex()`
- Mongoose `strict: true` on all schemas prevents mass-assignment
- All enum fields validated at the schema level

### Rate Limiting & Brute Force Protection
- **General limiter:** 100 requests / 15 min (global)
- **Auth limiter:** 10 attempts / 10 min, applied only to `/auth/login` and `/auth/forgot-password`, `skipSuccessfulRequests: true`
- **Account lockout:** 5 failed attempts → 15-minute lockout, tracked server-side

### Security Headers
`helmet()` sets: `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Strict-Transport-Security` (HSTS).

### Error Handling
- Stack traces **never** sent to clients in production
- Generic message returned for 500-level errors
- Detailed errors returned in `development` mode only

### Assessment Integrity
Client-side monitoring via `useAssessmentSecurity` hook:
- Tab-switch and window-blur detection
- Copy/paste/cut prevention
- Right-click context menu blocking
- DevTools keyboard shortcut blocking (F12, Ctrl+Shift+I, etc.)
- Fullscreen enforcement and exit detection
- Countdown timer with auto-submit on expiry

All violations are persisted to `SecurityViolation` collection with a unique `(assessmentId, userId)` index. High-risk sessions (`≥5 violations`) are flagged for HR review.

### Password Policy
Minimum 8 characters, must include: uppercase, lowercase, digit, and special character (`!@#$%^&*` etc.).

---

## Testing

### Run Tests

```bash
cd backend

# Install test dependencies (first time)
npm install --save-dev jest @jest/globals supertest

# Run all tests
npm test

# Run with coverage report
npm test -- --coverage
```

### Test Coverage Areas

The test suite (`zb-cas.test.js`) covers:

| Module | Tests |
|--------|-------|
| JWT utilities | Sign, verify, expiry, cookie options |
| `escapeRegex` | Metacharacter escaping, ReDoS prevention |
| `mongoSanitize` | Body / query / params sanitization |
| `protect` middleware | Missing token, invalid token, valid token |
| `authorize` middleware | Role allowed, role denied, multi-role |
| Password complexity | All regex edge cases |
| `AppError` | Status code, status string, stack trace |
| Error handler | All error type mappings, stack trace suppression |
| User `toPublic()` | Sensitive field exclusion |
| `defaultRole` virtual | Priority ordering |
| Assessment validation | Date logic, weight sum validation |
| Account lockout | Threshold, active lock, expired lock |
| Refresh token rotation | Replay attack rejection |
| Privilege escalation | Role switch boundary checks |
| User enumeration | Identical forgot-password response |
| NoSQL injection | Payload stripping |
| Pagination helpers | Skip/limit/totalPages calculations |
| `asyncHandler` | Error propagation to `next()` |
| `SecurityViolation` isHighRisk | Threshold logic |
| Frontend `pickDefaultRole` | Priority ordering |
| Frontend `isAuthRoute` | Interceptor bypass detection |

### Manual Testing Checklist

- [ ] Login as HR_ADMIN, SUPERVISOR, EMPLOYEE
- [ ] Attempt login with wrong password 5 times → account locks
- [ ] Verify forgot-password gives identical response for known/unknown user
- [ ] Switch roles (multi-role user)
- [ ] Create / edit / delete users (HR_ADMIN only)
- [ ] Create competency → questions → recommendations → assessment
- [ ] Schedule assessment → verify auto-activation at startDate
- [ ] Take assessment (auto-save + timer + security monitoring)
- [ ] Submit assessment → score → finalize results
- [ ] Generate PDP
- [ ] Export report as PDF and Excel
- [ ] Attempt to access HR_ADMIN routes as EMPLOYEE → expect 403

---

## Performance

### Backend Optimisations

- **Connection pooling:** Mongoose configured with `minPoolSize: 2`, `maxPoolSize: 10`
- **Lean queries:** `.lean()` used on all read-heavy list endpoints to skip Mongoose hydration
- **Parallel DB calls:** `Promise.all([find(), countDocuments()])` for paginated endpoints
- **Compression:** `compression` middleware gzips all JSON responses
- **Indexes:** Applied on all frequently-queried fields:
  - `User`: `username`, `department+status`, `roles`, `supervisorId`
  - `Assessment`: `status`, `startDate+endDate`, `targetAudience.*`
  - `SecurityViolation`: `(assessmentId+userId)` unique, `summary.isHighRisk`

### Production Scaling Notes

- Replace the in-memory rate limiter store with **Redis** before horizontal scaling:
  ```js
  import RedisStore from 'rate-limit-redis';
  store: new RedisStore({ sendCommand: (...args) => redisClient.sendCommand(args) })
  ```
- Replace `skip/limit` pagination with **cursor-based** pagination for collections exceeding 100k documents
- Enable **MongoDB Atlas search indexes** if full-text search is added

### Frontend Optimisations

- Access token held in `useRef` — no re-renders on token update
- Auto-save debounced at 600ms — limits write requests during assessment
- Axios 401 queue — parallel requests wait for a single refresh, preventing token-refresh storms

### Recommended Frontend Improvements

- Add route-level code splitting with `React.lazy()` + `Suspense`
- Introduce `React Query` or `SWR` for request caching and deduplication
- Add `loading="lazy"` to non-critical images

---

## API Reference

All endpoints are prefixed with `/api`.

### Auth — `/api/auth`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/login` | — | Login with username + password |
| POST | `/refresh` | Cookie | Rotate refresh token, get new access token |
| POST | `/logout` | Bearer | Invalidate refresh token |
| POST | `/register` | HR_ADMIN | Create a new user |
| POST | `/forgot-password` | — | Send password reset email |
| POST | `/reset-password/:token` | — | Set new password via reset token |
| POST | `/change-password` | Bearer | Change own password |
| POST | `/switch-role` | Bearer | Switch active role (multi-role users) |

### Users — `/api/users`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | HR_ADMIN / SUPERVISOR | List users (scope by role) |
| GET | `/me` | Bearer | Get own profile |
| GET | `/:id` | Bearer | Get single user |
| PUT | `/:id` | HR_ADMIN | Update user |
| PATCH | `/:id/status` | HR_ADMIN | Activate / deactivate |
| DELETE | `/:id` | HR_ADMIN | Delete user |

### Assessments — `/api/assessments`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | Bearer | List assessments (role-scoped) |
| POST | `/` | HR_ADMIN | Create assessment |
| GET | `/:id` | Bearer | Get assessment details |
| PUT | `/:id` | HR_ADMIN | Update assessment |
| PATCH | `/:id/status` | HR_ADMIN | Advance status |
| DELETE | `/:id` | HR_ADMIN | Delete assessment |

> Additional route groups: `/api/competencies`, `/api/questions`, `/api/recommendations`, `/api/responses`, `/api/results`, `/api/reports`, `/api/feedback`, `/api/supervisors`, `/api/dashboard`

---

## Design System

### Brand Colors (Zemen Bank)
```
Primary Red:   #C8102E
Red Dark:      #A00D24
Red Light:     #E8283F
Red Muted:     #F5E5E7
Black:         #1A1A1A
Black Soft:    #27272A
```

### Typography
- **Display:** Playfair Display (serif) — headers and titles
- **Body:** DM Sans (sans-serif) — body text and UI elements

### Competency Level Colors
- **Basic:** Yellow `#F59E0B`
- **Intermediate:** Orange `#EA580C`
- **Advanced:** Blue `#2563EB`
- **Expert:** Green `#16A34A`

### Utility Classes (`index.css`)

```jsx
// Badges
<span className="badge badge-active">Active</span>
<span className="badge badge-expert">Expert</span>
<span className="badge badge-hr_admin">HR Admin</span>

// Progress bars
<div className="progress-bar">
  <div className="progress-fill" style={{ width: '75%' }} />
</div>

// Focus / Hover
<input className="focus-brand" />
<div className="card-hover">...</div>
```

---

## Deployment

### Backend (e.g. Railway, Render, EC2)

```bash
npm run build   # if transpilation step added
npm start       # node src/app.js
```

Required environment variables in production:
- `NODE_ENV=production`
- `MONGO_URI`
- `JWT_SECRET`, `JWT_REFRESH_SECRET` (strong, unique, random)
- `CLIENT_ORIGIN` (your frontend domain)
- Email SMTP credentials

### Frontend (e.g. Vercel, Netlify)

```bash
npm run build   # outputs to dist/
```

Set `VITE_API_URL` to your production backend URL as a build-time environment variable.

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `401 Authentication token is missing` | No `Authorization` header | Check frontend token is being attached |
| `401 Invalid or expired token` | Access token expired | Token refresh should happen automatically; check interceptor |
| `403 You do not have permission` | Wrong role for the route | Verify the user's active role in JWT / DB |
| `423 Account locked` | ≥5 failed login attempts | Wait 15 minutes or reset `failedLoginAttempts` in DB |
| CORS errors | `CLIENT_ORIGIN` mismatch | Match the env var to your exact frontend origin including protocol and port |
| `Invalid refresh token` | Token already rotated | User may have logged in on another device; log in again |
| MongoDB `MongoServerSelectionError` | Wrong `MONGO_URI` or network | Check Atlas IP whitelist and connection string |

---

## License

Proprietary — Zemen Bank Internal Use Only

## Support

For issues or questions, contact the IT department at support@zemenbank.com

---

*Built for Zemen Bank — README updated 2026-03-06*
