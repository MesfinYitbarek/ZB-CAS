/* context/AuthContext.jsx */
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api, { registerTokenGetter, registerTokenSetter } from '../utils/api';

const AuthContext = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

const ROLE_PRIORITY = { HR_ADMIN: 0, SUPERVISOR: 1, EMPLOYEE: 2 };

function pickDefaultRole(roles = []) {
  if (!roles.length) return 'EMPLOYEE';
  return [...roles].sort(
    (a, b) => (ROLE_PRIORITY[a] ?? 99) - (ROLE_PRIORITY[b] ?? 99)
  )[0];
}

// Module-level flag — survives StrictMode's unmount/remount cycle.
// React StrictMode deliberately mounts every component TWICE in development
// to surface side-effect bugs. Without this guard the bootstrap useEffect fires
// twice in parallel: both calls hit POST /auth/refresh with the same cookie,
// the first rotates the token in the DB, and the second arrives with the now-
// invalidated old token → 401 → catch clears session → user logged out.
// Using a module-level promise means the second invocation just awaits the
// result of the first instead of making a duplicate network request.
let bootstrapPromise = null;

function restoreSession() {
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = api.post('/auth/refresh')
    .then(({ data }) => {
      const accessToken = data.data.accessToken;
      return api.get('/users/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then(({ data: meData }) => ({
        accessToken,
        user: meData.data.user,
      }));
    })
    .catch((err) => {
      // Reset so a future explicit login can re-run the bootstrap
      bootstrapPromise = null;
      throw err;
    });
  return bootstrapPromise;
}

export default function AuthProvider({ children }) {
  const accessTokenRef = useRef(null);
  const [user,       setUser]       = useState(null);
  const [activeRole, setActiveRole] = useState(
    () => sessionStorage.getItem('activeRole') || null
  );
  const [loading, setLoading] = useState(true);

  const getAccessToken = useCallback(() => accessTokenRef.current, []);

  // Register in-memory token getter/setter with api.js
  useEffect(() => {
    registerTokenGetter(() => accessTokenRef.current);
    registerTokenSetter((token) => { accessTokenRef.current = token; });
  }, []);

  // Restore session on mount.
  // restoreSession() is deduplicated at module level so StrictMode's
  // double-invoke never sends two simultaneous /auth/refresh requests.
  useEffect(() => {
    let cancelled = false;

    restoreSession()
      .then(({ accessToken, user: u }) => {
        if (cancelled) return;
        accessTokenRef.current = accessToken;
        setUser(u);
        const stored   = sessionStorage.getItem('activeRole');
        const resolved = stored && u.roles?.includes(stored)
          ? stored
          : pickDefaultRole(u.roles);
        setActiveRole(resolved);
        sessionStorage.setItem('activeRole', resolved);
      })
      .catch((err) => {
        if (cancelled) return;
        const status = err?.response?.status;
        if (status && status !== 400 && status !== 401 && status !== 403) {
          console.warn('[AuthContext] Unexpected error during session restore:', status, err?.response?.data?.message);
        }
        accessTokenRef.current = null;
        setUser(null);
        setActiveRole(null);
        sessionStorage.removeItem('activeRole');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  // Login with username + password
  const login = useCallback(async (username, password) => {
    const { data } = await api.post('/auth/login', { username, password });
    const { user: u, accessToken, activeRole: ar } = data.data;
    accessTokenRef.current = accessToken;
    // Reset the bootstrap promise so a future page refresh re-runs it
    bootstrapPromise = null;
    setUser(u);
    setActiveRole(ar);
    sessionStorage.setItem('activeRole', ar);
    return u;
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch { /* silent */ }
    accessTokenRef.current = null;
    bootstrapPromise = null;
    setUser(null);
    setActiveRole(null);
    sessionStorage.clear();
  }, []);

  const switchRole = useCallback(async (role) => {
    const { data } = await api.post('/auth/switch-role', { role });
    const { accessToken: newToken, activeRole: newRole } = data.data;
    accessTokenRef.current = newToken;
    setActiveRole(newRole);
    sessionStorage.setItem('activeRole', newRole);
    return newRole;
  }, []);

  const isAdmin      = activeRole === 'HR_ADMIN';
  const isSupervisor = activeRole === 'SUPERVISOR';
  const isEmployee   = activeRole === 'EMPLOYEE';
  const isMultiRole  = (user?.roles?.length ?? 0) > 1;

  return (
    <AuthContext.Provider
      value={{ user, loading, activeRole, getAccessToken, login, logout, switchRole, isAdmin, isSupervisor, isEmployee, isMultiRole }}
    >
      {children}
    </AuthContext.Provider>
  );
}
