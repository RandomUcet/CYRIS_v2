'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { useDialogAccessibility } from '@/hooks/useDialogAccessibility';
import { DataTable, Column } from '@/components/common/DataTable';
import { FilterBar } from '@/components/common/FilterBar';
import { RecordIdentifier, StatusBadge } from '@/components/common/Badges';
import { LoadingState, EmptyState, ErrorState } from '@/components/common/StateViews';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { FolderOpen, Plus, RefreshCw, X, ShieldAlert, ArrowRight } from 'lucide-react';

interface EvidenceItem {
  id: string;
  evidenceNumber: string;
  title: string;
  description?: string;
  evidenceType: string;
  status: string;
  caseId?: string;
  currentHolderId?: string;
  createdAt: string;
}

export default function EvidenceListPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventId = params.eventId as string;
  const { hasPermission, currentUser } = useAuth();
  const { formatDate } = usePreferences();

  const [evidenceList, setEvidenceList] = useState<EvidenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  useDialogAccessibility(showCreateModal, () => { if (!submitting) setShowCreateModal(false); });
  const [formError, setFormError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    evidenceType: 'DIGITAL',
    caseId: '',
  });
  const [availableCases, setAvailableCases] = useState<Array<{ id: string; caseNumber?: string; title: string }>>([]);
  const [casesLoading, setCasesLoading] = useState(false);

  const canCreate = hasPermission('evidence.create');

  const fetchEvidence = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getEvidence(eventId);
      if (res.ok && res.data) {
        setEvidenceList(res.data);
      } else {
        setError(res.error || 'Failed to load evidence register');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (eventId) {
      fetchEvidence();
    }
  }, [eventId]);

  useEffect(() => {
    if (!showCreateModal || !eventId) return;
    setCasesLoading(true);
    apiClient
      .getCases(eventId)
      .then((res) => {
        if (res.ok && res.data) {
          setAvailableCases(res.data);
        }
      })
      .finally(() => setCasesLoading(false));
  }, [showCreateModal, eventId]);

  useEffect(() => {
    const caseId = searchParams.get('caseId');
    if (caseId) {
      setFormData((current) => ({ ...current, caseId }));
      setShowCreateModal(true);
    }
  }, [searchParams]);

  const filteredEvidence = useMemo(() => {
    return evidenceList.filter((e) => {
      const matchSearch =
        !search ||
        e.evidenceNumber?.toLowerCase().includes(search.toLowerCase()) ||
        e.title?.toLowerCase().includes(search.toLowerCase()) ||
        e.description?.toLowerCase().includes(search.toLowerCase()) ||
        e.evidenceType?.toLowerCase().includes(search.toLowerCase());

      const matchType = !typeFilter || e.evidenceType === typeFilter;
      const matchStatus = !statusFilter || e.status === statusFilter;

      return matchSearch && matchType && matchStatus;
    });
  }, [evidenceList, search, typeFilter, statusFilter]);

  const handleCreateEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      setFormError('Evidence title is required');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const res = await apiClient.createEvidence(eventId, {
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        evidenceType: formData.evidenceType,
        currentHolderType: 'USER',
        currentHolderId: currentUser?.user.id ?? '',
        caseId: formData.caseId.trim() || undefined,
      });

      if (res.ok && res.data) {
        setShowCreateModal(false);
        setFormData({ title: '', description: '', evidenceType: 'DIGITAL', caseId: '' });
        router.push(`/events/${eventId}/evidence/${res.data.id}`);
      } else {
        setFormError(res.error || 'Failed to register evidence');
      }
    } catch (err: any) {
      setFormError(err.message || 'Error registering evidence');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: Column<EvidenceItem>[] = [
    {
      header: 'Identifier',
      accessor: (item) => <RecordIdentifier id={item.evidenceNumber || item.id} prefix="" />,
      sortKey: 'evidenceNumber',
      width: '120px',
    },
    {
      header: 'Title & Description',
      accessor: (item) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--color-text-main)' }}>{item.title}</div>
          {item.description && (
            <div
              style={{
                fontSize: '11px',
                color: 'var(--color-text-dim)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '380px',
              }}
            >
              {item.description}
            </div>
          )}
        </div>
      ),
      sortKey: 'title',
    },
    {
      header: 'Type',
      accessor: (item) => <span className="badge badge-neutral">{item.evidenceType}</span>,
      sortKey: 'evidenceType',
      width: '120px',
    },
    {
      header: 'Status',
      accessor: (item) => <StatusBadge status={item.status} />,
      sortKey: 'status',
      width: '120px',
    },
    {
      header: 'Storage / Holder',
      accessor: (item) => (
        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
          {item.currentHolderId ? `${item.currentHolderId.slice(0, 8)}…` : 'Unassigned'}
        </span>
      ),
      width: '160px',
    },
    {
      header: 'Registered',
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
        { label: 'Evidence' },
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
              <FolderOpen size={20} color="var(--color-accent-ops)" />
              Evidence Register & Chain of Custody
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--color-text-dim)' }}>
              Physical and digital items under formal chain of custody, forensic acquisition, and laboratory routing.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={fetchEvidence}
              className="btn btn-secondary"
              title="Refresh evidence registry"
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
                Register Evidence
              </button>
            )}
          </div>
        </div>

        {/* Filter Bar */}
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search evidence identifier, title or holder..."
          filters={[
            {
              label: 'Type',
              value: typeFilter,
              options: [
                { label: 'All Types', value: '' },
                { label: 'Digital', value: 'DIGITAL' },
                { label: 'Physical', value: 'PHYSICAL' },
                { label: 'Document', value: 'DOCUMENT' },
                { label: 'Biological', value: 'BIOLOGICAL' },
                { label: 'Chemical', value: 'CHEMICAL' },
              ],
              onChange: setTypeFilter,
            },
            {
              label: 'Status',
              value: statusFilter,
              options: [
                { label: 'All Statuses', value: '' },
                { label: 'Secured', value: 'SECURED' },
                { label: 'In Custody', value: 'IN_CUSTODY' },
                { label: 'In Lab', value: 'IN_LAB' },
                { label: 'Released', value: 'RELEASED' },
                { label: 'Archived', value: 'ARCHIVED' },
              ],
              onChange: setStatusFilter,
            },
          ]}
          onReset={() => {
            setSearch('');
            setTypeFilter('');
            setStatusFilter('');
          }}
          totalResults={filteredEvidence.length}
        />

        {/* Table / Views */}
        {loading ? (
          <LoadingState message="Accessing evidence vault registry..." />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchEvidence} />
        ) : evidenceList.length === 0 ? (
          <EmptyState
            title="Evidence vault is empty"
            description="No evidence has been formally secured or registered for this event."
            actionLabel={canCreate ? 'Register Evidence Item' : undefined}
            onAction={canCreate ? () => setShowCreateModal(true) : undefined}
          />
        ) : (
          <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <DataTable
              columns={columns}
              data={filteredEvidence}
              keyExtractor={(item) => item.id}
              onRowClick={(item) => router.push(`/events/${eventId}/evidence/${item.id}`)}
              emptyMessage="No evidence items match your active filters."
            />
          </div>
        )}

        {/* Modal: Register Evidence */}
        {showCreateModal && (
          <div
            className="dialog-overlay"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !submitting) setShowCreateModal(false);
            }}
          >
            <div
              className="dialog-surface form-dialog-surface" role="dialog" aria-modal="true" aria-label="Register Evidence" style={{ maxWidth: '520px' }}
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
                  <FolderOpen size={16} color="var(--color-accent-ops)" />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-main)' }}>
                    Register Evidence in Custody
                  </span>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--color-text-dim)', cursor: 'pointer' }}
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleCreateEvidence} style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
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

                <div className="dialog-body">
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                    Evidence Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. SanDisk 64GB USB Drive (Found at Server Room)"
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
                      Evidence Type
                    </label>
                    <select
                      value={formData.evidenceType}
                      onChange={(e) => setFormData({ ...formData, evidenceType: e.target.value })}
                      className="select-field"
                      style={{ width: '100%' }}
                    >
                      <option value="DIGITAL">Digital</option>
                      <option value="PHYSICAL">Physical</option>
                      <option value="DOCUMENT">Document</option>
                      <option value="BIOLOGICAL">Biological</option>
                      <option value="CHEMICAL">Chemical</option>
                    </select>
                  </div>

                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                    Linked Case (Optional)
                  </label>
                  <select
                    value={formData.caseId}
                    onChange={(e) => setFormData({ ...formData, caseId: e.target.value })}
                    className="select-field"
                    style={{ width: '100%' }}
                    disabled={casesLoading}
                  >
                    <option value="">{casesLoading ? 'Loading cases...' : 'No linked case'}</option>
                    {availableCases.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.caseNumber ? `${item.caseNumber} — ` : ''}{item.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: '18px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                    Description / Seizure Notes
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Physical condition, serial numbers, seizure circumstances..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="input-field"
                    style={{ width: '100%', resize: 'vertical' }}
                  />
                </div>
                </div>
                <div className="dialog-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="btn btn-secondary"
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? 'Registering...' : 'Secure & Register'}
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
