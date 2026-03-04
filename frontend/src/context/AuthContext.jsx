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

  // Restore session on mount via httpOnly cookie refresh
  useEffect(() => {
    api.post('/auth/refresh')
      .then(({ data }) => {
        accessTokenRef.current = data.data.accessToken;
        return api.get('/users/me');
      })
      .then(({ data }) => {
        const u = data.data.user;
        setUser(u);
        const stored = sessionStorage.getItem('activeRole');
        const resolved = stored && u.roles?.includes(stored) ? stored : pickDefaultRole(u.roles);
        setActiveRole(resolved);
        sessionStorage.setItem('activeRole', resolved);
      })
      .catch(() => {
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
