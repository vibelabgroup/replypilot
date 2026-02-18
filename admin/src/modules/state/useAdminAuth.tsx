import React, { createContext, useContext, useEffect, useState } from 'react';

type AdminUser = {
  id: string;
  email: string;
  role: string;
};

type AdminAuthContextValue = {
  user: AdminUser | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AdminAuthContext = createContext<AdminAuthContextValue | undefined>(undefined);

export const AdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [initialised, setInitialised] = useState(false);

  useEffect(() => {
    // Placeholder for future /api/admin/auth/me endpoint
    setInitialised(true);
  }, []);

  const apiBase = import.meta.env.VITE_ADMIN_API_BASE_URL || '';

  const login = async (email: string, password: string) => {
    const res = await fetch(`${apiBase}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const message = data?.error?.message || data?.error || 'Login failed';
      throw new Error(message);
    }

    const data = await res.json();
    setUser(data.user);
  };

  const logout = async () => {
    await fetch(`${apiBase}/api/admin/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {});
    setUser(null);
  };

  const value: AdminAuthContextValue = {
    user,
    isAuthenticated: !!user && initialised,
    login,
    logout,
  };

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
};

export const useAdminAuth = () => {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) {
    throw new Error('useAdminAuth must be used within AdminAuthProvider');
  }
  return ctx;
};

