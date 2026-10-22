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
import { Briefcase, Plus, Filter, RefreshCw, X, Sparkles } from 'lucide-react';
import { WritingAssistModal } from '@/components/intelligence/WritingAssistModal';

interface CaseItem {
  id: string;
  caseNumber: string;
  title: string;
  summary?: string | null;
  status: 'OPEN' | 'INVESTIGATING' | 'PENDING' | 'REFERRED' | 'CLOSED' | 'ARCHIVED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  owningUnitId?: string;
  leadUserId?: string;
  createdAt: string;
}

export default function CasesPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;
  const { hasPermission } = useAuth();
  const { formatDate } = usePreferences();

  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');

  // Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showWritingAssist, setShowWritingAssist] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    summary: '',
    priority: 'MEDIUM',
  });

  const canCreate = hasPermission('case.create');

  const fetchCases = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getCases(eventId);
      if (res.ok && res.data) {
        setCases(res.data);
      } else {
        setError(res.error || 'Failed to load cases');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (eventId) {
      fetchCases();
    }
  }, [eventId]);

  const filteredCases = useMemo(() => {
    return cases.filter((c) => {
      const matchSearch =
        !search ||
        c.caseNumber?.toLowerCase().includes(search.toLowerCase()) ||
        c.title?.toLowerCase().includes(search.toLowerCase()) ||
        c.summary?.toLowerCase().includes(search.toLowerCase());

      const matchStatus = !statusFilter || c.status === statusFilter;
      const matchPriority = !priorityFilter || c.priority === priorityFilter;

      return matchSearch && matchStatus && matchPriority;
    });
  }, [cases, search, statusFilter, priorityFilter]);

  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      setFormError('Title is required');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const res = await apiClient.createCase(eventId, {
        title: formData.title.trim(),
        summary: formData.summary.trim() || undefined,
        priority: formData.priority,
      });

      if (res.ok && res.data) {
        setShowCreateModal(false);
        setFormData({ title: '', summary: '', priority: 'MEDIUM' });
        router.push(`/events/${eventId}/cases/${res.data.id}`);
      } else {
        setFormError(res.error || 'Failed to create case');
      }
    } catch (err: any) {
      setFormError(err.message || 'Error creating case');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: Column<CaseItem>[] = [
    {
      header: 'Identifier',
      accessor: (item) => <RecordIdentifier id={item.caseNumber || item.id} prefix="" />,
      sortKey: 'caseNumber',
      width: '130px',
    },
    {
      header: 'Title & Summary',
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
      header: 'Opened',
      accessor: (item) => (
        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
          {formatDate(item.createdAt)}
        </span>
      ),
      sortKey: 'createdAt',
      width: '100px',
    },
  ];

  return (
    <AppShell
      breadcrumbs={[
        { label: 'Operations' },
        { label: 'Cases' },
      ]}
    >
      <div style={{ padding: '20px 24px' }}>
        {/* Page Title & Operational Action */}
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
              <Briefcase size={20} color="var(--color-accent-ops)" />
              Operational Cases
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--color-text-dim)' }}>
              Active and archival investigation workspaces, taskings, and cross-domain operational records.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={fetchCases}
              className="btn btn-secondary"
              title="Refresh case register"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
              Refresh
            </button>
            {canCreate && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Plus size={15} />
                New Case
              </button>
            )}
          </div>
        </div>

        {/* Filter Bar */}
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search case identifier, title or summary..."
          filters={[
            {
              label: 'Status',
              value: statusFilter,
              options: [
                { label: 'All Statuses', value: '' },
                { label: 'Open', value: 'OPEN' },
                { label: 'Investigating', value: 'INVESTIGATING' },
                { label: 'Pending', value: 'PENDING' },
                { label: 'Referred', value: 'REFERRED' },
                { label: 'Closed', value: 'CLOSED' },
                { label: 'Archived', value: 'ARCHIVED' },
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
          totalResults={filteredCases.length}
        />

        {/* Content Table / State */}
        {loading ? (
          <LoadingState message="Loading operational cases register..." />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchCases} />
        ) : cases.length === 0 ? (
          <EmptyState
            title="No cases registered"
            description="There are currently no active or archived cases in this exercise event."
            actionLabel={canCreate ? 'Open First Case' : undefined}
            onAction={canCreate ? () => setShowCreateModal(true) : undefined}
          />
        ) : (
          <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <DataTable
              columns={columns}
              data={filteredCases}
              keyExtractor={(item) => item.id}
              onRowClick={(item) => router.push(`/events/${eventId}/cases/${item.id}`)}
              emptyMessage="No cases match your active filter criteria."
            />
          </div>
        )}

        {/* Modal: Create Case */}
        {showCreateModal && (
          <div
            className="dialog-overlay"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !submitting) setShowCreateModal(false);
            }}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: '16px',
            }}
          >
            <div
              className="dialog-surface"
              style={{
                width: '100%',
                maxWidth: '540px',
                background: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border-strong)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-lg)',
                overflow: 'hidden',
                maxHeight: 'min(90vh, 760px)',
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
                  <Briefcase size={16} color="var(--color-accent-ops)" />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-main)' }}>
                    Open New Operational Case
                  </span>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-text-dim)',
                    cursor: 'pointer',
                    padding: '4px',
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleCreateCase} style={{ padding: '18px' }}>
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
                  <label
                    style={{
                      display: 'block',
                      fontSize: '11px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      color: 'var(--color-text-dim)',
                      marginBottom: '6px',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Case Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Operation Trident - Grid Infiltration"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="input-field"
                    style={{ width: '100%' }}
                    autoFocus
                  />
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '11px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      color: 'var(--color-text-dim)',
                      marginBottom: '6px',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Operational Summary / Scope
                  </label>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '5px' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setShowWritingAssist(true)}
                      disabled={!formData.summary.trim()}
                      style={{ fontSize: '11px', padding: '3px 8px' }}
                    >
                      <Sparkles size={11} />
                      Assist Writing
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    placeholder="Initial context, affected infrastructure, investigative objectives..."
                    value={formData.summary}
                    onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                    className="input-field"
                    style={{ width: '100%', resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '18px' }}>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '11px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        color: 'var(--color-text-dim)',
                        marginBottom: '6px',
                        letterSpacing: '0.05em',
                      }}
                    >
                      Priority
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

                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '8px',
                    borderTop: '1px solid var(--color-border-subtle)',
                    paddingTop: '14px',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="btn btn-secondary"
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={submitting}
                  >
                    {submitting ? 'Registering...' : 'Open Case'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        <WritingAssistModal
          isOpen={showWritingAssist}
          onClose={() => setShowWritingAssist(false)}
          initialText={formData.summary}
          fieldLabel="Operational Summary / Scope"
          context="case_scope"
          onApply={(summary) => {
            setFormData((current) => ({ ...current, summary }));
            setShowWritingAssist(false);
          }}
        />
      </div>
    </AppShell>
  );
}
