'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { RelationshipGraph } from '@/components/common/RelationshipGraph';
import { LoadingState, EmptyState, ErrorState } from '@/components/common/StateViews';
import { RecordIdentifier } from '@/components/common/Badges';
import { apiClient } from '@/lib/api-client';
import { Share2, RefreshCw, Filter, Layers, ArrowRight, ExternalLink } from 'lucide-react';

export default function DedicatedRelationshipsPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;

  const [relationships, setRelationships] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter
  const [selectedRelType, setSelectedRelType] = useState<string>('ALL');
  const [selectedNode, setSelectedNode] = useState<any | null>(null);

  const fetchRelationships = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getEventRelationships(eventId);
      if (res.ok && res.data) {
        setRelationships(Array.isArray(res.data) ? res.data : []);
      } else {
        setError(res.error || 'Failed to load event relationships');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (eventId) {
      fetchRelationships();
    }
  }, [eventId]);

  const uniqueTypes = useMemo(() => {
    const set = new Set<string>();
    relationships.forEach((r) => {
      if (r.relationshipType) set.add(r.relationshipType);
    });
    return Array.from(set);
  }, [relationships]);

  const filteredRelationships = useMemo(() => {
    if (selectedRelType === 'ALL') return relationships;
    return relationships.filter((r) => r.relationshipType === selectedRelType);
  }, [relationships, selectedRelType]);

  return (
    <AppShell
      breadcrumbs={[
        { label: 'Intelligence' },
        { label: 'Relationships' },
      ]}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        {/* Header Bar */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid var(--color-border-subtle)',
            background: 'var(--color-bg-surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: '18px',
                fontWeight: 700,
                color: 'var(--color-text-main)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Share2 size={18} color="var(--color-accent-ops)" />
              Event Intelligence & Resource Topology Graph
            </h1>
            <p style={{ margin: '3px 0 0 0', fontSize: '11px', color: 'var(--color-text-dim)' }}>
              Interactive relational topology across investigation cases, seized evidence, persons, organizations and affected assets.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Rel Type Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Filter size={13} color="var(--color-text-dim)" />
              <select
                value={selectedRelType}
                onChange={(e) => setSelectedRelType(e.target.value)}
                className="select-field"
                style={{ fontSize: '12px', padding: '4px 8px', height: '28px' }}
              >
                <option value="ALL">All Relationships ({relationships.length})</option>
                {uniqueTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={fetchRelationships}
              className="btn btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', fontSize: '12px' }}
            >
              <RefreshCw size={13} className={loading ? 'spin' : ''} />
              Refresh Graph
            </button>
          </div>
        </div>

        {/* Graph & Inspector Canvas */}
        <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            {loading ? (
              <div style={{ padding: '40px' }}>
                <LoadingState message="Rendering event-wide graph topology..." />
              </div>
            ) : error ? (
              <div style={{ padding: '40px' }}>
                <ErrorState message={error} onRetry={fetchRelationships} />
              </div>
            ) : relationships.length === 0 ? (
              <EmptyState
                title="No relationships established"
                description="The intelligence topology graph currently contains no connected links."
              />
            ) : (
              <RelationshipGraph
                relationships={filteredRelationships}
                height="100%"
                onNodeSelect={(node) => setSelectedNode(node)}
              />
            )}
          </div>

          {/* Node Context Inspector Panel */}
          {selectedNode && (
            <div
              style={{
                width: '320px',
                background: 'var(--color-bg-surface)',
                borderLeft: '1px solid var(--color-border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: 'var(--shadow-md)',
              }}
            >
              <div
                style={{
                  padding: '12px 16px',
                  background: 'var(--color-bg-panel)',
                  borderBottom: '1px solid var(--color-border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Layers size={14} color="var(--color-accent-ops)" />
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-main)' }}>
                    Selected Node Inspector
                  </span>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-text-dim)',
                    cursor: 'pointer',
                    fontSize: '11px',
                  }}
                >
                  Close
                </button>
              </div>

              <div style={{ padding: '16px', flex: 1, overflowY: 'auto' }}>
                <div style={{ marginBottom: '14px' }}>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '2px 6px',
                      background: 'rgba(2, 132, 199, 0.15)',
                      color: 'var(--color-accent-ops)',
                      borderRadius: '3px',
                      textTransform: 'uppercase',
                    }}
                  >
                    {selectedNode.type || 'RESOURCE'}
                  </span>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text-main)', marginTop: '6px' }}>
                    {selectedNode.label || selectedNode.id}
                  </div>
                  {selectedNode.subtitle && (
                    <div style={{ marginTop: '6px' }}>
                      <RecordIdentifier id={selectedNode.subtitle} prefix="" />
                    </div>
                  )}
                </div>

                <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: '12px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-dim)', marginBottom: '4px' }}>
                    Resource UUID
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      padding: '6px 8px',
                      background: 'var(--color-bg-panel)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--color-text-muted)',
                      wordBreak: 'break-all',
                    }}
                  >
                    {selectedNode.id}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button
                    onClick={() => {
                      // Navigate according to type
                      const type = (selectedNode.type || '').toLowerCase();
                      if (type.includes('case')) router.push(`/events/${eventId}/cases/${selectedNode.id}`);
                      else if (type.includes('evidence')) router.push(`/events/${eventId}/evidence/${selectedNode.id}`);
                      else if (type.includes('incident')) router.push(`/events/${eventId}/incidents/${selectedNode.id}`);
                      else if (type.includes('person')) router.push(`/events/${eventId}/registry/persons/${selectedNode.id}`);
                      else if (type.includes('organisation')) router.push(`/events/${eventId}/registry/organisations/${selectedNode.id}`);
                      else if (type.includes('vehicle')) router.push(`/events/${eventId}/registry/vehicles/${selectedNode.id}`);
                      else if (type.includes('device')) router.push(`/events/${eventId}/registry/devices/${selectedNode.id}`);
                      else if (type.includes('location')) router.push(`/events/${eventId}/registry/locations/${selectedNode.id}`);
                      else router.push(`/events/${eventId}/cases/${selectedNode.id}`);
                    }}
                    className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center', fontSize: '12px' }}
                  >
                    Open Canonical Record <ExternalLink size={13} style={{ marginLeft: '6px' }} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
