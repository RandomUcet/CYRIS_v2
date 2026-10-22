'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { DataTable, Column } from '@/components/common/DataTable';
import { LoadingState, EmptyState, ErrorState } from '@/components/common/StateViews';
import { apiClient } from '@/lib/api-client';
import { useEvent } from '@/contexts/EventContext';
import { Shield, RefreshCw, KeyRound, Check } from 'lucide-react';

interface RoleItem {
  id: string;
  name: string;
  slug: string;
  description?: string;
  scope: string;
  permissions?: Array<string | { permissionKey?: string; key?: string }>;
  createdAt: string;
}

export default function AdminRolesPage() {
  const { currentEvent } = useEvent();
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRoles = async () => {
    if (!currentEvent?.id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getRoles(currentEvent.id);
      if (res.ok && res.data) {
        setRoles(res.data);
      } else {
        setError(res.error || 'Failed to load roles');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, [currentEvent?.id]);

  const columns: Column<RoleItem>[] = [
    {
      header: 'Role Code',
      accessor: (item) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-text-main)', fontSize: '12px' }}>
          {item.slug}
        </span>
      ),
      sortKey: 'slug',
      width: '180px',
    },
    {
      header: 'Role Title & Description',
      accessor: (item) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--color-text-main)' }}>{item.name}</div>
          {item.description && (
            <div style={{ fontSize: '11px', color: 'var(--color-text-dim)' }}>{item.description}</div>
          )}
        </div>
      ),
      sortKey: 'name',
    },
    {
      header: 'Scope',
      accessor: (item) => (
        <span
          style={{
            fontSize: '10px',
            fontWeight: 700,
            padding: '2px 6px',
            background: 'var(--color-bg-subtle)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: '3px',
            color: 'var(--color-accent-ops)',
          }}
        >
          {item.scope}
        </span>
      ),
      width: '120px',
    },
    {
      header: 'Granted Permissions',
      accessor: (item) => {
        const perms = (item.permissions || []).map((permission) =>
          typeof permission === 'string' ? permission : permission.permissionKey || permission.key || String(permission)
        );
        if (perms.length === 0) return <span style={{ color: 'var(--color-text-dim)', fontSize: '11px' }}>Standard</span>;
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '400px' }}>
            {perms.slice(0, 4).map((p) => (
              <span
                key={p}
                style={{
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  padding: '1px 5px',
                  background: 'var(--color-bg-panel)',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: '2px',
                  color: 'var(--color-text-muted)',
                }}
              >
                {p}
              </span>
            ))}
            {perms.length > 4 && (
              <span style={{ fontSize: '10px', color: 'var(--color-text-dim)' }}>
                +{perms.length - 4} more
              </span>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <AppShell
      breadcrumbs={[
        { label: 'Administration' },
        { label: 'Roles & Permissions' },
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
              <KeyRound size={20} color="var(--color-accent-ops)" />
              Security Roles & Atomic Permission Catalogs
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--color-text-dim)' }}>
              Named bundles of atomic permissions evaluating under contextual predicates (PLATFORM, EVENT, UNIT, ASSIGNED, OWN).
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={fetchRoles}
              className="btn btn-secondary"
              title="Refresh roles"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <LoadingState message="Loading security role catalog..." />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchRoles} />
        ) : roles.length === 0 ? (
          <EmptyState
            title="No roles registered"
            description="No security roles defined for this event."
          />
        ) : (
          <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <DataTable
              columns={columns}
              data={roles}
              keyExtractor={(item) => item.id}
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}
