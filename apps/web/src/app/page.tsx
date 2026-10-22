'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useEvent } from '@/contexts/EventContext';
import { Shield, ArrowRight, Calendar, AlertCircle } from 'lucide-react';
import { StatusBadge } from '@/components/common/Badges';
import { apiClient } from '@/lib/api-client';

export default function RootPage() {
  const router = useRouter();
  const { currentUser, loading, login } = useAuth();
  const { events, selectedEventId, selectEvent } = useEvent();

  // Login form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [publicProviders, setPublicProviders] = useState<Array<{ id: string; name: string; category: string; displayName: string }>>([]);

  useEffect(() => {
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
    if (!loading && currentUser && selectedEventId) {
      router.push(`/events/${selectedEventId}/overview`);
    }
  }, [loading, currentUser, selectedEventId, router]);

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
            width: '460px',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: '24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <span style={{ width: '8px', height: '8px', background: 'var(--cylab-orange)', borderRadius: '2px' }} />
            <h2 style={{ fontSize: '15px', fontWeight: 600 }}>Select Active Cybertron Event</h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {events.map((ev) => (
              <div
                key={ev.id}
                onClick={() => {
                  selectEvent(ev.id);
                  router.push(`/events/${ev.id}/overview`);
                }}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 14px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13px' }}>{ev.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>/{ev.slug}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <StatusBadge status={ev.status} />
                  <ArrowRight size={14} style={{ color: 'var(--text-muted)' }} />
                </div>
              </div>
            ))}
          </div>
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
          borderRadius: 'var(--radius-md)',
          padding: '28px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.4)',
        }}
      >
        {/* Header */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ width: '8px', height: '8px', background: 'var(--cylab-orange)', borderRadius: '2px' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '18px', letterSpacing: '0.12em', color: '#fff' }}>
              CYRIS
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>v2</span>
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
            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Operator Username / Email
            </label>
            <input
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
            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Password
            </label>
            <input
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
