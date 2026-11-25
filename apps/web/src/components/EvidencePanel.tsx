'use client';

import { useState, useEffect } from 'react';
import type { TransferEvidenceRequest, CustodyHolderType } from '@cyris/contracts';
import { CustodyRecipientPicker } from '@/app/events/[eventId]/evidence/[evidenceId]/CustodyRecipientPicker';
import { apiClient } from '@/lib/api-client';
import { usePreferences } from '@/contexts/PreferencesContext';

interface EvidencePanelProps {
  eventId: string;
}

export function EvidencePanel({ eventId }: EvidencePanelProps) {
  const { formatTime } = usePreferences();
  const [evidenceList, setEvidenceList] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [relationships, setRelationships] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Forms
  const [createForm, setCreateForm] = useState({
    title: '',
    evidenceType: 'PHYSICAL',
    description: '',
    condition: 'INTACT',
    currentHolderType: 'USER',
    currentHolderId: '',
  });

  const [transferForm, setTransferForm] = useState<TransferEvidenceRequest>({
    toHolderType: 'UNIT',
    toHolderId: '',
    reason: '',
    notes: '',
  });

  const loadEvidence = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getEvidence(eventId);
      if (res.ok && res.data) setEvidenceList(res.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (id: string) => {
    setSelectedId(id);
    try {
      const [evRes, tlRes, relRes] = await Promise.all([
        apiClient.getEvidenceItem(eventId, id),
        apiClient.getResourceTimeline(id),
        apiClient.getRelationships(id),
      ]);
      if (evRes.ok && evRes.data) setSelectedItem(evRes.data);
      if (tlRes.ok && tlRes.data?.items) setTimeline(tlRes.data.items);
      if (relRes.ok && relRes.data) setRelationships(relRes.data);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    void loadEvidence();
  }, [eventId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.title || !createForm.currentHolderId) return;
    const res = await apiClient.createEvidence(eventId, createForm);
    if (res.ok) {
      setCreateForm({
        title: '',
        evidenceType: 'PHYSICAL',
        description: '',
        condition: 'INTACT',
        currentHolderType: 'USER',
        currentHolderId: '',
      });
      await loadEvidence();
    } else {
      setError(res.error || 'Failed to register evidence');
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !transferForm.toHolderId || !transferForm.reason.trim()) return;
    const res = await apiClient.transferEvidence(eventId, selectedId, transferForm);
    if (res.ok) {
      setTransferForm({ toHolderType: 'UNIT', toHolderId: '', reason: '', notes: '' });
      await loadDetail(selectedId);
      await loadEvidence();
    } else {
      setError(res.error || 'Failed to transfer evidence');
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <h4>Register Evidence</h4>
          <input
            placeholder="Evidence Title *"
            value={createForm.title}
            onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
            required
          />
          <input
            placeholder="Type (e.g. DIGITAL, PHYSICAL, WEAPON) *"
            value={createForm.evidenceType}
            onChange={(e) => setCreateForm({ ...createForm, evidenceType: e.target.value })}
            required
          />
          <input
            placeholder="Initial Holder ID (UUID/Code) *"
            value={createForm.currentHolderId}
            onChange={(e) => setCreateForm({ ...createForm, currentHolderId: e.target.value })}
            required
          />
          <select
            value={createForm.currentHolderType}
            onChange={(e) => setCreateForm({ ...createForm, currentHolderType: e.target.value })}
          >
            <option value="USER">USER</option>
            <option value="UNIT">UNIT</option>
            <option value="STORAGE">STORAGE</option>
          </select>
          <input
            placeholder="Condition (e.g. SEALED, DAMAGED)"
            value={createForm.condition}
            onChange={(e) => setCreateForm({ ...createForm, condition: e.target.value })}
          />
          <textarea
            placeholder="Description"
            value={createForm.description}
            onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
            rows={2}
          />
          <button type="submit">Register Item</button>
        </form>

        <div className="divider" />

        <h4>Evidence Items</h4>
        {loading ? <p>Loading...</p> : (
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {evidenceList.map((item) => (
              <li
                key={item.id}
                onClick={() => void loadDetail(item.id)}
                style={{
                  padding: '0.75rem',
                  border: selectedId === item.id ? '2px solid #3b82f6' : '1px solid var(--border)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  background: selectedId === item.id ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
                }}
              >
                <strong>{item.evidenceNumber}</strong>: {item.title}
                <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                  {item.evidenceType} · Status: {item.status} · Holder: {item.currentHolderName??(item.currentHolderType==='STORAGE'?item.currentHolderId:item.currentHolderType)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        {selectedItem ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '6px' }}>
              <h3>{selectedItem.evidenceNumber}: {selectedItem.title}</h3>
              <p style={{ margin: '0.5rem 0', color: '#4b5563' }}>{selectedItem.description || 'No description provided.'}</p>
              <div style={{ fontSize: '0.85rem', color: '#6b7280', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <span>Type: <strong>{selectedItem.evidenceType}</strong></span>
                <span>Status: <strong>{selectedItem.status}</strong></span>
                <span>Current Holder: <strong>{selectedItem.currentHolderName??(selectedItem.currentHolderType==='STORAGE'?selectedItem.currentHolderId:selectedItem.currentHolderType)}</strong></span>
                <span>Condition: {selectedItem.condition || 'N/A'}</span>
              </div>
            </div>

            {/* Transfer Custody Form */}
            <form onSubmit={handleTransfer} style={{ padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <h4>Transfer Chain of Custody</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <select
                  value={transferForm.toHolderType}
                  onChange={(e) => setTransferForm({ ...transferForm, toHolderType: e.target.value as CustodyHolderType,toHolderId:'' })}
                >
                  <option value="USER">USER</option>
                  <option value="UNIT">UNIT</option>
                  <option value="STORAGE">STORAGE</option>
                </select>
                {transferForm.toHolderType==='STORAGE'?<input placeholder="Storage location" maxLength={255} value={transferForm.toHolderId} onChange={e=>setTransferForm(old=>({...old,toHolderId:e.target.value}))} required/>:<CustodyRecipientPicker key={selectedId+':'+transferForm.toHolderType} eventId={eventId} evidenceId={selectedId!} type={transferForm.toHolderType} value={transferForm.toHolderId} disabled={false} onChange={id=>setTransferForm(old=>({...old,toHolderId:id}))}/>} 
              </div>
              <input
                placeholder="Reason for Transfer" required
                value={transferForm.reason}
                onChange={(e) => setTransferForm({ ...transferForm, reason: e.target.value })}
              />
              <input
                placeholder="Notes / Condition check"
                value={transferForm.notes}
                onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })}
              />
              <button type="submit">Record Custody Transfer</button>
            </form>

            {/* Custody History */}
            <div>
              <h4>Chain of Custody History ({selectedItem.custodyHistory?.length ?? 0} transfers)</h4>
              {(!selectedItem.custodyHistory || selectedItem.custodyHistory.length === 0) ? (
                <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>No custody transfer events.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {selectedItem.custodyHistory.map((h: any) => (
                    <div key={h.id} style={{ padding: '0.5rem 0.75rem', background: 'var(--card-hover)', borderRadius: '4px', fontSize: '0.85rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280' }}>
                        <span>{formatTime(h.occurredAt)}</span>
                        <span>Transferred by: {h.transferredByName??'Recorded account'}</span>
                      </div>
                      <div>
                        From <strong>{h.fromHolderName??(h.fromHolderType==='STORAGE'?h.fromHolderId:h.fromHolderType)}</strong> ➔ To <strong>{h.toHolderName??(h.toHolderType==='STORAGE'?h.toHolderId:h.toHolderType)}</strong>
                      </div>
                      {h.reason && <div style={{ color: '#4b5563' }}>Reason: {h.reason}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Timeline */}
            <div>
              <h4>Evidence Timeline ({timeline.length} events)</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {timeline.map((item) => (
                  <div key={item.id} style={{ padding: '0.5rem 0.75rem', borderLeft: '3px solid #10b981', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '4px' }}>
                    <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{formatTime(item.occurredAt)} · {item.activityType}</div>
                    <div style={{ fontWeight: 600 }}>{item.title}</div>
                    {item.summary && <div style={{ fontSize: '0.85rem' }}>{item.summary}</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p style={{ color: '#6b7280' }}>Select an evidence item on the left to inspect details, custody history, and timeline.</p>
        )}
      </div>
    </div>
  );
}
