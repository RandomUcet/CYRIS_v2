'use client';

import React, { useState, useEffect } from 'react';
import { CyrisWordmark, CylabLogo } from '@/components/layout/Brand';
import { previewTeams, previewTeamEmail } from '@cyris/contracts';
import { usePreferences } from '@/contexts/PreferencesContext';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useEvent } from '@/contexts/EventContext';
import { Shield, ArrowRight, Calendar, AlertCircle } from 'lucide-react';
import { StatusBadge } from '@/components/common/Badges';
import { apiClient } from '@/lib/api-client';

export default function RootPage() {
  const router = useRouter();
  const { locale } = usePreferences();
  const teamPage = usePathname() === '/login/teams';
  const [previewEnabled, setPreviewEnabled] = useState(false);
  const preview = teamPage && previewEnabled;
  useEffect(() => {
    if (!teamPage) return;
    let active = true;
    apiClient.getPreviewAccess().then(result => {
      if (!active) return;
      if (result.ok && result.data?.enabled) setPreviewEnabled(true);
      else router.replace('/');
    });
    return () => { active = false; };
  }, [teamPage, router]);
  const cs = locale === 'cs' || (preview && locale === 'en' && typeof window !== 'undefined' && !window.localStorage.getItem('cyris_locale'));

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
      setLoginError(res.error || (cs ? 'Přihlášení se nezdařilo.' : 'Sign-in failed.'));
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

  const oidcProviders = publicProviders.filter(provider => provider.category === 'OIDC');

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <header className="login-brand"><CyrisWordmark /><span>{systemVersion}</span></header>
        <div className="login-body">
          <h1 id="login-title">{cs ? 'Přihlášení ke cvičení' : 'Exercise sign-in'}</h1>
          {oidcProviders.map(provider => (
            <a key={provider.id} href={`/api/auth/oidc/${provider.id}/authorize`} className="btn-secondary">
              {cs ? 'Přihlásit přes' : 'Sign in with'} {provider.displayName}
            </a>
          ))}
          <form onSubmit={handleLogin}>
            {preview && (
              <label>{cs ? 'Vyzkoušet tým' : 'Preview a team'}
                <select value={previewTeams.some(team => previewTeamEmail(team.login) === email) ? email : ''}
                  onChange={event => { setEmail(event.target.value); setPassword(''); setLoginError(null); }}
                  disabled={submitting}>
                  <option value="">{cs ? 'Vlastní přihlášení' : 'Use my own account'}</option>
                  {previewTeams.map(team => <option key={team.slug} value={previewTeamEmail(team.login)}>{team.name}</option>)}
                </select>
              </label>
            )}
            <label>{cs ? 'Uživatel nebo e-mail' : 'Username or email'}
              <input name="identifier" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} required disabled={submitting} />
            </label>
            <label>{cs ? 'Heslo' : 'Password'}
              <input name="password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required disabled={submitting} />
            </label>
            {preview && previewTeams.some(team => previewTeamEmail(team.login) === email) && (
              <p className="login-hint">{cs ? 'Heslo pro tým zobrazíš v terminálu příkazem' : 'Read the local team password with'} <code>pnpm teams:list</code>.</p>
            )}
            {loginError && <p role="alert" className="login-error"><AlertCircle size={16} />{loginError}</p>}
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? (cs ? 'Přihlašování…' : 'Signing in…') : (cs ? 'Přihlásit se' : 'Sign in')}<ArrowRight size={16} />
            </button>
          </form>
        </div>
        <footer className="workspace-brand-footer"><span>CzechCybertron</span><CylabLogo /></footer>
      </section>
    </main>
  );
}
