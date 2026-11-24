'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, RefreshCw, Search, Shield, Users } from 'lucide-react';
import type { MembershipResponse } from '@cyris/contracts';
import { LdapTeamAssignments } from '@/components/admin/LdapTeamAssignments';
import { PlatformAdministrators } from '@/components/admin/PlatformAdministrators';
import { LocalTestAccounts } from '@/components/admin/LocalTestAccounts';
import { TeamPreviewAccess } from '@/components/admin/TeamPreviewAccess';
import { AppShell } from '@/components/layout/AppShell';
import { DataTable, type Column } from '@/components/common/DataTable';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/StateViews';
import { apiClient } from '@/lib/api-client';
import { filterRoster, rosterCounts, rosterStatus, type RosterStatusFilter } from '@/lib/admin-roster';
import { saveViewAs } from '@/lib/view-as';
import { useAuth } from '@/contexts/AuthContext';
import { useEvent } from '@/contexts/EventContext';
import { usePreferences } from '@/contexts/PreferencesContext';

export default function AdminUsersPage() {
  const { currentUser, isPlatformAdmin, hasPermission,viewAs } = useAuth();
  const { currentEvent, events, selectEvent, loadingEvents } = useEvent();
  const { formatDate, locale } = usePreferences();
  const cs = locale === 'cs';
  const tr = (cz: string, en: string) => cs ? cz : en;
  const [tab,setTab] = useState<'participants'|'ldap'|'admins'>('participants');
  useEffect(()=>{
    const requested=new URLSearchParams(window.location.search).get('tab');
    if(!isPlatformAdmin){setTab('participants');return;}
    if(requested==='participants'||requested==='ldap'||requested==='admins')setTab(requested);
  },[isPlatformAdmin]);
  function switchTab(next:'participants'|'ldap'|'admins') {
    setTab(next);
    const url=new URL(window.location.href);
    url.searchParams.set('tab',next);
    window.history.replaceState(null,'',url.pathname+url.search);
  }
  const [target, setTarget] = useState<MembershipResponse | null>(null);
  const [reason, setReason] = useState('');
  const [memberships, setMemberships] = useState<MembershipResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<RosterStatusFilter>('ALL');
  const [team, setTeam] = useState('ALL');
  const [revision, setRevision] = useState(0);
  const [starting, setStarting] = useState<string | null>(null);
  const [activating, setActivating] = useState<string | null>(null);
  const scopeKey = JSON.stringify([currentUser?.user.id, currentEvent?.id, isPlatformAdmin,viewAs?.id]);
  const scopeRef = useRef({ key: scopeKey, generation: 0 });
  if (scopeRef.current.key !== scopeKey) scopeRef.current = { key: scopeKey, generation: scopeRef.current.generation + 1 };
  const scope = scopeRef.current;
  const [loadedScope, setLoadedScope] = useState<typeof scope | null>(null);
  const [loadedRevision, setLoadedRevision] = useState(-1);
  const rosterReady = loadedScope === scope && loadedRevision === revision;
  const scopedMembers = rosterReady ? memberships : [];
  const operationRef = useRef<symbol | null>(null);
  const beginOperation = () => {
    if (operationRef.current) return null;
    const token = Symbol(); operationRef.current = token; return token;
  };
  const finishOperation = (token: symbol) => { if (operationRef.current === token) operationRef.current = null; };

  useEffect(() => {
    let cancelled = false;
    setTarget(null); setMemberships([]); setError(null); setActionError(null);
    setLoadedScope(null);
    if (!currentEvent||tab!=='participants'||!currentUser||viewAs) { setLoading(false); return; }
    const controller=new AbortController();
    setLoading(true);
    void apiClient.getMemberships(currentEvent.id,controller.signal).then((res) => {
      if (cancelled || scopeRef.current !== scope) return;
      if (res.ok && res.data) setMemberships(res.data.filter(member => member.eventId === currentEvent.id));
      else setError(res.error || (cs ? 'Účastníky se nepodařilo načíst.' : 'Unable to load participants.'));
    }).catch(err => {
      if (!cancelled && scopeRef.current === scope) setError(err instanceof Error ? err.message :
        (cs ? 'Seznam účastníků je nedostupný.' : 'Participant list unavailable.'));
    }).finally(() => { if (!cancelled && scopeRef.current === scope) { setLoadedScope(scope); setLoadedRevision(revision); setLoading(false); } });
    return () => { cancelled = true;controller.abort(); };
  }, [currentEvent?.id, revision, scope,tab]);
  useEffect(() => { setTeam('ALL'); setQuery(''); setStatus('ALL'); }, [scope]);

  const [commandRole, setCommandRole] = useState<{ id: string; eventId: string } | null>(null);
  const [changingRole, setChangingRole] = useState(false);
  const eventId = currentEvent?.id;
  const canManageCommand = Boolean(eventId && currentEvent?.slug !== 'cyris-team-preview' &&
    hasPermission('role.manage', eventId) && hasPermission('role.read', eventId));
  useEffect(() => {
    let active = true;
    setCommandRole(null);
    const controller=new AbortController();
    if (eventId && canManageCommand && tab==='participants'&&!viewAs) void apiClient.getRoles(eventId,controller.signal).then(response => {
      const role = response.data?.find(role => role.slug === 'exercise-command');
      if (active && scopeRef.current === scope && role) setCommandRole({ id: role.id, eventId });
    }).catch(() => { if (active && scopeRef.current === scope) setCommandRole(null); });
    return () => { active = false;controller.abort(); };
  }, [canManageCommand, eventId, scope,tab]);
  const mutationBusy = Boolean(starting || activating || changingRole);

  function commandControl(member: MembershipResponse) {
    if (!rosterReady || !canManageCommand || !commandRole || commandRole.eventId !== member.eventId || ['CLOSED','ARCHIVED'].includes(currentEvent?.status ?? '')) return null;
    const grant = member.roles.find(role => role.id === commandRole.id && !role.unitId);
    if (!grant && (!member.units.some(unit => unit.slug === 'juniorsky-krizovy-stab') ||
      member.status !== 'ACTIVE' || member.user?.status !== 'ACTIVE')) return null;
    const label = grant ? tr('Odebrat roli štábu', 'Remove command role') : tr('Pověřit řízením cvičení', 'Grant exercise command');
    async function changeRole() {
      if (mutationBusy || !commandRole || member.eventId !== eventId || scopeRef.current !== scope) return;
      const target = member.user?.displayName || member.user?.email || member.userId;
      const operation = grant
        ? tr('Odebrat roli štábu účastníkovi ', 'Revoke command role for ')
        : tr('Přidělit roli řízení cvičení účastníkovi ', 'Grant exercise command to ');
      if (!window.confirm(operation + target + ' · ' + (currentEvent?.name ?? member.eventId) + '?')) return;
      const token = beginOperation(); if (!token) return;
      setChangingRole(true);
      setActionError(null);
      try {
        const result = grant?.assignmentId ? await apiClient.revokeRole(member.eventId, grant.assignmentId) :
          await apiClient.assignRole(member.eventId, { roleId: commandRole.id, membershipId: member.id });
        if (scopeRef.current !== scope) return;
        if (result.ok) setRevision(value => value + 1);
        else setActionError(result.error || tr('Změna role se nezdařila.', 'Unable to change the role.'));
      } catch(err) {
        if (scopeRef.current === scope) setActionError(err instanceof Error ? err.message :
          tr('Změna role nebyla dokončena.', 'Role update failed.'));
      } finally { finishOperation(token); setChangingRole(false); }
    }
    return <button className="btn btn-secondary" disabled={mutationBusy || Boolean(grant && !grant.assignmentId)} onClick={changeRole}>{label}</button>;
  }

  const counts = useMemo(() => rosterCounts(scopedMembers), [scopedMembers]);
  const teams = useMemo(() => Array.from(new Map(scopedMembers.flatMap(member => member.units.map(unit => [unit.id, unit.name] as const))).entries()).sort((a,b)=>a[1].localeCompare(b[1],locale)), [scopedMembers, locale]);
  const visible = useMemo(() => filterRoster(scopedMembers, query, status, team), [scopedMembers, query, status, team]);

  const startPreview = async (member: MembershipResponse) => {
    if (!currentEvent || mutationBusy || member.eventId !== currentEvent.id || scopeRef.current !== scope || !rosterReady) return;
    const token = beginOperation(); if (!token) return;
    setStarting(member.id); setActionError(null);
    try {
      const res = await apiClient.startViewAs({ eventId: member.eventId, targetUserId: member.userId, reason: reason.trim() });
      if (scopeRef.current !== scope) return;
      if (!res.ok || !res.data) throw new Error(res.error || (cs ? 'Náhled nelze otevřít.' : 'Unable to open preview.'));
      saveViewAs(res.data);
      // Full navigation drops all previously loaded administrator data.
      window.location.assign(`/events/${currentEvent.id}/my-work`);
    } catch (err) { if (scopeRef.current === scope) setActionError(err instanceof Error ? err.message : tr('Náhled selhal.','Preview failed.')); }
    finally { finishOperation(token); setStarting(null); }
  };

  async function activate(member: MembershipResponse) {
    if (mutationBusy || member.eventId !== eventId || scopeRef.current !== scope || member.status !== 'INACTIVE' || member.user?.status !== 'ACTIVE') return;
    const target = member.user?.displayName || member.user?.email || member.userId;
    if (!window.confirm(tr(
      'Znovu aktivovat členství uživatele ' + target + ' v cvičení ' + (currentEvent?.name ?? member.eventId) + '?',
      'Reactivate ' + target + ' in exercise ' + (currentEvent?.name ?? member.eventId) + '?'))) return;
    const token = beginOperation(); if (!token) return;
    setActivating(member.id);
    setActionError(null);
    try {
      const result = await apiClient.activateMembership(member.eventId, member.id);
      if (scopeRef.current !== scope) return;
      if (result.ok) setRevision(value => value + 1);
      else setActionError(result.error || tr('Aktivace členství se nezdařila.', 'Could not activate membership.'));
    } catch(err){if (scopeRef.current === scope) setActionError(err instanceof Error?err.message:tr('Aktivace selhala.','Activation failed.'));}
    finally { finishOperation(token); setActivating(null); }
  }

  async function pauseMembership(member: MembershipResponse) {
    if(mutationBusy || member.eventId !== eventId || scopeRef.current !== scope || member.status!=='ACTIVE' || member.user?.status!=='ACTIVE')return;
    const name=member.user?.displayName||member.user?.email||member.userId;
    if(!window.confirm(cs
      ? 'Pozastavit členství uživatele '+name+' v cvičení '+(currentEvent?.name??'')+'? Účet CYRIS zůstane aktivní.'
      : 'Pause '+name+' in exercise '+(currentEvent?.name??'')+'? Their CYRIS login remains active.'))return;
    const token = beginOperation(); if (!token) return;
    setActivating(member.id);setActionError(null);
    try{
      const result=await apiClient.deactivateMembership(member.eventId,member.id);
      if (scopeRef.current !== scope) return;
      if(!result.ok)throw new Error(result.error||tr('Pozastavení členství selhalo.','Unable to pause membership.'));
      setRevision(value=>value+1);
    }catch(err){if (scopeRef.current === scope) setActionError(err instanceof Error?err.message:tr('Pozastavení selhalo.','Unable to pause membership.'));}
    finally{finishOperation(token);setActivating(null);}
  }

  const columns: Column<MembershipResponse>[] = [
    { header: cs ? 'Účastník' : 'Participant', accessor: (member) => <div className="roster-identity"><strong>{member.user?.displayName || member.user?.email || member.userId}</strong><span>{member.user?.email}</span></div> },
    { header: cs ? 'Týmy' : 'Teams', accessor: (member) => member.units.length ? <div className="roster-tags">{member.units.map((unit) => <span key={unit.id}>{unit.name}</span>)}</div> : <span className="roster-muted">{cs ? 'Bez týmu' : 'No team'}</span> },
    { header: cs ? 'Role ve cvičení' : 'Exercise roles', accessor: (member) => <div>{member.roles.length ? <div className="roster-tags">{member.roles.map((role) => <span key={`${role.id}:${role.unitId ?? ''}`}>{role.name}{role.unitId ? ` · ${member.units.find((unit) => unit.id === role.unitId)?.name ?? (cs ? 'vymezený tým' : 'scoped team')}` : ''}</span>)}</div> : <span className="roster-muted">{cs ? 'Bez přidělené role' : 'No assigned role'}</span>}{commandControl(member)}</div> },
    ...(isPlatformAdmin ? [{ header: cs ? 'Role platformy' : 'Platform roles', accessor: (member: MembershipResponse) => member.platformRoles.map(role => role.name).join(', ') || '—' }] : []),
    { header: cs ? 'Stav' : 'Status', accessor: member => <div>
      <span className={`roster-status ${rosterStatus(member) === 'ACTIVE' ? 'is-active' : ''}`}>{rosterStatus(member) === 'ACCOUNT_UNAVAILABLE' ? tr('Účet nedostupný', 'Account unavailable') : rosterStatus(member) === 'ACTIVE' ? tr('Aktivní', 'Active') : tr('Neaktivní členství', 'Inactive membership')}</span>
      {isPlatformAdmin && member.status === 'ACTIVE' && member.user?.status === 'ACTIVE' &&
        !['CLOSED', 'ARCHIVED'].includes(currentEvent?.status ?? '') &&
        <button type="button" className="btn btn-secondary" disabled={mutationBusy}
          onClick={()=>void pauseMembership(member)}>
          {activating===member.id?'…':tr('Pozastavit členství','Pause membership')}
        </button>}
      {isPlatformAdmin && member.status === 'INACTIVE' && member.user?.status === 'ACTIVE' && !['CLOSED', 'ARCHIVED'].includes(currentEvent?.status ?? '') &&
        <button type="button" className="btn btn-secondary" disabled={mutationBusy} onClick={() => void activate(member)}>
          {activating === member.id ? '…' : tr('Aktivovat členství', 'Activate membership')}
        </button>}
    </div> },
    { header: cs ? 'Přidán' : 'Joined', accessor: (member) => formatDate(member.joinedAt), sortKey: 'joinedAt' },
    ...(isPlatformAdmin ? [{ header: cs ? 'Náhled' : 'Preview', accessor: (member: MembershipResponse) => <button type="button" className="btn btn-secondary" disabled={mutationBusy || member.status !== 'ACTIVE' || member.user?.status !== 'ACTIVE' || member.platformRoles.length > 0 || member.userId === currentUser?.user.id} onClick={() => { setTarget(member); setReason(''); setActionError(null); }} title={cs ? 'Zobrazit cvičení s oprávněními účastníka, pouze pro čtení' : 'Inspect this exercise with the participant’s permissions, read only'}><Eye size={14} />{starting === member.id ? (cs ? 'Otevírám…' : 'Opening…') : (cs ? 'Zobrazit jako' : 'View as')}</button> }] : []),
  ];

  if(viewAs)return <AppShell title={tr('Uživatelé a přístupy','Users & access')}><EmptyState icon={<Shield size={28}/>} title={tr('Náhled účastníka','Participant preview')} description={tr('Správa uživatelů není v režimu náhledu dostupná. Ukončete náhled pro návrat do administrace.','User management is unavailable in participant preview. Exit preview to return to administration.')}/></AppShell>;
  return <AppShell title={cs ? 'Uživatelé a přístupy' : 'Users & access'} breadcrumbs={[{ label: 'Administration' }, { label: 'Users & Access' }]}>
    <div className="roster-page">
      <header className="access-workspace-header">
        <div><h2>{cs ? 'Správa přístupu' : 'Access management'}</h2>
          <p>{cs ? 'Oddělená správa účastníků cvičení, LDAP identit a správců platformy.'
            : 'Separate exercise memberships, LDAP identities and platform administrators.'}</p>
        </div>
      </header>
      <nav className="access-workspace-tabs" aria-label={cs ? 'Sekce správy uživatelů' : 'User management sections'}>
        <button type="button" aria-current={tab==='participants'?'page':undefined} data-active={tab==='participants'}
          onClick={()=>switchTab('participants')}>{cs?'Účastníci cvičení':'Exercise participants'}</button>
        {isPlatformAdmin&&<button type="button" aria-current={tab==='ldap'?'page':undefined} data-active={tab==='ldap'}
          onClick={()=>switchTab('ldap')}>{cs?'LDAP účty':'LDAP accounts'}</button>}
        {isPlatformAdmin&&<button type="button" aria-current={tab==='admins'?'page':undefined} data-active={tab==='admins'}
          onClick={()=>switchTab('admins')}>{cs?'Správci a náhled':'Administrators & preview'}</button>}
      </nav>
      <div className="roster-toolbar">
        <label className="roster-event-label">{cs ? 'Cvičení' : 'Exercise'}
          <select aria-label={cs ? 'Vybrat cvičení' : 'Select exercise'} value={currentEvent?.id ?? ''} onChange={(event) => selectEvent(event.target.value)} disabled={loadingEvents || mutationBusy}>
            <option value="" disabled={tab!=='ldap'}>{tab==='ldap'
              ?tr('Všechna LDAP konta (bez cvičení)','All LDAP accounts (no exercise)')
              :tr('Vyber cvičení','Select an exercise')}</option>
            {events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
          </select>
        </label>
        {tab==='participants'&&<><label className="roster-search"><Search size={16} aria-hidden="true" /><input aria-label={cs ? 'Hledat účastníka, tým nebo roli' : 'Search participant, team or role'} placeholder={cs ? 'Jméno, e-mail, tým nebo role…' : 'Name, email, team or role…'} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <select aria-label={cs ? 'Filtrovat podle stavu' : 'Filter by status'} value={status} onChange={(event) => setStatus(event.target.value as RosterStatusFilter)}>
          <option value="ALL">{cs ? 'Všechny stavy' : 'All statuses'}</option><option value="ACTIVE">{cs ? 'Aktivní' : 'Active'}</option><option value="INACTIVE">{cs ? 'Neaktivní členství' : 'Inactive membership'}</option><option value="ACCOUNT_UNAVAILABLE">{tr('Nedostupný účet','Unavailable account')}</option>
        </select>
        <select aria-label={tr('Filtrovat podle týmu','Filter by team')} value={team} onChange={e=>setTeam(e.target.value)}>
          <option value="ALL">{tr('Všechny týmy','All teams')}</option><option value="NONE">{tr('Bez týmu','No team')}</option>
          {teams.map(([id,name])=><option key={id} value={id}>{name}</option>)}
        </select>
        {(query || status !== 'ALL' || team !== 'ALL')&&<button type="button" className="btn btn-secondary" onClick={()=>{setQuery('');setStatus('ALL');setTeam('ALL');}}>{tr('Vymazat filtry','Clear filters')}</button>}
        <button type="button" className="btn btn-secondary" disabled={loading || mutationBusy || !currentEvent} onClick={() => setRevision((value) => value + 1)}><RefreshCw size={14} />{cs ? 'Obnovit' : 'Refresh'}</button></>}
      </div>
      {isPlatformAdmin && tab==='ldap' && !currentEvent && <p role="status" className="roster-caption">
        {tr('LDAP účty lze vyhledávat a aktivovat/deaktivovat i bez cvičení. Pro týmy a role zvolte cvičení výše.',
          'LDAP account status is available globally. Select an exercise above to manage teams and roles.')}
      </p>}
      {isPlatformAdmin && tab==='ldap' && <LdapTeamAssignments key={currentEvent?.id??'global'} event={currentEvent??undefined} onChanged={() => setRevision(value => value + 1)} />}
      {isPlatformAdmin && tab==='admins' && currentUser && <>
        <PlatformAdministrators actorId={currentUser.user.id} onChanged={() => setRevision(value => value + 1)}/>
        {!viewAs&&eventId&&<LocalTestAccounts key={scopeKey} eventId={eventId} eventName={currentEvent?.name??eventId} onChanged={()=>setRevision(v=>v+1)}/>}
        <TeamPreviewAccess />
      </>}
      {tab==='participants'&&<>{rosterReady && actionError && <div role="alert" className="roster-action-error">{actionError}</div>}
      {loadingEvents || !currentUser || (currentEvent && (loading || !rosterReady)) ? <LoadingState /> : !currentEvent ? <EmptyState icon={<Users size={28} />} title={cs ? 'Vyber cvičení' : 'Select an exercise'} description={cs ? 'Zobrazí se jeho účastníci, týmy a přidělené role.' : 'See its participants, teams and assigned roles.'} /> : error ? <ErrorState message={error} onRetry={() => setRevision((value) => value + 1)} /> : <>
        <div className="roster-toolbar" aria-label={tr('Přehled účastníků','Participant overview')}>
          <span>{tr('Aktivní','Active')}: <strong>{counts.active}</strong></span>
          <span>{tr('Neaktivní členství','Inactive memberships')}: <strong>{counts.inactive}</strong></span>
          <span>{tr('Nedostupné účty','Unavailable accounts')}: <strong>{counts.unavailable}</strong></span>
          <span>{tr('Bez týmu','No team')}: <strong>{counts.withoutTeam}</strong></span>
        </div>
        <p className="roster-caption">{visible.length} / {scopedMembers.length} {cs ? 'účastníků' : 'participants'} · {currentEvent.name}</p>
        <DataTable columns={columns} data={visible} keyField="id" pageSize={50} pageResetKey={JSON.stringify([scopeKey,query,status,team,revision])} emptyTitle={cs ? 'Žádní účastníci' : 'No participants'} emptyDescription={query || status !== 'ALL' || team !== 'ALL' ? (cs ? 'Zkus změnit hledání nebo filtr.' : 'Try a different search or filter.') : (cs ? 'V tomto cvičení zatím není žádný účastník.' : 'This exercise has no participants yet.')} />
      </>}</>}
    </div>
    {target&&rosterReady&&target.eventId===eventId&&tab==='participants'&&<div className="preview-dialog-backdrop" onClick={()=>{if(!starting)setTarget(null);}}><form className="preview-dialog" role="dialog" aria-modal="true" aria-labelledby="preview-title" onSubmit={e => { e.preventDefault(); void startPreview(target); }} onClick={e=>e.stopPropagation()}>
       <Shield size={23}/><h2 id="preview-title">{tr('Náhled účastníka','Participant preview')}</h2>
       <strong>{target.user?.displayName}</strong><p>{tr('Po dobu 15 minut použijete oprávnění tohoto účastníka v jediném cvičení. Změny a exporty jsou zakázané. Začátek a ukončení se zaznamenají do auditu.','For 15 minutes you will use this participant’s permissions in one exercise. Changes and exports are blocked. Start and exit are audited.')}</p>
       <label>{tr('Důvod náhledu','Reason for preview')}<textarea required minLength={3} maxLength={500} rows={3} value={reason} onChange={e=>setReason(e.target.value)}/></label>
       {actionError&&<p role="alert" className="error-text">{actionError}</p>}
       <div className="preview-dialog-actions"><button type="button" disabled={Boolean(starting)} onClick={()=>setTarget(null)}>{tr('Zrušit','Cancel')}</button><button type="submit" disabled={mutationBusy||reason.trim().length<3} className="btn btn-primary"><Eye size={16}/>{starting?'…':tr('Spustit náhled','Start preview')}</button></div>
    </form></div>}
  </AppShell>;
}
