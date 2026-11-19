'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { RecordIdentifier, StatusBadge, PriorityBadge } from '@/components/common/Badges';
import { LoadingState, EmptyState, ErrorState } from '@/components/common/StateViews';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  CheckSquare,
  Plus,
  RefreshCw,
  X,
  AlertTriangle,
  Play,
  CheckCircle,
  Clock,
  RotateCcw,
  Search,
  Filter,
  User,
  Users,
} from 'lucide-react';
import type {
  OperationalTaskItem,
  OperationalTaskDetail,
  TaskPriority,
  TaskStatus,
} from '@cyris/contracts';

export default function TasksPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const eventId = params.eventId as string;
  const { user, hasPermission } = useAuth();
  const { formatTime, formatDate, t } = usePreferences();

  const [tasks, setTasks] = useState<OperationalTaskItem[]>([]);
  const [units, setUnits] = useState<Array<{ id: string; name: string; kind?: string; parentUnitId?: string | null }>>([]);
  const [memberships, setMemberships] = useState<Array<{ userId: string; user?: { displayName: string } }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [disruptionStatus, setDisruptionStatus] = useState<{ mode: string | null; active: boolean; revision: number | null } | null>(null);

  // Filter state
  const [quickFilter, setQuickFilter] = useState<'ALL' | 'MINE' | 'MY_TEAM' | 'MY_SUBTEAM' | 'UNASSIGNED' | 'OPEN' | 'BLOCKED' | 'COMPLETED'>('ALL');
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');

  // Selected Task Drawer
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskDetail, setTaskDetail] = useState<OperationalTaskDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);

  // Modal: Action Reason (for Block / Cancel / Reopen / Complete)
  const [actionModal, setActionModal] = useState<{
    type: 'BLOCK' | 'CANCEL' | 'REOPEN' | 'COMPLETE' | null;
    note: string;
  }>({ type: null, note: '' });

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

  const canCreate = hasPermission('task.create');
  const canUpdate = hasPermission('task.update');
  const canAcknowledge = hasPermission('task.acknowledge');
  const canWork = hasPermission('task.work');
  const canComplete = hasPermission('task.complete');
  const canCancel = hasPermission('task.cancel');
  const canAssign = hasPermission('task.assign');

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

  const fetchTaskDetail = async (taskId: string) => {
    setLoadingDetail(true);
    setActionError(null);
    try {
      const res = await apiClient.getTask(eventId, taskId);
      if (res.ok && res.data) {
        setTaskDetail(res.data);
      } else {
        setActionError(res.error || 'Failed to load task details');
      }
    } catch (err: any) {
      setActionError(err.message || 'Network error');
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    let active = true;
    apiClient.getDisruptionStatus(eventId).then((response) => {
      if (active && response.ok && response.data) setDisruptionStatus(response.data);
    });
    return () => { active = false; };
  }, [eventId]);

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
    if (sourceResourceId) {
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
  }, [searchParams]);

  useEffect(() => {
    if (selectedTaskId) {
      fetchTaskDetail(selectedTaskId);
    } else {
      setTaskDetail(null);
    }
  }, [selectedTaskId]);

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

  // Task Transitions
  const handleAcknowledge = async () => {
    if (!taskDetail) return;
    setActionPending(true);
    setActionError(null);
    try {
      const res = await apiClient.acknowledgeTask(eventId, taskDetail.id);
      if (res.ok && res.data) {
        setTaskDetail(res.data);
        fetchTasks();
      } else {
        setActionError(res.error || 'Failed to acknowledge task');
      }
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionPending(false);
    }
  };

  const handleStart = async () => {
    if (!taskDetail) return;
    setActionPending(true);
    setActionError(null);
    try {
      const res = await apiClient.startTask(eventId, taskDetail.id);
      if (res.ok && res.data) {
        setTaskDetail(res.data);
        fetchTasks();
      } else {
        setActionError(res.error || 'Failed to start task');
      }
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionPending(false);
    }
  };

  const handleActionModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskDetail || !actionModal.type) return;

    setActionPending(true);
    setActionError(null);
    try {
      let res;
      if (actionModal.type === 'BLOCK') {
        if (!actionModal.note.trim()) {
          setActionError('Blocked reason is required');
          setActionPending(false);
          return;
        }
        res = await apiClient.blockTask(eventId, taskDetail.id, { reason: actionModal.note });
      } else if (actionModal.type === 'COMPLETE') {
        res = await apiClient.completeTask(eventId, taskDetail.id, { completionNote: actionModal.note });
      } else if (actionModal.type === 'CANCEL') {
        res = await apiClient.cancelTask(eventId, taskDetail.id, { reason: actionModal.note });
      } else if (actionModal.type === 'REOPEN') {
        if (!actionModal.note.trim()) {
          setActionError('Reason for reopening is required');
          setActionPending(false);
          return;
        }
        res = await apiClient.reopenTask(eventId, taskDetail.id, { reason: actionModal.note, newStatus: 'OPEN' });
      }

      if (res && res.ok && res.data) {
        setTaskDetail(res.data);
        setActionModal({ type: null, note: '' });
        fetchTasks();
      } else {
        setActionError(res?.error || 'Action failed');
      }
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionPending(false);
    }
  };

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
        fetchTasks();
        setSelectedTaskId(res.data.id);
      } else {
        setCreateError(res.error || 'Failed to create task');
      }
    } catch (err: any) {
      setCreateError(err.message);
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleAssignTask = async (assignedUnitId: string, assignedUserId: string) => {
    if (!taskDetail) return;
    setActionPending(true);
    setActionError(null);
    const res = await apiClient.assignTask(eventId, taskDetail.id, {
      assignedUnitId: assignedUnitId || null,
      assignedUserId: assignedUserId || null,
    });
    if (res.ok && res.data) {
      setTaskDetail(res.data);
      fetchTasks();
    } else {
      setActionError(res.error || 'Failed to assign task');
    }
    setActionPending(false);
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
              New Task
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {disruptionStatus?.active && disruptionStatus.mode === 'UNAVAILABLE' && (
          <div className="rounded-lg border border-orange-800 bg-orange-950/40 p-4 text-sm text-orange-100">
            <strong>Tasky jsou dočasně simulovaně nedostupné.</strong>
            <p className="mt-1 text-orange-200">Pracujte podle bezpečných pokynů Commandu; stav se obnoví po ukončení simulace.</p>
            <a className="mt-2 inline-block underline" href={`/events/${eventId}/tasks/disruption`}>Zobrazit stav a pokyny pro návrat k práci</a>
          </div>
        )}
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
              Assigned to me
            </button>
            <button
              onClick={() => setQuickFilter('MY_TEAM')}
              className={`px-3 py-1.5 rounded font-medium transition ${
                quickFilter === 'MY_TEAM'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              My Team
            </button>
            <button
              onClick={() => setQuickFilter('MY_SUBTEAM')}
              className={`px-3 py-1.5 rounded font-medium transition ${
                quickFilter === 'MY_SUBTEAM'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              My Subteam
            </button>
            <button
              onClick={() => setQuickFilter('UNASSIGNED')}
              className={`px-3 py-1.5 rounded font-medium transition ${
                quickFilter === 'UNASSIGNED'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              Unassigned
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
              <option value="LOW">Low</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
              <option value="URGENT">Urgent</option>
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
                  <th className="py-2.5 px-3 w-28">Identifier</th>
                  <th className="py-2.5 px-3">Title & Summary</th>
                  <th className="py-2.5 px-3 w-32">Source</th>
                  <th className="py-2.5 px-3 w-24">Priority</th>
                  <th className="py-2.5 px-3 w-32">Status</th>
                  <th className="py-2.5 px-3 w-40">Assigned Unit</th>
                  <th className="py-2.5 px-3 w-36">Assigned User</th>
                  <th className="py-2.5 px-3 w-36">Owning Unit</th>
                  <th className="py-2.5 px-3 w-32">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {filteredTasks.map((t) => {
                  const isSelected = selectedTaskId === t.id;
                  const isBlocked = t.status === 'BLOCKED';
                  return (
                    <tr
                      key={t.id}
                      onClick={() => setSelectedTaskId(t.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-blue-950/40 border-l-4 border-l-blue-500'
                          : isBlocked
                          ? 'bg-amber-950/10 hover:bg-amber-950/20'
                          : 'hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-300">
                        <RecordIdentifier code={t.taskNumber} />
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-200">
                        <div>{t.title}</div>
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

      {/* Task Detail Drawer */}
      {selectedTaskId && (
        <div className="fixed inset-y-0 right-0 w-96 bg-slate-900 border-l border-slate-800 shadow-2xl z-40 flex flex-col">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
            <div className="flex items-center gap-2">
              <CheckSquare size={16} className="text-blue-400" />
              <span className="font-mono font-semibold text-slate-200">
                {taskDetail?.taskNumber || 'Loading...'}
              </span>
            </div>
            <button
              onClick={() => setSelectedTaskId(null)}
              className="text-slate-400 hover:text-white p-1 rounded"
            >
              <X size={16} />
            </button>
          </div>

          <div className="p-4 flex-1 overflow-y-auto space-y-4 text-xs">
            {loadingDetail ? (
              <LoadingState message="Fetching task details..." />
            ) : taskDetail ? (
              <>
                {actionError && (
                  <div className="p-2.5 bg-red-950/50 border border-red-800 rounded text-red-300 text-xs">
                    {actionError}
                  </div>
                )}

                <div>
                  <h3 className="text-sm font-semibold text-slate-100">{taskDetail.title}</h3>
                  {taskDetail.description && (
                    <p className="mt-1 text-slate-400 whitespace-pre-wrap leading-relaxed">
                      {taskDetail.description}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 p-3 bg-slate-950/50 rounded border border-slate-800">
                  <div>
                    <div className="text-slate-500 text-[10px] uppercase font-mono">Status</div>
                    <div className="mt-1">
                      <StatusBadge status={taskDetail.status} />
                    </div>

                    {canAssign && (
                      <div className="p-3 bg-slate-950/50 rounded border border-slate-800 space-y-2">
                        <div className="text-slate-500 text-[10px] uppercase font-mono">Reassign</div>
                        <select
                          defaultValue={taskDetail.assignedUnitId || ''}
                          onChange={(e) => handleAssignTask(e.target.value, taskDetail.assignedUserId || '')}
                          className="w-full px-2 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-300"
                          disabled={actionPending}
                        >
                          <option value="">Unassigned unit</option>
                          {units.map((unit) => (
                            <option key={unit.id} value={unit.id}>
                              {unit.parentUnitId ? `${units.find((parent) => parent.id === unit.parentUnitId)?.name ?? 'Team'} → ${unit.name}` : unit.name}
                            </option>
                          ))}
                        </select>
                        <select
                          defaultValue={taskDetail.assignedUserId || ''}
                          onChange={(e) => handleAssignTask(taskDetail.assignedUnitId || '', e.target.value)}
                          className="w-full px-2 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-300"
                          disabled={actionPending}
                        >
                          <option value="">No individual assignee</option>
                          {memberships.filter((membership) => membership.user).map((membership) => (
                            <option key={membership.userId} value={membership.userId}>{membership.user?.displayName}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-slate-500 text-[10px] uppercase font-mono">Priority</div>
                    <div className="mt-1">
                      <PriorityBadge priority={taskDetail.priority} />
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-[10px] uppercase font-mono">Owning Unit</div>
                    <div className="mt-1 text-slate-300 font-mono">
                      {taskDetail.owningUnitName || '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-[10px] uppercase font-mono">Assigned Unit</div>
                    <div className="mt-1 text-slate-300 font-mono">
                      {taskDetail.assignedUnitName || '—'}
                    </div>
                  </div>
                </div>

                {taskDetail.blockedReason && (
                  <div className="p-2.5 bg-amber-950/40 border border-amber-800/60 rounded">
                    <div className="text-amber-400 font-semibold flex items-center gap-1.5 text-xs">
                      <AlertTriangle size={13} />
                      Blocked Reason
                    </div>
                    <div className="text-slate-300 mt-1">{taskDetail.blockedReason}</div>
                  </div>
                )}

                {taskDetail.completionNote && (
                  <div className="p-2.5 bg-emerald-950/40 border border-emerald-800/60 rounded">
                    <div className="text-emerald-400 font-semibold flex items-center gap-1.5 text-xs">
                      <CheckCircle size={13} />
                      Completion Note
                    </div>
                    <div className="text-slate-300 mt-1">{taskDetail.completionNote}</div>
                  </div>
                )}

                {/* Lifecycle timestamps */}
                <div className="space-y-1.5 text-slate-400 border-t border-slate-800 pt-3 text-[11px] font-mono">
                  <div>Created: {formatTime(taskDetail.createdAt)}</div>
                  {taskDetail.acknowledgedAt && (
                    <div>Acknowledged: {formatTime(taskDetail.acknowledgedAt)}</div>
                  )}
                  {taskDetail.startedAt && (
                    <div>Started: {formatTime(taskDetail.startedAt)}</div>
                  )}
                  {taskDetail.completedAt && (
                    <div>Completed: {formatTime(taskDetail.completedAt)}</div>
                  )}
                </div>

                {/* Operational Actions */}
                <div className="border-t border-slate-800 pt-3 space-y-2">
                  <div className="text-slate-400 font-semibold uppercase font-mono text-[10px]">
                    Task Actions
                  </div>

                  {taskDetail.status === 'OPEN' && canAcknowledge && (
                    <button
                      onClick={handleAcknowledge}
                      disabled={actionPending}
                      className="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                    >
                      <CheckSquare size={13} />
                      Acknowledge Task
                    </button>
                  )}

                  {['OPEN', 'ACKNOWLEDGED'].includes(taskDetail.status) && canWork && (
                    <button
                      onClick={handleStart}
                      disabled={actionPending}
                      className="w-full py-1.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                    >
                      <Play size={13} />
                      Start Work
                    </button>
                  )}

                  {['IN_PROGRESS', 'ACKNOWLEDGED'].includes(taskDetail.status) && canWork && (
                    <button
                      onClick={() => setActionModal({ type: 'BLOCK', note: '' })}
                      disabled={actionPending}
                      className="w-full py-1.5 px-3 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                    >
                      <AlertTriangle size={13} />
                      Mark as Blocked
                    </button>
                  )}

                  {taskDetail.status === 'BLOCKED' && canWork && (
                    <button
                      onClick={handleStart}
                      disabled={actionPending}
                      className="w-full py-1.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                    >
                      <Play size={13} />
                      Resume Work
                    </button>
                  )}

                  {['IN_PROGRESS', 'ACKNOWLEDGED', 'BLOCKED'].includes(taskDetail.status) && canComplete && (
                    <button
                      onClick={() => setActionModal({ type: 'COMPLETE', note: '' })}
                      disabled={actionPending}
                      className="w-full py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                    >
                      <CheckCircle size={13} />
                      Complete Task
                    </button>
                  )}

                  {taskDetail.status === 'COMPLETED' && canUpdate && (
                    <button
                      onClick={() => setActionModal({ type: 'REOPEN', note: '' })}
                      disabled={actionPending}
                      className="w-full py-1.5 px-3 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                    >
                      <RotateCcw size={13} />
                      Reopen Task
                    </button>
                  )}

                  {!['COMPLETED', 'CANCELLED'].includes(taskDetail.status) && canCancel && (
                    <button
                      onClick={() => setActionModal({ type: 'CANCEL', note: '' })}
                      disabled={actionPending}
                      className="w-full py-1.5 px-3 bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-300 border border-slate-700 rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                    >
                      <X size={13} />
                      Cancel Task
                    </button>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* Action Prompt Modal (Block, Reopen, Complete, Cancel) */}
      {actionModal.type && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleActionModalSubmit}
            className="bg-slate-900 border border-slate-700 rounded-lg max-w-md w-full p-4 shadow-xl space-y-3"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h4 className="font-semibold text-slate-100 text-sm">
                {actionModal.type === 'BLOCK' && 'Block Task'}
                {actionModal.type === 'COMPLETE' && 'Complete Task'}
                {actionModal.type === 'REOPEN' && 'Reopen Task'}
                {actionModal.type === 'CANCEL' && 'Cancel Task'}
              </h4>
              <button
                type="button"
                onClick={() => setActionModal({ type: null, note: '' })}
                className="text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                {actionModal.type === 'BLOCK' && 'Reason for Block (Required)'}
                {actionModal.type === 'COMPLETE' && 'Completion Notes (Optional)'}
                {actionModal.type === 'REOPEN' && 'Reopen Justification (Required)'}
                {actionModal.type === 'CANCEL' && 'Cancellation Reason (Optional)'}
              </label>
              <textarea
                value={actionModal.note}
                onChange={(e) => setActionModal({ ...actionModal, note: e.target.value })}
                rows={3}
                placeholder="Enter operational note..."
                className="w-full p-2 text-xs bg-slate-950 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActionModal({ type: null, note: '' })}
                className="px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 rounded transition"
              >
                Dismiss
              </button>
              <button
                type="submit"
                disabled={actionPending}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded transition"
              >
                {actionPending ? 'Submitting...' : 'Confirm'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* New Task Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleCreateTask}
            className="bg-slate-900 border border-slate-700 rounded-lg max-w-lg w-full p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-semibold text-slate-100 text-sm flex items-center gap-2">
                <CheckSquare size={16} className="text-blue-400" />
                Create Operational Task
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
                  Title <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  placeholder="e.g. Secure digital media from workstation"
                  className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Description / Brief</label>
                <textarea
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  rows={3}
                  placeholder="Operational context, expected output, safety notes..."
                  className="w-full p-2 bg-slate-950 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Priority</label>
                  <select
                    value={createForm.priority}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, priority: e.target.value as TaskPriority })
                    }
                    className="w-full px-2 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-300 focus:outline-none focus:border-blue-500"
                  >
                    <option value="LOW">LOW</option>
                    <option value="NORMAL">NORMAL</option>
                    <option value="HIGH">HIGH</option>
                    <option value="CRITICAL">CRITICAL</option>
                    <option value="URGENT">URGENT</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-300 mb-1">Due At (Optional)</label>
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
                  <label className="block font-medium text-slate-300 mb-1">Assigned to Team / Subteam</label>
                  <select
                    value={createForm.assignedUnitId || ''}
                    onChange={(e) => setCreateForm({ ...createForm, assignedUnitId: e.target.value || undefined })}
                    className="w-full px-2 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-300 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Unassigned</option>
                    {units.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.parentUnitId ? `${units.find((parent) => parent.id === unit.parentUnitId)?.name ?? 'Team'} → ${unit.name}` : unit.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Assigned to User</label>
                  <select
                    value={createForm.assignedUserId || ''}
                    onChange={(e) => setCreateForm({ ...createForm, assignedUserId: e.target.value || undefined })}
                    className="w-full px-2 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-300 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">No individual assignee</option>
                    {memberships.filter((membership) => membership.user).map((membership) => (
                      <option key={membership.userId} value={membership.userId}>{membership.user?.displayName}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Source Type</label>
                  <select
                    value={createForm.sourceType || 'MANUAL'}
                    onChange={(e) => setCreateForm({ ...createForm, sourceType: e.target.value as any })}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-blue-500"
                  >
                    <option value="MANUAL">Manual</option>
                    <option value="INCIDENT">Incident</option>
                    <option value="CASE">Case</option>
                    <option value="INJECT">Scenario Inject</option>
                    <option value="COURT_CASE">Court Case</option>
                    <option value="MEDICAL">Medical</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Source Resource</label>
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
                Cancel
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
