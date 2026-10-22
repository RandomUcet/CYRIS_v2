'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { DataTable, Column } from '@/components/common/DataTable';
import { FilterBar } from '@/components/common/FilterBar';
import { RecordIdentifier, StatusBadge } from '@/components/common/Badges';
import { LoadingState, EmptyState, ErrorState } from '@/components/common/StateViews';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { FlaskConical, Plus, RefreshCw, X, ArrowRight } from 'lucide-react';

interface LabItem {
  id: string;
  analysisNumber: string;
  title: string;
  purpose?: string;
  status: 'REQUESTED' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'APPROVED';
  evidenceId?: string;
  caseId?: string;
  labUnitId?: string;
  analystUserId?: string;
  createdAt: string;
}

export default function LabListPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;
  const { hasPermission } = useAuth();
  const { formatDate } = usePreferences();

  const [analyses, setAnalyses] = useState<LabItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modal: Request Analysis
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    purpose: '',
    evidenceId: '',
    caseId: '',
  });

  const canRequest = hasPermission('lab.request.create');

  const fetchAnalyses = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getLabAnalyses(eventId);
      if (res.ok && res.data) {
        setAnalyses(res.data);
      } else {
        setError(res.error || 'Failed to load laboratory queue');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (eventId) {
      fetchAnalyses();
    }
  }, [eventId]);

  const filteredAnalyses = useMemo(() => {
    return analyses.filter((a) => {
      const matchSearch =
        !search ||
        a.analysisNumber?.toLowerCase().includes(search.toLowerCase()) ||
        a.title?.toLowerCase().includes(search.toLowerCase()) ||
        a.purpose?.toLowerCase().includes(search.toLowerCase());

      const matchStatus = !statusFilter || a.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [analyses, search, statusFilter]);

  const handleCreateAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      setFormError('Analysis title is required');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const res = await apiClient.createLabAnalysis(eventId, {
        title: formData.title.trim(),
        purpose: formData.purpose.trim() || undefined,
        evidenceId: formData.evidenceId.trim() || undefined,
        caseId: formData.caseId.trim() || undefined,
      });

      if (res.ok && res.data) {
        setShowCreateModal(false);
        setFormData({ title: '', purpose: '', evidenceId: '', caseId: '' });
        router.push(`/events/${eventId}/lab/${res.data.id}`);
      } else {
        setFormError(res.error || 'Failed to request analysis');
      }
    } catch (err: any) {
      setFormError(err.message || 'Error submitting analysis request');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: Column<LabItem>[] = [
    {
      header: 'Identifier',
      accessor: (item) => <RecordIdentifier id={item.analysisNumber || item.id} prefix="" />,
      sortKey: 'analysisNumber',
      width: '120px',
    },
    {
      header: 'Title & Objective',
      accessor: (item) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--color-text-main)' }}>{item.title}</div>
          {item.purpose && (
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
              {item.purpose}
            </div>
          )}
        </div>
      ),
      sortKey: 'title',
    },
    {
      header: 'Workflow Stage',
      accessor: (item) => <StatusBadge status={item.status} />,
      sortKey: 'status',
      width: '130px',
    },
    {
      header: 'Analyst',
      accessor: (item) => (
        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
          {item.analystUserId ? `Analyst ${item.analystUserId.slice(0, 8)}` : 'Unassigned'}
        </span>
      ),
      width: '140px',
    },
    {
      header: 'Requested',
      accessor: (item) => (
        <span style={{ fontSize: '12px', color: 'var(--color-text-dim)' }}>
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
        { label: 'Operations Support' },
        { label: 'Laboratory' },
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
              <FlaskConical size={20} color="var(--color-accent-ops)" />
              Forensic & Chemical Laboratory Workflows
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--color-text-dim)' }}>
              Analytical tasking, acquisition protocol verification, forensic conclusions, and peer approval pipelines.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={fetchAnalyses}
              className="btn btn-secondary"
              title="Refresh laboratory queue"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
              Refresh
            </button>
            {canRequest && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Plus size={15} />
                Request Analysis
              </button>
            )}
          </div>
        </div>

        {/* Filter Bar */}
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search analysis identifier, title or objective..."
          filters={[
            {
              label: 'Workflow Stage',
              value: statusFilter,
              options: [
                { label: 'All Stages', value: '' },
                { label: 'Requested', value: 'REQUESTED' },
                { label: 'Accepted', value: 'ACCEPTED' },
                { label: 'In Progress', value: 'IN_PROGRESS' },
                { label: 'Completed', value: 'COMPLETED' },
                { label: 'Approved', value: 'APPROVED' },
              ],
              onChange: setStatusFilter,
            },
          ]}
          onReset={() => {
            setSearch('');
            setStatusFilter('');
          }}
          totalResults={filteredAnalyses.length}
        />

        {/* Content */}
        {loading ? (
          <LoadingState message="Connecting to laboratory workbench..." />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchAnalyses} />
        ) : analyses.length === 0 ? (
          <EmptyState
            title="No laboratory analyses requested"
            description="Forensic queues and laboratory taskings are currently clear."
            actionLabel={canRequest ? 'Request First Analysis' : undefined}
            onAction={canRequest ? () => setShowCreateModal(true) : undefined}
          />
        ) : (
          <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <DataTable
              columns={columns}
              data={filteredAnalyses}
              keyExtractor={(item) => item.id}
              onRowClick={(item) => router.push(`/events/${eventId}/lab/${item.id}`)}
              emptyMessage="No laboratory analyses match your active filter."
            />
          </div>
        )}

        {/* Modal: Request Analysis */}
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
                  <FlaskConical size={16} color="var(--color-accent-ops)" />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-main)' }}>
                    Commission Laboratory Analysis
                  </span>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--color-text-dim)', cursor: 'pointer' }}
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleCreateAnalysis} style={{ padding: '18px' }}>
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
                    Analysis Request Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Memory Dump Extraction & C2 Beaconing Triage"
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
                      Evidence Resource UUID
                    </label>
                    <input
                      type="text"
                      placeholder="Optional Evidence UUID"
                      value={formData.evidenceId}
                      onChange={(e) => setFormData({ ...formData, evidenceId: e.target.value })}
                      className="input-field"
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                      Associated Case UUID
                    </label>
                    <input
                      type="text"
                      placeholder="Optional Case UUID"
                      value={formData.caseId}
                      onChange={(e) => setFormData({ ...formData, caseId: e.target.value })}
                      className="input-field"
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '18px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                    Analytical Purpose & Tasking Questions
                  </label>
                  <textarea
                    rows={4}
                    placeholder="Specific questions for the analyst, target indicators of compromise, requested artifacts..."
                    value={formData.purpose}
                    onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
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
                    {submitting ? 'Submitting...' : 'Dispatch Request'}
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
