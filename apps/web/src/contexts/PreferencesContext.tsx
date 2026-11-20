'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { apiClient } from '@/lib/api-client';
import {
  type SupportedLocale,
  SUPPORTED_LOCALES,
  COMMON_TIMEZONES,
  translate,
  formatOperationalTime,
  formatOperationalDate,
} from '@/lib/i18n';

interface PreferencesContextValue {
  locale: SupportedLocale;
  timezone: string;
  setLocale: (locale: SupportedLocale) => Promise<void>;
  setTimezone: (timezone: string) => Promise<void>;
  t: (key: string, params?: Record<string, string | number>) => string;
  formatTime: (date: Date | string | null | undefined) => string;
  formatDate: (date: Date | string | null | undefined) => string;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

const STORAGE_KEY_LOCALE = 'cyris_locale';
const STORAGE_KEY_TIMEZONE = 'cyris_timezone';

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();

  // Initialize with cached localStorage values if present
  const [locale, setLocaleState] = useState<SupportedLocale>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY_LOCALE) as SupportedLocale | null;
      if (saved && (saved === 'en' || saved === 'cs' || saved === 'de' || saved === 'pl')) {
        return saved;
      }
    }
    return 'en';
  });

  const [timezone, setTimezoneState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY_TIMEZONE);
      if (saved) return saved;
      try {
        const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (resolved) return resolved;
      } catch {}
    }
    return 'UTC';
  });

  // Sync preferences from backend when authenticated
  useEffect(() => {
    if (!currentUser || currentUser.viewAs) return;

    let mounted = true;
    apiClient
      .getUserPreferences()
      .then((res) => {
        if (!mounted || !res.ok || !res.data) return;
        const data = res.data;
        if (data.locale && (data.locale === 'en' || data.locale === 'cs' || data.locale === 'de' || data.locale === 'pl')) {
          setLocaleState(data.locale);
          if (typeof window !== 'undefined') {
            localStorage.setItem(STORAGE_KEY_LOCALE, data.locale);
          }
        }
        if (data.timezone) {
          setTimezoneState(data.timezone);
          if (typeof window !== 'undefined') {
            localStorage.setItem(STORAGE_KEY_TIMEZONE, data.timezone);
          }
        }
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, [currentUser]);

  const setLocale = useCallback(
    async (newLocale: SupportedLocale) => {
      setLocaleState(newLocale);
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_LOCALE, newLocale);
      }
      if (currentUser && !currentUser.viewAs) {
        await apiClient.updateUserPreferences({ locale: newLocale }).catch(() => {});
      }
    },
    [currentUser]
  );

  const setTimezone = useCallback(
    async (newTz: string) => {
      setTimezoneState(newTz);
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_TIMEZONE, newTz);
      }
      if (currentUser && !currentUser.viewAs) {
        await apiClient.updateUserPreferences({ timezone: newTz }).catch(() => {});
      }
    },
    [currentUser]
  );

  useEffect(()=>{document.documentElement.lang=locale;},[locale]);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      return translate(locale, key, params);
    },
    [locale]
  );

  const formatTime = useCallback(
    (date: Date | string | null | undefined) => {
      return formatOperationalTime(date, timezone, locale);
    },
    [timezone, locale]
  );

  const formatDate = useCallback(
    (date: Date | string | null | undefined) => {
      return formatOperationalDate(date, timezone, locale);
    },
    [timezone, locale]
  );

  return (
    <PreferencesContext.Provider
      value={{
        locale,
        timezone,
        setLocale,
        setTimezone,
        t,
        formatTime,
        formatDate,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return ctx;
}
