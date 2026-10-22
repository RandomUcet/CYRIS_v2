'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';
import { usePreferences } from '@/contexts/PreferencesContext';

interface CasesPanelProps {
  eventId: string;
}

export function CasesPanel({ eventId }: CasesPanelProps) {
  const { formatTime } = usePreferences();
  const [casesList, setCasesList] = useState<any[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [selectedCase, setSelectedCase] = useState<any | null>(null);
  const [caseTimeline, setCaseTimeline] = useState<any[]>([]);
  const [relationships, setRelationships] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({ title: '', summary: '', priority: 'MEDIUM' });

  const loadCases = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getCases(eventId);
      if (res.ok && res.data) {
        setCasesList(res.data);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadCaseDetail = async (caseId: string) => {
    setSelectedCaseId(caseId);
    try {
      const [cRes, tlRes, relRes] = await Promise.all([
        apiClient.getCase(eventId, caseId),
        apiClient.getCaseTimeline(caseId),
        apiClient.getRelationships(caseId),
      ]);
      if (cRes.ok && cRes.data) setSelectedCase(cRes.data);
      if (tlRes.ok && tlRes.data?.items) setCaseTimeline(tlRes.data.items);
      if (relRes.ok && relRes.data) setRelationships(relRes.data);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    void loadCases();
  }, [eventId]);

  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title) return;
    const res = await apiClient.createCase(eventId, form);
    if (res.ok) {
      setForm({ title: '', summary: '', priority: 'MEDIUM' });
      await loadCases();
    } else {
      setError(res.error || 'Failed to create case');
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <form onSubmit={handleCreateCase} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <h4>Open New Investigation Case</h4>
          <input
            placeholder="Case Title *"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
          <textarea
            placeholder="Summary"
            value={form.summary}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
            rows={2}
          />
          <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            <option value="LOW">LOW</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HIGH">HIGH</option>
            <option value="CRITICAL">CRITICAL</option>
          </select>
          <button type="submit">Create Case</button>
        </form>

        <div className="divider" />

        <h4>Cases</h4>
        {loading ? <p>Loading...</p> : (
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {casesList.map((c) => (
              <li
                key={c.id}
                onClick={() => void loadCaseDetail(c.id)}
                style={{
                  padding: '0.75rem',
                  border: selectedCaseId === c.id ? '2px solid #3b82f6' : '1px solid var(--border)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  background: selectedCaseId === c.id ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
                }}
              >
                <strong>{c.caseNumber}</strong>: {c.title}
                <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                  Status: {c.status} · Priority: {c.priority}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        {selectedCase ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '6px' }}>
              <h3>{selectedCase.caseNumber}: {selectedCase.title}</h3>
              <p style={{ margin: '0.5rem 0', color: '#4b5563' }}>{selectedCase.summary || 'No summary provided.'}</p>
              <div style={{ fontSize: '0.85rem', color: '#6b7280', display: 'flex', gap: '1rem' }}>
                <span>Status: <strong>{selectedCase.status}</strong></span>
                <span>Priority: <strong>{selectedCase.priority}</strong></span>
                <span>Opened: {formatTime(selectedCase.openedAt)}</span>
              </div>
            </div>

            <div>
              <h4>Related Resources & Evidence ({relationships.length})</h4>
              {relationships.length === 0 ? <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>No resources linked yet.</p> : (
                <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {relationships.map((r) => (
                    <li key={r.id} style={{ fontSize: '0.85rem', padding: '0.4rem 0.6rem', background: 'var(--card-hover)', borderRadius: '4px' }}>
                      Relation: <code>{r.relationshipType}</code> ➔ Target: <code>{r.targetResourceId}</code>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h4>Case Aggregated Timeline ({caseTimeline.length} events)</h4>
              {caseTimeline.length === 0 ? <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>No timeline events recorded.</p> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {caseTimeline.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        padding: '0.6rem 0.8rem',
                        borderLeft: '3px solid #3b82f6',
                        background: 'var(--card-bg)',
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#6b7280' }}>
                        <span>{formatTime(item.occurredAt)}</span>
                        <span>{item.activityType}</span>
                      </div>
                      <div style={{ fontWeight: 600, marginTop: '0.2rem' }}>{item.title}</div>
                      {item.summary && <div style={{ fontSize: '0.85rem', marginTop: '0.2rem' }}>{item.summary}</div>}
                      {item.reason && <div style={{ fontSize: '0.8rem', color: '#4b5563', marginTop: '0.2rem' }}>Reason: {item.reason}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <p style={{ color: '#6b7280' }}>Select a case on the left to inspect overview, related resources, and aggregated timeline.</p>
        )}
      </div>
    </div>
  );
}
