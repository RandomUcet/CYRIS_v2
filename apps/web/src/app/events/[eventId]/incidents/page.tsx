'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { DataTable, Column } from '@/components/common/DataTable';
import { FilterBar } from '@/components/common/FilterBar';
import { RecordIdentifier, StatusBadge, PriorityBadge } from '@/components/common/Badges';
import { LoadingState, EmptyState, ErrorState } from '@/components/common/StateViews';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { AlertTriangle, Plus, RefreshCw, X, ArrowRight } from 'lucide-react';

interface IncidentItem {
  id: string;
  incidentNumber: string;
  title: string;
  summary?: string;
  status: 'REPORTED' | 'TRIAGED' | 'CONTAINED' | 'RESOLVED' | 'CLOSED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  occurredAt?: string;
  detectedAt?: string;
  caseId?: string;
  leadUserId?: string;
  createdAt: string;
}

export default function IncidentsListPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;
  const { hasPermission } = useAuth();
  const { formatTime, t } = usePreferences();

  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');

  // Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    summary: '',
    priority: 'HIGH',
    occurredAt: '',
  });

  const canCreate = hasPermission('incident.create');

  const fetchIncidents = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getIncidents(eventId);
      if (res.ok && res.data) {
        setIncidents(res.data);
      } else {
        setError(res.error || t('error.incidentsLoad'));
      }
    } catch (err: any) {
      setError(err.message || t('error.network'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (eventId) {
      fetchIncidents();
    }
  }, [eventId]);

  const filteredIncidents = useMemo(() => {
    return incidents.filter((inc) => {
      const matchSearch =
        !search ||
        inc.incidentNumber?.toLowerCase().includes(search.toLowerCase()) ||
        inc.title?.toLowerCase().includes(search.toLowerCase()) ||
        inc.summary?.toLowerCase().includes(search.toLowerCase());

      const matchStatus = !statusFilter || inc.status === statusFilter;
      const matchPriority = !priorityFilter || inc.priority === priorityFilter;

      return matchSearch && matchStatus && matchPriority;
    });
  }, [incidents, search, statusFilter, priorityFilter]);

  const handleCreateIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      setFormError('Incident title is required');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const res = await apiClient.createIncident(eventId, {
        title: formData.title.trim(),
        description: formData.summary.trim() || undefined,
        priority: formData.priority,
        occurredAt: formData.occurredAt ? new Date(formData.occurredAt).toISOString() : new Date().toISOString(),
      });

      if (res.ok && res.data) {
        setShowCreateModal(false);
        setFormData({ title: '', summary: '', priority: 'HIGH', occurredAt: '' });
        router.push(`/events/${eventId}/incidents/${res.data.id}`);
      } else {
        setFormError(res.error || 'Failed to report incident');
      }
    } catch (err: any) {
      setFormError(err.message || 'Error creating incident');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: Column<IncidentItem>[] = [
    {
      header: 'Identifier',
      accessor: (item) => <RecordIdentifier id={item.incidentNumber || item.id} prefix="" />,
      sortKey: 'incidentNumber',
      width: '120px',
    },
    {
      header: 'Incident Title & Impact',
      accessor: (item) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--color-text-main)' }}>{item.title}</div>
          {item.summary && (
            <div
              style={{
                fontSize: '11px',
                color: 'var(--color-text-dim)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '400px',
              }}
            >
              {item.summary}
            </div>
          )}
        </div>
      ),
      sortKey: 'title',
    },
    {
      header: 'Status',
      accessor: (item) => <StatusBadge status={item.status} />,
      sortKey: 'status',
      width: '110px',
    },
    {
      header: 'Priority',
      accessor: (item) => <PriorityBadge priority={item.priority} />,
      sortKey: 'priority',
      width: '110px',
    },
    {
      header: 'Occurred / Detected',
      accessor: (item) => (
        <span style={{ fontSize: '12px', color: 'var(--color-text-dim)' }}>
          {formatTime(item.occurredAt || item.createdAt)}
        </span>
      ),
      sortKey: 'createdAt',
      width: '130px',
    },
  ];

  return (
    <AppShell
      breadcrumbs={[
        { label: 'Operations' },
        { label: 'Incidents' },
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
            borderBottom: '1px solid var(--color-border-subtle)',
            paddingBottom: '16px',
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: '20px',
                fontWeight: 700,
                color: 'var(--color-text-main)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                letterSpacing: '-0.01em',
              }}
            >
              <AlertTriangle size={20} color="var(--color-accent-ops)" />
              {t('page.incidents.title')}
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--color-text-dim)' }}>
              {t('page.incidents.subtitle')}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={fetchIncidents}
              className="btn btn-secondary"
              title="Refresh incident triage queue"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
              {t('action.refresh')}
            </button>
            {canCreate && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Plus size={15} />
                {t('incidents.report')}
              </button>
            )}
          </div>
        </div>

        {/* Filter Bar */}
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder={t('incidents.searchPlaceholder')}
          filters={[
            {
              label: 'Status',
              value: statusFilter,
              options: [
                { label: 'All Statuses', value: '' },
                { label: 'Reported', value: 'REPORTED' },
                { label: 'Triaged', value: 'TRIAGED' },
                { label: 'Contained', value: 'CONTAINED' },
                { label: 'Resolved', value: 'RESOLVED' },
                { label: 'Closed', value: 'CLOSED' },
              ],
              onChange: setStatusFilter,
            },
            {
              label: 'Priority',
              value: priorityFilter,
              options: [
                { label: 'All Priorities', value: '' },
                { label: 'Critical', value: 'CRITICAL' },
                { label: 'High', value: 'HIGH' },
                { label: 'Medium', value: 'MEDIUM' },
                { label: 'Low', value: 'LOW' },
              ],
              onChange: setPriorityFilter,
            },
          ]}
          onReset={() => {
            setSearch('');
            setStatusFilter('');
            setPriorityFilter('');
          }}
          totalResults={filteredIncidents.length}
        />

        {/* Content */}
        {loading ? (
          <LoadingState message={t('incidents.loading')} />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchIncidents} />
        ) : incidents.length === 0 ? (
          <EmptyState
            title={t('empty.incidents')}
            description={t('empty.incidents.desc')}
            actionLabel={canCreate ? t('incidents.report') : undefined}
            onAction={canCreate ? () => setShowCreateModal(true) : undefined}
          />
        ) : (
          <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <DataTable
              columns={columns}
              data={filteredIncidents}
              keyExtractor={(item) => item.id}
              onRowClick={(item) => router.push(`/events/${eventId}/incidents/${item.id}`)}
              emptyMessage={t('empty.incidents.desc')}
            />
          </div>
        )}

        {/* Modal: Report Incident */}
        {showCreateModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              backdropFilter: 'blur(2px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: '16px',
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: '520px',
                background: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border-strong)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-lg)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 18px',
                  background: 'var(--color-bg-panel)',
                  borderBottom: '1px solid var(--color-border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertTriangle size={16} color="var(--color-accent-ops)" />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-main)' }}>
                    Report Operational Incident
                  </span>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--color-text-dim)', cursor: 'pointer' }}
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleCreateIncident} style={{ padding: '18px' }}>
                {formError && (
                  <div
                    style={{
                      padding: '8px 12px',
                      marginBottom: '14px',
                      background: 'rgba(239, 68, 68, 0.12)',
                      border: '1px solid var(--color-danger)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '12px',
                      color: 'var(--color-danger)',
                    }}
                  >
                    {formError}
                  </div>
                )}

                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                    Incident Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. SCADA Telemetry Loss on District Substations"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="input-field"
                    style={{ width: '100%' }}
                    autoFocus
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                      Priority / Severity
                    </label>
                    <select
                      value={formData.priority}
                      onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                      className="select-field"
                      style={{ width: '100%' }}
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                      <option value="CRITICAL">Critical</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                      Occurred Timestamp
                    </label>
                    <input
                      type="datetime-local"
                      value={formData.occurredAt}
                      onChange={(e) => setFormData({ ...formData, occurredAt: e.target.value })}
                      className="input-field"
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '18px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                    Initial Impact Summary
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Brief description of symptoms, affected systems, initial response taken..."
                    value={formData.summary}
                    onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                    className="input-field"
                    style={{ width: '100%', resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="btn btn-secondary"
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? 'Reporting...' : 'Submit Incident'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
