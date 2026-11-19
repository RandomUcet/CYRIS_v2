'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useEvent } from '@/contexts/EventContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { Search, ChevronDown, User, LogOut, Calendar, Shield, Activity } from 'lucide-react';
import { StatusBadge } from '../common/Badges';
import { EventSwitcherModal } from './EventSwitcherModal';
import { NotificationCenter } from './NotificationCenter';
import { SUPPORTED_LOCALES, COMMON_TIMEZONES } from '@/lib/i18n';
import { useDefconReadiness } from '@/hooks/useDefconReadiness';

const DEFCON_COLORS: Record<number, string> = {
  1: '#d62d2d',
  2: '#ff7a18',
  3: '#f3c53b',
  4: '#3b82f6',
  5: '#29c76f',
};

interface TopBarProps {
  onOpenSearch: () => void;
  breadcrumbs?: { label: string; href?: string }[];
}

export function TopBar({ onOpenSearch, breadcrumbs = [] }: TopBarProps) {
  const { currentUser, isPlatformAdmin, hasPermission, logout } = useAuth();
  const { selectedEvent } = useEvent();
  const { locale, timezone, setLocale, setTimezone, t } = usePreferences();
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const { snapshot: readiness, stale: readinessStale } = useDefconReadiness(
    selectedEvent?.id ?? '',
    Boolean(selectedEvent && hasPermission('command.read', selectedEvent.id)),
  );

  return (
    <>
      <header
        className="app-topbar"
        style={{
          height: 'var(--topbar-height)',
          background: 'var(--bg-sidebar)',
          borderBottom: '1px solid var(--border-default)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          flexShrink: 0,
          zIndex: 20,
        }}
      >
        {/* Left: Event Banner & Breadcrumbs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {selectedEvent ? (
            <React.Fragment>
            <button
              type="button"
              onClick={() => setIsSwitcherOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'transparent',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-xs)',
                padding: '3px 8px',
                height: '28px',
                cursor: 'pointer',
              }}
              title={t('topbar.switchEvent')}
            >
              <Calendar size={12} style={{ color: 'var(--accent-active)' }} />
              <span style={{ fontWeight: 600, fontSize: '11px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {selectedEvent.name}
              </span>
              <StatusBadge status={selectedEvent.status} />
              <ChevronDown size={11} style={{ color: 'var(--text-muted)' }} />
            </button>

            {readiness && (
              <Link
                href={`/events/${readiness.eventId}/command`}
                title="Read-only exercise readiness"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '3px 8px',
                  height: '28px',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-xs)',
                  color: readinessStale ? 'var(--status-warning)' : readiness.initialized && readiness.level ? DEFCON_COLORS[readiness.level] : 'var(--status-warning)',
                  fontSize: '10px',
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                <Activity size={12} />
                {readinessStale ? 'DEFCON STALE' : readiness.initialized ? `DEFCON ${readiness.level ?? '?'}` : 'DEFCON ?'}
              </Link>
            )}
            </React.Fragment>
          ) : (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t('topbar.noEvent')}</span>
          )}
          {selectedEvent && currentUser && (
            <span className="topbar-identity" title="Aktivní eventový kontext">
              {currentUser.user.displayName}
              {currentUser.memberships.filter((membership) => membership.eventId === selectedEvent.id && membership.status === 'ACTIVE').flatMap((membership) => membership.unitIds).length > 0
                ? ` · ${currentUser.memberships.filter((membership) => membership.eventId === selectedEvent.id && membership.status === 'ACTIVE').flatMap((membership) => membership.unitIds).length} unit scope`
                : ''}
            </span>
          )}

          {breadcrumbs.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
              <span>/</span>
              {breadcrumbs.map((b, i) => (
                <React.Fragment key={i}>
                  {b.href ? (
                    <Link href={b.href} style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>
                      {b.label}
                    </Link>
                  ) : (
                    <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{b.label}</span>
                  )}
                  {i < breadcrumbs.length - 1 && <span>/</span>}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>

        {/* Right: Search, Notifications & User Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={onOpenSearch}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '3px 10px',
              height: '28px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-xs)',
              color: 'var(--text-secondary)',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            <Search size={12} style={{ color: 'var(--accent-active)' }} />
            <span>{t('topbar.search')}</span>
            <kbd style={{ fontSize: '9px', padding: '1px 4px' }}>⌘K</kbd>
          </button>

          {/* Operational Notification Center */}
          <NotificationCenter />

          {currentUser && (
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setIsUserMenuOpen((p) => !p)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '3px 8px',
                  height: '28px',
                  background: 'transparent',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-xs)',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                <User size={12} style={{ color: 'var(--text-muted)' }} />
                <span style={{ fontWeight: 600 }}>{currentUser.user.displayName}</span>
                <ChevronDown size={10} style={{ color: 'var(--text-muted)' }} />
              </button>

              {isUserMenuOpen && (
                <div
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: '34px',
                    width: '240px',
                    background: 'var(--bg-panel)',
                    border: '1px solid var(--border-strong)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '8px',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
                    zIndex: 50,
                  }}
                  onMouseLeave={() => setIsUserMenuOpen(false)}
                >
                  <div style={{ padding: '4px 8px', borderBottom: '1px solid var(--border-subtle)', marginBottom: '8px' }}>
                    <div style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text-primary)' }}>
                      {currentUser.user.displayName}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{currentUser.user.email}</div>
                  </div>

                  {/* Language Selector */}
                  <div style={{ padding: '4px 8px', marginBottom: '8px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
                      {t('pref.language')}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                      {SUPPORTED_LOCALES.map((l) => (
                        <button
                          key={l.code}
                          type="button"
                          onClick={() => void setLocale(l.code)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 6px',
                            background: locale === l.code ? 'rgba(56, 189, 248, 0.15)' : 'var(--bg-surface)',
                            border: locale === l.code ? '1px solid var(--accent-active)' : '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-xs)',
                            fontSize: '11px',
                            cursor: 'pointer',
                            color: locale === l.code ? 'var(--accent-active)' : 'var(--text-secondary)',
                          }}
                        >
                          <span>{l.flag}</span>
                          <span>{l.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Timezone Selector */}
                  <div style={{ padding: '4px 8px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px', marginBottom: '8px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
                      {t('pref.timezone')}
                    </div>
                    <select
                      value={timezone}
                      onChange={(e) => void setTimezone(e.target.value)}
                      style={{
                        width: '100%',
                        fontSize: '11px',
                        padding: '4px 6px',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-xs)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {COMMON_TIMEZONES.map((tz) => (
                        <option key={tz.value} value={tz.value}>
                          {tz.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {isPlatformAdmin && (
                    <div style={{ padding: '0 8px 8px 8px' }}>
                      <Link
                        href="/admin"
                        prefetch={false}
                        onClick={() => setIsUserMenuOpen(false)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '12px',
                          fontWeight: 500,
                          padding: '6px 8px',
                          color: 'var(--accent-primary)',
                          textDecoration: 'none',
                          borderRadius: 'var(--radius-xs)',
                          backgroundColor: 'var(--bg-surface)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        <Shield size={13} /> Platform Administration
                      </Link>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => void logout()}
                    className="btn-ghost"
                    style={{
                      width: '100%',
                      justifyContent: 'flex-start',
                      fontSize: '12px',
                      padding: '6px 8px',
                      color: 'var(--status-danger)',
                    }}
                  >
                    <LogOut size={13} /> {t('action.signOut')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <EventSwitcherModal isOpen={isSwitcherOpen} onClose={() => setIsSwitcherOpen(false)} />
    </>
  );
}
