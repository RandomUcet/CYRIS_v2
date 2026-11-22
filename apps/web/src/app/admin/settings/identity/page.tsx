'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { AppShell } from '@/components/layout/AppShell';
import { useDialogAccessibility } from '@/hooks/useDialogAccessibility';
import {
  Users,
  Plus,
  CheckCircle2,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Pencil,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import type { IdentityProviderSummary, OidcConfig } from '@cyris/contracts';
import { LdapProviderForm } from './LdapProviderForm';
import styles from '@/components/admin/LdapTeams.module.css';

export default function IdentitySettingsPage() {
  const { isPlatformAdmin, loading: loadingSession } = useAuth();
  const { t, locale } = usePreferences();
  const cs = locale === 'cs';
  const [providers, setProviders] = useState<IdentityProviderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [editingLdap, setEditingLdap] = useState<IdentityProviderSummary | null>(null);

  // Modal / drawer states
  const [isLdapModalOpen, setIsLdapModalOpen] = useState(false);
  const [isOidcModalOpen, setIsOidcModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  useDialogAccessibility(isOidcModalOpen, () => { if (!submitting) setIsOidcModalOpen(false); });

  // OIDC form state
  const [oidcName, setOidcName] = useState('Partner SSO');
  const [oidcIssuer, setOidcIssuer] = useState('https://auth.example.org');
  const [oidcClientId, setOidcClientId] = useState('cyris-client');
  const [oidcClientSecret, setOidcClientSecret] = useState('');
  const [oidcJit, setOidcJit] = useState(true);

  const fetchProviders = async () => {
    const res = await apiClient.listIdentityProviders();
    if (res.ok && res.data) setProviders(res.data);
    else setFeedback({ error: true, message: res.error ?? 'Poskytovatele se nepodařilo načíst.' });
    setLoading(false);
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const res = await apiClient.testIdentityProvider(id);
      setFeedback({ error: !res.ok, message: res.ok ? (res.data?.message ?? 'Konfigurace je platná.') : (res.error ?? 'Konfigurace není platná.') });
    } finally {
      setTestingId(null);
    }
  };

  useEffect(() => {
    if (isPlatformAdmin) void fetchProviders();
  }, [isPlatformAdmin]);

  const handleToggle = async (id: string, current: boolean) => {
    const res = await apiClient.toggleIdentityProvider(id, !current);
    if (!res.ok) setFeedback({ error: true, message: res.error ?? 'Změna se nezdařila.' });
    else await fetchProviders();
  };

  const handleDelete = async (id: string) => {
    if (!confirm(cs ? 'Opravdu odstranit poskytovatele přihlášení?' : 'Remove this identity provider?')) return;
    const res = await apiClient.deleteIdentityProvider(id);
    if (!res.ok) setFeedback({ error: true, message: res.error ?? 'Odstranění se nezdařilo.' });
    else await fetchProviders();
  };

  const handleSaveOidc = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const config: OidcConfig = {
      displayName: oidcName,
      issuerUrl: oidcIssuer,
      clientId: oidcClientId,
      scopes: ['openid', 'profile', 'email'],
      allowedEmailDomains: [],
      claimMappings: { email: 'email', displayName: 'name', subject: 'sub' },
      jitEnabled: oidcJit,
    };

    try {
      const res = await apiClient.saveOidcProvider({ name: oidcName, config, clientSecret: oidcClientSecret || undefined });
      if (!res.ok) {
        setFeedback({ error: true, message: res.error ?? 'Konfiguraci OpenID Connect se nepodařilo uložit.' });
        return;
      }
      setIsOidcModalOpen(false);
      setOidcClientSecret('');
      await fetchProviders();
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingSession) return <AppShell><p role="status">{cs ? 'Načítání…' : 'Loading…'}</p></AppShell>;
  if (!isPlatformAdmin) return <AppShell><p role="alert">{cs ? 'Nastavení přihlášení může měnit pouze správce platformy.' : 'Only platform administrators can manage sign-in settings.'}</p></AppShell>;

  return (
    <AppShell
      breadcrumbs={[
        { label: 'Administration', href: '/admin/settings/identity' },
        { label: 'Settings' },
        { label: 'Identity Providers' },
      ]}
    >
      <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>
        {/* Title & Action Bar */}
        <div className={styles.providerToolbar}>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={18} style={{ color: 'var(--accent-active)' }} />
              {t('admin.identityProviders')}
            </h1>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              {cs ? 'Nastavte přihlášení přes školní adresář a přiřazení skupin k týmům.' : 'Configure directory sign-in and assign groups to exercise teams.'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => { setEditingLdap(null); setFeedback(null); setIsLdapModalOpen(true); }}
              style={{ fontSize: '11px', height: '30px' }}
            >
              <Plus size={12} /> {t('admin.addLdap')}
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setIsOidcModalOpen(true)}
              style={{ fontSize: '11px', height: '30px' }}
            >
              <Plus size={12} /> {t('admin.addOidc')}
            </button>
          </div>
        </div>

        {feedback && <p role={feedback.error ? 'alert' : 'status'} style={{ padding: '12px', color: feedback.error ? 'var(--status-critical)' : 'var(--text-primary)' }}>{feedback.message}</p>}

        <div
          style={{
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            overflow: 'hidden',
          }}
        >
          <div className={styles.providerTableHead}
            style={{
              padding: '10px 16px',
              background: 'var(--bg-surface)',
              borderBottom: '1px solid var(--border-default)',
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              letterSpacing: '0.05em',
            }}
          >
            <div>{cs ? 'Poskytovatel / adresa' : 'Provider / endpoint'}</div>
            <div>{cs ? 'Typ' : 'Type'}</div>
            <div>{cs ? 'Uložené heslo' : 'Stored credential'}</div>
            <div>{cs ? 'Stav' : 'Status'}</div>
            <div style={{ textAlign: 'right' }}>{cs ? 'Akce' : 'Actions'}</div>
          </div>

          {loading ? <p role="status" style={{ padding: '12px 16px' }}>{cs ? 'Načítání…' : 'Loading…'}</p> : providers.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
              {cs ? 'Zatím je dostupné pouze přihlášení místním účtem.' : 'Only local accounts are available for sign-in.'}
            </div>
          ) : (
            providers.map((p) => (
              <div
                key={p.id}
                className={styles.providerRow}
                style={{
                  alignItems: 'center',
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--border-subtle)',
                  fontSize: '12px',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {p.category === 'LDAP' ? p.config.url : p.config.issuerUrl}
                  </div>
                </div>

                <div>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-xs)',
                      fontSize: '10px',
                      fontWeight: 700,
                      background: p.category === 'LDAP' ? 'rgba(234, 88, 12, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                      color: p.category === 'LDAP' ? 'var(--cylab-orange)' : 'var(--accent-active)',
                    }}
                  >
                    {p.category}
                  </span>
                </div>

                <div>
                  {p.hasSecretConfigured ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--status-success)', fontSize: '11px' }}>
                      <CheckCircle2 size={12} /> {cs ? 'Uloženo' : 'Stored'}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{cs ? 'Chybí' : 'None'}</span>
                  )}
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => handleToggle(p.id, p.enabled)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '11px',
                      color: p.enabled ? 'var(--status-success)' : 'var(--text-muted)',
                    }}
                  >
                    {p.enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                    {p.enabled ? t('admin.enabled') : t('admin.disabled')}
                  </button>
                </div>

                <div className={styles.providerActions}>
                  {p.category === 'LDAP' && (
                    <>
                      <button type="button" className="btn-ghost" onClick={() => { setEditingLdap(p); setFeedback(null); setIsLdapModalOpen(true); }} aria-label={cs ? `Upravit LDAP · ${p.name}` : `Edit LDAP · ${p.name}`} title={cs ? 'Upravit LDAP' : 'Edit LDAP'}><Pencil size={14} /> {cs ? 'Upravit LDAP' : 'Edit LDAP'}</button>
                      <button type="button" className="btn-ghost" disabled={testingId === p.id} onClick={() => handleTest(p.id)} title={cs ? 'Zkontroluje pravidla a formát nastavení' : 'Check configuration and rules'}>
                        {testingId === p.id ? '…' : (cs ? 'Ověřit konfiguraci' : 'Check settings')}
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(p.id)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px',
                      color: 'var(--status-danger)',
                    }}
                    aria-label={cs ? `Odstranit ${p.name}` : `Delete ${p.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {isLdapModalOpen && <LdapProviderForm provider={editingLdap} onClose={() => setIsLdapModalOpen(false)} onSaved={() => {
          setIsLdapModalOpen(false);
          setFeedback({ error: false, message: cs ? 'Nastavení LDAP bylo uloženo.' : 'LDAP settings saved.' });
          void fetchProviders();
        }} />}

        {/* Modal: Add OIDC */}
        {isOidcModalOpen && (
          <div className="dialog-overlay dialog-overlay-top" role="presentation">
            <div className="dialog-surface form-dialog-surface" role="dialog" aria-modal="true" aria-label="Configure OpenID Connect SSO" style={{ maxWidth: '520px', padding: '24px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>Configure OpenID Connect SSO</h2>
              {feedback?.error && <p role="alert">{feedback.message}</p>}
              <form onSubmit={handleSaveOidc} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>Display Name</label>
                  <input value={oidcName} onChange={(e) => setOidcName(e.target.value)} required />
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>Issuer URL</label>
                  <input value={oidcIssuer} onChange={(e) => setOidcIssuer(e.target.value)} placeholder="https://keycloak.org/realms/cybertron" required />
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>Client ID</label>
                  <input value={oidcClientId} onChange={(e) => setOidcClientId(e.target.value)} required />
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>Client Secret (Encrypted)</label>
                  <input type="password" value={oidcClientSecret} onChange={(e) => setOidcClientSecret(e.target.value)} placeholder="••••••••••••" />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                  <input type="checkbox" id="oidcJit" checked={oidcJit} onChange={(e) => setOidcJit(e.target.checked)} />
                  <label htmlFor="oidcJit" style={{ fontSize: '12px' }}>Enable Just-In-Time (JIT) User Provisioning</label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                  <button type="button" className="btn-ghost" onClick={() => setIsOidcModalOpen(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={submitting}>Save Provider</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
