/* context/AuthContext.jsx */
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api, { registerTokenGetter } from '../utils/api';

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

export default function AuthProvider({ children }) {
  const accessTokenRef = useRef(null);
  const [user,       setUser]       = useState(null);
  const [activeRole, setActiveRole] = useState(
    () => sessionStorage.getItem('activeRole') || null
  );
  const [loading, setLoading] = useState(true);

  const getAccessToken = useCallback(() => accessTokenRef.current, []);

  // Register in-memory token getter with api.js
  useEffect(() => {
    registerTokenGetter(() => accessTokenRef.current);
  }, []);

  // Restore session on mount via httpOnly cookie refresh.
  // Called once when the app loads (including hard page reloads).
  //
  // Failure handling:
  //   • 400 / 401 / 403 → genuine "no valid session" → clear local state
  //   • Network error / 5xx → transient failure → also clear so user can retry
  //     (we cannot distinguish "no cookie" from "server down" here, so the
  //      safe default is to require a fresh login; tokens are short-lived anyway)
  useEffect(() => {
    api.post('/auth/refresh')
      .then(({ data }) => {
        accessTokenRef.current = data.data.accessToken;
        return api.get('/users/me');
      })
      .then(({ data }) => {
        const u = data.data.user;
        setUser(u);
        const stored   = sessionStorage.getItem('activeRole');
        const resolved = stored && u.roles?.includes(stored)
          ? stored
          : pickDefaultRole(u.roles);
        setActiveRole(resolved);
        sessionStorage.setItem('activeRole', resolved);
      })
      .catch((err) => {
        // Only wipe the stored role if this is definitely an auth failure.
        // For any error we still can't show the app without a valid token,
        // so always reset — but log it so the team can spot unexpected errors.
        const status = err?.response?.status;
        if (status && status !== 400 && status !== 401 && status !== 403) {
          // Unexpected server error during bootstrap — log but still clear
          console.warn('[AuthContext] Unexpected error during session restore:', status, err?.response?.data?.message);
        }
        accessTokenRef.current = null;
        setUser(null);
        setActiveRole(null);
        sessionStorage.removeItem('activeRole');
      })
      .finally(() => setLoading(false));
  }, []);

  // Login with username + password
  const login = useCallback(async (username, password) => {
    const { data } = await api.post('/auth/login', { username, password });
    const { user: u, accessToken, activeRole: ar } = data.data;
    accessTokenRef.current = accessToken;
    setUser(u);
    setActiveRole(ar);
    sessionStorage.setItem('activeRole', ar);
    return u;
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch { /* silent */ }
    accessTokenRef.current = null;
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
