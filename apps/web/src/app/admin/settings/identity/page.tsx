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
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import type { IdentityProviderSummary, LdapConfig, OidcConfig } from '@cyris/contracts';

export default function IdentitySettingsPage() {
  const { isPlatformAdmin } = useAuth();
  const { t, formatTime } = usePreferences();
  const [providers, setProviders] = useState<IdentityProviderSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal / drawer states
  const [isLdapModalOpen, setIsLdapModalOpen] = useState(false);
  const [isOidcModalOpen, setIsOidcModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // LDAP form state
  const [ldapName, setLdapName] = useState('Active Directory');
  const [ldapUrl, setLdapUrl] = useState('ldap://localhost:389');
  const [ldapTls, setLdapTls] = useState(false);
  const [ldapTransportSecurity, setLdapTransportSecurity] = useState<'NONE' | 'LDAPS' | 'STARTTLS'>('NONE');
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
    try {
      const res = await apiClient.listIdentityProviders();
      if (res.ok && res.data) {
        setProviders(res.data);
      }
    } catch {}
    setLoading(false);
  };

  const handleTest = async (id: string) => {
    const res = await apiClient.testIdentityProvider(id);
    alert(res.ok ? (res.data?.message ?? 'Configuration valid') : `LDAP test failed: ${res.error}`);
  };

  useEffect(() => {
    fetchProviders();
  }, []);

  const handleToggle = async (id: string, current: boolean) => {
    await apiClient.toggleIdentityProvider(id, !current);
    await fetchProviders();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this identity provider?')) return;
    await apiClient.deleteIdentityProvider(id);
    await fetchProviders();
  };

  const handleSaveLdap = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const config: LdapConfig = {
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
      groupMappings: [],
    };

    await apiClient.saveLdapProvider({
      name: ldapName,
      config,
      bindPassword: ldapBindPassword || undefined,
    });

    setSubmitting(false);
    setIsLdapModalOpen(false);
    setLdapBindPassword('');
    await fetchProviders();
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

    await apiClient.saveOidcProvider({
      name: oidcName,
      config,
      clientSecret: oidcClientSecret || undefined,
    });

    setSubmitting(false);
    setIsOidcModalOpen(false);
    setOidcClientSecret('');
    await fetchProviders();
  };

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
              onClick={() => setIsLdapModalOpen(true)}
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
                    <button type="button" className="btn-ghost" onClick={() => handleTest(p.id)} title="Validate locally without network access">
                      Test (mock)
                    </button>
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
                    <option value="NONE">Plain LDAP (test only)</option>
                    <option value="LDAPS">LDAPS (certificate verification required)</option>
                    <option value="STARTTLS">StartTLS (certificate verification required)</option>
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
