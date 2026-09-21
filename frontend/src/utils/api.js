/* utils/api.js
 * SECURITY FIX (A02): Access token is no longer stored in localStorage.
 * It is held in memory via AuthContext (accessTokenRef).
 *
 * BUG FIX: Auth endpoints (/auth/login, /auth/refresh, /auth/logout, etc.)
 * are excluded from the 401 auto-refresh interceptor. Previously a failed
 * login would trigger a refresh attempt, which would also fail and then fire
 * window.location.href = '/login' — causing a hard page reload that wiped
 * any error message the Login page had just set.
 */
import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// ── Token registry (avoids circular import with AuthContext) ──────────────────
let _getToken = () => null;
let _setToken = null;

export function registerTokenGetter(fn) {
  _getToken = fn;
}

// The 401-refresh interceptor pushes each refreshed access token here so the
// in-memory holder (AuthContext.accessTokenRef) is updated permanently —
// otherwise every later request still carries the expired token and burns a
// refresh+rotation cycle until the refresh limiter trips.
export function registerTokenSetter(fn) {
  _setToken = fn;
}

// ── Axios instance ────────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: BASE,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,  // Required so httpOnly refresh cookie is sent
});

// ── Request interceptor: attach in-memory access token ───────────────────────
api.interceptors.request.use((config) => {
  const token = _getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Response interceptor: auto-refresh on 401 ────────────────────────────────
let isRefreshing = false;
let failedQueue  = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((p) => (token ? p.resolve(token) : p.reject(error)));
  failedQueue = [];
};

// Auth routes that should NEVER trigger the refresh interceptor.
// A 401 from these means the credentials themselves are wrong — not an
// expired session — so we must let the error propagate to the caller.
const AUTH_ROUTES = ['/auth/login', '/auth/refresh', '/auth/logout', '/auth/forgot-password', '/auth/reset-password'];

const isAuthRoute = (url = '') => AUTH_ROUTES.some((r) => url.includes(r));

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const orig = error.config;

    // BUG FIX: Skip refresh logic entirely for auth endpoints.
    // This prevents a failed /auth/login (401) from triggering a
    // /auth/refresh attempt which would then do a hard window.location reload.
    if (isAuthRoute(orig?.url)) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !orig._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          orig.headers.Authorization = `Bearer ${token}`;
          return api(orig);
        });
      }

      orig._retry    = true;
      isRefreshing   = true;

      try {
        const { data } = await axios.post(
          `${BASE}/auth/refresh`,
          {},
          { withCredentials: true }
        );

        const newToken = data.data.accessToken;

        // Permanently adopt the refreshed token for all future requests.
        if (typeof _setToken === 'function') {
          _setToken(newToken);
        }

        processQueue(null, newToken);
        orig.headers.Authorization = `Bearer ${newToken}`;
        return api(orig);
      } catch (err) {
        processQueue(err);
        // Only force a hard redirect to /login if we were already on a
        // protected page (i.e. there WAS an active session that just expired).
        // Do NOT redirect if we're already on /login or if there's no session
        // to clear — that would cause an infinite reload loop on startup.
        const alreadyOnAuth = window.location.pathname.startsWith('/login') ||
                              window.location.pathname.startsWith('/reset-password');
        if (!alreadyOnAuth) {
          sessionStorage.removeItem('activeRole'); // remove only auth key, not all storage
          window.location.href = '/login';
        }
        throw err;
      } finally {
        isRefreshing = false;
      }
    }

    throw error;
  }
);

export default api;