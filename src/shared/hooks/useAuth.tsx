import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { STORAGE_KEYS } from '../config/routes';
import type { AuthUser } from '../types';
import { apiFetch, getStoredToken, onSessionExpired, setStoredAuth } from '../utils/apiClient';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  sessionExpiredOpen: boolean;
  setSessionExpiredOpen: (open: boolean) => void;
  setSession: (token: string, user: AuthUser) => void;
  logout: () => void;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.AUTH_USER);
      return raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(getStoredToken()));
  const [sessionExpiredOpen, setSessionExpiredOpen] = useState(false);

  const setSession = useCallback((token: string, nextUser: AuthUser) => {
    setStoredAuth(token, nextUser);
    setUser(nextUser);
    setSessionExpiredOpen(false);
  }, []);

  const logout = useCallback(() => {
    setStoredAuth(null, null);
    setUser(null);
  }, []);

  const refreshMe = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    try {
      const res = await apiFetch<{ user: AuthUser }>('/auth/me');
      setStoredAuth(token, res.user);
      setUser(res.user);
    } catch {
      setStoredAuth(null, null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  useEffect(() => {
    return onSessionExpired(() => {
      setSessionExpiredOpen(true);
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, sessionExpiredOpen, setSessionExpiredOpen, setSession, logout, refreshMe }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
