'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, LockKeyhole, RefreshCw, Search, ShieldCheck, UserRoundCheck, UserRoundX } from 'lucide-react';
import type { EventResponse, LdapTeamAccount, LdapTeamAssignment } from '@cyris/contracts';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { apiClient } from '@/lib/api-client';
import { isLdapStatusConfirmationValid, ldapAccountAction } from '@/lib/ldap-account-policy';
import { ExerciseTeamRoles, useTeamCatalogs } from './ExerciseTeamRoles';
import styles from './LdapTeams.module.css';

type StatusFilter = 'ALL' | 'ACTIVE' | 'DISABLED';

function AccountEditor({ account, event, actorId, busy, setBusy, onChanged }: {
  account: LdapTeamAccount;
  event?: EventResponse;
  actorId: string;
  busy: boolean;
  setBusy: (value: boolean) => void;
  onChanged: (message: string) => void;
}) {
  const {locale,formatTime} = usePreferences();
  const cs = locale === 'cs';
  const tr = (cz:string,en:string) => cs ? cz : en;
  const [mode,setMode] = useState<LdapTeamAssignment['mode']>(account.assignment.mode);
  const [unitId,setUnitId] = useState(account.assignment.mode === 'MANUAL' ? account.assignment.unitId : '');
  const [roleId,setRoleId] = useState(account.assignment.mode === 'MANUAL' ? account.assignment.roleId : '');
  const [error,setError] = useState('');
  const [action,setAction] = useState<'ENABLE'|'DISABLE'|null>(null);
  const [reason,setReason] = useState('');
  const [emailConfirmation,setEmailConfirmation] = useState('');
  const {catalogs,retry} = useTeamCatalogs(mode === 'MANUAL' && event ? [event.id] : []);
  const catalog = event ? catalogs[event.id] : undefined;
  const lifecycle = ldapAccountAction(account, actorId);
  const closed = !event || event.status === 'ARCHIVED' || event.status === 'CLOSED';
  const canAssign = Boolean(event) && account.userStatus === 'ACTIVE' && !closed && !account.providerMissing;
  const validManual = mode !== 'MANUAL' || Boolean(catalog?.units.some(unit=>unit.id===unitId) &&
    catalog.roles.some(role=>role.id===roleId));
  const changed = account.assignment.mode !== mode ||
    (mode === 'MANUAL' && account.assignment.mode === 'MANUAL' &&
      (account.assignment.unitId !== unitId || account.assignment.roleId !== roleId));

  async function saveAssignment(e:FormEvent) {
    e.preventDefault();
    if (busy || !event || !canAssign || !validManual || !changed) return;
    setError('');setBusy(true);
    try {
      const choice:LdapTeamAssignment = mode === 'MANUAL' ? {mode,unitId,roleId} : {mode};
      const result = await apiClient.setLdapTeamAssignment(account.identityId,event.id,choice);
      if(!result.ok)throw new Error(result.error || tr('Nepodařilo se uložit přiřazení.','Unable to save assignment.'));
      onChanged(tr('Zařazení uživatele bylo uloženo.','User assignment saved.'));
    } catch(e) {setError(e instanceof Error?e.message:tr('Uložení selhalo.','Save failed.'));}
    finally {setBusy(false);}
  }

  async function applyStatus(e:FormEvent) {
    e.preventDefault();
    if(busy || !action || !isLdapStatusConfirmationValid(account.email,emailConfirmation,reason))return;
    const enabled = action === 'ENABLE';
    if((enabled && lifecycle !== 'ENABLE') || (!enabled && lifecycle !== 'DISABLE'))return;
    setError('');setBusy(true);
    try {
      const result=await apiClient.setLdapAccountEnabled(account.identityId,enabled,reason.trim());
      if(!result.ok || !result.data)throw new Error(result.error || tr('Změna stavu účtu selhala.','Account status change failed.'));
      setAction(null);setReason('');setEmailConfirmation('');
      onChanged(enabled ? tr('LDAP účet byl znovu aktivován.','LDAP account reactivated.')
        : tr('LDAP účet byl deaktivován a jeho relace byly zneplatněny.','LDAP account disabled and sessions invalidated.'));
    }catch(e){setError(e instanceof Error?e.message:tr('Změna stavu selhala.','Status change failed.'));}
    finally{setBusy(false);}
  }

  const statusLabel=account.userStatus==='ACTIVE'?tr('Aktivní účet','Active account'):tr('Deaktivovaný účet','Disabled account');

  return <article className={styles.detail} aria-label={tr('Detail LDAP účtu','LDAP account detail')}>
    <div className={styles.detailHeading}>
      <div>
        <span className={styles.kicker}>{tr('Identita v adresáři','Directory identity')}</span>
        <h3>{account.displayName}</h3>
        <p>{account.email}</p>
        <p className={styles.meta}>{tr('Poskytovatel: ','Provider: ')}{account.providerName}
          {' · '}{account.providerEnabled===false
            ?tr('Přihlášení přes něj je vypnuto','Provider disabled')
            :tr('LDAP přihlášení povoleno','LDAP sign-in enabled')}</p>
        <p className={styles.meta}>{tr('Poslední přihlášení: ','Last sign-in: ')}
          {account.lastLoginAt ? formatTime(account.lastLoginAt) : tr('dosud žádné','none recorded')}</p>
      </div>
      <span className={account.userStatus==='ACTIVE'?styles.stateActive:styles.stateDisabled}>
        {statusLabel}
      </span>
    </div>
    {error&&<p className={styles.error} role="alert">{error}</p>}

    <section className={styles.detailSection}>
      <h4>{tr('Přístup do CYRIS','CYRIS account access')}</h4>
      <p>{tr('Toto nastavení platí pro celou platformu, nikoliv jen pro vybrané cvičení.',
        'This status applies to the entire platform, not just this exercise.')}</p>
      <Link className={styles.secondaryButton} href={'/admin/audit?resourceId='+encodeURIComponent(account.userId)}>
        {tr('Zobrazit audit změn tohoto účtu','View this account’s change history')}
      </Link>
      {account.providerMissing&&<p className={styles.warning}><AlertTriangle size={16}/>
        {tr('Původní LDAP poskytovatel byl odstraněn. Účet a audit zůstávají v CYRIS. Pro další přihlášení je nutné obnovit správnou identitu.',
          'The original LDAP provider was removed. This CYRIS account and its audit history remain, but sign-in requires a valid identity provider.')}</p>}
      {!account.providerMissing&&account.providerEnabled===false&&<p className={styles.warning}><AlertTriangle size={16}/>
        {tr('Poskytovatel LDAP je vypnutý. Aktivace uživatelského účtu sama o sobě neobnoví možnost přihlášení.',
          'This LDAP provider is disabled. Enabling the CYRIS user account alone will not restore sign-in.')}</p>}
      {account.platformAdmin&&<p className={styles.warning}><ShieldCheck size={16}/>
        {tr('Účet má oprávnění správce platformy. Před deaktivací mu nejprve odeberte tuto roli.',
          'Account has platform administration access. Revoke its administrator role before disabling it.')}</p>}
      {account.otherLoginMethods&&<p className={styles.warning}><AlertTriangle size={16}/>
        {tr('Účet má více přihlašovacích identit. Globální stav nejde bezpečně změnit v tomto editoru.',
          'This user has multiple sign-in identities. Global account status cannot safely be changed here.')}</p>}
      {lifecycle==='SELF'&&<p className={styles.warning}>
        {tr('Vlastní účet není možné deaktivovat.','You cannot disable your own account.')}</p>}
      {(lifecycle==='ENABLE'||lifecycle==='DISABLE')&&<button type="button"
        className={lifecycle==='DISABLE'?styles.dangerButton:styles.primaryButton}
        disabled={busy} onClick={()=>{setAction(lifecycle);setReason('');setEmailConfirmation('');setError('');}}>
        {lifecycle==='DISABLE'?<UserRoundX size={16}/>:<UserRoundCheck size={16}/>}
        {lifecycle==='DISABLE'?tr('Deaktivovat účet','Disable account'):tr('Znovu aktivovat účet','Reactivate account')}
      </button>}
      {action&&<form className={styles.confirmation} onSubmit={e=>void applyStatus(e)}>
        <strong>{action==='DISABLE'?tr('Potvrzení deaktivace','Confirm account deactivation'):tr('Potvrzení reaktivace','Confirm reactivation')}</strong>
        <p>{action==='DISABLE'
          ?tr('Uživatel ztratí přístup ke všem cvičením. Záznamy a audit zůstanou zachovány.',
              'The user loses access to all exercises. Records and audit history are retained.')
          :tr('Uživatel se bude moci znovu přihlásit, pokud jeho LDAP přihlášení platí.',
              'The user can sign in again if their directory credentials are valid.')}</p>
        <label>{tr('Důvod změny (min. 8 znaků)','Reason for change (min. 8 characters)')}
          <textarea rows={3} required minLength={8} maxLength={500} value={reason} disabled={busy}
            onChange={e=>setReason(e.target.value)} placeholder={tr('Např. ukončení účasti na cvičení','E.g. exercise participation ended')}/>
        </label>
        <label>{tr('Pro potvrzení opište e-mail účtu','Type the account email to confirm')}
          <input type="text" autoComplete="off" spellCheck={false} required value={emailConfirmation} disabled={busy}
            onChange={e=>setEmailConfirmation(e.target.value)} placeholder={account.email}/>
        </label>
        <div className={styles.actions}>
          <button className={action==='DISABLE'?styles.dangerButton:styles.primaryButton} type="submit"
            disabled={busy||!isLdapStatusConfirmationValid(account.email,emailConfirmation,reason)}>
            {busy?tr('Ukládám…','Saving…'):tr('Potvrdit změnu stavu','Confirm status change')}
          </button>
          <button className={styles.secondaryButton} type="button" disabled={busy} onClick={()=>setAction(null)}>
            {tr('Zrušit','Cancel')}</button>
        </div>
      </form>}
    </section>

    {event?<section className={styles.detailSection}>
      <h4>{tr('Zařazení v aktuálním cvičení','Assignment in selected exercise')}</h4>
      <p><strong>{event.name}</strong> · {account.membershipStatus==='ACTIVE'?tr('Aktivní členství','Active membership')
        :account.membershipStatus==='INACTIVE'?tr('Neaktivní členství','Inactive membership')
          :tr('Bez členství','No membership')}</p>
      <p>{tr('Současné týmy: ','Current teams: ')}{account.units.map(u=>u.name).join(', ')||tr('žádné','none')}</p>
      {!canAssign&&<p className={styles.warning}><LockKeyhole size={16}/>
        {account.providerMissing
          ?tr('Původní LDAP poskytovatel již neexistuje. Týmy a role nelze měnit, dokud nebude identita obnovena.',
            'The original LDAP provider no longer exists. Restore the identity provider before changing teams or roles.')
          :closed?tr('Cvičení je uzavřené, přiřazení nelze měnit.','Exercise is closed; assignments cannot change.')
          :tr('Nejdříve znovu aktivujte uživatelský účet.','Reactivate the user account before changing assignments.')}</p>}
      <form onSubmit={e=>void saveAssignment(e)}>
        <fieldset className={styles.fields} disabled={busy||!canAssign}>
          <label className={styles.full}>{tr('Zdroj přiřazení','Assignment source')}
            <select value={mode} onChange={e=>{setMode(e.target.value as LdapTeamAssignment['mode']);setError('');}}>
              <option value="DIRECTORY">{tr('Automaticky podle LDAP skupin','Automatic from LDAP groups')}</option>
              <option value="MANUAL">{tr('Ručně vybraný tým a role','Manual team and role')}</option>
              <option value="UNASSIGNED">{tr('Bez automatického zařazení','No automatic assignment')}</option>
            </select>
          </label>
          {mode==='MANUAL'?<ExerciseTeamRoles cs={cs} catalog={catalog} hasEvent valueKey="id"
            unit={unitId} role={roleId} onUnit={setUnitId} onRole={setRoleId} retry={retry} disabled={busy||!canAssign}/>:
            <p className={styles.full}>{mode==='DIRECTORY'
              ?tr('Použijí se známé LDAP skupiny. Příští úspěšné přihlášení aktualizuje jejich stav.',
                  'Known LDAP groups apply; the next successful sign-in refreshes them.')
              :tr('Odebere se jen automatické LDAP zařazení pro toto cvičení. Ruční oprávnění zůstávají.',
                  'Only the directory-managed assignment for this exercise is removed; independent grants remain.')}</p>}
        </fieldset>
        <div className={styles.actions}>
          <button className={styles.primaryButton} type="submit" disabled={busy||!canAssign||!validManual||!changed}>
            <Check size={15}/>{busy?tr('Ukládám…','Saving…'):tr('Uložit zařazení','Save assignment')}</button>
        </div>
      </form>
    </section>:<section className={styles.detailSection}>
      <h4>{tr('Zařazení do cvičení','Exercise assignment')}</h4>
      <p>{tr('Vyberte cvičení nahoře, pokud chcete spravovat týmy a role. Stav LDAP účtu můžete spravovat i bez něj.',
        'Choose an exercise above to manage teams and roles. LDAP account status is available globally.')}</p>
    </section>}
  </article>;
}

