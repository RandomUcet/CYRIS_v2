'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { ResourcePicker } from '@/components/common/ResourcePicker';
import { useDialogAccessibility } from '@/hooks/useDialogAccessibility';
import { DataTable, Column } from '@/components/common/DataTable';
import { FilterBar } from '@/components/common/FilterBar';
import { RecordIdentifier, StatusBadge } from '@/components/common/Badges';
import { LoadingState, EmptyState, ErrorState } from '@/components/common/StateViews';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { Award, Plus, RefreshCw, X, ArrowRight, BookOpen, Clock, Folder, CheckCircle2, FileText } from 'lucide-react';
import type { CourtCaseListItemDto, CourtCaseStatus } from '@cyris/contracts';

export default function CourtDocketPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  return <CourtDocketWorkspace key={eventId} eventId={eventId}/>;
}
function CourtDocketWorkspace({eventId}:{eventId:string}) {
  const router=useRouter();
  const { hasPermission,viewAs } = useAuth();
  const { formatDate } = usePreferences();

  const [courtCases, setCourtCases] = useState<CourtCaseListItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modal: Create Court Case
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  useDialogAccessibility(showCreateModal, () => { if (!submitting) setShowCreateModal(false); });
  const [formError, setFormError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    summary: '',
    originatingCaseId: '',
  });

  const canCreate = !viewAs && hasPermission('court.create',eventId);

  const fetchCourtCases = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getCourtCases(eventId);
      if (res.ok && res.data) {
        setCourtCases(res.data);
      } else {
        setError(res.error || 'Failed to load court docket');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (eventId) {
      fetchCourtCases();
    }
  }, [eventId]);

  const filteredCases = useMemo(() => {
    return courtCases.filter((c) => {
      const matchSearch =
        !search ||
        c.courtCaseNumber?.toLowerCase().includes(search.toLowerCase()) ||
        c.title?.toLowerCase().includes(search.toLowerCase()) ||
        c.summary?.toLowerCase().includes(search.toLowerCase());

      const matchStatus = !statusFilter || c.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [courtCases, search, statusFilter]);

  const handleCreateCourtCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!canCreate||submitting)return;
    if (!formData.title.trim()) {
      setFormError('Matter title is required');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const res = await apiClient.createCourtCase(eventId, {
        title: formData.title.trim(),
        summary: formData.summary.trim() || undefined,
        originatingCaseId: formData.originatingCaseId.trim() || undefined,
        visibility: 'EVENT',
      });

      if (res.ok && res.data) {
        setShowCreateModal(false);
        setFormData({ title: '', summary: '', originatingCaseId: '' });
        fetchCourtCases();
        router.push(`/events/${eventId}/court/${res.data.id}`);
      } else {
        setFormError(res.error || 'Failed to initiate court proceeding');
      }
    } catch (err: any) {
      setFormError(err.message || 'Network error');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: Column<CourtCaseListItemDto>[] = [
    {
      header: 'Docket / Number',
      accessor: (row) => <RecordIdentifier value={row.courtCaseNumber} />,
      width: '130px',
    },
    {
      header: 'Title / Legal Matter',
      accessor: (row) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--color-text-bright)' }}>{row.title}</div>
          {row.summary && (
            <div style={{ fontSize: '12px', color: 'var(--color-text-dim)', marginTop: '2px' }}>
              {row.summary.slice(0, 100)}...
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: (row) => <StatusBadge status={row.status} />,
      width: '130px',
    },
    {
      header: 'Opened',
      accessor: (row) => (
        <span style={{ fontSize: '12px', color: 'var(--color-text-dim)' }}>
          {formatDate(row.openedAt)}
        </span>
      ),
      width: '110px',
    },
    {
      header: '',
      accessor: (row) => (
        <Link
          href={`/events/${eventId}/court/${row.id}`}
          className="btn btn-secondary btn-sm"
          style={{ padding: '3px 8px' }}
        >
          Proceeding <ArrowRight size={13} style={{ marginLeft: '4px' }} />
        </Link>
      ),
      width: '110px',
    },
  ];

  return (
    <AppShell
      breadcrumbs={[
        { label: 'Event', href: `/events/${eventId}/overview` },
        { label: 'Court & Legal Proceedings', href: `/events/${eventId}/court` },
      ]}
    >
      <div className="workspace-container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-text-bright)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Award size={20} color="var(--color-accent-ops)" />
              Judicial Docket & Legal Proceedings
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--color-text-dim)' }}>
              Tribunal / Court docket managing legal charges, exhibits, hearings, and official judicial verdicts.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary" onClick={fetchCourtCases} title="Refresh docket">
              <RefreshCw size={14} />
            </button>
            {!viewAs&&(hasPermission('court.read',eventId)||hasPermission('court.request.read',eventId)||hasPermission('scenario.manage',eventId))&&<Link className="btn btn-secondary" href={'/events/'+eventId+'/legal-library'}><BookOpen size={14}/> Legal Intelligence</Link>}
            {hasPermission('court.request.read',eventId)&&<Link className="btn btn-secondary" href={'/events/'+eventId+'/legal-requests'}><FileText size={14}/> Žádosti o podklady</Link>}
            {canCreate && (
              <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
                <Plus size={14} style={{ marginRight: '6px' }} />
                Initiate Legal Matter
              </button>
            )}
          </div>
        </div>

        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search court docket by CRT-ID or matter title..."
          filters={[
            {
              label: 'Proceeding Status',
              value: statusFilter,
              options: [
                { label: 'All Statuses', value: '' },
                { label: 'Preparation', value: 'PREPARATION' },
                { label: 'Filed', value: 'FILED' },
                { label: 'Active', value: 'ACTIVE' },
                { label: 'Deliberation', value: 'DELIBERATION' },
                { label: 'Decided', value: 'DECIDED' },
                { label: 'Closed', value: 'CLOSED' },
              ],
              onChange: setStatusFilter,
            },
          ]}
        />

        {loading ? (
          <LoadingState message="Loading judicial docket..." />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchCourtCases} />
        ) : filteredCases.length === 0 ? (
          <EmptyState
            title="Docket is Empty"
            description={
              search || statusFilter
                ? 'No legal matters match the current filter criteria.'
                : 'No court cases or prosecutions have been initiated.'
            }
            action={
              canCreate ? (
                <button className="btn btn-primary btn-sm" onClick={() => setShowCreateModal(true)}>
                  <Plus size={14} style={{ marginRight: '6px' }} />
                  Initiate Legal Matter
                </button>
              ) : undefined
            }
          />
        ) : (
          <div style={{ marginTop: '16px' }}>
            <DataTable
              columns={columns}
              data={filteredCases}
              keyExtractor={(row) => row.id}
              onRowClick={(row) => router.push(`/events/${eventId}/court/${row.id}`)}
            />
          </div>
        )}

        {/* Modal: Initiate Legal Matter */}
        {showCreateModal && (
          <div className="modal-backdrop" role="presentation">
            <div className="modal-dialog" role="dialog" aria-modal="true" aria-label="Initiate Legal Matter" style={{ maxWidth: '540px' }}>
              <div className="modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Award size={18} style={{ color: 'var(--color-accent-ops)' }} />
                  <h3 className="modal-title">Initiate Legal Matter</h3>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowCreateModal(false)}
                  style={{ padding: '4px' }}
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleCreateCourtCase}>
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {formError && (
                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: '4px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid var(--color-danger)',
                        color: 'var(--color-danger)',
                        fontSize: '13px',
                      }}
                    >
                      {formError}
                    </div>
                  )}

                  <div>
                    <label className="field-label">Legal Matter Title *</label>
                    <input
                      type="text"
                      className="field-input"
                      placeholder="e.g. State v. Novotny (Clandestine Infrastructure Sabotage)"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      required
                    />
                  </div>

                  <div>
                    <label className="field-label">Summary / Indictment Overview</label>
                    <textarea
                      className="field-input"
                      rows={3}
                      placeholder="Overview of jurisdictional mandate, initial allegations, and key subjects..."
                      value={formData.summary}
                      onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                    />
                  </div>

                  <div>
                    <ResourcePicker
                      eventId={eventId}
                      value={formData.originatingCaseId}
                      onChange={(value) => setFormData(current => ({ ...current, originatingCaseId: value }))}
                      types="case"
                      label="Originating investigation case (optional)"
                      placeholder="Search by case number or title…"
                    />
                  </div>
                </div>

                <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowCreateModal(false)}
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? 'Creating...' : 'File Case'}
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
