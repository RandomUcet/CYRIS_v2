'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';
import { usePreferences } from '@/contexts/PreferencesContext';

interface LabPanelProps {
  eventId: string;
}

export function LabPanel({ eventId }: LabPanelProps) {
  const { formatTime } = usePreferences();
  const [analyses, setAnalyses] = useState<any[]>([]);
  const [evidenceList, setEvidenceList] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedAnalysis, setSelectedAnalysis] = useState<any | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Forms
  const [createForm, setCreateForm] = useState({
    analysisType: 'DIGITAL_FORENSICS',
    evidenceIds: [] as string[],
    purpose: '',
  });

  const [updateForm, setUpdateForm] = useState({
    status: '',
    method: '',
    findings: '',
    conclusion: '',
  });

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [labRes, evRes] = await Promise.all([
        apiClient.getLabAnalyses(eventId),
        apiClient.getEvidence(eventId),
      ]);
      if (labRes.ok && labRes.data) setAnalyses(labRes.data);
      if (evRes.ok && evRes.data) setEvidenceList(evRes.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (id: string) => {
    setSelectedId(id);
    try {
      const [aRes, tlRes] = await Promise.all([
        apiClient.getLabAnalysis(eventId, id),
        apiClient.getResourceTimeline(id),
      ]);
      if (aRes.ok && aRes.data) {
        setSelectedAnalysis(aRes.data);
        setUpdateForm({
          status: aRes.data.status,
          method: aRes.data.method || '',
          findings: aRes.data.findings || '',
          conclusion: aRes.data.conclusion || '',
        });
      }
      if (tlRes.ok && tlRes.data?.items) setTimeline(tlRes.data.items);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    void loadData();
  }, [eventId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.analysisType || createForm.evidenceIds.length === 0) {
      setError('Please select at least one evidence item');
      return;
    }
    const res = await apiClient.createLabAnalysis(eventId, createForm);
    if (res.ok) {
      setCreateForm({ analysisType: 'DIGITAL_FORENSICS', evidenceIds: [], purpose: '' });
      await loadData();
    } else {
      setError(res.error || 'Failed to request analysis');
    }
  };

  const handleUpdate = async (newStatus?: string) => {
    if (!selectedId) return;
    const payload = {
      ...updateForm,
      ...(newStatus ? { status: newStatus } : {}),
    };
    const res = await apiClient.updateLabAnalysis(eventId, selectedId, payload);
    if (res.ok) {
      await loadDetail(selectedId);
      await loadData();
    } else {
      setError(res.error || 'Failed to update analysis');
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <h4>Request Laboratory Analysis</h4>
          <input
            placeholder="Analysis Type *"
            value={createForm.analysisType}
            onChange={(e) => setCreateForm({ ...createForm, analysisType: e.target.value })}
            required
          />
          <textarea
            placeholder="Purpose / Instructions"
            value={createForm.purpose}
            onChange={(e) => setCreateForm({ ...createForm, purpose: e.target.value })}
            rows={2}
          />
          <div>
            <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Attach Evidence:</label>
            <div style={{ maxHeight: '120px', overflowY: 'auto', border: '1px solid var(--border)', padding: '0.4rem', borderRadius: '4px' }}>
              {evidenceList.map((ev) => (
                <label key={ev.id} style={{ display: 'flex', gap: '0.4rem', fontSize: '0.8rem', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={createForm.evidenceIds.includes(ev.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setCreateForm({ ...createForm, evidenceIds: [...createForm.evidenceIds, ev.id] });
                      } else {
                        setCreateForm({ ...createForm, evidenceIds: createForm.evidenceIds.filter((id) => id !== ev.id) });
                      }
                    }}
                  />
                  <span>{ev.evidenceNumber}: {ev.title}</span>
                </label>
              ))}
            </div>
          </div>
          <button type="submit">Submit Request</button>
        </form>

        <div className="divider" />

        <h4>Laboratory Analyses</h4>
        {loading ? <p>Loading...</p> : (
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {analyses.map((a) => (
              <li
                key={a.id}
                onClick={() => void loadDetail(a.id)}
                style={{
                  padding: '0.75rem',
                  border: selectedId === a.id ? '2px solid #3b82f6' : '1px solid var(--border)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  background: selectedId === a.id ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
                }}
              >
                <strong>{a.analysisNumber}</strong>: {a.analysisType}
                <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                  Status: <strong>{a.status}</strong> · Ev items: {a.evidenceIds?.length ?? 0}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        {selectedAnalysis ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '6px' }}>
              <h3>{selectedAnalysis.analysisNumber}: {selectedAnalysis.analysisType}</h3>
              <div style={{ fontSize: '0.85rem', color: '#6b7280', margin: '0.5rem 0', display: 'flex', gap: '1rem' }}>
                <span>Status: <strong>{selectedAnalysis.status}</strong></span>
                <span>Requested: {formatTime(selectedAnalysis.requestedAt)}</span>
              </div>
              <p style={{ margin: '0.5rem 0' }}>Purpose: {selectedAnalysis.purpose || 'None'}</p>
              <div>
                <strong>Evidence Inputs ({selectedAnalysis.evidenceIds?.length ?? 0}):</strong>
                <ul style={{ listStyle: 'none', padding: 0, marginTop: '0.3rem' }}>
                  {selectedAnalysis.evidenceIds?.map((eid: string) => (
                    <li key={eid} style={{ fontSize: '0.85rem', color: '#4b5563' }}>• Evidence ID: <code>{eid}</code></li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Workflow actions */}
            <div style={{ padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <h4>Workflow Actions & Findings</h4>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {selectedAnalysis.status === 'REQUESTED' && (
                  <>
                    <button type="button" onClick={() => void handleUpdate('ACCEPTED')}>Accept Request</button>
                    <button type="button" onClick={() => void handleUpdate('REJECTED')}>Reject Request</button>
                  </>
                )}
                {selectedAnalysis.status === 'ACCEPTED' && (
                  <button type="button" onClick={() => void handleUpdate('IN_PROGRESS')}>Start Work</button>
                )}
                {selectedAnalysis.status === 'IN_PROGRESS' && (
                  <button type="button" onClick={() => void handleUpdate('COMPLETED')}>Complete Analysis</button>
                )}
                {selectedAnalysis.status === 'COMPLETED' && (
                  <button type="button" onClick={() => void handleUpdate('APPROVED')}>Approve Analysis</button>
                )}
              </div>

              <textarea
                placeholder="Method"
                value={updateForm.method}
                onChange={(e) => setUpdateForm({ ...updateForm, method: e.target.value })}
                rows={2}
              />
              <textarea
                placeholder="Findings"
                value={updateForm.findings}
                onChange={(e) => setUpdateForm({ ...updateForm, findings: e.target.value })}
                rows={3}
              />
              <textarea
                placeholder="Conclusion"
                value={updateForm.conclusion}
                onChange={(e) => setUpdateForm({ ...updateForm, conclusion: e.target.value })}
                rows={2}
              />
              <button type="button" onClick={() => void handleUpdate()}>Save Findings & Method</button>
            </div>

            {/* Timeline */}
            <div>
              <h4>Analysis Timeline ({timeline.length} events)</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {timeline.map((item) => (
                  <div key={item.id} style={{ padding: '0.5rem 0.75rem', borderLeft: '3px solid #8b5cf6', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '4px' }}>
                    <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{formatTime(item.occurredAt)} · {item.activityType}</div>
                    <div style={{ fontWeight: 600 }}>{item.title}</div>
                    {item.summary && <div style={{ fontSize: '0.85rem' }}>{item.summary}</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p style={{ color: '#6b7280' }}>Select an analysis on the left to inspect details, update workflow status, and view timeline.</p>
        )}
      </div>
    </div>
  );
}
