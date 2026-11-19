'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { DataTable, Column } from '@/components/common/DataTable';
import { FilterBar } from '@/components/common/FilterBar';
import { RecordIdentifier, StatusBadge } from '@/components/common/Badges';
import { LoadingState, EmptyState, ErrorState } from '@/components/common/StateViews';
import { ResourcePicker } from '@/components/common/ResourcePicker';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { FlaskConical, Plus, RefreshCw, X, ArrowRight } from 'lucide-react';

interface LabItem {
  id: string;
  analysisNumber: string;
  analysisType: string;
  purpose?: string;
  status: 'REQUESTED' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  evidenceIds?: string[];
  assignedUnitId?: string | null;
  assignedToUserId?: string | null;
  createdAt: string;
}

export default function LabListPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;
  const { hasPermission, user } = useAuth();
  const { formatDate } = usePreferences();

  const [analyses, setAnalyses] = useState<LabItem[]>([]);
  const [labUnits, setLabUnits] = useState<Array<{ id: string; name: string }>>([]);
  const [workspace, setWorkspace] = useState<'all' | 'mine' | 'unassigned' | 'unit' | 'completed'>('all');
  const [selectedUnitId, setSelectedUnitId] = useState('');
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
    analysisType: '',
    purpose: '',
    evidenceId: '',
    requestedFromUnitId: '',
  });

  const canRequest = hasPermission('lab.request', eventId);

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
      const units = await apiClient.getLabUnits(eventId);
      if (units.ok && units.data) setLabUnits(units.data);
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
      const workspaceMatch =
        workspace === 'all' ||
        (workspace === 'mine' && a.assignedToUserId === user?.user.id) ||
        (workspace === 'unassigned' && !a.assignedToUserId) ||
        (workspace === 'unit' && (!selectedUnitId || a.assignedUnitId === selectedUnitId)) ||
        (workspace === 'completed' && ['COMPLETED', 'APPROVED'].includes(a.status));
      const matchSearch =
        !search ||
        a.analysisNumber?.toLowerCase().includes(search.toLowerCase()) ||
        a.analysisType?.toLowerCase().includes(search.toLowerCase()) ||
        a.purpose?.toLowerCase().includes(search.toLowerCase());

      const matchStatus = !statusFilter || a.status === statusFilter;
      return workspaceMatch && matchSearch && matchStatus;
    });
  }, [analyses, search, statusFilter, workspace, selectedUnitId, user?.user.id]);

  const handleCreateAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.analysisType.trim()) {
      setFormError('Analysis type is required');
      return;
    }
    if (!formData.evidenceId.trim()) {
      setFormError('Select at least one evidence item');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const res = await apiClient.createLabAnalysis(eventId, {
        analysisType: formData.analysisType.trim(),
        purpose: formData.purpose.trim() || undefined,
        evidenceIds: [formData.evidenceId.trim()],
        requestedFromUnitId: formData.requestedFromUnitId || undefined,
      });

      if (res.ok && res.data) {
        setShowCreateModal(false);
        setFormData({ analysisType: '', purpose: '', evidenceId: '', requestedFromUnitId: '' });
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
          <div style={{ fontWeight: 600, color: 'var(--color-text-main)' }}>
            {item.analysisType} · {item.analysisNumber}
          </div>
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
          {item.assignedToUserId ? 'Assigned analyst' : 'Unassigned'}
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
        <div style={{ display: 'flex', gap: '8px', margin: '12px 0' }}>
          {([
            ['all', 'All work'],
            ['mine', 'My work'],
            ['unassigned', 'Unassigned'],
            ['unit', 'Unit work'],
            ['completed', 'Completed'],
          ] as const).map(([value, label]) => (
            <button key={value} type="button" onClick={() => setWorkspace(value)}
              className={`btn ${workspace === value ? 'btn-primary' : 'btn-secondary'}`}>
              {label}
            </button>
          ))}
          {workspace === 'unit' && (
            <select value={selectedUnitId} onChange={(e) => setSelectedUnitId(e.target.value)} className="input-field">
              <option value="">All laboratory units</option>
              {labUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
            </select>
          )}
        </div>

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
                    Responsible laboratory
                  </label>
                  <select
                    value={formData.requestedFromUnitId}
                    onChange={(e) => setFormData({ ...formData, requestedFromUnitId: e.target.value })}
                    className="input-field"
                    style={{ width: '100%' }}
                  >
                    <option value="">Automatic assignment</option>
                    {labUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                  </select>
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                    Analysis type *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. DIGITAL_FORENSIC or CHEMICAL"
                    value={formData.analysisType}
                    onChange={(e) => setFormData({ ...formData, analysisType: e.target.value })}
                    className="input-field"
                    style={{ width: '100%' }}
                    autoFocus
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  <ResourcePicker
                    eventId={eventId}
                    value={formData.evidenceId}
                    onChange={(value) => setFormData({ ...formData, evidenceId: value })}
                    label="Evidence"
                    types="evidence"
                  />
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