export function LdapTeamAssignments({event,onChanged}: {event?:EventResponse;onChanged:()=>void}) {
  const {locale}=usePreferences();
  const {currentUser}=useAuth();
  const cs=locale==='cs';
  const tr=(cz:string,en:string)=>cs?cz:en;
  const [query,setQuery]=useState('');
  const [status,setStatus]=useState<StatusFilter>('ALL');
  const [page,setPage]=useState(1);
  const [unassigned,setUnassigned]=useState(false);
  const [revision,setRevision]=useState(0);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [accounts,setAccounts]=useState<LdapTeamAccount[]>([]);
  const [hasMore,setHasMore]=useState(false);
  const [selected,setSelected]=useState('');
  const [saving,setSaving]=useState(false);
  const account=accounts.find(row=>row.identityId===selected);

  useEffect(()=>{setPage(1);},[event?.id,query,status,unassigned]);

  useEffect(()=>{
    let active=true;
    setLoading(true);setError('');
    const timeout=window.setTimeout(()=>{
      void apiClient.listLdapTeamAccounts(event?.id,query.trim(),unassigned&&Boolean(event),status,page)
        .then(res=>{
          if(!active)return;
          if(!res.ok||!res.data)throw new Error(res.error||tr('Účty nelze načíst.','Could not load accounts.'));
          setAccounts(res.data.accounts);setHasMore(res.data.hasMore);
          setSelected(previous=>res.data!.accounts.some(row=>row.identityId===previous)?previous:'');
        }).catch(e=>{if(active){
          setError(e instanceof Error?e.message:'HTTP');
          setAccounts([]);setHasMore(false);setSelected('');
        }})
        .finally(()=>{if(active)setLoading(false);});
    },query.trim()?250:0);
    return ()=>{active=false;window.clearTimeout(timeout);};
  },[event?.id,query,unassigned,status,page,revision,cs]);

  function changed(message:string){
    setNotice(message);setRevision(n=>n+1);onChanged();
  }

  return <section className={styles.workspace} aria-label={tr('Správa LDAP účtů','LDAP account management')}>
    <div className={styles.workspaceHeader}>
      <div><h2>{tr('LDAP účty a přístupy','LDAP accounts & access')}</h2>
        <p>{tr('Účty přihlášené alespoň jednou přes LDAP. Správa přihlášení je oddělená od členství v cvičení.',
            'Accounts that have signed in through LDAP. Global sign-in status is separate from exercise membership.')}</p></div>
      <button className={styles.secondaryButton} type="button" disabled={saving||loading}
        onClick={()=>setRevision(n=>n+1)}><RefreshCw size={15}/>{tr('Obnovit','Refresh')}</button>
    </div>
    <div className={styles.toolbar}>
      <label className={styles.searchField}><Search size={16} aria-hidden="true"/>
        <span className={styles.visuallyHidden}>{tr('Hledat LDAP uživatele','Search LDAP users')}</span>
        <input type="search" placeholder={tr('Jméno nebo e-mail…','Name or email…')} value={query}
          disabled={saving} maxLength={160} onChange={e=>setQuery(e.target.value)}/>
      </label>
      <label>{tr('Stav účtu','Account status')}
        <select value={status} disabled={saving} onChange={e=>setStatus(e.target.value as StatusFilter)}>
          <option value="ALL">{tr('Všechny účty','All accounts')}</option>
          <option value="ACTIVE">{tr('Aktivní','Active')}</option>
          <option value="DISABLED">{tr('Deaktivované','Disabled')}</option>
        </select>
      </label>
      <label className={styles.check}><input type="checkbox" disabled={saving||!event} checked={Boolean(event)&&unassigned}
        onChange={e=>setUnassigned(e.target.checked)}/>
        {tr('Bez aktivního týmu v cvičení','Without an active team in exercise')}</label>
    </div>
    {notice&&<p className={styles.notice} role="status">{notice}</p>}
    {error&&<p className={styles.error} role="alert">{error} <button type="button" onClick={()=>setRevision(n=>n+1)}>
      {tr('Zkusit znovu','Retry')}</button></p>}
    <div className={styles.manageGrid}>
      <div className={styles.accountColumn}>
        <p className={styles.columnHeading}>{tr('Strana','Page')} {page} · {tr('Účtů','Accounts')} {loading?'…':accounts.length}
          {hasMore?' +':''}</p>
        {loading?<p className={styles.hint} role="status">{tr('Načítání LDAP účtů…','Loading LDAP accounts…')}</p>
          :accounts.length?<ul className={styles.accounts} aria-label={tr('LDAP účty','LDAP accounts')}>
            {accounts.map(row=><li key={row.identityId}>
              <button type="button" disabled={saving} aria-pressed={selected===row.identityId}
                onClick={()=>{setSelected(row.identityId);setNotice('');}}>
                <strong>{row.displayName}</strong>
                <small>{row.email}</small>
                <span className={styles.accountFlags}>
                  <span data-state={row.userStatus}>{row.userStatus==='ACTIVE'?tr('Aktivní','Active'):tr('Deaktivovaný','Disabled')}</span>
                  {row.platformAdmin&&<span>{tr('Správce','Admin')}</span>}
                  {row.membershipStatus==='ACTIVE'&&<span>{tr('V cvičení','In exercise')}</span>}
                </span>
              </button>
            </li>)}
          </ul>:!error&&<p className={styles.hint}>{tr('Žádný účet neodpovídá filtrům.','No accounts match these filters.')}</p>}
        {(page>1||hasMore)&&<div className={styles.pagination}>
          <button type="button" className={styles.secondaryButton} disabled={loading||saving||page<=1}
            onClick={()=>setPage(p=>Math.max(1,p-1))}>{tr('Předchozí','Previous')}</button>
          <span role="status">{tr('Strana','Page')} {page}</span>
          <button type="button" className={styles.secondaryButton} disabled={loading||saving||!hasMore}
            onClick={()=>setPage(p=>Math.min(1000,p+1))}>{tr('Další','Next')}</button>
        </div>
      </div>
      <div className={styles.detailColumn}>
        {account?<AccountEditor key={account.identityId+':'+account.userStatus+':'+JSON.stringify(account.assignment)}
          account={account} actorId={currentUser?.user.id??''} event={event}
          busy={saving} setBusy={setSaving} onChanged={changed}/>:
          <div className={styles.noSelection}><ShieldCheck size={30} aria-hidden="true"/>
            <h3>{tr('Vyberte účet vlevo','Select an account')}</h3>
            <p>{tr('Vyberte uživatele pro kontrolu přístupu, posledního přihlášení a změnu stavu účtu. Týmy a role se spravují v konkrétním cvičení.',
              'Select a user to inspect access, last sign-in and account state. Team and role assignments require an exercise.')}</p>
          </div>}
      </div>
    </div>
  </section>;
}
