'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useEvent } from '@/contexts/EventContext';
import { Shield, ArrowRight, Calendar, AlertCircle } from 'lucide-react';
import { StatusBadge } from '@/components/common/Badges';
import { apiClient } from '@/lib/api-client';

export default function RootPage() {
  const router = useRouter();
  const { currentUser, loading, login, isPlatformAdmin, logout } = useAuth();
  const { events, selectedEventId, selectEvent } = useEvent();

  // Login form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [publicProviders, setPublicProviders] = useState<Array<{ id: string; name: string; category: string; displayName: string }>>([]);
  const [systemVersion, setSystemVersion] = useState<string>(
    process.env.NEXT_PUBLIC_CYRIS_VERSION ? `v${process.env.NEXT_PUBLIC_CYRIS_VERSION.replace(/^v/, '')}` : 'v2.0'
  );

  useEffect(() => {
    apiClient
      .getHealth()
      .then((res) => {
        if (res.ok && res.data?.version) {
          setSystemVersion(`v${res.data.version.replace(/^v/, '')}`);
        }
      })
      .catch(() => {});

    apiClient
      .getPublicAuthProviders()
      .then((res) => {
        if (res.ok && res.data) {
          setPublicProviders(res.data);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!loading && currentUser) {
      if (isPlatformAdmin) router.replace('/admin');
      else if (selectedEventId) router.replace(`/events/${selectedEventId}/my-work`);
    }
  }, [loading, currentUser, selectedEventId, isPlatformAdmin, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setSubmitting(true);
    setLoginError(null);

    const res = await login({ identifier: email, password });
    if (!res.ok) {
      setLoginError(res.error || 'Authentication rejected. Verify operational credentials.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return null;
  }

  // If authenticated but no event selected or waiting for redirect
  if (currentUser) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-canvas)' }}>
        <div
          style={{
            width: '480px',
            maxWidth: '92vw',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-default)',
            borderTop: '3px solid var(--accent-primary)',
            borderRadius: 'var(--radius-md)',
            padding: '24px',
            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '8px', height: '8px', background: 'var(--cylab-orange)', borderRadius: '2px' }} />
              <h2 style={{ fontSize: '15px', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>Select Active Cybertron Event</h2>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              style={{
                fontSize: '11px',
                color: 'var(--text-muted)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px 8px',
              }}
              title="Sign out of operator session"
            >
              Sign out
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {events.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                <Calendar size={28} style={{ margin: '0 auto 8px', color: 'var(--text-dim)', opacity: 0.6 }} />
                <div>No active Cybertron events found.</div>
                {isPlatformAdmin && (
                  <button
                    type="button"
                    onClick={() => router.push('/admin/events')}
                    className="btn-primary"
                    style={{ marginTop: '12px', fontSize: '12px' }}
                  >
                    Create Initial Event in Admin Console
                  </button>
                )}
              </div>
            ) : (
              events.map((ev) => (
                <Link
                  key={ev.id}
                  href={`/events/${ev.id}/my-work`}
                  onClick={() => selectEvent(ev.id)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 14px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    textDecoration: 'none',
                    transition: 'border-color 0.15s ease, background-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent-primary)';
                    e.currentTarget.style.backgroundColor = 'var(--bg-active)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-default)';
                    e.currentTarget.style.backgroundColor = 'var(--bg-surface)';
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>{ev.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>/{ev.slug}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <StatusBadge status={ev.status} />
                    <ArrowRight size={14} style={{ color: 'var(--text-muted)' }} />
                  </div>
                </Link>
              ))
            )}
          </div>

          {isPlatformAdmin && (
            <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => router.push('/admin')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--accent-primary)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <Shield size={14} /> Open Platform Administration
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Institutional European Operations Login
  const oidcProviders = publicProviders.filter((p) => p.category === 'OIDC');

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-canvas)',
        padding: '20px',
      }}
    >
      <div
        style={{
          width: '380px',
          maxWidth: '100%',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-default)',
          borderTop: '3px solid var(--accent-primary)',
          borderRadius: 'var(--radius-md)',
          padding: '28px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
          boxShadow: '0 16px 40px rgba(0, 0, 0, 0.08)',
        }}
      >
        {/* Header */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ width: '8px', height: '8px', background: 'var(--cylab-orange)', borderRadius: '2px' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '18px', letterSpacing: '0.12em', color: 'var(--text-primary)' }}>
              CYRIS
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>{systemVersion}</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Cybertron Registry & Intelligence System
          </div>
        </div>

        <div className="divider" style={{ margin: 0 }} />

        {/* OIDC Single Sign-On Providers */}
        {oidcProviders.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {oidcProviders.map((p) => (
              <a
                key={p.id}
                href={`/api/auth/oidc/${p.id}/authorize`}
                className="btn-secondary"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  height: '34px',
                  textDecoration: 'none',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                }}
              >
                Sign in with {p.displayName}
              </a>
            ))}

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0' }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>or continue with</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
            </div>
          </div>
        )}

        {/* Security Classification */}
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '8px 12px',
            fontSize: '11px',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Shield size={14} style={{ color: 'var(--accent-active)', flexShrink: 0 }} />
          <span>Restricted to authorized exercise operators. All interactions audited.</span>
        </div>

        {/* Form: Local / LDAP credentials */}
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {loginError && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                background: 'var(--status-danger-bg)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '12px',
                color: 'var(--status-danger)',
              }}
            >
              <AlertCircle size={14} />
              <span>{loginError}</span>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label htmlFor="login-identifier" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Operator Username / Email
            </label>
            <input
              id="login-identifier"
              name="identifier"
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="operator@cyris.local or LDAP username"
              required
              autoComplete="username"
              disabled={submitting}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label htmlFor="login-password" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Password
            </label>
            <input
              id="login-password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              required
              autoComplete="current-password"
              disabled={submitting}
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={submitting}
            style={{ width: '100%', marginTop: '4px', height: '34px' }}
          >
            {submitting ? 'Authenticating…' : 'Sign in to CYRIS'}
          </button>
        </form>
      </div>

      <div style={{ marginTop: '16px', fontSize: '11px', color: 'var(--text-muted)' }}>
        LOCAL administrator break-glass login is always enabled.
      </div>
    </div>
  );
}
