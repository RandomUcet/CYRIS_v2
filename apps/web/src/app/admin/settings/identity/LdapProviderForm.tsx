'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { resolveLdapTransportSecurity, validateLdapConfig, type IdentityProviderSummary, type LdapConfig, type LdapGroupMapping } from '@cyris/contracts';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useEvent } from '@/contexts/EventContext';
import { apiClient } from '@/lib/api-client';
import { ExerciseTeamRoles, useTeamCatalogs } from '@/components/admin/ExerciseTeamRoles';
import styles from '@/components/admin/LdapTeams.module.css';

const emptyConfig: LdapConfig = {
  displayName: 'Active Directory', url: '', bindDn: '', baseDn: '', transportSecurity: 'LDAPS',
  userFilter: '(uid={username})', usernameAttr: 'uid', emailAttr: 'mail', displayNameAttr: 'cn',
  groupBaseDn: '', groupFilter: '', jitEnabled: true,
};

type Rule = LdapGroupMapping & { key: number; allowEventWide: boolean; legacyScope?: boolean };

export function LdapProviderForm({ provider, onClose, onSaved }: {
  provider: IdentityProviderSummary | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { locale } = usePreferences();
  const cs = locale === 'cs';
  const { events, loadingEvents } = useEvent();
  const dialog = useRef<HTMLDialogElement>(null);
  const [config, setConfig] = useState<LdapConfig>(() => {
    const saved = provider?.config as LdapConfig | undefined;
    return {
      ...emptyConfig, ...saved, displayName: provider?.name ?? emptyConfig.displayName,
      transportSecurity: saved ? resolveLdapTransportSecurity(saved) : 'LDAPS',
    };
  });
  const [password, setPassword] = useState('');
  const [rules, setRules] = useState<Rule[]>(() => (config.groupMappings ?? []).map((rule, key) => ({
    ...rule, key, allowEventWide: !rule.unitSlug, legacyScope: !rule.eventId,
  })));
  const nextKey = useRef(rules.length);
  const { catalogs, retry } = useTeamCatalogs(rules.map(rule => rule.eventId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const node = dialog.current;
    if (node && !node.open) node.showModal();
    return () => node?.close();
  }, []);

  function field<K extends keyof LdapConfig>(key: K, value: LdapConfig[K]) {
    setConfig(previous => ({ ...previous, [key]: value }));
  }
  function editRule(key: number, change: Partial<Rule>) {
    setRules(previous => previous.map(rule => rule.key === key ? { ...rule, ...change } : rule));
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setError('');
    const groupMappings: LdapGroupMapping[] = [];
    for (const rule of rules) {
      const catalog = catalogs[rule.eventId ?? ''];
      const existingScope = rule.legacyScope && !rule.eventId && rule.roleSlug;
      const validSelection = catalog?.roles.some(role => role.slug === rule.roleSlug) &&
        (rule.allowEventWide && !rule.unitSlug || catalog.units.some(unit => unit.slug === rule.unitSlug));
      if (!rule.ldapGroup.trim() || !(existingScope || validSelection)) {
        setError(cs ? 'U každé skupiny zkontrolujte cvičení, tým a roli.' : 'Check the exercise, team and role for each group.');
        return;
      }
      const mapping = { ldapGroup: rule.ldapGroup.trim(), eventId: rule.eventId, roleSlug: rule.roleSlug, unitSlug: rule.unitSlug || undefined };
      if (groupMappings.some(old => old.ldapGroup.toLowerCase() === mapping.ldapGroup.toLowerCase() &&
        old.eventId === mapping.eventId && old.roleSlug === mapping.roleSlug && old.unitSlug === mapping.unitSlug)) {
        setError(cs ? 'Stejné pravidlo pro tuto skupinu již existuje.' : 'This group already has the same rule.');
        return;
      }
      groupMappings.push(mapping);
    }
    const security = resolveLdapTransportSecurity(config);
    const payload = {
      ...config, displayName: config.displayName.trim(), url: config.url.trim(), bindDn: config.bindDn.trim(), baseDn: config.baseDn.trim(),
      groupBaseDn: config.groupBaseDn?.trim() || null, groupFilter: config.groupFilter?.trim() || null,
      transportSecurity: security, tls: security !== 'NONE', groupMappings,
    };
    const errors = validateLdapConfig(payload);
    if (errors.length) { setError(errors.join(' ')); return; }
    setSaving(true);
    try {
      const result = await apiClient.saveLdapProvider({ id: provider?.id, name: payload.displayName, config: payload, bindPassword: password || undefined });
      if (result.ok) onSaved();
      else setError(result.error || (cs ? 'Uložení poskytovatele selhalo.' : 'Could not save provider.'));
    } catch (err) {
      setError(err instanceof Error ? err.message : (cs ? 'Spojení není dostupné.' : 'Connection unavailable.'));
    } finally { setSaving(false); }
  }

  return <dialog ref={dialog} aria-labelledby="ldap-provider-title"
    className={styles.dialog+' '+styles.ldapEditorDialog}
    onCancel={event => { event.preventDefault(); if (!saving) onClose(); }}>
    <h2 id="ldap-provider-title" className={styles.ldapEditorHeader}>{provider ? (cs ? 'Upravit LDAP' : 'Edit LDAP') : (cs ? 'Přidat LDAP / Active Directory' : 'Add LDAP / Active Directory')}</h2>
    <form className={styles.form+' '+styles.ldapEditorForm} onSubmit={save}>
      <div className={styles.ldapEditorBody}>
      <fieldset disabled={saving} className={styles.fields}>
        <label className={styles.full}>{cs ? 'Název poskytovatele' : 'Provider name'}
          <input required maxLength={128} value={config.displayName} onChange={e => field('displayName', e.target.value)} />
        </label>
        <label>LDAP URL
          <input required type="url" placeholder="ldaps://ad.example.org:636" value={config.url} onChange={e => field('url', e.target.value)} />
        </label>
        <label>{cs ? 'Zabezpečení spojení' : 'Connection security'}
          <select value={resolveLdapTransportSecurity(config)} onChange={e => field('transportSecurity', e.target.value as LdapConfig['transportSecurity'])}>
            <option value="LDAPS">LDAPS</option><option value="STARTTLS">StartTLS</option>
            <option value="NONE">{cs ? 'Bez TLS (pouze localhost)' : 'Without TLS (localhost only)'}</option>
          </select>
        </label>
        <label>{cs ? 'DN servisního účtu (Bind DN)' : 'Service account DN (Bind DN)'}
          <input required value={config.bindDn} onChange={e => field('bindDn', e.target.value)} />
        </label>
        <label>{cs ? 'Heslo servisního účtu' : 'Service account password'}
          <input type="password" autoComplete="new-password" value={password}
            placeholder={provider?.hasSecretConfigured ? (cs ? 'Ponechat uložené heslo' : 'Keep stored password') : undefined} onChange={e => setPassword(e.target.value)} />
        </label>
        <label className={styles.full}>{cs ? 'DN pro hledání uživatelů (Base DN)' : 'User search base DN'}
          <input required value={config.baseDn} onChange={e => field('baseDn', e.target.value)} />
        </label>
        <label className={styles.full}>{cs ? 'Filtr uživatele' : 'User filter'}
          <input required value={config.userFilter} onChange={e => field('userFilter', e.target.value)} />
        </label>
        <details className={styles.full}><summary>{cs ? 'Atributy adresáře' : 'Directory attributes'}</summary>
          <div className={styles.fields}>
            <label>{cs ? 'Přihlašovací jméno' : 'Username'}<input required value={config.usernameAttr} onChange={e => field('usernameAttr', e.target.value)} /></label>
            <label>E-mail<input required value={config.emailAttr} onChange={e => field('emailAttr', e.target.value)} /></label>
            <label>{cs ? 'Zobrazované jméno' : 'Display name'}<input required value={config.displayNameAttr} onChange={e => field('displayNameAttr', e.target.value)} /></label>
          </div>
        </details>
        <label className={styles.check + ' ' + styles.full}>
          <input type="checkbox" checked={config.jitEnabled !== false} onChange={e => field('jitEnabled', e.target.checked)} />
          {cs ? 'Vytvořit účet při prvním přihlášení (JIT)' : 'Create the account on first sign-in (JIT)'}
        </label>
      </fieldset>
      <section className={styles.section} aria-labelledby="ldap-group-title">
        <h3 id="ldap-group-title">{cs ? 'Skupiny LDAP a týmy' : 'LDAP groups and teams'}</h3>
        <p>{cs ? 'Při přihlášení získají členové skupiny vybraný tým a roli. Pokud má stejný název více skupin, zadejte celý DN.' : 'At sign-in, group members receive the selected team and role. For groups with the same name, enter the full DN.'}</p>
        <fieldset className={styles.fields} disabled={saving}>
          <label>{cs ? 'DN pro hledání skupin' : 'Group search base DN'}
            <input value={config.groupBaseDn ?? ''} required={rules.length > 0} placeholder="ou=Groups,dc=example,dc=org" onChange={e => field('groupBaseDn', e.target.value)} />
          </label>
          <label>{cs ? 'Filtr členství' : 'Group membership filter'}
            <input value={config.groupFilter ?? ''} placeholder="(|(member={dn})(memberUid={username}))" onChange={e => field('groupFilter', e.target.value)} />
          </label>
        </fieldset>
        {rules.map((rule,index) => <div key={rule.key} className={styles.rule}>
          <div className={styles.full}>
            <strong className={styles.ruleTitle}>
              {cs?'Pravidlo '+(index+1):'Rule '+(index+1)}
            </strong>
            <p>{cs?'Vyberte LDAP skupinu, cvičení a rozsah přidělení role.':'Choose the LDAP group, exercise and role scope.'}</p>
          </div>
          <label>{cs ? 'Skupina LDAP (CN nebo DN)' : 'LDAP group (CN or DN)'}
            <input required disabled={saving} value={rule.ldapGroup} onChange={e => editRule(rule.key, { ldapGroup: e.target.value })} />
          </label>
          <label>{cs ? 'Cvičení' : 'Exercise'}
            <select required={!rule.legacyScope} value={rule.eventId ?? ''} disabled={loadingEvents || saving} onChange={e => editRule(rule.key, { eventId: e.target.value, roleSlug: '', unitSlug: '', allowEventWide: false, legacyScope: false })}>
              <option value="">{rule.legacyScope ? (cs ? 'Podle původní role' : 'From existing role') : (cs ? 'Vyberte cvičení' : 'Select an exercise')}</option>
              {events.filter(event => event.id === rule.eventId || !['CLOSED','ARCHIVED'].includes(event.status)).map(event =>
                <option value={event.id} key={event.id}>{event.name}</option>)}
            </select>
          </label>
          <label className={styles.check+' '+styles.full}>
            <input type="checkbox" checked={rule.allowEventWide} disabled={saving || !rule.eventId}
              onChange={e => editRule(rule.key, { allowEventWide:e.target.checked, unitSlug:'' })}/>
            {cs?'Role platí pro celé cvičení (bez konkrétního týmu)':'Exercise-wide role (no specific team)'}
          </label>
          <p className={styles.full}>{rule.allowEventWide
            ?(cs?'Všichni členové této LDAP skupiny získají vybranou roli v daném cvičení bez týmového omezení.':'Members of the LDAP group receive the selected exercise role without a team assignment.')
            :(cs?'Členové této LDAP skupiny získají roli v konkrétním týmu.':'Members of the LDAP group receive the role in the selected team.')}</p>
          <ExerciseTeamRoles cs={cs} hasEvent={Boolean(rule.eventId)} valueKey="slug" catalog={catalogs[rule.eventId ?? '']}
            unit={rule.unitSlug ?? ''} role={rule.roleSlug} allowEventWide={rule.allowEventWide} retry={retry} disabled={saving}
            onUnit={unitSlug => editRule(rule.key, { unitSlug })} onRole={roleSlug => editRule(rule.key, { roleSlug })} />
          <div className={styles.actions + ' ' + styles.full}><button type="button" disabled={saving} className="btn btn-secondary"
            onClick={() => setRules(previous => previous.filter(item => item.key !== rule.key))}>{cs ? 'Odebrat pravidlo' : 'Remove rule'}</button></div>
        </div>)}
        <div><button type="button" className="btn btn-secondary" disabled={saving} onClick={() => {
          const key = nextKey.current++;
          setRules(previous => [...previous, { key, ldapGroup: '', roleSlug: '', allowEventWide: false }]);
        }}>{cs ? 'Přidat pravidlo' : 'Add rule'}</button></div>
      </section>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      </div>
      <div className={styles.ldapEditorFooter}>
        <span>{cs ? 'Změny se projeví po uložení.' : 'Changes take effect after saving.'}</span>
        <div className={styles.actions}>
          <button type="button" className="btn btn-secondary" disabled={saving} onClick={onClose}>{cs ? 'Zrušit' : 'Cancel'}</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? '…' : (cs ? 'Uložit poskytovatele' : 'Save provider')}</button>
        </div>
      </div>
    </form>
  </dialog>;
}
