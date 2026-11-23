'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { useDialogAccessibility } from '@/hooks/useDialogAccessibility';
import { DataTable, Column } from '@/components/common/DataTable';
import { StatusBadge } from '@/components/common/Badges';
import { LoadingState, EmptyState, ErrorState } from '@/components/common/StateViews';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { useEvent } from '@/contexts/EventContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  Calendar,
  Plus,
  RefreshCw,
  X,
  Copy,
  Archive,
  ArrowRight,
  Edit2,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Globe,
  Clock,
  Building2,
  BarChart3,
  Radio,
  Shield,
} from 'lucide-react';
import { CAPABILITY_CATALOG } from '@cyris/contracts';
import { COMMON_TIMEZONES, SUPPORTED_LOCALES } from '@/lib/i18n';

function EventTemplateAction({ eventId, onApplied }: { eventId: string; onApplied: () => void }) {
  const { locale } = usePreferences();
  const cs = locale === 'cs';
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const initialize = async () => {
    setSaving(true);
    setMessage('');
    setFailed(false);
    try {
      const response = await apiClient.initializeTeamTemplates(eventId);
      if (!response.ok || !response.data) throw new Error(response.error);
      const { rolesCreated, unitsCreated } = response.data;
      setMessage(rolesCreated || unitsCreated
        ? (cs ? `Přidáno · týmy +${unitsCreated}, role +${rolesCreated}` : `Added · teams +${unitsCreated}, roles +${rolesCreated}`)
        : (cs ? 'Všechny týmy a role už jsou připravené.' : 'All teams and roles are already in place.'));
      if (unitsCreated) onApplied();
    } catch (err) {
      setFailed(true);
      setMessage((err instanceof Error && err.message) || (cs ? 'Týmy a role se nepodařilo doplnit.' : 'Unable to add the exercise teams and roles.'));
    } finally {
      setSaving(false);
    }
  };
  return <div style={{ marginBottom: '12px' }}>
    <button type="button" className="btn btn-secondary" disabled={saving} onClick={initialize}>
      {saving ? (cs ? 'Doplňuji…' : 'Adding…') : (cs ? 'Doplnit týmy a role' : 'Add missing teams and roles')}
    </button>
    {message && <p role={failed ? 'alert' : 'status'}>{message}</p>}
  </div>;
}

