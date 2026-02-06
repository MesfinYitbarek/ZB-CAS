import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      api.get('/users/me')
        .then(({ data }) => setUser(data.data.user))
        .catch(() => localStorage.clear())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('accessToken', data.data.accessToken);
    localStorage.setItem('refreshToken', data.data.refreshToken);
    setUser(data.data.user);
    return data.data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch (_) {
      // Silent fail
    }
    localStorage.clear();
    setUser(null);
  }, []);

  const isAdmin = user?.role === 'HR_ADMIN';
  const isSupervisor = user?.role === 'SUPERVISOR';
  const isEmployee = user?.role === 'EMPLOYEE';

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAdmin, isSupervisor, isEmployee }}>
      {children}
    </AuthContext.Provider>
  );
}
