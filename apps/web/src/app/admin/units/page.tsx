'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { DataTable, Column } from '@/components/common/DataTable';
import { LoadingState, EmptyState, ErrorState } from '@/components/common/StateViews';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { useEvent } from '@/contexts/EventContext';
import { Network, Plus, RefreshCw, X, Sliders, ShieldCheck, Info } from 'lucide-react';
import { CAPABILITY_CATALOG } from '@cyris/contracts';

interface UnitItem {
  id: string;
  name: string;
  slug: string;
  description?: string;
  parentUnitId?: string | null;
  kind?: string;
  capabilities?: string[];
  createdAt: string;
}

export default function AdminUnitsPage() {
  const { hasPermission } = useAuth();
  const { currentEvent, events, selectEvent, refreshWorkspace } = useEvent();
  const [units, setUnits] = useState<UnitItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create Unit Modal
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    parentId: '',
    kind: 'TEAM',
  });

  // Unit Capabilities Modal
  const [selectedUnitForCaps, setSelectedUnitForCaps] = useState<UnitItem | null>(null);
  const [selectedCaps, setSelectedCaps] = useState<string[]>([]);
  const [savingCaps, setSavingCaps] = useState(false);
  const [capsError, setCapsError] = useState<string | null>(null);

  const canManage = hasPermission('unit.manage');

  const fetchUnits = async () => {
    if (!currentEvent?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getUnits(currentEvent.id);
      if (res.ok && res.data) {
        setUnits(res.data);
      } else {
        setError(res.error || 'Failed to load organizational units');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!currentEvent?.id && events.length > 0) {
      selectEvent(events[0].id);
    } else {
      void fetchUnits();
    }
  }, [currentEvent?.id, events]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.slug.trim()) {
      setFormError('Unit name and slug are required');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const res = await apiClient.createUnit(currentEvent!.id, {
        name: formData.name.trim(),
        slug: formData.slug.trim().toLowerCase(),
        description: formData.description.trim() || undefined,
        parentUnitId: formData.parentId.trim() || undefined,
        kind: formData.kind,
      });

      if (res.ok) {
        setShowModal(false);
        setFormData({ name: '', slug: '', description: '', parentId: '', kind: 'TEAM' });
        void fetchUnits();
      } else {
        setFormError(res.error || 'Failed to create unit');
      }
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const openCapabilitiesModal = (unit: UnitItem) => {
    setSelectedUnitForCaps(unit);
    setSelectedCaps(unit.capabilities ?? []);
    setCapsError(null);
  };

  const handleSaveCapabilities = async () => {
    if (!currentEvent?.id || !selectedUnitForCaps) return;

    setSavingCaps(true);
    setCapsError(null);
    try {
      const res = await apiClient.setUnitCapabilities(
        currentEvent.id,
        selectedUnitForCaps.id,
        selectedCaps
      );
      if (res.ok) {
        setSelectedUnitForCaps(null);
        await fetchUnits();
        await refreshWorkspace();
      } else {
        setCapsError(res.error || 'Failed to update capabilities');
      }
    } catch (err: any) {
      setCapsError(err.message || 'Failed to update capabilities');
    } finally {
      setSavingCaps(false);
    }
  };

  const toggleCap = (key: string) => {
    setSelectedCaps((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const columns: Column<UnitItem>[] = [
    {
      header: 'Slug / Code',
      accessor: (item) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)', fontSize: '12px' }}>
          {item.slug}
        </span>
      ),
      sortKey: 'slug',
      width: '140px',
    },
    {
      header: 'Type / Parent',
      accessor: (item) => (
        <div style={{ fontSize: '11px' }}>
          <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-active)' }}>
            {item.parentUnitId ? 'SUBTEAM' : (item.kind || 'TEAM')}
          </div>
          {item.parentUnitId && (
            <div style={{ color: 'var(--text-secondary)' }}>
              Parent: {units.find((parent) => parent.id === item.parentUnitId)?.name || '—'}
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'Unit / Team Name',
      accessor: (item) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.name}</div>
          {item.description && (
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{item.description}</div>
          )}
        </div>
      ),
      sortKey: 'name',
    },
    {
      header: 'Assigned Capabilities',
      accessor: (item) => {
        const caps = item.capabilities ?? [];
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {caps.length === 0 ? (
              <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                No capabilities assigned
              </span>
            ) : (
              caps.map((c) => (
                <span
                  key={c}
                  style={{
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    padding: '1px 6px',
                    borderRadius: 'var(--radius-xs)',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {c}
                </span>
              ))
            )}
          </div>
        );
      },
    },
    {
      header: 'Actions',
      accessor: (item) => (
        canManage ? (
          <button
            type="button"
            onClick={() => openCapabilitiesModal(item)}
            style={{
              padding: '2px 8px',
              fontSize: '11px',
              height: '24px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Sliders size={11} style={{ color: 'var(--accent-active)' }} />
            Capabilities
          </button>
        ) : null
      ),
      width: '120px',
    },
  ];

  return (
    <AppShell
      breadcrumbs={[
        { label: 'Administration' },
        { label: 'Units & Teams' },
      ]}
    >
      <div style={{ padding: '24px 32px' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
            borderBottom: '1px solid var(--border-default)',
            paddingBottom: '14px',
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
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              <Network size={18} style={{ color: 'var(--accent-active)' }} />
              Organizational Units & Capabilities
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
              Configure functional units and assign workspace capabilities for {currentEvent?.name || 'active event'}.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {events.length > 0 && (
              <select
                value={currentEvent?.id || ''}
                onChange={(e) => selectEvent(e.target.value)}
                style={{
                  fontSize: '11px',
                  padding: '4px 8px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-xs)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => void fetchUnits()}
              className="btn btn-secondary"
              title="Refresh units"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            {canManage && (
              <button
                onClick={() => setShowModal(true)}
                className="btn btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
              >
                <Plus size={14} />
                Create Unit
              </button>
            )}
          </div>
        </div>

        {/* Units DataTable */}
        {loading ? (
          <LoadingState message="Loading organizational units..." />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void fetchUnits()} />
        ) : units.length === 0 ? (
          <EmptyState
            title="No Organizational Units"
            description="Create your first specialist team or investigative division."
            action={
              canManage ? (
                <button onClick={() => setShowModal(true)} className="btn btn-primary">
                  Create Unit
                </button>
              ) : undefined
            }
          />
        ) : (
          <DataTable columns={columns} data={units} keyExtractor={(u) => u.id} />
        )}

        {/* Modal: Create Unit */}
        {showModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 100,
            }}
          >
            <div
              style={{
                width: '460px',
                background: 'var(--bg-panel)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: 'var(--bg-surface)',
                  borderBottom: '1px solid var(--border-default)',
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Add Organizational Unit
                </span>
                <button
                  onClick={() => setShowModal(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={15} />
                </button>
              </div>

              <form onSubmit={handleCreate} style={{ padding: '16px' }}>
                {formError && (
                  <div
                    style={{
                      padding: '8px 12px',
                      marginBottom: '12px',
                      background: 'var(--status-danger-bg)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: 'var(--radius-xs)',
                      fontSize: '11px',
                      color: 'var(--status-danger)',
                    }}
                  >
                    {formError}
                  </div>
                )}

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Unit Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Digital Forensics"
                    value={formData.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                      setFormData({ ...formData, name, slug: formData.slug || slug });
                    }}
                    style={{ width: '100%' }}
                    autoFocus
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Unit Type
                    </label>
                    <select value={formData.kind} onChange={(e) => setFormData({ ...formData, kind: e.target.value })} style={{ width: '100%' }}>
                      <option value="TEAM">Team</option>
                      <option value="SUBTEAM">Subteam</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Parent Team
                    </label>
                    <select value={formData.parentId} onChange={(e) => setFormData({ ...formData, parentId: e.target.value, kind: e.target.value ? 'SUBTEAM' : 'TEAM' })} style={{ width: '100%' }}>
                      <option value="">None — top-level team</option>
                      {units.filter((unit) => !unit.parentUnitId).map((unit) => (
                        <option key={unit.id} value={unit.id}>{unit.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Slug Identifier *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. digital-forensics"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    style={{ width: '100%' }}
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Operational Scope & Mandate
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Mandate, analytical capabilities, triage scope..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    style={{ width: '100%', resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="btn btn-secondary"
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? 'Registering...' : 'Register Unit'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Unit Capabilities Editor */}
        {selectedUnitForCaps && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.75)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 100,
            }}
          >
            <div
              style={{
                width: '560px',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--bg-panel)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                overflow: 'hidden',
              }}
            >
              {/* Modal Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 18px',
                  background: 'var(--bg-surface)',
                  borderBottom: '1px solid var(--border-default)',
                }}
              >
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Unit Capabilities: {selectedUnitForCaps.name}
                  </div>
                  <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                    {selectedUnitForCaps.slug}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedUnitForCaps(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={15} />
                </button>
              </div>

              {/* Explanatory Banner: Capability vs Permission */}
              <div
                style={{
                  padding: '10px 18px',
                  background: 'rgba(2, 132, 199, 0.08)',
                  borderBottom: '1px solid var(--border-subtle)',
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'flex-start',
                }}
              >
                <Info size={14} style={{ color: 'var(--accent-active)', marginTop: '2px', flexShrink: 0 }} />
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>Capability controls workspace relevance.</strong>{' '}
                  Permissions control authority. Assigning capabilities makes relevant workspaces available in navigation for members of this unit.
                </div>
              </div>

              {/* Error notice */}
              {capsError && (
                <div
                  style={{
                    padding: '8px 18px',
                    background: 'var(--status-danger-bg)',
                    borderBottom: '1px solid rgba(239, 68, 68, 0.3)',
                    fontSize: '11px',
                    color: 'var(--status-danger)',
                  }}
                >
                  {capsError}
                </div>
              )}

              {/* Capability Checklist */}
              <div style={{ padding: '14px 18px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {CAPABILITY_CATALOG.map((cap) => {
                  const isChecked = selectedCaps.includes(cap.key);
                  return (
                    <label
                      key={cap.key}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-xs)',
                        background: isChecked ? 'var(--bg-active)' : 'var(--bg-surface)',
                        border: isChecked ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                        cursor: 'pointer',
                        transition: 'background-color 0.1s ease',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleCap(cap.key)}
                        style={{ marginTop: '2px' }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {cap.name}
                          </span>
                          <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
                            {cap.key}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          {cap.description}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Modal Footer */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 18px',
                  background: 'var(--bg-surface)',
                  borderTop: '1px solid var(--border-default)',
                }}
              >
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {selectedCaps.length} capabilities selected
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setSelectedUnitForCaps(null)}
                    className="btn btn-secondary"
                    disabled={savingCaps}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveCapabilities()}
                    className="btn btn-primary"
                    disabled={savingCaps}
                  >
                    {savingCaps ? 'Saving...' : 'Save Capabilities'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
