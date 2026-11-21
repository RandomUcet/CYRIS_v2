'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { RecordIdentifier, StatusBadge } from '@/components/common/Badges';
import { LoadingState, EmptyState, ErrorState } from '@/components/common/StateViews';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  Heart,
  Activity,
  Plus,
  RefreshCw,
  Tag,
  Truck,
  CheckCircle,
  X,
  FileText,
  Clock,
  ArrowRight,
  Shield,
  AlertTriangle,
} from 'lucide-react';
import type {
  MedicalEncounterDetail,
  MedicalTriageCategory,
  MedicalObservationType,
  MedicalIntervention,
  MedicalObservation,
} from '@cyris/contracts';
import { TriageBadge } from '@/components/medical/TriageBadge';

const medicalDialogTranslations: Record<string, string> = {
  "Assign Triage Category": "Nastavit kategorii třídění",
  "Triage Category": "Kategorie třídění",
  "Clinical Justification / Note": "Zdůvodnění / poznámka",
  "Justification for category change...": "Důvod změny kategorie…",
  "Record Observation / Vital": "Zaznamenat vitální funkce",
  "Observation Type": "Druh pozorování",
  "Value": "Hodnota",
  "Unit": "Jednotka",
  "Observation Note": "Poznámka k pozorování",
  "e.g. 115": "Např. 115",
  "e.g. bpm": "Např. tepů/min",
  "e.g. Tachycardia following chemical inhalation": "Např. tachykardie po inhalaci",
  "Record Medical Intervention": "Zaznamenat zdravotnický zákrok",
  "Intervention Type": "Druh zákroku",
  "Description": "Popis zákroku",
  "Outcome": "Výsledek",
  "e.g. OXYGEN_ADMINISTRATION, DECONTAMINATION": "Např. OXYGEN_ADMINISTRATION, DECONTAMINATION",
  "Details of procedure performed...": "Popište provedený zákrok…",
  "e.g. STABILIZED, IMPROVED, UNCHANGED": "Např. STABILIZED, IMPROVED, UNCHANGED",
  "Transfer Casualty Disposition": "Předání pacienta",
  "Destination Disposition": "Místo předání",
  "Transfer Notes / Handoff Summary": "Předávací zpráva",
  "Receiving team, transport callsign, vital trends...": "Přebírající tým, transport a vývoj vitálních funkcí…",
  "Field Aid Station": "Polní ošetřovna",
  "Ambulance Transport": "Převoz sanitkou",
  "General Hospital / Trauma Center": "Nemocnice / traumatologické centrum",
  "Morgue (Deceased)": "Márnice (zemřelý)",
  "Discharged / Returned to Duty": "Propuštěn / návrat do služby",
  "Cancel": "Zrušit",
  "Set Triage": "Uložit třídění",
  "Updating...": "Ukládám…",
  "Save Observation": "Uložit pozorování",
  "Saving...": "Ukládám…",
  "Record Procedure": "Uložit zákrok",
  "Recording...": "Ukládám…",
  "Execute Transfer": "Potvrdit předání",
  "Transferring...": "Předávám…",
  "Close": "Zavřít",
  "IMMEDIATE (Red - Life-threatening)": "Okamžitě (červená – ohrožení života)",
  "DELAYED (Yellow - Serious)": "Odloženě (žlutá – závažný stav)",
  "MINOR (Green - Walking wounded)": "Lehké (zelená – chodící ranění)",
  "EXPECTANT (Black - Non-viable)": "Velmi závažné (černá)",
  "UNKNOWN": "Neurčeno",
  "HEART_RATE (bpm)": "Srdeční frekvence (tepů/min)",
  "BLOOD_PRESSURE (e.g. 120/80)": "Krevní tlak (např. 120/80)",
  "SPO2 (%)": "Saturace kyslíkem (%)",
  "TEMPERATURE (°C)": "Tělesná teplota (°C)",
  "RESPIRATORY_RATE (/min)": "Dechová frekvence (/min)",
  "GCS (Glasgow Coma Scale)": "GCS (Glasgowská škála bezvědomí)",
  "OTHER": "Jiné"
};

