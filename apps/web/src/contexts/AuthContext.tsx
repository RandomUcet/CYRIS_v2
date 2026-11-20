'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import type { CurrentUserResponse, LoginRequest, ViewAsContext } from '@cyris/contracts';
import { readViewAs, clearViewAs, VIEW_AS_INVALID_EVENT } from '@/lib/view-as';

export interface AuthContextType {
  currentUser: CurrentUserResponse | null;
  user: CurrentUserResponse | null;
  loading: boolean;
  login: (credentials: LoginRequest) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  isPlatformAdmin: boolean;
  viewAs: ViewAsContext | null;
  previewInvalid: boolean;
  exitViewAs: () => Promise<void>;
  hasPermission: (permission: string, eventId?: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewAs, setViewAs] = useState<ViewAsContext | null>(null);
  const [previewInvalid, setPreviewInvalid] = useState(false);

  const refreshSession = useCallback(async () => {
    try {
      const res = await apiClient.getMe();
      if (res.ok && res.data) {
        setCurrentUser(res.data);
      } else {
        setCurrentUser(null);
      }
    } catch {
      setCurrentUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const invalidate = () => setPreviewInvalid(true);
    window.addEventListener(VIEW_AS_INVALID_EVENT, invalidate);
    try { setViewAs(readViewAs()); } catch { setPreviewInvalid(true); }
    void refreshSession();
    return () => window.removeEventListener(VIEW_AS_INVALID_EVENT, invalidate);
  }, [refreshSession]);

  const exitViewAs = async () => {
    let validContext = false;
    try { validContext = Boolean(readViewAs()); } catch { /* Explicit exit also clears a damaged local receipt. */ }
    if (validContext) {
      const result = await apiClient.stopViewAs();
      if (!result.ok && result.code !== 'VIEW_AS_INVALID') throw new Error(result.error || 'Unable to end preview');
    }
    clearViewAs();
    // Clear all target data and pending requests before returning as administrator.
    window.location.replace('/admin/users');
  };

  const login = async (credentials: LoginRequest) => {
    const res = await apiClient.login(credentials);
    if (res.ok) {
      await refreshSession();
      return { ok: true };
    }
    return { ok: false, error: res.error || 'Authentication failed' };
  };

  const logout = async () => {
    await apiClient.logout();
    if (typeof window !== 'undefined') {
      clearViewAs();
      localStorage.removeItem('cyris_selected_event');
      window.location.href = '/';
    }
    setCurrentUser(null);
  };

  const platformPermissions = currentUser?.platformPermissions ?? [];
  const isPlatformAdmin = !viewAs && platformPermissions.includes('platform.manage');

  const hasPermission = useCallback(
    (permission: string, eventId?: string): boolean => {
      if (!currentUser) return false;
      if (platformPermissions.includes('platform.manage')) return true;
      return currentUser.memberships.some(
        (membership) =>
          (!eventId || membership.eventId === eventId) &&
          membership.status === 'ACTIVE' &&
          (membership.permissions ?? []).includes(permission)
      );
    },
    [currentUser, platformPermissions]
  );

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        user: currentUser,
        loading,
        login,
        logout,
        refreshSession,
        isPlatformAdmin,
        viewAs,
        previewInvalid,
        exitViewAs,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
