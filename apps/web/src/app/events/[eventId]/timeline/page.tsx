'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { TimelineView } from '@/components/common/TimelineView';
import { FilterBar } from '@/components/common/FilterBar';
import { LoadingState, EmptyState, ErrorState } from '@/components/common/StateViews';
import { apiClient } from '@/lib/api-client';
import { Clock, RefreshCw, Activity, Filter } from 'lucide-react';
import { ExplainTimelineModal } from '@/components/intelligence/ExplainTimelineModal';

export default function EventTimelinePage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Intelligence Explain Modal
  const [explainActivity, setExplainActivity] = useState<any | null>(null);

  const fetchTimeline = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getEventTimeline(eventId, typeFilter || undefined);
      if (res.ok && res.data) {
        setActivities(Array.isArray(res.data) ? res.data : []);
      } else {
        setError(res.error || 'Failed to load event timeline');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (eventId) {
      fetchTimeline();
    }
  }, [eventId, typeFilter]);

  const filteredActivities = useMemo(() => {
    return activities.filter((item) => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        item.title?.toLowerCase().includes(s) ||
        item.summary?.toLowerCase().includes(s) ||
        item.type?.toLowerCase().includes(s) ||
        item.reason?.toLowerCase().includes(s) ||
        item.resourceId?.toLowerCase().includes(s)
      );
    });
  }, [activities, search]);

  return (
    <AppShell
      breadcrumbs={[
        { label: 'Operations' },
        { label: 'Operational Timeline' },
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
              <Clock size={20} color="var(--color-accent-ops)" />
              Event Operational Activity Timeline
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--color-text-dim)' }}>
              Real-time chronological spine of exercise actions, custody transfers, laboratory determinations, and command taskings.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={fetchTimeline}
              className="btn btn-secondary"
              title="Refresh timeline stream"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Filter activities by keyword, reason, actor or affected resource..."
          filters={[
            {
              label: 'Activity Type',
              value: typeFilter,
              options: [
                { label: 'All Activities', value: '' },
                { label: 'Case Created', value: 'case.created' },
                { label: 'Case Updated', value: 'case.updated' },
                { label: 'Incident Reported', value: 'incident.reported' },
                { label: 'Incident Triaged', value: 'incident.triaged' },
                { label: 'Evidence Secured', value: 'evidence.created' },
                { label: 'Evidence Transferred', value: 'evidence.transferred' },
                { label: 'Lab Requested', value: 'lab.requested' },
                { label: 'Lab Completed', value: 'lab.completed' },
                { label: 'Lab Approved', value: 'lab.approved' },
              ],
              onChange: setTypeFilter,
            },
          ]}
          onReset={() => {
            setSearch('');
            setTypeFilter('');
          }}
          totalResults={filteredActivities.length}
        />

        {/* Timeline Content */}
        {loading ? (
          <LoadingState message="Reconstructing exercise chronological spine..." />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchTimeline} />
        ) : activities.length === 0 ? (
          <EmptyState
            title="Operational timeline is empty"
            description="No actions or events have been logged yet for this exercise edition."
          />
        ) : (
          <div
            style={{
              background: 'var(--color-bg-surface)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '24px 20px',
            }}
          >
            <TimelineView
              items={filteredActivities}
              onExplainActivity={(item) => setExplainActivity(item)}
            />
          </div>
        )}

        {/* Explain Timeline Modal */}
        <ExplainTimelineModal
          isOpen={Boolean(explainActivity)}
          onClose={() => setExplainActivity(null)}
          activityId={explainActivity?.id}
          resourceId={explainActivity?.resourceId}
          eventTitle={explainActivity?.title}
        />
      </div>
    </AppShell>
  );
}