interface EventItem {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  status: 'DRAFT' | 'PREPARATION' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED' | string;
  defaultLocale: string;
  defaultTimezone: string;
  startsAt?: string | null;
  endsAt?: string | null;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

const LIFECYCLE_OPTIONS: Array<{ value: string; label: string; description: string }> = [
  { value: 'DRAFT', label: 'Draft', description: 'Early planning phase. Not visible to regular participants.' },
  { value: 'PREPARATION', label: 'Preparation', description: 'Fully administrable structure & injects. Excluded from active operations.' },
  { value: 'ACTIVE', label: 'Active', description: 'Live exercise operation. Visible and accessible to authorized participants.' },
  { value: 'CLOSED', label: 'Closed', description: 'Operational exercise concluded. Read-mostly evaluation & reporting.' },
  { value: 'ARCHIVED', label: 'Archived', description: 'Historical record. Preserved for after-action review.' },
];

export default function AdminEventsPage() {
  const router = useRouter();
  const { hasPermission, isPlatformAdmin } = useAuth();
  const { selectEvent, currentEvent } = useEvent();
  const { formatDate, formatTime, t, locale } = usePreferences();
  const cs = locale === 'cs';

  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    name: '',
    slug: '',
    description: '',
    status: 'PREPARATION',
    defaultLocale: 'cs',
    defaultTimezone: 'Europe/Prague',
    startsAt: '',
    endsAt: '',
  });

  // Edit Modal
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    status: '',
    defaultLocale: 'cs',
    defaultTimezone: 'Europe/Prague',
    startsAt: '',
    endsAt: '',
  });

  // Duplicate Modal
  const [duplicatingEvent, setDuplicatingEvent] = useState<EventItem | null>(null);
  const [dupSubmitting, setDupSubmitting] = useState(false);
  const [dupError, setDupError] = useState<string | null>(null);
  const [dupForm, setDupForm] = useState({
    name: '',
    slug: '',
    description: '',
    startsAt: '',
    endsAt: '',
  });

  // Quick Units & Capabilities Modal
  const [inspectingEvent, setInspectingEvent] = useState<EventItem | null>(null);
  const [eventUnits, setEventUnits] = useState<any[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [unitsError, setUnitsError] = useState('');
  const [unitsRevision, setUnitsRevision] = useState(0);
  const [editingUnitCaps, setEditingUnitCaps] = useState<any | null>(null);
  const [selectedCaps, setSelectedCaps] = useState<string[]>([]);
  const [savingCaps, setSavingCaps] = useState(false);
  useDialogAccessibility(showCreateModal || Boolean(editingEvent) || Boolean(duplicatingEvent) || Boolean(inspectingEvent), () => { if (!createSubmitting && !editSubmitting && !dupSubmitting && !savingCaps) { setShowCreateModal(false); setEditingEvent(null); setDuplicatingEvent(null); setInspectingEvent(null); } });

  const canManage = hasPermission('event.create') || hasPermission('platform.manage');

  const fetchEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getEvents();
      if (res.ok && res.data) {
        setEvents(res.data as EventItem[]);
      } else {
        setError('Failed to load exercise editions');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchEvents();
  }, []);

  // Handle Create Event
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name.trim() || !createForm.slug.trim()) {
      setCreateError('Name and slug are required');
      return;
    }

    setCreateSubmitting(true);
    setCreateError(null);
    try {
      const res = await apiClient.createEvent({
        name: createForm.name.trim(),
        slug: createForm.slug.trim().toLowerCase(),
        description: createForm.description.trim() || undefined,
        status: createForm.status,
        defaultLocale: createForm.defaultLocale,
        defaultTimezone: createForm.defaultTimezone,
        startsAt: createForm.startsAt ? new Date(createForm.startsAt).toISOString() : undefined,
        endsAt: createForm.endsAt ? new Date(createForm.endsAt).toISOString() : undefined,
      });

      if (res.ok) {
        setShowCreateModal(false);
        setCreateForm({
          name: '',
          slug: '',
          description: '',
          status: 'PREPARATION',
          defaultLocale: 'cs',
          defaultTimezone: 'Europe/Prague',
          startsAt: '',
          endsAt: '',
        });
        void fetchEvents();
      } else {
        setCreateError(res.error || 'Failed to create event');
      }
    } catch (err: any) {
      setCreateError(err.message);
    } finally {
      setCreateSubmitting(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (event: EventItem) => {
    setEditingEvent(event);
    setEditError(null);
    setEditForm({
      name: event.name,
      description: event.description || '',
      status: event.status,
      defaultLocale: event.defaultLocale || 'cs',
      defaultTimezone: event.defaultTimezone || 'Europe/Prague',
      startsAt: event.startsAt ? event.startsAt.slice(0, 16) : '',
      endsAt: event.endsAt ? event.endsAt.slice(0, 16) : '',
    });
  };

  // Handle Update Event
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvent) return;

    setEditSubmitting(true);
    setEditError(null);
    try {
      const res = await apiClient.updateEvent(editingEvent.id, {
        name: editForm.name.trim(),
        description: editForm.description.trim() || null,
        status: editForm.status,
        defaultLocale: editForm.defaultLocale,
        defaultTimezone: editForm.defaultTimezone,
        startsAt: editForm.startsAt ? new Date(editForm.startsAt).toISOString() : null,
        endsAt: editForm.endsAt ? new Date(editForm.endsAt).toISOString() : null,
      });

      if (res.ok) {
        setEditingEvent(null);
        void fetchEvents();
      } else {
        setEditError(res.error || 'Failed to update event');
      }
    } catch (err: any) {
      setEditError(err.message);
    } finally {
      setEditSubmitting(false);
    }
  };

  // Open Duplicate Modal
  const openDuplicateModal = (event: EventItem) => {
    setDuplicatingEvent(event);
    setDupError(null);
    const yearMatch = event.name.match(/\d{4}/);
    let nextName = `${event.name} (Copy)`;
    let nextSlug = `${event.slug}-copy`;
    if (yearMatch) {
      const currentYear = parseInt(yearMatch[0], 10);
      const nextYear = currentYear + 1;
      nextName = event.name.replace(yearMatch[0], String(nextYear));
      nextSlug = event.slug.replace(yearMatch[0], String(nextYear));
    }
    setDupForm({
      name: nextName,
      slug: nextSlug,
      description: event.description || '',
      startsAt: '',
      endsAt: '',
    });
  };

  // Handle Duplicate Event
  const handleDuplicate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!duplicatingEvent) return;

    setDupSubmitting(true);
    setDupError(null);
    try {
      const res = await apiClient.duplicateEvent(duplicatingEvent.id, {
        name: dupForm.name.trim(),
        slug: dupForm.slug.trim().toLowerCase(),
        description: dupForm.description.trim() || undefined,
        startsAt: dupForm.startsAt ? new Date(dupForm.startsAt).toISOString() : undefined,
        endsAt: dupForm.endsAt ? new Date(dupForm.endsAt).toISOString() : undefined,
      });

      if (res.ok) {
        setDuplicatingEvent(null);
        void fetchEvents();
      } else {
        setDupError(res.error || 'Failed to duplicate event');
      }
    } catch (err: any) {
      setDupError(err.message);
    } finally {
      setDupSubmitting(false);
    }
  };

  // Handle Archive Event
  const handleArchive = async (event: EventItem) => {
    if (!window.confirm(`Are you sure you want to archive "${event.name}"? The event will transition to read-only historical status.`)) {
      return;
    }
    try {
      const res = await apiClient.archiveEvent(event.id);
      if (res.ok) {
        void fetchEvents();
      } else {
        alert(res.error || 'Failed to archive event');
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Handle Enter Event Context
  const handleEnterEvent = (event: EventItem) => {
    selectEvent(event.id);
    router.push(`/events/${event.id}/overview`);
  };

  // Open Units & Capabilities Inspector
  const openUnitsInspector = (event: EventItem) => {
    setInspectingEvent(event);
    setEventUnits([]);
    setUnitsLoading(true);
    setUnitsError('');
    setEditingUnitCaps(null);
  };
  const inspectedId = inspectingEvent?.id;
  useEffect(() => {
    if (!inspectedId) return;
    let current = true;
    setUnitsError('');
    setUnitsLoading(true);
    apiClient.getEventUnits(inspectedId).then(result => {
      if (!current) return;
      if (result.ok && result.data) setEventUnits(result.data);
      else setUnitsError(result.error || (cs ? 'Týmy se nepodařilo načíst.' : 'Unable to load teams.'));
    }).catch(() => {
      if (current) setUnitsError(cs ? 'Týmy se nepodařilo načíst.' : 'Unable to load teams.');
    }).finally(() => { if (current) setUnitsLoading(false); });
    return () => { current = false; };
  }, [inspectedId, unitsRevision, cs]);

  // Open unit capability configuration
  const openUnitCapsEditor = async (unit: any) => {
    setEditingUnitCaps(unit);
    try {
      const res = await apiClient.getUnitCapabilities(inspectingEvent!.id, unit.id);
      if (res.ok && res.data) {
        setSelectedCaps(res.data.map((c: any) => c.capabilityKey));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Save unit capabilities
  const handleSaveUnitCaps = async () => {
    if (!inspectingEvent || !editingUnitCaps) return;
    setSavingCaps(true);
    try {
      const res = await apiClient.setUnitCapabilities(inspectingEvent.id, editingUnitCaps.id, selectedCaps);
      if (res.ok) {
        // Refresh units list
        const updatedUnits = await apiClient.getEventUnits(inspectingEvent.id);
        if (updatedUnits.ok && updatedUnits.data) {
          setEventUnits(updatedUnits.data);
        }
        setEditingUnitCaps(null);
      } else {
        alert(res.error || 'Failed to save capabilities');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingCaps(false);
    }
  };

  const columns: Column<EventItem>[] = [
    {
      header: t('field.slug'),
      accessor: (item) => (
        <div>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.slug}</span>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)' }}>
            {item.id}
          </div>
        </div>
      ),
      sortKey: 'slug',
      width: '180px',
    },
    {
      header: t('field.name'),
      accessor: (item) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {item.name}
            {currentEvent?.id === item.id && (
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 700,
                  padding: '1px 5px',
                  borderRadius: 'var(--radius-xs)',
                  background: 'var(--accent-subtle)',
                  color: 'var(--accent-active)',
                  border: '1px solid var(--accent-primary)',
                }}
              >
                CURRENT ACTIVE CONTEXT
              </span>
            )}
          </div>
          {item.description && (
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{item.description}</div>
          )}
        </div>
      ),
      sortKey: 'name',
    },
    {
      header: t('field.status'),
      accessor: (item) => <StatusBadge status={item.status} />,
      sortKey: 'status',
      width: '120px',
    },
    {
      header: t('field.localeTimezone'),
      accessor: (item) => (
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Globe size={11} color="var(--text-muted)" />
            <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>{item.defaultLocale}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
            <Clock size={11} color="var(--text-muted)" />
            <span>{item.defaultTimezone}</span>
          </div>
        </div>
      ),
      width: '160px',
    },
    {
      header: t('field.schedule'),
      accessor: (item) => (
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
          {item.startsAt ? (
            <div>
              <span>{formatDate(item.startsAt)}</span>
              {item.endsAt && (
                <span style={{ color: 'var(--text-muted)' }}> → {formatDate(item.endsAt)}</span>
              )}
            </div>
          ) : (
            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{t('empty.unscheduled')}</span>
          )}
        </div>
      ),
      width: '180px',
    },
    {
      header: t('field.actions'),
      accessor: (item) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            onClick={() => handleEnterEvent(item)}
            className="btn btn-secondary"
            title="Enter exercise operational context"
            style={{ fontSize: '11px', padding: '3px 8px' }}
          >
            <ArrowRight size={12} color="var(--accent-active)" />
            {t('action.enter')}
          </button>
          {(isPlatformAdmin || hasPermission('scenario.manage', item.id)) && item.status !== 'CLOSED' && item.status !== 'ARCHIVED' && <button className="btn btn-secondary"
            title={cs?'Poslat zprávu účastníkům cvičení':'Send an exercise broadcast'}
            onClick={() => router.push('/events/' + item.id + '/broadcast')}
            style={{fontSize:'11px',padding:'3px 7px'}}>
            <Radio size={12}/> {cs?'Zprávy':'Broadcast'}
          </button>}
          {isPlatformAdmin && <button className="btn btn-secondary"
            title={cs?'Statistiky, závěrečný report a náhled promazání':'Statistics, after-action report and cleanup preview'}
            onClick={() => router.push('/admin/events/' + item.id + '/report')}
            style={{fontSize:'11px',padding:'3px 7px'}}>
            <BarChart3 size={12}/> {cs?'Report':'Report'}
          </button>}
          {canManage && (
            <>
              <button
                onClick={() => openEditModal(item)}
                className="btn btn-secondary"
                title="Edit event metadata & lifecycle"
                style={{ fontSize: '11px', padding: '3px 7px' }}
              >
                <Edit2 size={12} />
              </button>
              <button
                onClick={() => openUnitsInspector(item)}
                className="btn btn-secondary"
                title={cs ? 'Nastavit týmy cvičení' : 'Configure exercise teams'}
                style={{ fontSize: '11px', padding: '3px 7px' }}
              >
                <Building2 size={12} />
                {cs ? 'Týmy' : 'Teams'}
              </button>
              <button
                onClick={() => openDuplicateModal(item)}
                className="btn btn-secondary"
                title="Duplicate edition as starting template"
                style={{ fontSize: '11px', padding: '3px 7px' }}
              >
                <Copy size={12} />
              </button>
              {item.status !== 'ARCHIVED' && (
                <button
                  onClick={() => handleArchive(item)}
                  className="btn btn-ghost"
                  title="Archive event"
                  style={{ fontSize: '11px', padding: '3px 6px', color: 'var(--text-muted)' }}
                >
                  <Archive size={12} />
                </button>
              )}
            </>
          )}
        </div>
      ),
      width: '210px',
    },
  ];

  return (
    <AppShell
      breadcrumbs={[
        { label: 'Administration', href: '/admin/events' },
        { label: t('page.events.title') },
      ]}
    >
      <div style={{ padding: '20px 24px' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
            borderBottom: '1px solid var(--border-default)',
            paddingBottom: '16px',
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: '18px',
                fontWeight: 700,
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                letterSpacing: '-0.01em',
              }}
            >
              <Calendar size={18} color="var(--accent-primary)" />
              {t('page.events.title')}
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
              {t('page.events.subtitle')}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={fetchEvents}
              className="btn btn-secondary"
              title="Refresh event list"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
              {t('action.refresh')}
            </button>
            {canManage && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Plus size={15} />
                {t('action.create')} {t('nav.events')}
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <LoadingState message="Loading exercise editions..." />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchEvents} />
        ) : events.length === 0 ? (
          <EmptyState
            title="No exercise editions registered"
            description="CYRIS is operating on a clean system baseline. Create the first exercise edition to begin operations."
            actionLabel={canManage ? `${t('action.create')} ${t('nav.events')}` : undefined}
            onAction={canManage ? () => setShowCreateModal(true) : undefined}
          />
        ) : (
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            <DataTable
              columns={columns}
              data={events}
              keyExtractor={(item) => item.id}
            />
          </div>
        )}

        {/* Modal: Create Event */}
        {showCreateModal && (
          <div className="dialog-overlay dialog-overlay-top" role="presentation">
            <div className="dialog-surface form-dialog-surface" role="dialog" aria-modal="true" aria-label="Create exercise" style={{ maxWidth: '540px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 18px',
                  background: 'var(--bg-panel)',
                  borderBottom: '1px solid var(--border-default)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={16} color="var(--accent-primary)" />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Register New Exercise Edition
                  </span>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleCreate} style={{ padding: '18px' }}>
                {createError && (
                  <div
                    style={{
                      padding: '8px 12px',
                      marginBottom: '14px',
                      background: 'var(--status-danger-bg)',
                      border: '1px solid var(--status-danger)',
                      borderRadius: 'var(--radius-xs)',
                      fontSize: '12px',
                      color: 'var(--status-danger)',
                    }}
                  >
                    {createError}
                  </div>
                )}

                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Edition Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Český Cybertron 2029"
                    value={createForm.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                      setCreateForm({ ...createForm, name, slug: createForm.slug || slug });
                    }}
                    style={{ width: '100%' }}
                    autoFocus
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Slug Identifier *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. czech-cybertron-2029"
                      value={createForm.slug}
                      onChange={(e) => setCreateForm({ ...createForm, slug: e.target.value })}
                      style={{ width: '100%', fontFamily: 'var(--font-mono)' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Initial Lifecycle Status
                    </label>
                    <select
                      value={createForm.status}
                      onChange={(e) => setCreateForm({ ...createForm, status: e.target.value })}
                      style={{ width: '100%' }}
                    >
                      <option value="DRAFT">Draft</option>
                      <option value="PREPARATION">Preparation</option>
                      <option value="ACTIVE">Active</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Default Locale
                    </label>
                    <select
                      value={createForm.defaultLocale}
                      onChange={(e) => setCreateForm({ ...createForm, defaultLocale: e.target.value })}
                      style={{ width: '100%' }}
                    >
                      {SUPPORTED_LOCALES.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.flag} {l.name} ({l.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Default Timezone
                    </label>
                    <select
                      value={createForm.defaultTimezone}
                      onChange={(e) => setCreateForm({ ...createForm, defaultTimezone: e.target.value })}
                      style={{ width: '100%' }}
                    >
                      {COMMON_TIMEZONES.map((tz) => (
                        <option key={tz.value} value={tz.value}>
                          {tz.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Exercise Starts At
                    </label>
                    <input
                      type="datetime-local"
                      value={createForm.startsAt}
                      onChange={(e) => setCreateForm({ ...createForm, startsAt: e.target.value })}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Exercise Ends At
                    </label>
                    <input
                      type="datetime-local"
                      value={createForm.endsAt}
                      onChange={(e) => setCreateForm({ ...createForm, endsAt: e.target.value })}
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Description
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Edition scope, participating agencies, exercise objectives..."
                    value={createForm.description}
                    onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                    style={{ width: '100%', resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="btn btn-secondary"
                    disabled={createSubmitting}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={createSubmitting}>
                    {createSubmitting ? 'Creating...' : 'Create Edition'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Edit Event & Lifecycle Transition */}
        {editingEvent && (
          <div className="dialog-overlay dialog-overlay-top" role="presentation">
            <div className="dialog-surface form-dialog-surface" role="dialog" aria-modal="true" aria-label="Edit exercise and lifecycle" style={{ maxWidth: '540px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 18px',
                  background: 'var(--bg-panel)',
                  borderBottom: '1px solid var(--border-default)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Edit2 size={16} color="var(--accent-primary)" />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Edit Edition Metadata & Lifecycle — {editingEvent.slug}
                  </span>
                </div>
                <button
                  onClick={() => setEditingEvent(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleUpdate} style={{ padding: '18px' }}>
                {editError && (
                  <div
                    style={{
                      padding: '8px 12px',
                      marginBottom: '14px',
                      background: 'var(--status-danger-bg)',
                      border: '1px solid var(--status-danger)',
                      borderRadius: 'var(--radius-xs)',
                      fontSize: '12px',
                      color: 'var(--status-danger)',
                    }}
                  >
                    {editError}
                  </div>
                )}

                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Edition Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    style={{ width: '100%' }}
                  />
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Lifecycle Status Transition
                  </label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    style={{ width: '100%' }}
                  >
                    {LIFECYCLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label} — {opt.description}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Default Locale
                    </label>
                    <select
                      value={editForm.defaultLocale}
                      onChange={(e) => setEditForm({ ...editForm, defaultLocale: e.target.value })}
                      style={{ width: '100%' }}
                    >
                      {SUPPORTED_LOCALES.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.flag} {l.name} ({l.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Default Timezone
                    </label>
                    <select
                      value={editForm.defaultTimezone}
                      onChange={(e) => setEditForm({ ...editForm, defaultTimezone: e.target.value })}
                      style={{ width: '100%' }}
                    >
                      {COMMON_TIMEZONES.map((tz) => (
                        <option key={tz.value} value={tz.value}>
                          {tz.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Starts At
                    </label>
                    <input
                      type="datetime-local"
                      value={editForm.startsAt}
                      onChange={(e) => setEditForm({ ...editForm, startsAt: e.target.value })}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Ends At
                    </label>
                    <input
                      type="datetime-local"
                      value={editForm.endsAt}
                      onChange={(e) => setEditForm({ ...editForm, endsAt: e.target.value })}
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Description
                  </label>
                  <textarea
                    rows={2}
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    style={{ width: '100%', resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setEditingEvent(null)}
                    className="btn btn-secondary"
                    disabled={editSubmitting}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={editSubmitting}>
                    {editSubmitting ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Duplicate Event as Starting Point */}
        {duplicatingEvent && (
          <div className="dialog-overlay dialog-overlay-top" role="presentation">
            <div className="dialog-surface form-dialog-surface" role="dialog" aria-modal="true" aria-label="Duplicate exercise" style={{ maxWidth: '520px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 18px',
                  background: 'var(--bg-panel)',
                  borderBottom: '1px solid var(--border-default)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Copy size={16} color="var(--accent-primary)" />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Duplicate Edition as New Template
                  </span>
                </div>
                <button
                  onClick={() => setDuplicatingEvent(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleDuplicate} style={{ padding: '18px' }}>
                <div
                  style={{
                    padding: '8px 12px',
                    marginBottom: '14px',
                    background: 'var(--accent-subtle)',
                    border: '1px solid var(--accent-primary)',
                    borderRadius: 'var(--radius-xs)',
                    fontSize: '11px',
                    color: 'var(--text-primary)',
                  }}
                >
                  Cloning <strong>{duplicatingEvent.name}</strong> will replicate its organizational unit hierarchy, capabilities, and event roles into a fresh <strong>DRAFT</strong> edition without operational records.
                </div>

                {dupError && (
                  <div
                    style={{
                      padding: '8px 12px',
                      marginBottom: '14px',
                      background: 'var(--status-danger-bg)',
                      border: '1px solid var(--status-danger)',
                      borderRadius: 'var(--radius-xs)',
                      fontSize: '12px',
                      color: 'var(--status-danger)',
                    }}
                  >
                    {dupError}
                  </div>
                )}

                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    New Edition Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={dupForm.name}
                    onChange={(e) => setDupForm({ ...dupForm, name: e.target.value })}
                    style={{ width: '100%' }}
                    autoFocus
                  />
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    New Slug Identifier *
                  </label>
                  <input
                    type="text"
                    required
                    value={dupForm.slug}
                    onChange={(e) => setDupForm({ ...dupForm, slug: e.target.value })}
                    style={{ width: '100%', fontFamily: 'var(--font-mono)' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Starts At
                    </label>
                    <input
                      type="datetime-local"
                      value={dupForm.startsAt}
                      onChange={(e) => setDupForm({ ...dupForm, startsAt: e.target.value })}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Ends At
                    </label>
                    <input
                      type="datetime-local"
                      value={dupForm.endsAt}
                      onChange={(e) => setDupForm({ ...dupForm, endsAt: e.target.value })}
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Description
                  </label>
                  <textarea
                    rows={2}
                    value={dupForm.description}
                    onChange={(e) => setDupForm({ ...dupForm, description: e.target.value })}
                    style={{ width: '100%', resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setDuplicatingEvent(null)}
                    className="btn btn-secondary"
                    disabled={dupSubmitting}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={dupSubmitting}>
                    {dupSubmitting ? 'Duplicating...' : 'Duplicate Edition'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Event Units & Capabilities Inspector */}
        {inspectingEvent && (
          <div className="dialog-overlay dialog-overlay-top" role="presentation">
            <div className="dialog-surface form-dialog-surface" role="dialog" aria-modal="true" aria-label="Inspect exercise units and capabilities" style={{ maxWidth: '680px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 18px',
                  background: 'var(--bg-panel)',
                  borderBottom: '1px solid var(--border-default)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Building2 size={16} color="var(--accent-primary)" />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {cs ? 'Týmy' : 'Teams'} · {inspectingEvent.name}
                  </span>
                </div>
                <button
                  onClick={() => setInspectingEvent(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={16} />
                </button>
              </div>

              <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
                {isPlatformAdmin && !editingUnitCaps && <EventTemplateAction key={inspectingEvent.id}
                  eventId={inspectingEvent.id} onApplied={() => setUnitsRevision(value => value + 1)} />}
                {unitsLoading ? (
                  <LoadingState message={cs ? 'Načítám týmy…' : 'Loading teams…'} />
                ) : unitsError ? (
                  <ErrorState message={unitsError} onRetry={() => setUnitsRevision(value => value + 1)} />
                ) : editingUnitCaps ? (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <div>
                        <span style={{ fontWeight: 600, fontSize: '13px' }}>Configure Capabilities: {editingUnitCaps.name}</span>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Select the operational modules assigned to this unit.</div>
                      </div>
                      <button
                        onClick={() => setEditingUnitCaps(null)}
                        className="btn btn-secondary"
                        style={{ fontSize: '11px', padding: '3px 8px' }}
                      >
                        Back to Units
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                      {CAPABILITY_CATALOG.map((cap) => {
                        const isChecked = selectedCaps.includes(cap.key);
                        return (
                          <label
                            key={cap.key}
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: '8px',
                              padding: '8px 10px',
                              background: isChecked ? 'var(--accent-subtle)' : 'var(--bg-panel)',
                              border: `1px solid ${isChecked ? 'var(--accent-primary)' : 'var(--border-default)'}`,
                              borderRadius: 'var(--radius-xs)',
                              cursor: 'pointer',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedCaps([...selectedCaps, cap.key]);
                                } else {
                                  setSelectedCaps(selectedCaps.filter((c) => c !== cap.key));
                                }
                              }}
                              style={{ marginTop: '2px' }}
                            />
                            <div>
                              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{cap.name}</div>
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{cap.description}</div>
                            </div>
                          </label>
                        );
                      })}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      <button onClick={() => setEditingUnitCaps(null)} className="btn btn-secondary" disabled={savingCaps}>
                        Cancel
                      </button>
                      <button onClick={handleSaveUnitCaps} className="btn btn-primary" disabled={savingCaps}>
                        {savingCaps ? 'Saving...' : 'Apply Capabilities'}
                      </button>
                    </div>
                  </div>
                ) : eventUnits.length === 0 ? (
                  <EmptyState
                    title={cs ? 'Cvičení zatím nemá týmy' : 'This exercise has no teams yet'}
                  />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {eventUnits.map((u: any) => (
                      <div
                        key={u.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          background: 'var(--bg-panel)',
                          border: '1px solid var(--border-default)',
                          borderRadius: 'var(--radius-xs)',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '12px' }}>{u.name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                            slug: {u.slug} • kind: {u.kind}
                          </div>
                          {u.capabilities && u.capabilities.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                              {u.capabilities.map((c: string) => (
                                <span
                                  key={c}
                                  style={{
                                    fontSize: '9px',
                                    fontWeight: 600,
                                    padding: '1px 6px',
                                    borderRadius: 'var(--radius-xs)',
                                    background: 'var(--bg-surface)',
                                    border: '1px solid var(--border-strong)',
                                    color: 'var(--text-secondary)',
                                  }}
                                >
                                  {c}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <button
                          onClick={() => openUnitCapsEditor(u)}
                          className="btn btn-secondary"
                          style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Sliders size={12} />
                          Capabilities
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div
                style={{
                  padding: '10px 18px',
                  background: 'var(--bg-panel)',
                  borderTop: '1px solid var(--border-default)',
                  display: 'flex',
                  justifyContent: 'flex-end',
                }}
              >
                <button onClick={() => setInspectingEvent(null)} className="btn btn-secondary">
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
