'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { RecordIdentifier, StatusBadge } from '@/components/common/Badges';
import { LoadingState, EmptyState, ErrorState } from '@/components/common/StateViews';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { workspaceLabel } from '@/lib/workspace-navigation';
import {
  Heart,
  Plus,
  RefreshCw,
  Search,
  Tag,
  Truck,
  UserCheck,
  AlertCircle,
  X,
  Activity,
  ArrowRight,
} from 'lucide-react';
import type {
  MedicalEncounterItem,
  MedicalTriageCategory,
  MedicalEncounterStatus,
} from '@cyris/contracts';
import { TriageBadge } from '@/components/medical/TriageBadge';

export default function MedicalPage() {
  const { formatTime, t, locale } = usePreferences();
  const tr = (label: string) => workspaceLabel(locale, label);
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventId = params.eventId as string;
  const initialView = searchParams.get('view') || 'active';

  const { hasPermission } = useAuth();

  const [encounters, setEncounters] = useState<MedicalEncounterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [activeTab, setActiveTab] = useState<'active' | 'triage' | 'transfers' | 'all'>(
    initialView === 'triage' ? 'triage' : initialView === 'transfers' ? 'transfers' : 'active'
  );
  const [search, setSearch] = useState('');
  const [triageFilter, setTriageFilter] = useState('');

  // Dynamically synchronize activeTab when searchParams change on client-side routing
  useEffect(() => {
    const view = searchParams.get('view');
    if (view === 'triage') setActiveTab('triage');
    else if (view === 'transfers') setActiveTab('transfers');
    else if (view === 'all') setActiveTab('all');
    else setActiveTab('active');
  }, [searchParams]);

  // Create Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [formData, setFormData] = useState<{
    chiefComplaint: string;
    mechanismOfInjury: string;
    assessmentSummary: string;
    triageCategory?: MedicalTriageCategory;
    incidentId?: string;
    locationId?: string;
  }>({
    chiefComplaint: '',
    mechanismOfInjury: '',
    assessmentSummary: '',
    triageCategory: 'UNKNOWN',
  });

  const canCreate = hasPermission('medical.create');

  const fetchEncounters = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.listMedicalEncounters(eventId);
      if (res.ok && res.data) {
        setEncounters(res.data);
      } else {
        setError(res.error || t('error.medicalLoad'));
      }
    } catch (err: any) {
      setError(err.message || t('error.network'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (eventId) {
      fetchEncounters();
    }
  }, [eventId]);

  useEffect(() => {
    if (!showCreateModal) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) setShowCreateModal(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showCreateModal, submitting]);

  const filteredEncounters = useMemo(() => {
    return encounters.filter((e) => {
      if (search) {
        const q = search.toLowerCase();
        const matches =
          e.medicalNumber.toLowerCase().includes(q) ||
          (e.chiefComplaint && e.chiefComplaint.toLowerCase().includes(q)) ||
          (e.personDisplayName && e.personDisplayName.toLowerCase().includes(q)) ||
          (e.assignedUnitName && e.assignedUnitName.toLowerCase().includes(q));
        if (!matches) return false;
      }

      if (triageFilter && e.triageCategory !== triageFilter) return false;

      if (activeTab === 'active') {
        return ['RECEIVED', 'TRIAGED', 'UNDER_CARE', 'STABILIZED'].includes(e.status);
      }
      if (activeTab === 'triage') {
        return e.status === 'TRIAGED' || e.triageCategory === 'IMMEDIATE';
      }
      if (activeTab === 'transfers') {
        return e.status === 'TRANSFERRED' || Boolean(e.transferredAt);
      }

      return true;
    });
  }, [encounters, search, triageFilter, activeTab]);

  const handleCreateEncounter = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setCreateError(null);
    try {
      const res = await apiClient.createMedicalEncounter(eventId, {
        chiefComplaint: formData.chiefComplaint.trim() || undefined,
        mechanismOfInjury: formData.mechanismOfInjury.trim() || undefined,
        assessmentSummary: formData.assessmentSummary.trim() || undefined,
        triageCategory: formData.triageCategory || 'UNKNOWN',
        incidentId: formData.incidentId || undefined,
        locationId: formData.locationId || undefined,
        visibility: 'UNIT',
      });

      if (res.ok && res.data) {
        setShowCreateModal(false);
        setFormData({
          chiefComplaint: '',
          mechanismOfInjury: '',
          assessmentSummary: '',
          triageCategory: 'UNKNOWN',
        });
        fetchEncounters();
        router.push(`/events/${eventId}/medical/${res.data.id}`);
      } else {
        setCreateError(res.error || t('error.medicalCreate'));
      }
    } catch (err: any) {
      setCreateError(err.message || t('error.network'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell
      title={t('page.medical.title')}
      breadcrumbs={[{ label: t('nav.medical'), href: `/events/${eventId}/medical` }]}
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={fetchEncounters}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            {t('action.refresh')}
          </button>
          {canCreate && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded transition shadow-sm"
            >
              <Plus size={14} />
              {t('medical.receive')}
            </button>
          )}
        </div>
      }
    >
      <div className="medical-workspace space-y-4">
        {/* Navigation Tabs & Filters */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 overflow-x-auto text-xs">
            <button
              onClick={() => router.push(`/events/${eventId}/medical`)}
              className={`px-3 py-1.5 rounded font-medium transition ${
                activeTab === 'active'
                  ? 'bg-rose-600 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {t('medical.active')}
            </button>
            <button
              onClick={() => router.push(`/events/${eventId}/medical?view=triage`)}
              className={`px-3 py-1.5 rounded font-medium transition ${
                activeTab === 'triage'
                  ? 'bg-rose-600 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {t('medical.triageQueue')}
            </button>
            <button
              onClick={() => router.push(`/events/${eventId}/medical?view=transfers`)}
              className={`px-3 py-1.5 rounded font-medium transition ${
                activeTab === 'transfers'
                  ? 'bg-rose-600 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {t('medical.transfers')}
            </button>
            <button
              onClick={() => router.push(`/events/${eventId}/medical?view=all`)}
              className={`px-3 py-1.5 rounded font-medium transition ${
                activeTab === 'all'
                  ? 'bg-rose-600 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {t('medical.allRecords')} ({encounters.length})
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2.5 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('medical.searchPlaceholder')}
                className="pl-8 pr-3 py-1 text-xs bg-slate-950 border border-slate-700 rounded text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-500 w-52"
              />
            </div>
            <select
              value={triageFilter}
              onChange={(e) => setTriageFilter(e.target.value)}
              className="px-2 py-1 text-xs bg-slate-950 border border-slate-700 rounded text-slate-300 focus:outline-none focus:border-rose-500"
            >
              <option value="">{t('medical.allTriage')}</option>
              <option value="IMMEDIATE">{t('triage.immediate')}</option>
              <option value="DELAYED">{t('triage.delayed')}</option>
              <option value="MINOR">{t('triage.minor')}</option>
              <option value="EXPECTANT">{t('triage.expectant')}</option>
              <option value="UNKNOWN">{t('triage.unknown')}</option>
            </select>
          </div>
        </div>

        {/* Casualty Run-Sheet Table (No card grid!) */}
        {loading ? (
          <LoadingState message={t('medical.loading')} />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchEncounters} />
        ) : filteredEncounters.length === 0 ? (
          <EmptyState
            title={t('empty.medical')}
            description={t('empty.medical.desc')}
          />
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/70 border-b border-slate-800 text-slate-400 uppercase font-mono tracking-wider text-[11px]">
                  <th className="py-2.5 px-3 w-28">{tr("Identifier")}</th>
                  <th className="py-2.5 px-3 w-40">{tr("Casualty / Person")}</th>
                  <th className="py-2.5 px-3">{tr("Chief Complaint & Presentation")}</th>
                  <th className="py-2.5 px-3 w-36">Triage</th>
                  <th className="py-2.5 px-3 w-32">{tr("Status")}</th>
                  <th className="py-2.5 px-3 w-36">{tr("Disposition")}</th>
                  <th className="py-2.5 px-3 w-28">{tr("Opened")}</th>
                  <th className="py-2.5 px-3 w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {filteredEncounters.map((enc) => {
                  const isDeceased = enc.status === 'DECEASED';
                  return (
                    <tr
                      key={enc.id}
                      onClick={() => router.push(`/events/${eventId}/medical/${enc.id}`)}
                      className={`cursor-pointer transition-colors ${
                        isDeceased ? 'bg-purple-950/20 hover:bg-purple-950/30' : 'hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-300">
                        <RecordIdentifier code={enc.medicalNumber} />
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-200">
                        {enc.personDisplayName || <span className="text-slate-400 italic">{tr("Unknown casualty")}</span>}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">
                        <div className="line-clamp-1">{enc.chiefComplaint || 'No initial complaint recorded'}</div>
                        {enc.mechanismOfInjury && (
                          <div className="text-[11px] text-slate-500 line-clamp-1 font-mono">
                            Mechanism: {enc.mechanismOfInjury}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <TriageBadge category={enc.triageCategory} />
                      </td>
                      <td className="py-2.5 px-3">
                        <StatusBadge status={enc.status} />
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">
                        {enc.disposition || 'Scene'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">
                        {formatTime(enc.openedAt)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-500">
                        <ArrowRight size={14} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Receive Casualty Modal */}
      {showCreateModal && (
        <div
          className="dialog-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !submitting) setShowCreateModal(false);
          }}
        >
          <form
            onSubmit={handleCreateEncounter}
            className="dialog-surface"
            role="dialog"
            aria-modal="true"
            aria-labelledby="medical-encounter-dialog-title"
          >
            <div className="dialog-header flex items-center justify-between">
              <h3 id="medical-encounter-dialog-title" className="font-semibold text-sm flex items-center gap-2">
                <Heart size={16} />
                {t('medical.receive')}
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="btn btn-ghost"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {createError && (
              <div className="mx-[18px] mt-4 p-2.5 bg-red-50 border border-red-200 rounded text-red-700 text-xs">
                {createError}
              </div>
            )}

            <div className="dialog-body space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-300 mb-1">{tr("Chief Complaint")}</label>
                <input
                  type="text"
                  value={formData.chiefComplaint}
                  onChange={(e) => setFormData({ ...formData, chiefComplaint: e.target.value })}
                  placeholder={tr("e.g. Acute respiratory distress, chemical vapor exposure")}
                  className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">{tr("Mechanism of Injury")}</label>
                <input
                  type="text"
                  value={formData.mechanismOfInjury}
                  onChange={(e) => setFormData({ ...formData, mechanismOfInjury: e.target.value })}
                  placeholder={tr("e.g. Inhalation near ventilation shaft, chemical leak")}
                  className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">{tr("Initial Triage Category")}</label>
                <select
                  value={formData.triageCategory}
                  onChange={(e) =>
                    setFormData({ ...formData, triageCategory: e.target.value as MedicalTriageCategory })
                  }
                  className="w-full px-2 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-300 focus:outline-none focus:border-rose-500 font-mono"
                >
                  <option value="IMMEDIATE">{tr("IMMEDIATE (Red - Life-threatening)")}</option>
                  <option value="DELAYED">{tr("DELAYED (Yellow - Serious but stable)")}</option>
                  <option value="MINOR">{tr("MINOR (Green - Walking wounded)")}</option>
                  <option value="EXPECTANT">{tr("EXPECTANT (Black - Severe/Non-viable)")}</option>
                  <option value="UNKNOWN">{tr("UNKNOWN (Pending initial assessment)")}</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">{tr("Assessment Summary")}</label>
                <textarea
                  value={formData.assessmentSummary}
                  onChange={(e) => setFormData({ ...formData, assessmentSummary: e.target.value })}
                  rows={3}
                  placeholder={tr("Initial airway, breathing, circulation, skin condition, responsiveness...")}
                  className="w-full p-2 bg-slate-950 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>

            <div className="dialog-footer flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
              className="btn btn-secondary"
              >
                {tr("Cancel")}
              </button>
              <button
                type="submit"
                disabled={submitting}
              className="btn btn-primary"
              >
              {submitting ? t('action.save') : t('medical.receive')}
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
