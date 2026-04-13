/**
 * PortalAuthContext.tsx
 * Patient Portal Authentication Context
 *
 * ─── SECURITY RULES ──────────────────────────────────────────────
 *  ✅ Token stored in sessionStorage (key: portal_token)
 *  ✅ NEVER decoded client-side for auth decisions
 *  ✅ Logout invalidates token server-side (tokenVersion++)
 *  ✅ 401 handled by portalApi interceptor
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { authApi } from '@/api/auth.api';

interface PortalAuthState {
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface PortalAuthActions {
  login: (token: string) => void;
  loginWithCredentials: (email: string, password: string) => Promise<void>;
  loginWithMagicLink: (linkToken: string) => Promise<void>;
  loginWithOtp: (email: string, otp: string) => Promise<void>;
  logout: () => Promise<void>;
}

type PortalAuthContextType = PortalAuthState & PortalAuthActions;

const PortalAuthContext = createContext<PortalAuthContextType | undefined>(undefined);

const TOKEN_KEY = 'portal_token';

export const PortalAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(TOKEN_KEY));
  const [isLoading, setIsLoading] = useState(false);

  const isAuthenticated = !!token;

  const login = useCallback((newToken: string) => {
    sessionStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
  }, []);

  const loginWithCredentials = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const result = await authApi.login({ email, password });
      if (result.success && result.data.token) {
        login(result.data.token);
      } else {
        throw new Error('Login failed');
      }
    } finally {
      setIsLoading(false);
    }
  }, [login]);

  const loginWithMagicLink = useCallback(async (linkToken: string) => {
    setIsLoading(true);
    try {
      const result = await authApi.verifyMagicLink(linkToken);
      if (result.success && result.data.token) {
        login(result.data.token);
      } else {
        throw new Error('Magic link verification failed');
      }
    } finally {
      setIsLoading(false);
    }
  }, [login]);

  const loginWithOtp = useCallback(async (email: string, otp: string) => {
    setIsLoading(true);
    try {
      const result = await authApi.verifyOtp({ email, otp });
      if (result.success && result.data.token) {
        login(result.data.token);
      } else {
        throw new Error('OTP verification failed');
      }
    } finally {
      setIsLoading(false);
    }
  }, [login]);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Best-effort server logout — clear client regardless
    } finally {
      sessionStorage.removeItem(TOKEN_KEY);
      setToken(null);
    }
  }, []);

  // Sync across tabs (sessionStorage doesn't fire 'storage' but let's be safe)
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === TOKEN_KEY) {
        setToken(e.newValue);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return (
    <PortalAuthContext.Provider
      value={{
        token,
        isAuthenticated,
        isLoading,
        login,
        loginWithCredentials,
        loginWithMagicLink,
        loginWithOtp,
        logout,
      }}
    >
      {children}
    </PortalAuthContext.Provider>
  );
};

export const usePortalAuth = (): PortalAuthContextType => {
  const ctx = useContext(PortalAuthContext);
  if (!ctx) throw new Error('usePortalAuth must be used within <PortalAuthProvider>');
  return ctx;
};
