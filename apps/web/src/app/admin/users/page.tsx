'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { DataTable, Column } from '@/components/common/DataTable';
import { LoadingState, EmptyState, ErrorState } from '@/components/common/StateViews';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { useEvent } from '@/contexts/EventContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { Users, RefreshCw, Shield, UserCheck } from 'lucide-react';

interface MembershipItem {
  id: string;
  userId: string;
  user?: {
    email: string;
    displayName: string;
    status: string;
  };
  unitId?: string;
  unit?: {
    name: string;
    slug: string;
  };
  roleId?: string;
  role?: {
    name: string;
    scope: string;
  };
  createdAt: string;
}

export default function AdminUsersPage() {
  const { currentEvent } = useEvent();
  const { formatDate } = usePreferences();
  const [memberships, setMemberships] = useState<MembershipItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMemberships = async () => {
    if (!currentEvent?.id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getMemberships(currentEvent.id);
      if (res.ok && res.data) {
        setMemberships(res.data);
      } else {
        setError(res.error || 'Failed to load user memberships');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMemberships();
  }, [currentEvent?.id]);

  const columns: Column<MembershipItem>[] = [
    {
      header: 'User Identity',
      accessor: (item) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--color-text-main)' }}>
            {item.user?.displayName || item.user?.email || item.userId.slice(0, 8)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-dim)' }}>
            {item.user?.email || item.userId}
          </div>
        </div>
      ),
      sortKey: 'userId',
    },
    {
      header: 'Assigned Unit',
      accessor: (item) => (
        <span style={{ fontWeight: 500, color: 'var(--color-accent-ops)', fontSize: '12px' }}>
          {item.unit?.name || (item.unitId ? `Unit ${item.unitId.slice(0, 8)}` : 'Platform / Global')}
        </span>
      ),
      width: '180px',
    },
    {
      header: 'Role Assignment',
      accessor: (item) => (
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            padding: '2px 6px',
            background: 'var(--color-bg-subtle)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: '3px',
            color: 'var(--color-text-main)',
          }}
        >
          {item.role?.name || (item.roleId ? `Role ${item.roleId.slice(0, 8)}` : 'Standard User')}
        </span>
      ),
      width: '180px',
    },
    {
      header: 'Membership UUID',
      accessor: (item) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-text-dim)' }}>
          {item.id}
        </span>
      ),
      width: '160px',
    },
    {
      header: 'Granted',
      accessor: (item) => (
        <span style={{ fontSize: '12px', color: 'var(--color-text-dim)' }}>
          {formatDate(item.createdAt)}
        </span>
      ),
      width: '100px',
    },
  ];

  return (
    <AppShell
      breadcrumbs={[
        { label: 'Administration' },
        { label: 'Users & Memberships' },
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
              <Users size={20} color="var(--color-accent-ops)" />
              User Memberships & Unit Rosters
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--color-text-dim)' }}>
              Accredited exercise participants, role bindings, and unit assignments for {currentEvent?.name || 'active event'}.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={fetchMemberships}
              className="btn btn-secondary"
              title="Refresh rosters"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <LoadingState message="Querying active memberships..." />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchMemberships} />
        ) : memberships.length === 0 ? (
          <EmptyState
            title="No event memberships"
            description="No users have been assigned to units for this exercise event."
          />
        ) : (
          <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <DataTable
              columns={columns}
              data={memberships}
              keyExtractor={(item) => item.id}
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}
