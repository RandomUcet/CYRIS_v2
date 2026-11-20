'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { EventResponse, LdapTeamAccount, LdapTeamAssignment } from '@cyris/contracts';
import { usePreferences } from '@/contexts/PreferencesContext';
import { apiClient } from '@/lib/api-client';
import { ExerciseTeamRoles, useTeamCatalogs } from './ExerciseTeamRoles';
import styles from './LdapTeams.module.css';

function AccountAssignment({ account, event, saving, setSaving, onSave }: {
  account: LdapTeamAccount;
  event: EventResponse;
  onSave: (message: string) => void;
  saving: boolean;
  setSaving: (saving: boolean) => void;
}) {
  const { locale } = usePreferences();
  const cs = locale === 'cs';
  const assignment = account.assignment;
  const [mode, setMode] = useState(assignment.mode);
  const [unitId, setUnitId] = useState(assignment.mode === 'MANUAL' ? assignment.unitId : '');
  const [roleId, setRoleId] = useState(assignment.mode === 'MANUAL' ? assignment.roleId : '');
  const [error, setError] = useState('');
  const { catalogs, retry } = useTeamCatalogs(mode === 'MANUAL' ? [event.id] : []);
  const catalog = catalogs[event.id];
  const canSave = mode !== 'MANUAL' || Boolean(catalog?.units.some(unit => unit.id === unitId) && catalog.roles.some(role => role.id === roleId));

  async function save(e: FormEvent) {
    e.preventDefault();
    if (saving || !canSave) return;
    setError('');
    setSaving(true);
    try {
      const choice: LdapTeamAssignment = mode === 'MANUAL' ? { mode, unitId, roleId } : { mode };
      const result = await apiClient.setLdapTeamAssignment(account.identityId, event.id, choice);
      if (!result.ok) {
        setError(result.error || (cs ? 'Zařazení se nepodařilo uložit.' : 'Unable to save assignment.'));
        return;
      }
      const selected = mode === 'MANUAL' ? catalog?.units.find(unit => unit.id === unitId)?.name : undefined;
      const message = cs ? 'Zařazení bylo uloženo' : 'Assignment saved';
      onSave(`${message} · ${account.displayName}${selected ? ' · ' + selected : ''}`);
    } finally { setSaving(false); }
  }

  return <form className={styles.editor} onSubmit={save} aria-label={cs ? 'Zařazení vybraného účtu' : 'Selected account assignment'}>
    <h3>{account.displayName} · {event.name}</h3>
    <p>{account.email} · {account.providerName}</p>
    <p>{cs ? 'Aktuální týmy' : 'Current teams'} · {account.units.map(unit => unit.name).join(', ') || (cs ? 'Bez týmu' : 'No team')}
      {account.membershipStatus === 'INACTIVE' && (cs ? ' · Neaktivní členství' : ' · Inactive membership')}</p>
    <fieldset className={styles.fields} disabled={saving}>
      <label className={styles.full}>{cs ? 'Způsob zařazení' : 'Assignment method'}
        <select value={mode} onChange={e => { setMode(e.target.value as LdapTeamAssignment['mode']); setError(''); }}>
          <option value="DIRECTORY">{cs ? 'Podle skupin LDAP' : 'Use LDAP groups'}</option>
          <option value="MANUAL">{cs ? 'Ručně zvolený tým' : 'Manually selected team'}</option>
          <option value="UNASSIGNED">{cs ? 'Bez přiřazení z LDAP' : 'No LDAP assignment'}</option>
        </select>
      </label>
      {mode === 'MANUAL' ? <ExerciseTeamRoles cs={cs} catalog={catalog} hasEvent valueKey="id" unit={unitId} role={roleId}
        onUnit={setUnitId} onRole={setRoleId} retry={retry} /> :
        <p className={styles.full}>{mode === 'DIRECTORY'
          ? (cs ? 'Použijí se skupiny z posledního přihlášení. Další přihlášení je aktualizuje.' : 'Use the groups from the last sign-in. The next sign-in refreshes them.')
          : (cs ? 'Pro toto cvičení se vypne přiřazení pomocí LDAP. Ostatní samostatně udělená oprávnění zůstanou v platnosti.' : 'Turn off LDAP assignment in this exercise. Other independently granted access still applies.')}</p>}
    </fieldset>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.actions}><button type="submit" className="btn btn-primary" disabled={!canSave || saving}>
      {saving ? '…' : (cs ? 'Uložit zařazení' : 'Save assignment')}
    </button></div>
  </form>;
}

