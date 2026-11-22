'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { useDialogAccessibility } from '@/hooks/useDialogAccessibility';
import { DataTable, Column } from '@/components/common/DataTable';
import { FilterBar } from '@/components/common/FilterBar';
import { StatusBadge } from '@/components/common/Badges';
import { LoadingState, EmptyState, ErrorState } from '@/components/common/StateViews';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { Hash, Plus, RefreshCw, X, ArrowLeft, Shield } from 'lucide-react';
import type { TechnicalIndicatorDto, IndicatorType, VerificationState } from '@cyris/contracts';

export default function TechnicalIndicatorsPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const { hasPermission } = useAuth();
  const { formatDate } = usePreferences();

  const [indicators, setIndicators] = useState<TechnicalIndicatorDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');

  // Modal: Add Indicator
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  useDialogAccessibility(showModal, () => { if (!submitting) setShowModal(false); });
  const [formError, setFormError] = useState<string | null>(null);
  const [formData, setFormData] = useState<{
    indicatorType: IndicatorType;
    value: string;
    description: string;
    verificationState: 'CONFIRMED_MALICIOUS' | 'SUSPICIOUS' | 'UNVERIFIED' | 'BENIGN';
  }>({
    indicatorType: 'IP',
    value: '',
    description: '',
    verificationState: 'CONFIRMED_MALICIOUS',
  });

  const canCreate = hasPermission('indicator.create');

  const fetchIndicators = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getTechnicalIndicators(eventId);
      if (res.ok && res.data) {
        setIndicators(res.data);
      } else {
        setError(res.error || 'Failed to load technical indicators');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (eventId) {
      fetchIndicators();
    }
  }, [eventId]);

  const filteredIndicators = useMemo(() => {
    return indicators.filter((ind) => {
      const matchSearch =
        !search ||
        ind.value.toLowerCase().includes(search.toLowerCase()) ||
        ind.normalizedValue.toLowerCase().includes(search.toLowerCase()) ||
        ind.description?.toLowerCase().includes(search.toLowerCase());

      const matchType = !typeFilter || ind.indicatorType === typeFilter;
      const matchState = !stateFilter || ind.verificationState === stateFilter;
      return matchSearch && matchType && matchState;
    });
  }, [indicators, search, typeFilter, stateFilter]);

  const handleCreateIndicator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.value.trim()) {
      setFormError('Indicator value is required');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const res = await apiClient.createTechnicalIndicator(eventId, {
        indicatorType: formData.indicatorType,
        value: formData.value.trim(),
        description: formData.description.trim() || undefined,
        verificationState: formData.verificationState,
      });

      if (res.ok && res.data) {
        setShowModal(false);
        setFormData({
          indicatorType: 'IP',
          value: '',
          description: '',
          verificationState: 'CONFIRMED_MALICIOUS',
        });
        fetchIndicators();
      } else {
        setFormError(res.error || 'Failed to add indicator');
      }
    } catch (err: any) {
      setFormError(err.message || 'Network error');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: Column<TechnicalIndicatorDto>[] = [
    {
      header: 'Type',
      accessor: (row) => (
        <span
          className="badge badge-neutral"
          style={{ fontSize: '11px', fontFamily: 'monospace', fontWeight: 600 }}
        >
          {row.indicatorType}
        </span>
      ),
      width: '120px',
    },
    {
      header: 'Indicator Value',
      accessor: (row) => (
        <div>
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--color-accent-ops)',
              wordBreak: 'break-all',
            }}
          >
            {row.value}
          </span>
          {row.description && (
            <div style={{ fontSize: '12px', color: 'var(--color-text-dim)', marginTop: '2px' }}>
              {row.description}
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'Verification State',
      accessor: (row) => <StatusBadge status={row.verificationState} />,
      width: '140px',
    },
    {
      header: 'First Seen / Added',
      accessor: (row) => (
        <span style={{ fontSize: '12px', color: 'var(--color-text-dim)' }}>
          {formatDate(row.createdAt)}
        </span>
      ),
      width: '130px',
    },
  ];

  return (
    <AppShell
      breadcrumbs={[
        { label: 'Event', href: `/events/${eventId}/overview` },
        { label: 'Forensics', href: `/events/${eventId}/forensics` },
        { label: 'Technical Indicators', href: `/events/${eventId}/forensics/indicators` },
      ]}
    >
      <div className="workspace-container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-text-bright)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Hash size={20} color="var(--color-accent-ops)" />
              Technical Indicators (IOCs)
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--color-text-dim)' }}>
              Lightweight repository of observable network, system, and cryptographic indicators.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <Link href={`/events/${eventId}/forensics`} className="btn btn-secondary">
              <ArrowLeft size={14} style={{ marginRight: '6px' }} />
              Forensics Queue
            </Link>
            <button className="btn btn-secondary" onClick={fetchIndicators} title="Refresh indicators">
              <RefreshCw size={14} />
            </button>
            {canCreate && (
              <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                <Plus size={14} style={{ marginRight: '6px' }} />
                Add Indicator
              </button>
            )}
          </div>
        </div>

        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search indicators by IP, domain, hash, username..."
          filters={[
            {
              label: 'Type',
              value: typeFilter,
              options: [
                { label: 'All Types', value: '' },
                { label: 'IP Address', value: 'IP' },
                { label: 'Domain', value: 'DOMAIN' },
                { label: 'Hostname', value: 'HOSTNAME' },
                { label: 'Email', value: 'EMAIL' },
                { label: 'Username', value: 'USERNAME' },
                { label: 'File Hash', value: 'FILE_HASH' },
                { label: 'URL', value: 'URL' },
                { label: 'Other', value: 'OTHER' },
              ],
              onChange: setTypeFilter,
            },
            {
              label: 'Verification',
              value: stateFilter,
              options: [
                { label: 'All States', value: '' },
                { label: 'Verified', value: 'VERIFIED' },
                { label: 'Suspected', value: 'SUSPECTED' },
                { label: 'Unverified', value: 'UNVERIFIED' },
                { label: 'Refuted', value: 'REFUTED' },
              ],
              onChange: setStateFilter,
            },
          ]}
        />

        {loading ? (
          <LoadingState message="Loading technical indicators..." />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchIndicators} />
        ) : filteredIndicators.length === 0 ? (
          <EmptyState
            title="No Technical Indicators Found"
            description={
              search || typeFilter || stateFilter
                ? 'No indicators match the specified filters.'
                : 'No network, system, or file indicators recorded.'
            }
            action={
              canCreate ? (
                <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>
                  <Plus size={14} style={{ marginRight: '6px' }} />
                  Add Indicator
                </button>
              ) : undefined
            }
          />
        ) : (
          <div style={{ marginTop: '16px' }}>
            <DataTable
              columns={columns}
              data={filteredIndicators}
              keyExtractor={(row) => row.id}
            />
          </div>
        )}

        {/* Modal: Add Technical Indicator */}
        {showModal && (
          <div className="modal-backdrop" role="presentation">
            <div className="modal-dialog" role="dialog" aria-modal="true" aria-label="Add Technical Indicator" style={{ maxWidth: '520px' }}>
              <div className="modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Hash size={18} style={{ color: 'var(--color-accent-ops)' }} />
                  <h3 className="modal-title">Add Technical Indicator</h3>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowModal(false)}
                  style={{ padding: '4px' }}
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleCreateIndicator}>
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
                      <label className="field-label">Indicator Type *</label>
                      <select
                        className="field-input"
                        value={formData.indicatorType}
                        onChange={(e) =>
                          setFormData({ ...formData, indicatorType: e.target.value as IndicatorType })
                        }
                      >
                        <option value="IP">IP Address</option>
                        <option value="DOMAIN">Domain Name</option>
                        <option value="HOSTNAME">Hostname</option>
                        <option value="EMAIL">Email Address</option>
                        <option value="USERNAME">Username</option>
                        <option value="FILE_HASH">File Hash (SHA256/MD5)</option>
                        <option value="URL">URL</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="field-label">Verification State</label>
                      <select
                        className="field-input"
                        value={formData.verificationState}
                        onChange={(e) =>
                          setFormData({ ...formData, verificationState: e.target.value as any })
                        }
                      >
                        <option value="CONFIRMED_MALICIOUS">Confirmed Malicious</option>
                        <option value="SUSPICIOUS">Suspicious</option>
                        <option value="UNVERIFIED">Unverified</option>
                        <option value="BENIGN">Benign</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="field-label">Value *</label>
                    <input
                      type="text"
                      className="field-input"
                      placeholder="e.g. 10.42.18.7, evil.example, or SHA256 string"
                      value={formData.value}
                      onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                      required
                    />
                  </div>

                  <div>
                    <label className="field-label">Context / Description (optional)</label>
                    <input
                      type="text"
                      className="field-input"
                      placeholder="C2 callback node, attacker alias, exfiltration server..."
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    />
                  </div>
                </div>

                <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowModal(false)}
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? 'Adding...' : 'Add Indicator'}
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
