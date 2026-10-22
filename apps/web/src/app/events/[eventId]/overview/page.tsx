'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { apiClient } from '@/lib/api-client';
import { useEvent } from '@/contexts/EventContext';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { StatusBadge, PriorityBadge, RecordIdentifier } from '@/components/common/Badges';
import { LoadingState } from '@/components/common/StateViews';
import { CatchMeUpWidget } from '@/components/intelligence/CatchMeUpWidget';
import { ArrowRight } from 'lucide-react';
import { UnitCapabilityKeys } from '@cyris/contracts';

export default function OverviewPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params['eventId'] as string;
  const { selectedEvent, workspace, loadingWorkspace } = useEvent();
  const { isPlatformAdmin } = useAuth();
  const { formatTime, t } = usePreferences();

  const [loading, setLoading] = useState(true);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [cases, setCases] = useState<any[]>([]);
  const [evidence, setEvidence] = useState<any[]>([]);
  const [labAnalyses, setLabAnalyses] = useState<any[]>([]);
  const [timelineItems, setTimelineItems] = useState<any[]>([]);

  useEffect(() => {
    if (!eventId) return;

    let active = true;
    const loadOverview = async () => {
      setLoading(true);
      try {
        const [incRes, caseRes, evRes, labRes, tlRes] = await Promise.all([
          apiClient.getIncidents(eventId),
          apiClient.getCases(eventId),
          apiClient.getEvidence(eventId),
          apiClient.getLabAnalyses(eventId),
          apiClient.getEventTimeline(eventId),
        ]);

        if (!active) return;
        if (incRes.ok && incRes.data) setIncidents(incRes.data);
        if (caseRes.ok && caseRes.data) setCases(caseRes.data);
        if (evRes.ok && evRes.data) setEvidence(evRes.data);
        if (labRes.ok && labRes.data) setLabAnalyses(labRes.data);
        if (tlRes.ok && tlRes.data?.items) setTimelineItems(tlRes.data.items);
      } catch (err) {
        console.error('Failed to load overview data:', err);
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadOverview();
    return () => {
      active = false;
    };
  }, [eventId]);

  // Operational capabilities resolved for the current user in this event
  const caps = workspace?.capabilities ?? [];
  const hasOperationalContext = !isPlatformAdmin && Boolean(workspace?.unitIds.length);
  const hasInvestigation = hasOperationalContext && caps.includes(UnitCapabilityKeys.INVESTIGATION);
  const hasChemical = hasOperationalContext && caps.includes(UnitCapabilityKeys.CHEMICAL_ANALYSIS);
  const hasForensics = hasOperationalContext && caps.includes(UnitCapabilityKeys.DIGITAL_FORENSICS);
  const hasOps =
    hasOperationalContext &&
    (caps.includes(UnitCapabilityKeys.INCIDENT_OPERATIONS) ||
      caps.includes(UnitCapabilityKeys.TECHNICAL_OPERATIONS) ||
      caps.includes(UnitCapabilityKeys.CRISIS_MANAGEMENT));
  const hasEvidence =
    hasOperationalContext &&
    (caps.includes(UnitCapabilityKeys.EVIDENCE) ||
    hasInvestigation ||
    hasChemical ||
    hasForensics);

  // Filtered operational datasets
  const activeCases = cases
    .filter((c) => c.status === 'INVESTIGATING' || c.status === 'ACTIVE' || c.priority === 'CRITICAL' || c.priority === 'HIGH')
    .slice(0, 5);
  const activeIncidents = incidents
    .filter((i) => i.status !== 'CLOSED' && i.status !== 'RESOLVED')
    .slice(0, 5);
  const activeLabRequests = labAnalyses
    .filter((l) => l.status === 'REQUESTED' || l.status === 'IN_PROGRESS' || l.status === 'ACCEPTED')
    .slice(0, 5);
  const completedLabRequests = labAnalyses
    .filter((l) => l.status === 'COMPLETED' || l.status === 'APPROVED')
    .slice(0, 4);
  const recentEvidence = evidence.slice(0, 5);
  const recentActivity = timelineItems.slice(0, 7);

  const unitContextStr = workspace?.unitNames && workspace.unitNames.length > 0
    ? workspace.unitNames.join(' · ')
    : isPlatformAdmin
    ? 'Platform Administration'
    : 'Exercise Operator';

  return (
    <AppShell breadcrumbs={[{ label: 'Overview' }]}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 32px', width: '100%' }}>
        {/* Clean Operational Page Context (No decorative KPI boxes) */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="cyris-signal-marker" />
              <h1 style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>
                {selectedEvent?.name ?? 'Cybertron Exercise'}
              </h1>
              <StatusBadge status={selectedEvent?.status ?? 'ACTIVE'} />
            </div>
            <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
              {formatTime(new Date())}
            </div>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {unitContextStr} {selectedEvent?.description ? `— ${selectedEvent.description}` : ''}
          </div>
        </div>

        {/* Ambient Briefing Trigger Bar */}
        <CatchMeUpWidget />

        {loading ? (
          <LoadingState message="Resolving operational briefing..." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            {/* 1. INVESTIGATION SECTION (If user has investigation capability or platform admin) */}
            {hasInvestigation && (
              <div>
                <div className="cyris-section-header">
                  <span className="cyris-section-title">
                    <span className="cyris-signal-marker" />
                    {t('overview.investigations')}
                  </span>
                  <Link
                    href={`/events/${eventId}/cases`}
                    style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    {t('overview.allCases')} <ArrowRight size={11} />
                  </Link>
                </div>

                <div className="workspace-sheet">
                  {activeCases.length === 0 ? (
                    <div style={{ padding: '16px', fontSize: '12px', color: 'var(--text-dim)' }}>
                      {t('overview.noInvestigations')}
                    </div>
                  ) : (
                    activeCases.map((c) => (
                      <Link
                        key={c.id}
                        href={`/events/${eventId}/cases/${c.id}`}
                        className="workspace-row"
                      >
                        <div style={{ minWidth: '90px' }}>
                          <RecordIdentifier value={c.caseNumber} id={c.id} prefix="CASE" />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {c.title}
                          </div>
                          {c.summary && (
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                              {c.summary}
                            </div>
                          )}
                        </div>
                        <PriorityBadge priority={c.priority} />
                        <StatusBadge status={c.status} />
                      </Link>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* 2. ACTIVE INCIDENTS (If user has investigation, ops, or platform admin) */}
            {(hasInvestigation || hasOps) && (
              <div>
                <div className="cyris-section-header">
                  <span className="cyris-section-title">
                    <span className="cyris-signal-marker" />
                    Active Incidents
                  </span>
                  <Link
                    href={`/events/${eventId}/incidents`}
                    style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    All Incidents <ArrowRight size={11} />
                  </Link>
                </div>

                <div className="workspace-sheet">
                  {activeIncidents.length === 0 ? (
                    <div style={{ padding: '16px', fontSize: '12px', color: 'var(--text-dim)' }}>
                      {t('overview.noIncidents')}
                    </div>
                  ) : (
                    activeIncidents.map((inc) => (
                      <Link
                        key={inc.id}
                        href={`/events/${eventId}/incidents/${inc.id}`}
                        className="workspace-row"
                      >
                        <div style={{ minWidth: '90px' }}>
                          <RecordIdentifier value={inc.incidentNumber} id={inc.id} prefix="INC" />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {inc.title}
                          </div>
                        </div>
                        <PriorityBadge priority={inc.severity || 'MEDIUM'} />
                        <StatusBadge status={inc.status} />
                      </Link>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* 3. SPECIALIST ANALYSIS / LABORATORY WORK QUEUE (If user has chemical, forensics, or platform admin) */}
            {(hasChemical || hasForensics) && (
              <div>
                <div className="cyris-section-header">
                  <span className="cyris-section-title">
                    <span className="cyris-signal-marker" />
                    Analysis / Work Queue
                  </span>
                  <Link
                    href={`/events/${eventId}/lab`}
                    style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    All Requests <ArrowRight size={11} />
                  </Link>
                </div>

                <div className="workspace-sheet">
                  {activeLabRequests.length === 0 ? (
                    <div style={{ padding: '16px', fontSize: '12px', color: 'var(--text-dim)' }}>
                      {t('overview.noAnalysis')}
                    </div>
                  ) : (
                    activeLabRequests.map((lab) => (
                      <Link
                        key={lab.id}
                        href={`/events/${eventId}/lab`}
                        className="workspace-row"
                      >
                        <div style={{ minWidth: '90px' }}>
                          <RecordIdentifier value={lab.analysisNumber} id={lab.id} prefix="LAB" />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {lab.title || lab.analysisType}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            {lab.analysisType}
                          </div>
                        </div>
                        <PriorityBadge priority={lab.priority || 'MEDIUM'} />
                        <StatusBadge status={lab.status} />
                      </Link>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* 4. COMPLETED DETERMINATIONS (For Laboratory context) */}
            {hasChemical && !hasInvestigation && (
              <div>
                <div className="cyris-section-header">
                  <span className="cyris-section-title">
                    <span className="cyris-signal-marker" />
                    Recent Determinations
                  </span>
                </div>

                <div className="workspace-sheet">
                  {completedLabRequests.length === 0 ? (
                    <div style={{ padding: '16px', fontSize: '12px', color: 'var(--text-dim)' }}>
                      No completed determinations in current session.
                    </div>
                  ) : (
                    completedLabRequests.map((lab) => (
                      <div key={lab.id} className="workspace-row">
                        <div style={{ minWidth: '90px' }}>
                          <RecordIdentifier value={lab.analysisNumber} id={lab.id} prefix="LAB" />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {lab.title || lab.analysisType}
                          </div>
                          {lab.determination && (
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                              {lab.determination}
                            </div>
                          )}
                        </div>
                        <StatusBadge status={lab.status} />
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* 5. EVIDENCE (If user has evidence capability, or specialist/investigator) */}
            {hasEvidence && (
              <div>
                <div className="cyris-section-header">
                  <span className="cyris-section-title">
                    <span className="cyris-signal-marker" />
                    Secured Evidence Register
                  </span>
                  <Link
                    href={`/events/${eventId}/evidence`}
                    style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    All Evidence <ArrowRight size={11} />
                  </Link>
                </div>

                <div className="workspace-sheet">
                  {recentEvidence.length === 0 ? (
                    <div style={{ padding: '16px', fontSize: '12px', color: 'var(--text-dim)' }}>
                      {t('overview.noEvidence')}
                    </div>
                  ) : (
                    recentEvidence.map((ev) => (
                      <Link
                        key={ev.id}
                        href={`/events/${eventId}/evidence/${ev.id}`}
                        className="workspace-row"
                      >
                        <div style={{ minWidth: '90px' }}>
                          <RecordIdentifier value={ev.evidenceNumber} id={ev.id} prefix="E" />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {ev.title}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            {ev.kind} {ev.storageLocation ? `· Stored: ${ev.storageLocation}` : ''}
                          </div>
                        </div>
                        <StatusBadge status={ev.status} />
                      </Link>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* 6. RECENT OPERATIONAL ACTIVITY */}
            <div>
              <div className="cyris-section-header">
                <span className="cyris-section-title">
                  <span className="cyris-signal-marker" />
                  {t('overview.recentActivity')}
                </span>
                <Link
                  href={`/events/${eventId}/timeline`}
                  style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                >
                  Full Timeline <ArrowRight size={11} />
                </Link>
              </div>

              <div className="workspace-sheet">
                {recentActivity.length === 0 ? (
                  <div style={{ padding: '16px', fontSize: '12px', color: 'var(--text-dim)' }}>
                    No operational activities logged yet for this exercise.
                  </div>
                ) : (
                  recentActivity.map((act) => {
                    const timeStr = formatTime(act.occurredAt);
                    return (
                      <div key={act.id} className="workspace-row">
                        <div style={{ width: '130px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
                          {timeStr}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                            {act.title}
                          </div>
                          {act.summary && (
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '1px' }}>
                              {act.summary}
                            </div>
                          )}
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dim)' }}>
                          {act.activityType}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
