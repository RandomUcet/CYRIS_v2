'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import type { CurrentUserResponse, LoginRequest } from '@cyris/contracts';

export interface AuthContextType {
  currentUser: CurrentUserResponse | null;
  user: CurrentUserResponse | null;
  loading: boolean;
  login: (credentials: LoginRequest) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  isPlatformAdmin: boolean;
  hasPermission: (permission: string, eventId?: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewActive,setPreviewActive]=useState(false);
  const [exitError,setExitError]=useState('');
  const [exiting,setExiting]=useState(false);

  const refreshSession = useCallback(async () => {
    try {
      const status=await apiClient.getViewAsStatus();
      const active=Boolean(status.ok && status.data?.active);
      apiClient.setPreviewMode(active);
      setPreviewActive(active);
      const res = await apiClient.getMe();
      if (res.ok && res.data) {
        const preview=Boolean(res.data.viewAs);
        apiClient.setPreviewMode(preview);
        setPreviewActive(preview);
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
    void refreshSession();
  }, [refreshSession]);

  const login = async (credentials: LoginRequest) => {
    const res = await apiClient.login(credentials);
    if (res.ok) {
      await refreshSession();
      return { ok: true };
    }
    return { ok: false, error: res.error || 'Authentication failed' };
  };

  const logout = async () => {
    try {
      await apiClient.logout();
    } finally {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('cyris_selected_event');
        window.location.href = '/';
      }
      setCurrentUser(null);
    }
  };

  const exitPreview=async()=>{
    setExiting(true);setExitError('');
    const result=await apiClient.stopViewAs();
    if(result.ok){apiClient.setPreviewMode(false);window.location.replace('/admin/users');}
    else {setExitError(result.error || 'Unable to exit preview');setExiting(false);}
  };

  const platformPermissions = currentUser?.platformPermissions ?? [];
  const isPlatformAdmin = platformPermissions.includes('platform.manage');

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
        hasPermission,
      }}
    >
      {previewActive ? <div className="preview-root">
        <div className="preview-banner" role="status">
          <div><strong>VIEW AS · READ ONLY / POUZE PRO ČTENÍ</strong><span>{currentUser?.viewAs?.displayName ?? 'Preview expired / Náhled vypršel'}{currentUser?.viewAs ? ' · '+new Date(currentUser.viewAs.expiresAt).toLocaleTimeString() : ''}</span>{exitError && <span role="alert">{exitError}</span>}</div>
          <button type="button" onClick={exitPreview} disabled={exiting}>{exiting ? '…' : 'Exit preview / Ukončit náhled'}</button>
        </div>
        <div className="preview-body">{children}</div>
      </div> : children}
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
