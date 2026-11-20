'use client';

import { useEffect, useState } from 'react';
import type { PlatformAdminAccount } from '@cyris/contracts';
import { usePreferences } from '@/contexts/PreferencesContext';
import { apiClient } from '@/lib/api-client';

export function PlatformAdministrators({ actorId, onChanged }: { actorId: string; onChanged: () => void }) {
  const { locale } = usePreferences();
  const cs = locale === 'cs';
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<PlatformAdminAccount[]>([]);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setRows([]);
    setMore(false);
    setLoading(true);
    setError('');
    const timer = window.setTimeout(async () => {
      const result = await apiClient.listPlatformAdmins(query.trim());
      if (!active) return;
      if (result.ok && result.data) {
        setRows(result.data.accounts);
        setMore(result.data.hasMore);
      } else setError(result.error || (cs ? 'Načtení účtů selhalo.' : 'Could not load accounts.'));
      setLoading(false);
    }, query.trim() ? 200 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [open, query, revision, cs]);

  async function change(person: PlatformAdminAccount) {
    const label = person.displayName + ' (' + person.email + ')';
    const question = person.admin
      ? (cs ? `Odebrat účtu ${label} správu celé platformy?` : `Revoke platform administration for ${label}?`)
      : (cs ? `Svěřit účtu ${label} úplnou správu CYRIS včetně přidělování dalších správců?`
        : `Give ${label} full control of CYRIS, including appointing other administrators?`);
    if (saving || !window.confirm(question)) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const result = await apiClient.setPlatformAdmin(person.id, !person.admin);
      if (!result.ok) { setError(result.error || (cs ? 'Změna selhala.' : 'Change failed.')); return; }
      setMessage(person.admin
        ? (cs ? `Role odebrána účtu ${person.email}.` : `Revoked access for ${person.email}.`)
        : (cs ? `Správce platformy přidán: ${person.email}.` : `Granted platform access to ${person.email}.`));
      setQuery('');
      setRevision(value => value + 1);
      onChanged();
    } finally { setSaving(false); }
  }

  return <details className="preview-access" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{cs ? 'Správci platformy' : 'Platform administrators'}</summary>
    <p>{cs ? 'Správce řídí celý CYRIS a všechna cvičení. Pro přidání vyhledejte uživatele po jeho prvním přihlášení přes LDAP.'
      : 'Administrators control CYRIS and all exercises. To add someone, search after their first LDAP sign-in.'}</p>
    <label>{cs ? 'Vyhledat LDAP účet' : 'Find an LDAP account'}{' '}
      <input type="search" value={query} maxLength={160} disabled={saving}
        placeholder={cs ? 'Jméno nebo e-mail' : 'Name or email'}
        onChange={event => { setQuery(event.target.value); setMessage(''); }} />
    </label>
    <h3>{query.trim() ? (cs ? 'Výsledky hledání' : 'Search results') : (cs ? 'Současní správci' : 'Current administrators')}</h3>
    {loading && <p role="status">{cs ? 'Načítání…' : 'Loading…'}</p>}
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {!loading && !rows.length && !error && <p>{cs ? 'Žádný odpovídající účet.' : 'No matching accounts.'}</p>}
    <ul>{rows.map(person => <li key={person.id}>
      <strong>{person.displayName}</strong> · {person.email}
      {person.id === actorId && (cs ? ' · váš účet' : ' · your account')}
      {person.status !== 'ACTIVE' && (cs ? ' · deaktivován' : ' · disabled')}
      {person.ldap && person.id !== actorId && <> <button type="button" className="btn btn-secondary"
        disabled={saving} onClick={() => void change(person)}>{person.admin ? (cs ? 'Odebrat roli' : 'Revoke role')
          : (cs ? 'Přidat správce' : 'Grant administrator')}</button></>}
    </li>)}</ul>
    {more && <p>{cs ? 'Zobrazeno prvních 25 účtů. Upřesněte hledání.' : 'Showing the first 25 accounts. Refine your search.'}</p>}
  </details>;
}
