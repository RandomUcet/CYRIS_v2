'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { DataTable, Column } from '@/components/common/DataTable';
import { FilterBar } from '@/components/common/FilterBar';
import { RecordIdentifier, StatusBadge, PriorityBadge } from '@/components/common/Badges';
import { LoadingState, EmptyState, ErrorState } from '@/components/common/StateViews';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { Cpu, Plus, RefreshCw, X, ArrowRight, Hash, HardDrive, Shield } from 'lucide-react';
import type { ForensicAnalysisListItemDto, ForensicAnalysisType, ForensicPriority } from '@cyris/contracts';

export default function ForensicsListPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;
  const { hasPermission } = useAuth();
  const { formatDate } = usePreferences();

  const [analyses, setAnalyses] = useState<ForensicAnalysisListItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Modal: Request Analysis
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formData, setFormData] = useState<{
    analysisType: ForensicAnalysisType;
    priority: ForensicPriority;
    purpose: string;
    methodology: string;
    evidenceId?: string;
    deviceId?: string;
  }>({
    analysisType: 'DISK_IMAGE',
    priority: 'MEDIUM',
    purpose: '',
    methodology: '',
    evidenceId: '',
    deviceId: '',
  });

  const canRequest = hasPermission('forensics.request');

  const fetchAnalyses = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getForensicAnalyses(eventId);
      if (res.ok && res.data) {
        setAnalyses(res.data);
      } else {
        setError(res.error || 'Failed to load forensic analysis queue');
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
        a.purpose?.toLowerCase().includes(search.toLowerCase()) ||
        a.analysisType?.toLowerCase().includes(search.toLowerCase());

      const matchStatus = !statusFilter || a.status === statusFilter;
      const matchType = !typeFilter || a.analysisType === typeFilter;
      return matchSearch && matchStatus && matchType;
    });
  }, [analyses, search, statusFilter, typeFilter]);

  const handleCreateAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.purpose.trim()) {
      setFormError('Purpose / description is required');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const payload: any = {
        analysisType: formData.analysisType,
        priority: formData.priority,
        purpose: formData.purpose.trim(),
      };
      if (formData.methodology.trim()) payload.methodology = formData.methodology.trim();
      if (formData.evidenceId?.trim()) payload.evidenceIds = [formData.evidenceId.trim()];
      if (formData.deviceId?.trim()) payload.deviceIds = [formData.deviceId.trim()];

      const res = await apiClient.createForensicAnalysis(eventId, payload);
      if (res.ok && res.data) {
        setShowCreateModal(false);
        setFormData({
          analysisType: 'DISK_IMAGE',
          priority: 'MEDIUM',
          purpose: '',
          methodology: '',
          evidenceId: '',
          deviceId: '',
        });
        fetchAnalyses();
        router.push(`/events/${eventId}/forensics/${res.data.id}`);
      } else {
        setFormError(res.error || 'Failed to request analysis');
      }
    } catch (err: any) {
      setFormError(err.message || 'Network error');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: Column<ForensicAnalysisListItemDto>[] = [
    {
      header: 'Identifier',
      accessor: (row) => <RecordIdentifier value={row.analysisNumber} />,
      width: '120px',
    },
    {
      header: 'Analysis Type',
      accessor: (row) => (
        <span className="badge badge-neutral" style={{ fontSize: '11px', fontFamily: 'monospace' }}>
          {row.analysisType.replace(/_/g, ' ')}
        </span>
      ),
      width: '160px',
    },
    {
      header: 'Purpose / Focus',
      accessor: (row) => (
        <div>
          <div style={{ fontWeight: 500, color: 'var(--color-text-bright)' }}>
            {row.purpose || 'No purpose specified'}
          </div>
          {row.conclusion && (
            <div style={{ fontSize: '12px', color: 'var(--color-text-dim)', marginTop: '2px' }}>
              Conclusion: {row.conclusion.slice(0, 80)}...
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'Priority',
      accessor: (row) => <PriorityBadge priority={row.priority} />,
      width: '100px',
    },
    {
      header: 'Status',
      accessor: (row) => <StatusBadge status={row.status} />,
      width: '130px',
    },
    {
      header: 'Requested',
      accessor: (row) => (
        <span style={{ fontSize: '12px', color: 'var(--color-text-dim)' }}>
          {formatDate(row.requestedAt)}
        </span>
      ),
      width: '110px',
    },
    {
      header: '',
      accessor: (row) => (
        <Link
          href={`/events/${eventId}/forensics/${row.id}`}
          className="btn btn-secondary btn-sm"
          style={{ padding: '3px 8px' }}
        >
          View <ArrowRight size={13} style={{ marginLeft: '4px' }} />
        </Link>
      ),
      width: '80px',
    },
  ];

  return (
    <AppShell
      breadcrumbs={[
        { label: 'Event', href: `/events/${eventId}/overview` },
        { label: 'Forensics & Technical Operations', href: `/events/${eventId}/forensics` },
      ]}
    >
      <div className="workspace-container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-text-bright)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Cpu size={20} color="var(--color-accent-ops)" />
              Digital Forensics & Technical Operations
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--color-text-dim)' }}>
              Specialist digital acquisition, disk/memory analysis, reverse engineering, and technical indicators.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <Link href={`/events/${eventId}/forensics/indicators`} className="btn btn-secondary">
              <Hash size={14} style={{ marginRight: '6px' }} />
              Technical Indicators
            </Link>
            <button className="btn btn-secondary" onClick={fetchAnalyses} title="Refresh analysis queue">
              <RefreshCw size={14} />
            </button>
            {canRequest && (
              <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
                <Plus size={14} style={{ marginRight: '6px' }} />
                Request Forensic Analysis
              </button>
            )}
          </div>
        </div>

        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by FOR-ID, purpose, or type..."
          filters={[
            {
              label: 'Status',
              value: statusFilter,
              options: [
                { label: 'All Statuses', value: '' },
                { label: 'Requested', value: 'REQUESTED' },
                { label: 'Accepted', value: 'ACCEPTED' },
                { label: 'In Progress', value: 'IN_PROGRESS' },
                { label: 'Completed', value: 'COMPLETED' },
                { label: 'Approved', value: 'APPROVED' },
                { label: 'Rejected', value: 'REJECTED' },
                { label: 'Cancelled', value: 'CANCELLED' },
              ],
              onChange: setStatusFilter,
            },
            {
              label: 'Analysis Type',
              value: typeFilter,
              options: [
                { label: 'All Types', value: '' },
                { label: 'Disk Image', value: 'DISK_IMAGE' },
                { label: 'File Analysis', value: 'FILE_ANALYSIS' },
                { label: 'Memory Analysis', value: 'MEMORY_ANALYSIS' },
                { label: 'Network Analysis', value: 'NETWORK_ANALYSIS' },
                { label: 'Mobile Device', value: 'MOBILE_DEVICE' },
                { label: 'Malware Analysis', value: 'MALWARE_ANALYSIS' },
                { label: 'Log Analysis', value: 'LOG_ANALYSIS' },
                { label: 'Account Analysis', value: 'ACCOUNT_ANALYSIS' },
                { label: 'Other', value: 'OTHER' },
              ],
              onChange: setTypeFilter,
            },
          ]}
        />

        {loading ? (
          <LoadingState message="Loading forensic analyses..." />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchAnalyses} />
        ) : filteredAnalyses.length === 0 ? (
          <EmptyState
            title="No Forensic Analyses Found"
            description={
              search || statusFilter || typeFilter
                ? 'No analyses match the current filters.'
                : 'No digital forensics or technical analyses have been requested for this event.'
            }
            action={
              canRequest ? (
                <button className="btn btn-primary btn-sm" onClick={() => setShowCreateModal(true)}>
                  <Plus size={14} style={{ marginRight: '6px' }} />
                  Request Forensic Analysis
                </button>
              ) : undefined
            }
          />
        ) : (
          <div style={{ marginTop: '16px' }}>
            <DataTable
              columns={columns}
              data={filteredAnalyses}
              keyExtractor={(row) => row.id}
              onRowClick={(row) => router.push(`/events/${eventId}/forensics/${row.id}`)}
            />
          </div>
        )}

        {/* Modal: Request Forensic Analysis */}
        {showCreateModal && (
          <div className="modal-backdrop">
            <div className="modal-dialog" style={{ maxWidth: '580px' }}>
              <div className="modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Cpu size={18} style={{ color: 'var(--color-accent-ops)' }} />
                  <h3 className="modal-title">Request Forensic Analysis</h3>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowCreateModal(false)}
                  style={{ padding: '4px' }}
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleCreateAnalysis}>
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

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label className="field-label">Analysis Type *</label>
                      <select
                        className="field-input"
                        value={formData.analysisType}
                        onChange={(e) =>
                          setFormData({ ...formData, analysisType: e.target.value as ForensicAnalysisType })
                        }
                      >
                        <option value="DISK_IMAGE">Disk Image Analysis</option>
                        <option value="FILE_ANALYSIS">File Analysis</option>
                        <option value="MEMORY_ANALYSIS">Memory Analysis</option>
                        <option value="NETWORK_ANALYSIS">Network Packet Analysis</option>
                        <option value="MOBILE_DEVICE">Mobile Device Extraction</option>
                        <option value="MALWARE_ANALYSIS">Malware Analysis</option>
                        <option value="LOG_ANALYSIS">Log Analysis</option>
                        <option value="ACCOUNT_ANALYSIS">Account Analysis</option>
                        <option value="OTHER">Other Technical Analysis</option>
                      </select>
                    </div>

                    <div>
                      <label className="field-label">Priority</label>
                      <select
                        className="field-input"
                        value={formData.priority}
                        onChange={(e) =>
                          setFormData({ ...formData, priority: e.target.value as ForensicPriority })
                        }
                      >
                        <option value="LOW">Low</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="HIGH">High</option>
                        <option value="CRITICAL">Critical</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="field-label">Purpose / Focus *</label>
                    <textarea
                      className="field-input"
                      rows={3}
                      placeholder="e.g. Extract chat logs, browser history, and identify persistence mechanisms on acquired laptop image."
                      value={formData.purpose}
                      onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                      required
                    />
                  </div>

                  <div>
                    <label className="field-label">Suggested Methodology / Toolchain (optional)</label>
                    <input
                      type="text"
                      className="field-input"
                      placeholder="e.g. Autopsy / Volatility 3 / Wireshark / Ghidra"
                      value={formData.methodology}
                      onChange={(e) => setFormData({ ...formData, methodology: e.target.value })}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label className="field-label">Evidence Item ID (optional)</label>
                      <input
                        type="text"
                        className="field-input"
                        placeholder="UUID of evidence item"
                        value={formData.evidenceId}
                        onChange={(e) => setFormData({ ...formData, evidenceId: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="field-label">Device ID (optional)</label>
                      <input
                        type="text"
                        className="field-input"
                        placeholder="UUID of device"
                        value={formData.deviceId}
                        onChange={(e) => setFormData({ ...formData, deviceId: e.target.value })}
                      />
                    </div>
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
                    {submitting ? 'Submitting...' : 'Submit Request'}
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
