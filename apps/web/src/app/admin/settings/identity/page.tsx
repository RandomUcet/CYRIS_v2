'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { AppShell } from '@/components/layout/AppShell';
import {
  Users,
  Shield,
  Plus,
  Key,
  Globe,
  CheckCircle2,
  AlertCircle,
  Trash2,
  ToggleLeft,
  ToggleRight,
  ExternalLink,
  Pencil,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { resolveLdapTransportSecurity, type IdentityProviderSummary, type LdapConfig, type OidcConfig } from '@cyris/contracts';

export default function IdentitySettingsPage() {
  const { isPlatformAdmin } = useAuth();
  const { t, formatTime } = usePreferences();
  const [providers, setProviders] = useState<IdentityProviderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [editingLdap, setEditingLdap] = useState<IdentityProviderSummary | null>(null);

  // Modal / drawer states
  const [isLdapModalOpen, setIsLdapModalOpen] = useState(false);
  const [isOidcModalOpen, setIsOidcModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // LDAP form state
  const [ldapName, setLdapName] = useState('Active Directory');
  const [ldapUrl, setLdapUrl] = useState('ldaps://localhost:636');
  const [ldapTransportSecurity, setLdapTransportSecurity] = useState<'NONE' | 'LDAPS' | 'STARTTLS'>('LDAPS');
  const [ldapBindDn, setLdapBindDn] = useState('cn=admin,dc=example,dc=org');
  const [ldapBindPassword, setLdapBindPassword] = useState('');
  const [ldapBaseDn, setLdapBaseDn] = useState('dc=example,dc=org');
  const [ldapUserFilter, setLdapUserFilter] = useState('(uid={username})');
  const [ldapUsernameAttr, setLdapUsernameAttr] = useState('uid');
  const [ldapEmailAttr, setLdapEmailAttr] = useState('mail');
  const [ldapDisplayNameAttr, setLdapDisplayNameAttr] = useState('cn');
  const [ldapJit, setLdapJit] = useState(true);

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
    if (!confirm('Opravdu odstranit poskytovatele přihlášení?')) return;
    const res = await apiClient.deleteIdentityProvider(id);
    if (!res.ok) setFeedback({ error: true, message: res.error ?? 'Odstranění se nezdařilo.' });
    else await fetchProviders();
  };

  const editLdap = (provider: IdentityProviderSummary) => {
    const config = provider.config as LdapConfig;
    setEditingLdap(provider);
    setLdapName(provider.name);
    setLdapUrl(config.url);
    setLdapTransportSecurity(resolveLdapTransportSecurity(config));
    setLdapBindDn(config.bindDn);
    setLdapBaseDn(config.baseDn);
    setLdapUserFilter(config.userFilter ?? '(uid={username})');
    setLdapUsernameAttr(config.usernameAttr ?? 'uid');
    setLdapEmailAttr(config.emailAttr ?? 'mail');
    setLdapDisplayNameAttr(config.displayNameAttr ?? 'cn');
    setLdapJit(config.jitEnabled !== false);
    setLdapBindPassword('');
    setIsLdapModalOpen(true);
  };

  const handleSaveLdap = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const config: LdapConfig = {
      ...(editingLdap?.config as LdapConfig | undefined),
      displayName: ldapName,
      url: ldapUrl,
      tls: ldapTransportSecurity !== 'NONE',
      transportSecurity: ldapTransportSecurity,
      bindDn: ldapBindDn,
      baseDn: ldapBaseDn,
      userFilter: ldapUserFilter,
      usernameAttr: ldapUsernameAttr,
      emailAttr: ldapEmailAttr,
      displayNameAttr: ldapDisplayNameAttr,
      jitEnabled: ldapJit,
      groupMappings: (editingLdap?.config as LdapConfig | undefined)?.groupMappings ?? [],
    };

    try {
      const res = await apiClient.saveLdapProvider({
        id: editingLdap?.id,
        name: ldapName,
        config,
        bindPassword: ldapBindPassword || undefined,
      });
      if (!res.ok) {
        setFeedback({ error: true, message: res.error ?? 'Konfiguraci LDAP se nepodařilo uložit.' });
        return;
      }
      setIsLdapModalOpen(false);
      setLdapBindPassword('');
      setEditingLdap(null);
      setFeedback({ error: false, message: 'Konfigurace LDAP byla uložena. Připojení zatím nebylo ověřeno.' });
      await fetchProviders();
    } finally {
      setSubmitting(false);
    }
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

  if (!isPlatformAdmin) return <AppShell><p role="alert">Nastavení přihlášení může měnit pouze správce platformy.</p></AppShell>;

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={18} style={{ color: 'var(--accent-active)' }} />
              {t('admin.identityProviders')}
            </h1>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Configure enterprise directory synchronization and OpenID Connect single sign-on.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => { setEditingLdap(null); setLdapBindPassword(''); setIsLdapModalOpen(true); }}
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

        {/* Break-glass Warning Banner */}
        <div
          style={{
            background: 'rgba(56, 189, 248, 0.05)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            borderRadius: 'var(--radius-sm)',
            padding: '12px 16px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            fontSize: '12px',
          }}
        >
          <Shield size={16} style={{ color: 'var(--accent-active)', marginTop: '2px', flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Break-Glass Operational Resilience</div>
            <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
              {t('auth.breakGlass')}. External SSO or LDAP outages never lock out local administrators. All sensitive bind passwords and client secrets are AES-256-GCM envelope-encrypted.
            </div>
          </div>
        </div>

        {feedback && <p role={feedback.error ? 'alert' : 'status'} style={{ padding: '12px', color: feedback.error ? 'var(--status-critical)' : 'var(--text-primary)' }}>{feedback.message}</p>}

        {/* Provider List */}
        <div
          style={{
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1fr 1fr 100px',
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
            <div>Provider / Endpoint</div>
            <div>Category</div>
            <div>Secret Storage</div>
            <div>Status</div>
            <div style={{ textAlign: 'right' }}>Actions</div>
          </div>

          {providers.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
              No external identity providers configured. Only LOCAL database accounts are currently active.
            </div>
          ) : (
            providers.map((p) => (
              <div
                key={p.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr 1fr 100px',
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
                      <CheckCircle2 size={12} /> Encrypted
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>None</span>
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

                <div style={{ textAlign: 'right' }}>
                  {p.category === 'LDAP' && (
                    <>
                      <button type="button" className="btn-ghost" onClick={() => editLdap(p)} aria-label={`Upravit ${p.name}`}><Pencil size={14} /></button>
                      <button type="button" className="btn-ghost" disabled={testingId === p.id} onClick={() => handleTest(p.id)} title="Ověří formát konfigurace; nepřipojuje se k adresáři">
                        {testingId === p.id ? 'Ověřuji…' : 'Ověřit konfiguraci'}
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
                    title="Delete provider"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal: Add LDAP */}
        {isLdapModalOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 100,
            }}
          >
            <div
              style={{
                width: '520px',
                background: 'var(--bg-panel)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                padding: '24px',
                maxHeight: '90vh',
                overflowY: 'auto',
              }}
            >
              <h2 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>Configure LDAP / Active Directory</h2>
              {feedback?.error && <p role="alert">{feedback.message}</p>}
              <form onSubmit={handleSaveLdap} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>Display Name</label>
                  <input value={ldapName} onChange={(e) => setLdapName(e.target.value)} required />
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>LDAP URL</label>
                  <input value={ldapUrl} onChange={(e) => setLdapUrl(e.target.value)} placeholder="ldap://10.0.0.1:389" required />
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>Transport security</label>
                  <select value={ldapTransportSecurity} onChange={(e) => setLdapTransportSecurity(e.target.value as typeof ldapTransportSecurity)}>
                    <option value="NONE">Nešifrované LDAP (pouze localhost)</option>
                    <option value="LDAPS">LDAPS (ověření certifikátu)</option>
                    <option value="STARTTLS">StartTLS (ověření certifikátu)</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>Bind DN</label>
                  <input value={ldapBindDn} onChange={(e) => setLdapBindDn(e.target.value)} required />
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>Bind Password (Encrypted)</label>
                  <input type="password" value={ldapBindPassword} onChange={(e) => setLdapBindPassword(e.target.value)} placeholder="••••••••••••" />
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>Base DN</label>
                  <input value={ldapBaseDn} onChange={(e) => setLdapBaseDn(e.target.value)} required />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>User Filter</label>
                    <input value={ldapUserFilter} onChange={(e) => setLdapUserFilter(e.target.value)} required />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>Username Attr</label>
                    <input value={ldapUsernameAttr} onChange={(e) => setLdapUsernameAttr(e.target.value)} required />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                  <input type="checkbox" id="ldapJit" checked={ldapJit} onChange={(e) => setLdapJit(e.target.checked)} />
                  <label htmlFor="ldapJit" style={{ fontSize: '12px' }}>Enable Just-In-Time (JIT) User Provisioning</label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                  <button type="button" className="btn-ghost" onClick={() => setIsLdapModalOpen(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={submitting}>Save Provider</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Add OIDC */}
        {isOidcModalOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 100,
            }}
          >
            <div
              style={{
                width: '520px',
                background: 'var(--bg-panel)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                padding: '24px',
                maxHeight: '90vh',
                overflowY: 'auto',
              }}
            >
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