function AccountSearch({ event, onChanged }: { event: EventResponse; onChanged: () => void }) {
  const { locale } = usePreferences();
  const cs = locale === 'cs';
  const [query, setQuery] = useState('');
  const [unassigned, setUnassigned] = useState(true);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accounts, setAccounts] = useState<LdapTeamAccount[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const account = accounts.find(row => row.identityId === selected);

  useEffect(() => {
    let current = true;
    setAccounts([]);
    setSelected('');
    setLoading(true);
    setError('');
    setHasMore(false);
    const timeout = window.setTimeout(async () => {
      const result = await apiClient.listLdapTeamAccounts(event.id, query.trim(), unassigned);
      if (!current) return;
      if (result.ok && result.data) {
        setAccounts(result.data.accounts);
        setHasMore(result.data.hasMore);
      } else {
        setError(result.error || (cs ? 'Účty LDAP se nepodařilo načíst.' : 'Unable to load LDAP accounts.'));
      }
      setLoading(false);
    }, query ? 220 : 0);
    return () => { current = false; window.clearTimeout(timeout); };
  }, [event.id, query, unassigned, revision, cs]);

  return <div className={styles.section}>
    <p>{cs ? 'Vyberte člověka, který se už alespoň jednou přihlásil přes LDAP.' : 'Choose someone who has signed in through LDAP at least once.'}</p>
    <div className={styles.fields}>
      <label>{cs ? 'Jméno nebo e-mail účtu LDAP' : 'LDAP account name or email'}
        <input type="search" disabled={saving} value={query} maxLength={120} onChange={e => { setNotice(''); setQuery(e.target.value); }} />
      </label>
      <label className={styles.check}><input type="checkbox" disabled={saving} checked={unassigned} onChange={e => { setNotice(''); setUnassigned(e.target.checked); }} />
        {cs ? 'Pouze bez týmu' : 'Only accounts without a team'}</label>
    </div>
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {loading ? <p role="status">{cs ? 'Načítání účtů…' : 'Loading accounts…'}</p> : error ?
      <p role="alert" className={styles.error}>{error} <button type="button" className="btn btn-secondary" onClick={() => setRevision(value => value + 1)}>{cs ? 'Zkusit znovu' : 'Retry'}</button></p> :
      accounts.length ? <ul className={styles.accounts} aria-label={cs ? 'Účty LDAP' : 'LDAP accounts'}>
        {accounts.map(row => <li key={row.identityId}><button type="button" disabled={saving} aria-pressed={selected === row.identityId} onClick={() => { setNotice(''); setSelected(row.identityId); }}>
          <strong>{row.displayName}</strong><small>{row.email} · {row.providerName}</small>
        </button></li>)}
      </ul> : <p role="status">{cs ? 'Žádný účet neodpovídá tomuto výběru.' : 'No accounts match this selection.'}</p>}
    {hasMore && <p>{cs ? 'Zobrazuje se prvních 50 účtů. Upřesněte jméno nebo e-mail.' : 'Showing the first 50 accounts. Narrow the name or email search.'}</p>}
    {account && <AccountAssignment key={account.identityId} account={account} event={event} saving={saving} setSaving={setSaving} onSave={message => {
      setSelected(''); setNotice(message); setRevision(value => value + 1); onChanged();
    }} />}
  </div>;
}

export function LdapTeamAssignments({ event, onChanged }: { event: EventResponse; onChanged: () => void }) {
  const { locale } = usePreferences();
  const cs = locale === 'cs';
  const [open, setOpen] = useState(false);
  return <details className={styles.panel} onToggle={e => setOpen(e.currentTarget.open)}>
    <summary>{cs ? 'Zařazení účtů LDAP' : 'LDAP team assignments'}</summary>
    {open && (event.status === 'CLOSED' || event.status === 'ARCHIVED'
      ? <p className={styles.section}>{cs ? 'V uzavřeném cvičení nelze měnit zařazení.' : 'Assignments for a closed exercise cannot be changed.'}</p>
      : <AccountSearch event={event} onChanged={onChanged} />)}
  </details>;
}
