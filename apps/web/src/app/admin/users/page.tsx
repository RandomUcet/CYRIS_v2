'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Eye, RefreshCw, Search, Shield, Users } from 'lucide-react';
import type { MembershipResponse } from '@cyris/contracts';
import { TeamPreviewAccess } from '@/components/admin/TeamPreviewAccess';
import { AppShell } from '@/components/layout/AppShell';
import { DataTable, type Column } from '@/components/common/DataTable';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/StateViews';
import { apiClient } from '@/lib/api-client';
import { saveViewAs } from '@/lib/view-as';
import { useAuth } from '@/contexts/AuthContext';
import { useEvent } from '@/contexts/EventContext';
import { usePreferences } from '@/contexts/PreferencesContext';

export default function AdminUsersPage() {
  const { currentUser, isPlatformAdmin, hasPermission } = useAuth();
  const { currentEvent, events, selectEvent, loadingEvents } = useEvent();
  const { formatDate, locale } = usePreferences();
  const cs = locale === 'cs';
  const tr = (cz: string, en: string) => cs ? cz : en;
  const [target, setTarget] = useState<MembershipResponse | null>(null);
  const [reason, setReason] = useState('');
  const [memberships, setMemberships] = useState<MembershipResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [revision, setRevision] = useState(0);
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTarget(null); setMemberships([]); setError(null); setActionError(null);
    if (!currentEvent) { setLoading(false); return; }
    setLoading(true);
    void apiClient.getMemberships(currentEvent.id).then((res) => {
      if (cancelled) return;
      if (res.ok && res.data) setMemberships(res.data);
      else setError(res.error || (cs ? 'Účastníky se nepodařilo načíst.' : 'Unable to load participants.'));
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [currentEvent?.id, revision]);

  const [commandRole, setCommandRole] = useState<{ id: string; eventId: string } | null>(null);
  const [changingRole, setChangingRole] = useState(false);
  const eventId = currentEvent?.id;
  const canManageCommand = Boolean(eventId && currentEvent?.slug !== 'cyris-team-preview' &&
    hasPermission('role.manage', eventId) && hasPermission('role.read', eventId));
  useEffect(() => {
    let active = true;
    setCommandRole(null);
    if (eventId && canManageCommand) void apiClient.getRoles(eventId).then(response => {
      const role = response.data?.find(role => role.slug === 'exercise-command');
      if (active && role) setCommandRole({ id: role.id, eventId });
    });
    return () => { active = false; };
  }, [canManageCommand, eventId]);

  function commandControl(member: MembershipResponse) {
    if (!canManageCommand || !commandRole || commandRole.eventId !== member.eventId) return null;
    const grant = member.roles.find(role => role.id === commandRole.id && !role.unitId);
    if (!grant && (!member.units.some(unit => unit.slug === 'juniorsky-krizovy-stab') ||
      member.status !== 'ACTIVE' || member.user?.status !== 'ACTIVE')) return null;
    const label = grant ? tr('Odebrat roli štábu', 'Remove command role') : tr('Pověřit řízením cvičení', 'Grant exercise command');
    async function changeRole() {
      if (changingRole || !commandRole) return;
      setChangingRole(true);
      setActionError(null);
      try {
        const result = grant?.assignmentId ? await apiClient.revokeRole(member.eventId, grant.assignmentId) :
          await apiClient.assignRole(member.eventId, { roleId: commandRole.id, membershipId: member.id });
        if (result.ok) setRevision(value => value + 1);
        else setActionError(result.error || tr('Změna role se nezdařila.', 'Unable to change the role.'));
      } finally { setChangingRole(false); }
    }
    return <button className="btn btn-secondary" disabled={changingRole || Boolean(grant && !grant.assignmentId)} onClick={changeRole}>{label}</button>;
  }

  const visible = useMemo(() => {
    const text = query.trim().toLocaleLowerCase();
    return memberships.filter((member) => {
      const active = member.status === 'ACTIVE' && member.user?.status === 'ACTIVE';
      if (status === 'ACTIVE' && !active) return false;
      if (status === 'INACTIVE' && active) return false;
      return !text || [member.user?.displayName, member.user?.email, ...member.units.map((unit) => unit.name), ...member.roles.map((role) => role.name)]
        .join(' ').toLocaleLowerCase().includes(text);
    });
  }, [memberships, query, status]);

  const startPreview = async (member: MembershipResponse) => {
    if (!currentEvent || starting) return;
    setStarting(member.id); setActionError(null);
    try {
      const res = await apiClient.startViewAs({ eventId: currentEvent.id, targetUserId: member.userId, reason: reason.trim() });
      if (!res.ok || !res.data) throw new Error(res.error || (cs ? 'Náhled nelze otevřít.' : 'Unable to open preview.'));
      saveViewAs(res.data);
      // Full navigation drops all previously loaded administrator data.
      window.location.assign(`/events/${currentEvent.id}/my-work`);
    } catch (err) { setActionError((err as Error).message); setStarting(null); }
  };

  const columns: Column<MembershipResponse>[] = [
    { header: cs ? 'Účastník' : 'Participant', accessor: (member) => <div className="roster-identity"><strong>{member.user?.displayName || member.user?.email || member.userId}</strong><span>{member.user?.email}</span></div> },
    { header: cs ? 'Týmy' : 'Teams', accessor: (member) => member.units.length ? <div className="roster-tags">{member.units.map((unit) => <span key={unit.id}>{unit.name}</span>)}</div> : <span className="roster-muted">{cs ? 'Bez týmu' : 'No team'}</span> },
    { header: cs ? 'Role ve cvičení' : 'Exercise roles', accessor: (member) => <div>{member.roles.length ? <div className="roster-tags">{member.roles.map((role) => <span key={`${role.id}:${role.unitId ?? ''}`}>{role.name}{role.unitId ? ` · ${member.units.find((unit) => unit.id === role.unitId)?.name ?? (cs ? 'vymezený tým' : 'scoped team')}` : ''}</span>)}</div> : <span className="roster-muted">{cs ? 'Bez přidělené role' : 'No assigned role'}</span>}{commandControl(member)}</div> },
    ...(isPlatformAdmin ? [{ header: cs ? 'Role platformy' : 'Platform roles', accessor: (member: MembershipResponse) => member.platformRoles.map(role => role.name).join(', ') || '—' }] : []),
    { header: cs ? 'Stav' : 'Status', accessor: (member) => <span className={`roster-status ${member.status === 'ACTIVE' && member.user?.status === 'ACTIVE' ? 'is-active' : ''}`}>{member.user?.status === 'DISABLED' ? (cs ? 'Účet zakázán' : 'Account disabled') : member.status === 'ACTIVE' ? (cs ? 'Aktivní' : 'Active') : (cs ? 'Neaktivní členství' : 'Inactive membership')}</span> },
    { header: cs ? 'Přidán' : 'Joined', accessor: (member) => formatDate(member.joinedAt), sortKey: 'joinedAt' },
    ...(isPlatformAdmin ? [{ header: cs ? 'Náhled' : 'Preview', accessor: (member: MembershipResponse) => <button type="button" className="btn btn-secondary" disabled={Boolean(starting) || member.status !== 'ACTIVE' || member.user?.status !== 'ACTIVE' || member.platformRoles.length > 0 || member.userId === currentUser?.user.id} onClick={() => { setTarget(member); setReason(''); setActionError(null); }} title={cs ? 'Zobrazit cvičení s oprávněními účastníka, pouze pro čtení' : 'Inspect this exercise with the participant’s permissions, read only'}><Eye size={14} />{starting === member.id ? (cs ? 'Otevírám…' : 'Opening…') : (cs ? 'Zobrazit jako' : 'View as')}</button> }] : []),
  ];

  return <AppShell title={cs ? 'Uživatelé a přístupy' : 'Users & access'} breadcrumbs={[{ label: 'Administration' }, { label: 'Users & Access' }]}>
    <div className="roster-page">
      {isPlatformAdmin && <TeamPreviewAccess />}
      <div className="roster-toolbar">
        <label className="roster-event-label">{cs ? 'Cvičení' : 'Exercise'}
          <select aria-label={cs ? 'Vybrat cvičení' : 'Select exercise'} value={currentEvent?.id ?? ''} onChange={(event) => selectEvent(event.target.value)} disabled={loadingEvents || Boolean(starting)}>
            <option value="" disabled>{cs ? 'Vyber cvičení' : 'Select an exercise'}</option>
            {events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
          </select>
        </label>
        <label className="roster-search"><Search size={16} aria-hidden="true" /><input aria-label={cs ? 'Hledat účastníka, tým nebo roli' : 'Search participant, team or role'} placeholder={cs ? 'Jméno, e-mail, tým nebo role…' : 'Name, email, team or role…'} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <select aria-label={cs ? 'Filtrovat podle stavu' : 'Filter by status'} value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="ALL">{cs ? 'Všechny stavy' : 'All statuses'}</option><option value="ACTIVE">{cs ? 'Aktivní' : 'Active'}</option><option value="INACTIVE">{cs ? 'Neaktivní' : 'Inactive'}</option>
        </select>
        <button type="button" className="btn btn-secondary" disabled={loading || !currentEvent} onClick={() => setRevision((value) => value + 1)}><RefreshCw size={14} />{cs ? 'Obnovit' : 'Refresh'}</button>
      </div>
      {actionError && <div role="alert" className="roster-action-error">{actionError}</div>}
      {loading || loadingEvents ? <LoadingState /> : !currentEvent ? <EmptyState icon={<Users size={28} />} title={cs ? 'Vyber cvičení' : 'Select an exercise'} description={cs ? 'Zobrazí se jeho účastníci, týmy a přidělené role.' : 'See its participants, teams and assigned roles.'} /> : error ? <ErrorState message={error} onRetry={() => setRevision((value) => value + 1)} /> : <>
        <p className="roster-caption">{visible.length} / {memberships.length} {cs ? 'účastníků' : 'participants'} · {currentEvent.name}</p>
        <DataTable columns={columns} data={visible} keyField="id" emptyTitle={cs ? 'Žádní účastníci' : 'No participants'} emptyDescription={query || status !== 'ALL' ? (cs ? 'Zkus změnit hledání nebo filtr.' : 'Try a different search or filter.') : (cs ? 'V tomto cvičení zatím není žádný účastník.' : 'This exercise has no participants yet.')} />
      </>}
    </div>
    {target&&<div className="preview-dialog-backdrop" onClick={()=>{if(!starting)setTarget(null);}}><form className="preview-dialog" role="dialog" aria-modal="true" aria-labelledby="preview-title" onSubmit={e => { e.preventDefault(); void startPreview(target); }} onClick={e=>e.stopPropagation()}>
       <Shield size={23}/><h2 id="preview-title">{tr('Náhled účastníka','Participant preview')}</h2>
       <strong>{target.user?.displayName}</strong><p>{tr('Po dobu 15 minut použijete oprávnění tohoto účastníka v jediném cvičení. Změny a exporty jsou zakázané. Začátek a ukončení se zaznamenají do auditu.','For 15 minutes you will use this participant’s permissions in one exercise. Changes and exports are blocked. Start and exit are audited.')}</p>
       <label>{tr('Důvod náhledu','Reason for preview')}<textarea required minLength={3} maxLength={500} rows={3} value={reason} onChange={e=>setReason(e.target.value)}/></label>
       {actionError&&<p role="alert" className="error-text">{actionError}</p>}
       <div className="preview-dialog-actions"><button type="button" disabled={Boolean(starting)} onClick={()=>setTarget(null)}>{tr('Zrušit','Cancel')}</button><button type="submit" disabled={Boolean(starting)||reason.trim().length<3} className="btn btn-primary"><Eye size={16}/>{starting?'…':tr('Spustit náhled','Start preview')}</button></div>
    </form></div>}
  </AppShell>;
}
