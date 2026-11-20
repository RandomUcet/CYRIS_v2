'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { RecordIdentifier, StatusBadge, PriorityBadge } from '@/components/common/Badges';
import { LoadingState, EmptyState, ErrorState } from '@/components/common/StateViews';
import { apiClient } from '@/lib/api-client';
import { useServiceReadOnly } from '@/hooks/useServiceStatus';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { workspaceLabel } from '@/lib/workspace-navigation';
import {
  CheckSquare,
  Plus,
  RefreshCw,
  X,
  AlertTriangle,
  Search,
  Filter,
  User,
} from 'lucide-react';
import type {
  OperationalTaskItem,
  TaskPriority,
} from '@cyris/contracts';

export default function TasksPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const eventId = params.eventId as string;
  const { user, hasPermission, viewAs } = useAuth();
  const { formatTime, formatDate, t, locale } = usePreferences();
  const tr = (label: string) => workspaceLabel(locale, label);

  const [tasks, setTasks] = useState<OperationalTaskItem[]>([]);
  const [units, setUnits] = useState<Array<{ id: string; name: string; kind?: string; parentUnitId?: string | null }>>([]);
  const [memberships, setMemberships] = useState<Array<{ userId: string; user?: { displayName: string } }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const readOnly = useServiceReadOnly('tasks');

  // Filter state
  const [quickFilter, setQuickFilter] = useState<'ALL' | 'MINE' | 'MY_TEAM' | 'MY_SUBTEAM' | 'UNASSIGNED' | 'OPEN' | 'BLOCKED' | 'COMPLETED'>('ALL');
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');

  // Modal: Create Task
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [sourceContext, setSourceContext] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<{
    title: string;
    description: string;
    priority: TaskPriority;
    owningUnitId?: string;
    assignedUnitId?: string;
    assignedUserId?: string;
    sourceType?: 'CASE' | 'INCIDENT' | 'MANUAL' | 'INJECT' | 'COURT_CASE' | 'MEDICAL';
    sourceResourceId?: string;
    dueAt?: string;
  }>({
    title: '',
    description: '',
    priority: 'NORMAL',
  });

  const canCreate = !readOnly && !viewAs && hasPermission('task.create', eventId);
  const fetchTasks = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.listTasks(eventId);
      if (res.ok && res.data) {
        setTasks(res.data);
      } else {
        setError(res.error || t('error.tasksLoad'));
      }
    } catch (err: any) {
      setError(err.message || t('error.network'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (eventId) {
      fetchTasks();
      Promise.all([apiClient.getUnits(eventId), apiClient.getMemberships(eventId)]).then(([unitRes, membershipRes]) => {
        if (unitRes.ok && unitRes.data) setUnits(unitRes.data);
        if (membershipRes.ok && membershipRes.data) setMemberships(membershipRes.data);
      });
    }
  }, [eventId]);

  useEffect(() => {
    const sourceResourceId = searchParams.get('sourceResourceId');
    if (sourceResourceId && canCreate) {
      setCreateForm((current) => ({
        ...current,
        sourceType: 'CASE',
        sourceResourceId,
      }));
      setShowCreateModal(true);
      apiClient.getCaseWorkspace(eventId, sourceResourceId).then((res) => {
        if (res.ok && res.data) {
          setSourceContext(`${res.data.case.caseNumber} — ${res.data.case.title}`);
        }
      });
    }
  }, [searchParams, canCreate, eventId]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      // Search text
      if (search) {
        const q = search.toLowerCase();
        const matches =
          t.taskNumber.toLowerCase().includes(q) ||
          t.title.toLowerCase().includes(q) ||
          (t.assignedUnitName && t.assignedUnitName.toLowerCase().includes(q)) ||
          (t.owningUnitName && t.owningUnitName.toLowerCase().includes(q));
        if (!matches) return false;
      }

      // Priority
      if (priorityFilter && t.priority !== priorityFilter) return false;

      // Quick tab filters
      if (quickFilter === 'MINE') {
        return t.assignedUserId === user?.user?.id;
      }
      if (quickFilter === 'MY_TEAM' || quickFilter === 'MY_SUBTEAM') {
        const myUnitIds = user?.memberships.flatMap((m) => m.unitIds) || [];
        const eligibleIds = quickFilter === 'MY_SUBTEAM'
          ? myUnitIds.filter((id) => units.find((unit) => unit.id === id)?.parentUnitId)
          : myUnitIds.filter((id) => !units.find((unit) => unit.id === id)?.parentUnitId);
        return Boolean(t.assignedUnitId && eligibleIds.includes(t.assignedUnitId));
      }
      if (quickFilter === 'UNASSIGNED') {
        return !t.assignedUnitId && !t.assignedUserId;
      }
      if (quickFilter === 'OPEN') {
        return ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'].includes(t.status);
      }
      if (quickFilter === 'BLOCKED') {
        return t.status === 'BLOCKED';
      }
      if (quickFilter === 'COMPLETED') {
        return t.status === 'COMPLETED';
      }

      return true;
    });
  }, [tasks, search, priorityFilter, quickFilter, user, units]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.title.trim()) {
      setCreateError('Task title is required');
      return;
    }
    setCreateSubmitting(true);
    setCreateError(null);
    try {
      const res = await apiClient.createTask(eventId, {
        title: createForm.title.trim(),
        description: createForm.description.trim() || undefined,
        priority: createForm.priority,
        visibility: 'EVENT',
        owningUnitId: createForm.owningUnitId || undefined,
        assignedUnitId: createForm.assignedUnitId || undefined,
          assignedUserId: createForm.assignedUserId || undefined,
        sourceType: createForm.sourceType || 'MANUAL',
        sourceResourceId: createForm.sourceResourceId || undefined,
        dueAt: createForm.dueAt ? new Date(createForm.dueAt).toISOString() : undefined,
      });

      if (res.ok && res.data) {
        setShowCreateModal(false);
        setCreateForm({ title: '', description: '', priority: 'NORMAL' });
        router.push(`/events/${eventId}/tasks/${res.data.id}`);
      } else {
        setCreateError(res.error || 'Failed to create task');
      }
    } catch (err: any) {
      setCreateError(err.message);
    } finally {
      setCreateSubmitting(false);
    }
  };

  return (
    <AppShell
      title="Operational Tasking"
      breadcrumbs={[{ label: 'Tasks', href: `/events/${eventId}/tasks` }]}
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={fetchTasks}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            {t('action.refresh')}
          </button>
          {canCreate && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded transition shadow-sm"
            >
              <Plus size={14} />
              {tr("New Task")}
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {/* Quick Filter Bar & Search */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
          {/* Run-sheet filter tabs */}
          <div className="flex items-center gap-1 overflow-x-auto text-xs">
            <button
              onClick={() => setQuickFilter('ALL')}
              className={`px-3 py-1.5 rounded font-medium transition ${
                quickFilter === 'ALL'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {t('tasks.all')} ({tasks.length})
            </button>
            <button
              onClick={() => setQuickFilter('MINE')}
              className={`px-3 py-1.5 rounded font-medium transition ${
                quickFilter === 'MINE'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {tr("Assigned to me")}
            </button>
            <button
              onClick={() => setQuickFilter('MY_TEAM')}
              className={`px-3 py-1.5 rounded font-medium transition ${
                quickFilter === 'MY_TEAM'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {tr("My Team")}
            </button>
            <button
              onClick={() => setQuickFilter('MY_SUBTEAM')}
              className={`px-3 py-1.5 rounded font-medium transition ${
                quickFilter === 'MY_SUBTEAM'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {tr("My Subteam")}
            </button>
            <button
              onClick={() => setQuickFilter('UNASSIGNED')}
              className={`px-3 py-1.5 rounded font-medium transition ${
                quickFilter === 'UNASSIGNED'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {tr("Unassigned")}
            </button>
            <button
              onClick={() => setQuickFilter('OPEN')}
              className={`px-3 py-1.5 rounded font-medium transition ${
                quickFilter === 'OPEN'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {t('tasks.open')}
            </button>
            <button
              onClick={() => setQuickFilter('BLOCKED')}
              className={`px-3 py-1.5 rounded font-medium transition ${
                quickFilter === 'BLOCKED'
                  ? 'bg-amber-600 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {t('status.blocked')}
            </button>
            <button
              onClick={() => setQuickFilter('COMPLETED')}
              className={`px-3 py-1.5 rounded font-medium transition ${
                quickFilter === 'COMPLETED'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {t('status.completed')}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2.5 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('tasks.searchPlaceholder')}
                className="pl-8 pr-3 py-1 text-xs bg-slate-950 border border-slate-700 rounded text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 w-48"
              />
            </div>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="px-2 py-1 text-xs bg-slate-950 border border-slate-700 rounded text-slate-300 focus:outline-none focus:border-blue-500"
            >
              <option value="">{t('tasks.allPriorities')}</option>
              <option value="LOW">{tr("Low")}</option>
              <option value="NORMAL">{tr("Normal")}</option>
              <option value="HIGH">{tr("High")}</option>
              <option value="CRITICAL">{tr("Critical")}</option>
              <option value="URGENT">{tr("Urgent")}</option>
            </select>
          </div>
        </div>

        {/* Content Area */}
        {loading ? (
          <LoadingState message={t('tasks.loading')} />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchTasks} />
        ) : filteredTasks.length === 0 ? (
          <EmptyState
            title={t('empty.tasks')}
            description={t('empty.tasks.desc')}
          />
        ) : (
          /* Operational Tasking Run-Sheet Table (No task cards!) */
          <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/70 border-b border-slate-800 text-slate-400 uppercase font-mono tracking-wider text-[11px]">
                  <th className="py-2.5 px-3 w-28">{tr("Identifier")}</th>
                  <th className="py-2.5 px-3">{tr("Title & Summary")}</th>
                  <th className="py-2.5 px-3 w-32">{tr("Source")}</th>
                  <th className="py-2.5 px-3 w-24">{tr("Priority")}</th>
                  <th className="py-2.5 px-3 w-32">{tr("Status")}</th>
                  <th className="py-2.5 px-3 w-40">{tr("Assigned Unit")}</th>
                  <th className="py-2.5 px-3 w-36">{tr("Assigned User")}</th>
                  <th className="py-2.5 px-3 w-36">{tr("Owning Unit")}</th>
                  <th className="py-2.5 px-3 w-32">{tr("Due")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {filteredTasks.map((t) => {
                  const href = `/events/${eventId}/tasks/${t.id}`;
                  const isBlocked = t.status === 'BLOCKED';
                  return (
                    <tr
                      key={t.id}
                      onClick={() => router.push(href)}
                      className={`cursor-pointer transition-colors ${
                        isBlocked
                          ? 'bg-amber-950/10 hover:bg-amber-950/20'
                          : 'hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-300">
                        <RecordIdentifier code={t.taskNumber} />
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-200">
                        <Link href={href} onClick={e => e.stopPropagation()}>{t.title}</Link>
                        {t.blockedReason && (
                          <div className="text-[11px] text-amber-400 font-normal mt-0.5 flex items-center gap-1">
                            <AlertTriangle size={11} />
                            {t.blockedReason}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">
                        {t.sourceIdentifier || t.sourceType || '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        <PriorityBadge priority={t.priority} />
                      </td>
                      <td className="py-2.5 px-3">
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 font-mono text-[11px]">
                        {t.assignedUnitName || <span className="text-slate-600">—</span>}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 text-[11px]">
                        {t.assignedUserDisplayName || <span className="text-slate-600">—</span>}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">
                        {t.owningUnitName || <span className="text-slate-600">—</span>}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">
                        {t.dueAt ? formatTime(t.dueAt) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Task Modal */}
      {canCreate && showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleCreateTask}
            className="bg-slate-900 border border-slate-700 rounded-lg max-w-lg w-full p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-semibold text-slate-100 text-sm flex items-center gap-2">
                <CheckSquare size={16} className="text-blue-400" />
                {tr("Create Operational Task")}
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            {createError && (
              <div className="p-2.5 bg-red-950/50 border border-red-800 rounded text-red-300 text-xs">
                {createError}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-300 mb-1">
                  {tr("Title")} <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  placeholder={tr("e.g. Secure digital media from workstation")}
                  className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">{tr("Description / Brief")}</label>
                <textarea
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  rows={3}
                  placeholder={tr("Operational context, expected output, safety notes...")}
                  className="w-full p-2 bg-slate-950 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">{tr("Priority")}</label>
                  <select
                    value={createForm.priority}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, priority: e.target.value as TaskPriority })
                    }
                    className="w-full px-2 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-300 focus:outline-none focus:border-blue-500"
                  >
                    <option value="LOW">{tr("LOW")}</option>
                    <option value="NORMAL">{tr("NORMAL")}</option>
                    <option value="HIGH">{tr("HIGH")}</option>
                    <option value="CRITICAL">{tr("CRITICAL")}</option>
                    <option value="URGENT">{tr("URGENT")}</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-300 mb-1">{tr("Due At (Optional)")}</label>
                  <input
                    type="datetime-local"
                    value={createForm.dueAt || ''}
                    onChange={(e) => setCreateForm({ ...createForm, dueAt: e.target.value })}
                    className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-slate-300 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">{tr("Assigned to Team / Subteam")}</label>
                  <select
                    value={createForm.assignedUnitId || ''}
                    onChange={(e) => setCreateForm({ ...createForm, assignedUnitId: e.target.value || undefined })}
                    className="w-full px-2 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-300 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">{tr("Unassigned")}</option>
                    {units.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.parentUnitId ? `${units.find((parent) => parent.id === unit.parentUnitId)?.name ?? 'Team'} → ${unit.name}` : unit.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">{tr("Assigned to User")}</label>
                  <select
                    value={createForm.assignedUserId || ''}
                    onChange={(e) => setCreateForm({ ...createForm, assignedUserId: e.target.value || undefined })}
                    className="w-full px-2 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-300 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">{tr("No individual assignee")}</option>
                    {memberships.filter((membership) => membership.user).map((membership) => (
                      <option key={membership.userId} value={membership.userId}>{membership.user?.displayName}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">{tr("Source Type")}</label>
                  <select
                    value={createForm.sourceType || 'MANUAL'}
                    onChange={(e) => setCreateForm({ ...createForm, sourceType: e.target.value as any })}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-blue-500"
                  >
                    <option value="MANUAL">{tr("Manual")}</option>
                    <option value="INCIDENT">{tr("Incident")}</option>
                    <option value="CASE">{tr("Case")}</option>
                    <option value="INJECT">{tr("Scenario Inject")}</option>
                    <option value="COURT_CASE">{tr("Court Case")}</option>
                    <option value="MEDICAL">Medical</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">{tr("Source Resource")}</label>
                  {sourceContext ? (
                    <div className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-slate-200">
                      {sourceContext}
                    </div>
                  ) : (
                    <div className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-slate-500">
                      Create from a Case or Incident to preserve its human identifier.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 rounded transition"
              >
                {tr("Cancel")}
              </button>
              <button
                type="submit"
                disabled={createSubmitting}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded transition"
              >
                {createSubmitting ? 'Creating...' : 'Create Task'}
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