export default function MedicalDetailPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;
  const encounterId = params.encounterId as string;
  const { user, hasPermission } = useAuth();
  const {formatTime, locale} = usePreferences();
  const trDialog = (value: string): string => locale === 'cs' ? medicalDialogTranslations[value] ?? value : value;

  const [encounter, setEncounter] = useState<MedicalEncounterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tabs: Overview, Observations, Interventions, Transfers
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'OBSERVATIONS' | 'INTERVENTIONS' | 'TRANSFERS'>('OVERVIEW');

  // Quick Action Modals
  const [showTriageModal, setShowTriageModal] = useState(false);
  const [newTriage, setNewTriage] = useState<MedicalTriageCategory>('IMMEDIATE');
  const [triageNote, setTriageNote] = useState('');

  const [showObservationModal, setShowObservationModal] = useState(false);
  const [obsForm, setObsForm] = useState<{
    observationType: MedicalObservationType;
    value: string;
    unit?: string;
    note?: string;
  }>({
    observationType: 'HEART_RATE',
    value: '',
    unit: 'bpm',
    note: '',
  });

  const [showInterventionModal, setShowInterventionModal] = useState(false);
  const [intForm, setIntForm] = useState<{
    interventionType: string;
    description: string;
    outcome?: string;
  }>({
    interventionType: 'AIRWAY_MANAGEMENT',
    description: '',
    outcome: 'IMPROVED',
  });

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferForm, setTransferForm] = useState<{
    disposition: string;
    transferNotes?: string;
    locationId?: string;
  }>({
    disposition: 'AID_STATION',
    transferNotes: '',
  });

  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const canTriage = hasPermission('medical.triage');
  const canObserve = hasPermission('medical.observe');
  const canIntervene = hasPermission('medical.intervene');
  const canTransfer = hasPermission('medical.transfer');
  const canClose = hasPermission('medical.close');

  const fetchEncounter = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getMedicalEncounter(eventId, encounterId);
      if (res.ok && res.data) {
        setEncounter(res.data);
      } else {
        setError(res.error || 'Failed to load medical encounter');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (eventId && encounterId) {
      fetchEncounter();
    }
  }, [eventId, encounterId]);

  const handleTriageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionPending(true);
    setActionError(null);
    try {
      const res = await apiClient.triageMedicalEncounter(eventId, encounterId, {
        triageCategory: newTriage,
        notes: triageNote.trim() || undefined,
      });
      if (res.ok && res.data) {
        setEncounter(res.data);
        setShowTriageModal(false);
        setTriageNote('');
      } else {
        setActionError(res.error || 'Failed to update triage category');
      }
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionPending(false);
    }
  };

  const handleObservationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!obsForm.value.trim()) {
      setActionError('Measurement value is required');
      return;
    }
    setActionPending(true);
    setActionError(null);
    try {
      const res = await apiClient.addMedicalObservation(eventId, encounterId, {
        observationType: obsForm.observationType,
        value: obsForm.value.trim(),
        unit: obsForm.unit?.trim() || undefined,
        note: obsForm.note?.trim() || undefined,
      });
      if (res.ok && res.data) {
        setShowObservationModal(false);
        setObsForm({ observationType: 'HEART_RATE', value: '', unit: 'bpm', note: '' });
        fetchEncounter();
      } else {
        setActionError(res.error || 'Failed to record vital observation');
      }
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionPending(false);
    }
  };

  const handleInterventionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!intForm.description.trim()) {
      setActionError('Intervention description is required');
      return;
    }
    setActionPending(true);
    setActionError(null);
    try {
      const res = await apiClient.addMedicalIntervention(eventId, encounterId, {
        interventionType: intForm.interventionType,
        description: intForm.description.trim(),
        outcome: intForm.outcome?.trim() || undefined,
      });
      if (res.ok && res.data) {
        setShowInterventionModal(false);
        setIntForm({ interventionType: 'AIRWAY_MANAGEMENT', description: '', outcome: 'IMPROVED' });
        fetchEncounter();
      } else {
        setActionError(res.error || 'Failed to record medical intervention');
      }
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionPending(false);
    }
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferForm.locationId) {
      setActionError('Transfer destination location is required');
      setActionPending(false);
      return;
    }
    try {
      const res = await apiClient.transferMedicalEncounter(eventId, encounterId, {
        disposition: transferForm.disposition,
        targetLocationId: transferForm.locationId,
      });
      if (res.ok && res.data) {
        setEncounter(res.data);
        setShowTransferModal(false);
      } else {
        setActionError(res.error || 'Failed to transfer casualty');
      }
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionPending(false);
    }
  };

  const handleStabilize = async () => {
    setActionPending(true);
    setActionError(null);
    try {
      const res = await apiClient.stabilizeMedicalEncounter(eventId, encounterId);
      if (res.ok && res.data) {
        setEncounter(res.data);
      } else {
        setActionError(res.error || 'Failed to stabilize encounter');
      }
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionPending(false);
    }
  };

  const handleClose = async () => {
    setActionPending(true);
    setActionError(null);
    try {
      const res = await apiClient.closeMedicalEncounter(eventId, encounterId, {
        status: 'CLOSED',
        disposition: 'Discharged / Closed by medical officer',
      });
      if (res.ok && res.data) {
        setEncounter(res.data);
      } else {
        setActionError(res.error || 'Failed to close encounter');
      }
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionPending(false);
    }
  };

  return (
    <AppShell
      title={encounter ? `${encounter.medicalNumber} — Casualty Encounter` : 'Medical Encounter'}
      breadcrumbs={[
        { label: 'Medical', href: `/events/${eventId}/medical` },
        { label: encounter?.medicalNumber || encounterId, href: `/events/${eventId}/medical/${encounterId}` },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={fetchEncounter}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          {canTriage && (
            <button
              onClick={() => setShowTriageModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 rounded transition"
            >
              <Tag size={13} />
              Set Triage
            </button>
          )}
          {encounter?.status !== 'STABILIZED' && encounter?.status !== 'CLOSED' && (
            <button
              onClick={handleStabilize}
              disabled={actionPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded transition"
            >
              <Activity size={13} />
              Mark Stabilized
            </button>
          )}
          {canTransfer && encounter?.status !== 'CLOSED' && (
            <button
              onClick={() => setShowTransferModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded transition"
            >
              <Truck size={13} />
              Transfer
            </button>
          )}
          {canClose && encounter?.status !== 'CLOSED' && (
            <button
              onClick={handleClose}
              disabled={actionPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition"
            >
              <CheckCircle size={13} />
              Close Record
            </button>
          )}
        </div>
      }
    >
      <div className="medical-workspace space-y-6 max-w-6xl mx-auto">
        {loading ? (
          <LoadingState message="Loading casualty medical record..." />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchEncounter} />
        ) : !encounter ? (
          <EmptyState title="Encounter not found" description="The medical encounter record could not be loaded." />
        ) : (
          <>
            {/* Header Banner: MED-0012 | Unknown casualty | IMMEDIATE · UNDER CARE */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 shadow">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <RecordIdentifier code={encounter.medicalNumber} />
                    <span className="text-slate-600">·</span>
                    <h2 className="text-base font-bold text-slate-100">
                      {encounter.personDisplayName || <span className="text-slate-400 italic">Unknown casualty</span>}
                    </h2>
                  </div>
                  <div className="text-xs text-slate-400 flex items-center gap-3 pt-1">
                    <span>Opened: {formatTime(encounter.openedAt)}</span>
                    <span>·</span>
                    <span>Disposition: <strong className="text-slate-300 font-mono">{encounter.disposition || 'Scene'}</strong></span>
                    {encounter.assignedUnitName && (
                      <>
                        <span>·</span>
                        <span>Unit: <strong className="text-slate-300 font-mono">{encounter.assignedUnitName}</strong></span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <TriageBadge category={encounter.triageCategory} />
                  <StatusBadge status={encounter.status} />
                </div>
              </div>
            </div>

            {actionError && (
              <div className="p-3 bg-red-950/50 border border-red-800 rounded text-red-300 text-xs font-mono">
                {actionError}
              </div>
            )}

            {/* Navigation Tabs (Overview, Observations, Interventions, Transfers) */}
            <div className="border-b border-slate-800 flex items-center gap-6 text-xs font-medium">
              <button
                onClick={() => setActiveTab('OVERVIEW')}
                className={`pb-2.5 transition border-b-2 ${
                  activeTab === 'OVERVIEW'
                    ? 'border-rose-500 text-rose-400 font-semibold'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab('OBSERVATIONS')}
                className={`pb-2.5 transition border-b-2 flex items-center gap-1.5 ${
                  activeTab === 'OBSERVATIONS'
                    ? 'border-rose-500 text-rose-400 font-semibold'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Observations ({encounter.observations.length})
              </button>
              <button
                onClick={() => setActiveTab('INTERVENTIONS')}
                className={`pb-2.5 transition border-b-2 flex items-center gap-1.5 ${
                  activeTab === 'INTERVENTIONS'
                    ? 'border-rose-500 text-rose-400 font-semibold'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Interventions ({encounter.interventions.length})
              </button>
              <button
                onClick={() => setActiveTab('TRANSFERS')}
                className={`pb-2.5 transition border-b-2 ${
                  activeTab === 'TRANSFERS'
                    ? 'border-rose-500 text-rose-400 font-semibold'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Transfers & Log
              </button>
            </div>

            {/* TAB CONTENT */}
            {activeTab === 'OVERVIEW' && (
              <div className="space-y-4">
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4 text-xs">
                  <div>
                    <h4 className="font-mono text-slate-400 uppercase tracking-wider text-[11px]">
                      Chief Complaint
                    </h4>
                    <p className="mt-1 text-slate-200 text-sm font-medium">
                      {encounter.chiefComplaint || 'No chief complaint recorded'}
                    </p>
                  </div>

                  <div>
                    <h4 className="font-mono text-slate-400 uppercase tracking-wider text-[11px]">
                      Mechanism of Injury
                    </h4>
                    <p className="mt-1 text-slate-300">
                      {encounter.mechanismOfInjury || 'No mechanism specified'}
                    </p>
                  </div>

                  <div>
                    <h4 className="font-mono text-slate-400 uppercase tracking-wider text-[11px]">
                      Clinical Assessment Summary
                    </h4>
                    <p className="mt-1 text-slate-300 whitespace-pre-wrap leading-relaxed">
                      {encounter.assessmentSummary || 'No clinical assessment summary recorded.'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'OBSERVATIONS' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold font-mono uppercase text-slate-300">
                    Structured Observations & Vitals
                  </h3>
                  {canObserve && (
                    <button
                      onClick={() => setShowObservationModal(true)}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded transition flex items-center gap-1.5"
                    >
                      <Plus size={13} />
                      Record Observation
                    </button>
                  )}
                </div>

                {encounter.observations.length === 0 ? (
                  <div className="bg-slate-900 border border-slate-800 rounded-lg p-8 text-center text-xs text-slate-500 font-mono">
                    No vitals or observations recorded yet.
                  </div>
                ) : (
                  <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow">
                    <table className="w-full text-left text-xs border-collapse font-mono">
                      <thead>
                        <tr className="bg-slate-950/70 border-b border-slate-800 text-slate-400 uppercase text-[11px]">
                          <th className="py-2.5 px-3 w-40">Time</th>
                          <th className="py-2.5 px-3 w-44">Observation Type</th>
                          <th className="py-2.5 px-3 w-36">Value</th>
                          <th className="py-2.5 px-3">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-sans">
                        {encounter.observations.map((obs) => (
                          <tr key={obs.id} className="hover:bg-slate-800/30">
                            <td className="py-2.5 px-3 font-mono text-slate-400">
                              {formatTime(obs.observedAt)}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-medium text-slate-200">
                              {obs.observationType}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-rose-300">
                              {obs.value} {obs.unit && <span className="text-slate-400 font-normal">{obs.unit}</span>}
                            </td>
                            <td className="py-2.5 px-3 text-slate-300">
                              {obs.note || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'INTERVENTIONS' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold font-mono uppercase text-slate-300">
                    Medical Procedures & Interventions
                  </h3>
                  {canIntervene && (
                    <button
                      onClick={() => setShowInterventionModal(true)}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded transition flex items-center gap-1.5"
                    >
                      <Plus size={13} />
                      Record Intervention
                    </button>
                  )}
                </div>

                {encounter.interventions.length === 0 ? (
                  <div className="bg-slate-900 border border-slate-800 rounded-lg p-8 text-center text-xs text-slate-500 font-mono">
                    No medical interventions recorded yet.
                  </div>
                ) : (
                  <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow">
                    <table className="w-full text-left text-xs border-collapse font-mono">
                      <thead>
                        <tr className="bg-slate-950/70 border-b border-slate-800 text-slate-400 uppercase text-[11px]">
                          <th className="py-2.5 px-3 w-40">Time</th>
                          <th className="py-2.5 px-3 w-48">Type</th>
                          <th className="py-2.5 px-3">Description</th>
                          <th className="py-2.5 px-3 w-36">Outcome</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-sans">
                        {encounter.interventions.map((intItem) => (
                          <tr key={intItem.id} className="hover:bg-slate-800/30">
                            <td className="py-2.5 px-3 font-mono text-slate-400">
                              {formatTime(intItem.performedAt)}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-medium text-slate-200">
                              {intItem.interventionType}
                            </td>
                            <td className="py-2.5 px-3 text-slate-200">
                              {intItem.description}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-emerald-400 font-semibold">
                              {intItem.outcome || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'TRANSFERS' && (
              <div className="space-y-4">
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4 text-xs font-mono">
                  <h3 className="font-bold uppercase text-slate-200 tracking-wider">
                    Operational Transfer & Disposition
                  </h3>

                  <div className="space-y-2 text-slate-300">
                    <div>Current Disposition: <strong className="text-white">{encounter.disposition || 'Scene'}</strong></div>
                    {encounter.transferredAt && (
                      <div>Transferred At: {formatTime(encounter.transferredAt)}</div>
                    )}
                    {encounter.stabilizedAt && (
                      <div>Stabilized At: {formatTime(encounter.stabilizedAt)}</div>
                    )}
                    {encounter.closedAt && (
                      <div>Closed At: {formatTime(encounter.closedAt)}</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Set Triage Modal */}
      {showTriageModal && (
        <div className="dialog-overlay medical-dialog-overlay" role="presentation">
          <form
            onSubmit={handleTriageSubmit}
            className="dialog-surface medical-dialog-surface" role="dialog" aria-modal="true" aria-labelledby="triage-dialog-title"
          >
            <div className="dialog-header medical-dialog-header">
              <h4 id="triage-dialog-title">{trDialog('Assign Triage Category')}</h4>
              <button
                type="button"
                onClick={() => setShowTriageModal(false)}
                className="medical-dialog-dismiss" aria-label={trDialog("Close")}
              >
                <X size={16} />
              </button>
            </div>

            <div className="dialog-body medical-dialog-body">
              <div>
                <label className="medical-dialog-label">{trDialog("Triage Category")}</label>
                <select
                  value={newTriage}
                  onChange={(e) => setNewTriage(e.target.value as MedicalTriageCategory)}
                  className="medical-dialog-control"
                >
                  <option value="IMMEDIATE">{trDialog("IMMEDIATE (Red - Life-threatening)")}</option>
                  <option value="DELAYED">{trDialog("DELAYED (Yellow - Serious)")}</option>
                  <option value="MINOR">{trDialog("MINOR (Green - Walking wounded)")}</option>
                  <option value="EXPECTANT">{trDialog("EXPECTANT (Black - Non-viable)")}</option>
                  <option value="UNKNOWN">{trDialog("UNKNOWN")}</option>
                </select>
              </div>

              <div>
                <label className="medical-dialog-label">{trDialog("Clinical Justification / Note")}</label>
                <textarea
                  value={triageNote}
                  onChange={(e) => setTriageNote(e.target.value)}
                  rows={3}
                  placeholder={trDialog("Justification for category change...")}
                  className="medical-dialog-control"
                />
              </div>
            </div>

            {actionError && <p className="medical-dialog-error" role="alert">{actionError}</p>}
            <div className="dialog-footer medical-dialog-footer">
              <button
                type="button"
                onClick={() => setShowTriageModal(false)}
                className="btn btn-secondary"
              >
                {trDialog("Cancel")}
              </button>
              <button
                type="submit"
                disabled={actionPending}
                className="btn btn-primary"
              >
                {actionPending ? 'Updating...' : 'Set Triage'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Record Observation Modal */}
      {showObservationModal && (
        <div className="dialog-overlay medical-dialog-overlay" role="presentation">
          <form
            onSubmit={handleObservationSubmit}
            className="dialog-surface medical-dialog-surface" role="dialog" aria-modal="true" aria-labelledby="observation-dialog-title"
          >
            <div className="dialog-header medical-dialog-header">
              <h4 id="observation-dialog-title">{trDialog('Record Observation / Vital')}</h4>
              <button
                type="button"
                onClick={() => setShowObservationModal(false)}
                className="medical-dialog-dismiss" aria-label={trDialog("Close")}
              >
                <X size={16} />
              </button>
            </div>

            <div className="dialog-body medical-dialog-body">
              <div>
                <label className="medical-dialog-label">{trDialog("Observation Type")}</label>
                <select
                  value={obsForm.observationType}
                  onChange={(e) => {
                    const t = e.target.value as MedicalObservationType;
                    let u = '';
                    if (t === 'HEART_RATE') u = 'bpm';
                    else if (t === 'BLOOD_PRESSURE') u = 'mmHg';
                    else if (t === 'SPO2') u = '%';
                    else if (t === 'TEMPERATURE') u = '°C';
                    else if (t === 'RESPIRATORY_RATE') u = '/min';
                    else if (t === 'GCS') u = 'points';
                    setObsForm({ ...obsForm, observationType: t, unit: u });
                  }}
                  className="medical-dialog-control"
                >
                  <option value="HEART_RATE">{trDialog("HEART_RATE (bpm)")}</option>
                  <option value="BLOOD_PRESSURE">{trDialog("BLOOD_PRESSURE (e.g. 120/80)")}</option>
                  <option value="SPO2">{trDialog("SPO2 (%)")}</option>
                  <option value="TEMPERATURE">{trDialog("TEMPERATURE (°C)")}</option>
                  <option value="RESPIRATORY_RATE">{trDialog("RESPIRATORY_RATE (/min)")}</option>
                  <option value="GCS">{trDialog("GCS (Glasgow Coma Scale)")}</option>
                  <option value="OTHER">{trDialog("OTHER")}</option>
                </select>
              </div>

              <div className="medical-dialog-two-col">
                <div>
                  <label className="medical-dialog-label">{trDialog("Value")} <span className="medical-required">*</span></label>
                  <input
                    type="text"
                    value={obsForm.value}
                    onChange={(e) => setObsForm({ ...obsForm, value: e.target.value })}
                    placeholder={trDialog("e.g. 115")}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-rose-500 font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="medical-dialog-label">{trDialog("Unit")}</label>
                  <input
                    type="text"
                    value={obsForm.unit || ''}
                    onChange={(e) => setObsForm({ ...obsForm, unit: e.target.value })}
                    placeholder={trDialog("e.g. bpm")}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-rose-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="medical-dialog-label">{trDialog("Observation Note")}</label>
                <input
                  type="text"
                  value={obsForm.note || ''}
                  onChange={(e) => setObsForm({ ...obsForm, note: e.target.value })}
                  placeholder={trDialog("e.g. Tachycardia following chemical inhalation")}
                  className="medical-dialog-control"
                />
              </div>
            </div>

            {actionError && <p className="medical-dialog-error" role="alert">{actionError}</p>}
            <div className="dialog-footer medical-dialog-footer">
              <button
                type="button"
                onClick={() => setShowObservationModal(false)}
                className="btn btn-secondary"
              >
                {trDialog("Cancel")}
              </button>
              <button
                type="submit"
                disabled={actionPending}
                className="btn btn-primary"
              >
                {actionPending ? 'Saving...' : 'Save Observation'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Record Intervention Modal */}
      {showInterventionModal && (
        <div className="dialog-overlay medical-dialog-overlay" role="presentation">
          <form
            onSubmit={handleInterventionSubmit}
            className="dialog-surface medical-dialog-surface" role="dialog" aria-modal="true" aria-labelledby="intervention-dialog-title"
          >
            <div className="dialog-header medical-dialog-header">
              <h4 id="intervention-dialog-title">{trDialog('Record Medical Intervention')}</h4>
              <button
                type="button"
                onClick={() => setShowInterventionModal(false)}
                className="medical-dialog-dismiss" aria-label={trDialog("Close")}
              >
                <X size={16} />
              </button>
            </div>

            <div className="dialog-body medical-dialog-body">
              <div>
                <label className="medical-dialog-label">{trDialog("Intervention Type")}</label>
                <input
                  type="text"
                  value={intForm.interventionType}
                  onChange={(e) => setIntForm({ ...intForm, interventionType: e.target.value })}
                  placeholder={trDialog("e.g. OXYGEN_ADMINISTRATION, DECONTAMINATION")}
                  className="medical-dialog-control"
                  required
                />
              </div>

              <div>
                <label className="medical-dialog-label">{trDialog("Description")} <span className="medical-required">*</span></label>
                <textarea
                  value={intForm.description}
                  onChange={(e) => setIntForm({ ...intForm, description: e.target.value })}
                  rows={3}
                  placeholder={trDialog("Details of procedure performed...")}
                  className="medical-dialog-control"
                  required
                />
              </div>

              <div>
                <label className="medical-dialog-label">{trDialog("Outcome")}</label>
                <input
                  type="text"
                  value={intForm.outcome || ''}
                  onChange={(e) => setIntForm({ ...intForm, outcome: e.target.value })}
                  placeholder={trDialog("e.g. STABILIZED, IMPROVED, UNCHANGED")}
                  className="medical-dialog-control"
                />
              </div>
            </div>

            {actionError && <p className="medical-dialog-error" role="alert">{actionError}</p>}
            <div className="dialog-footer medical-dialog-footer">
              <button
                type="button"
                onClick={() => setShowInterventionModal(false)}
                className="btn btn-secondary"
              >
                {trDialog("Cancel")}
              </button>
              <button
                type="submit"
                disabled={actionPending}
                className="btn btn-primary"
              >
                {actionPending ? 'Recording...' : 'Record Procedure'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Transfer Casualty Modal */}
      {showTransferModal && (
        <div className="dialog-overlay medical-dialog-overlay" role="presentation">
          <form
            onSubmit={handleTransferSubmit}
            className="dialog-surface medical-dialog-surface" role="dialog" aria-modal="true" aria-labelledby="transfer-dialog-title"
          >
            <div className="dialog-header medical-dialog-header">
              <h4 id="transfer-dialog-title">{trDialog('Transfer Casualty Disposition')}</h4>
              <button
                type="button"
                onClick={() => setShowTransferModal(false)}
                className="medical-dialog-dismiss" aria-label={trDialog("Close")}
              >
                <X size={16} />
              </button>
            </div>

            <div className="dialog-body medical-dialog-body">
              <div>
                <label className="medical-dialog-label">{trDialog("Destination Disposition")}</label>
                <select
                  value={transferForm.disposition}
                  onChange={(e) => setTransferForm({ ...transferForm, disposition: e.target.value })}
                  className="medical-dialog-control"
                >
                  <option value="AID_STATION">{trDialog("Field Aid Station")}</option>
                  <option value="AMBULANCE">{trDialog("Ambulance Transport")}</option>
                  <option value="HOSPITAL">{trDialog("General Hospital / Trauma Center")}</option>
                  <option value="MORGUE">{trDialog("Morgue (Deceased)")}</option>
                  <option value="DISCHARGED">{trDialog("Discharged / Returned to Duty")}</option>
                </select>
              </div>

              <div>
                <label className="medical-dialog-label">{trDialog("Transfer Notes / Handoff Summary")}</label>
                <textarea
                  value={transferForm.transferNotes || ''}
                  onChange={(e) => setTransferForm({ ...transferForm, transferNotes: e.target.value })}
                  rows={3}
                  placeholder={trDialog("Receiving team, transport callsign, vital trends...")}
                  className="medical-dialog-control"
                />
              </div>
            </div>

            {actionError && <p className="medical-dialog-error" role="alert">{actionError}</p>}
            <div className="dialog-footer medical-dialog-footer">
              <button
                type="button"
                onClick={() => setShowTransferModal(false)}
                className="btn btn-secondary"
              >
                {trDialog("Cancel")}
              </button>
              <button
                type="submit"
                disabled={actionPending}
                className="btn btn-primary"
              >
                {actionPending ? 'Transferring...' : 'Execute Transfer'}
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
