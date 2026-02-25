/* context/AuthContext.jsx
 *
 * Changes:
 *  - `activeRole`  – the role the user is currently operating as (persisted in
 *                    localStorage so it survives a page refresh).
 *  - `switchRole(role)` – calls POST /auth/switch-role, swaps the access token,
 *                          updates activeRole, then navigates to the correct dashboard.
 *  - `isAdmin`, `isSupervisor`, `isEmployee` now reflect `activeRole` so
 *    route guards work correctly after a switch.
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

// Role priority used to pick the default when logging in
const ROLE_PRIORITY = { HR_ADMIN: 0, SUPERVISOR: 1, EMPLOYEE: 2 };

function pickDefaultRole(roles = []) {
  if (!roles.length) return 'EMPLOYEE';
  return [...roles].sort(
    (a, b) => (ROLE_PRIORITY[a] ?? 99) - (ROLE_PRIORITY[b] ?? 99)
  )[0];
}

export default function AuthProvider({ children }) {
  const [user,       setUser]       = useState(null);
  const [activeRole, setActiveRole] = useState(
    () => localStorage.getItem('activeRole') || null
  );
  const [loading, setLoading] = useState(true);

  // ── Restore session on mount ────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      api
        .get('/users/me')
        .then(({ data }) => {
          const u = data.data.user;
          setUser(u);

          // Restore persisted activeRole only if the user still owns that role
          const stored = localStorage.getItem('activeRole');
          const resolved =
            stored && u.roles?.includes(stored)
              ? stored
              : pickDefaultRole(u.roles);

          setActiveRole(resolved);
          localStorage.setItem('activeRole', resolved);
        })
        .catch(() => {
          localStorage.clear();
          setActiveRole(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  // ── Login ───────────────────────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    const { user: u, accessToken, refreshToken, activeRole: ar } = data.data;

    localStorage.setItem('accessToken',  accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('activeRole',   ar);

    setUser(u);
    setActiveRole(ar);

    return u;
  }, []);

  // ── Logout ──────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // silent
    }
    localStorage.clear();
    setUser(null);
    setActiveRole(null);
  }, []);

  // ── Switch Role (no logout) ─────────────────────────────────────────────────
  const switchRole = useCallback(async (role) => {
    const { data } = await api.post('/auth/switch-role', { role });
    const { accessToken: newToken, activeRole: newRole } = data.data;

    localStorage.setItem('accessToken', newToken);
    localStorage.setItem('activeRole',  newRole);

    setActiveRole(newRole);

    return newRole;
  }, []);

  // ── Convenience booleans (based on ACTIVE role) ─────────────────────────────
  const isAdmin      = activeRole === 'HR_ADMIN';
  const isSupervisor = activeRole === 'SUPERVISOR';
  const isEmployee   = activeRole === 'EMPLOYEE';
  const isMultiRole  = (user?.roles?.length ?? 0) > 1;

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        activeRole,
        login,
        logout,
        switchRole,
        isAdmin,
        isSupervisor,
        isEmployee,
        isMultiRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
