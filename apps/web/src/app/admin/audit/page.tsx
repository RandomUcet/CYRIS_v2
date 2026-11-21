'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { DataTable, Column } from '@/components/common/DataTable';
import { FilterBar } from '@/components/common/FilterBar';
import { RecordInspector } from '@/components/common/RecordInspector';
import { RecordIdentifier } from '@/components/common/Badges';
import { LoadingState, EmptyState, ErrorState } from '@/components/common/StateViews';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { ShieldAlert, RefreshCw, Layers, FileCode, CheckCircle, AlertOctagon } from 'lucide-react';

import type { AuditEventItem as AuditEntry } from '@cyris/contracts';

export default function AdminAuditPage() {
  const { hasPermission } = useAuth();
  const { formatTime, formatDate, locale } = usePreferences();
  const cs=locale==='cs';
  const tr=(cz:string,en:string)=>cs?cz:en;
  const displayDate=(stamp:string)=>stamp?formatDate(stamp)+' · '+formatTime(stamp):'—';
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);

  const fetchAudit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getAudit({
        limit: 100,
        category: categoryFilter || undefined,
      });

      if (res.ok && res.data) {
        setEntries(res.data.items || []);
        setTotal(res.data.total || 0);
      } else {
        setError(res.error || 'Failed to load institutional audit log');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAudit();
  }, [categoryFilter]);

  const filteredEntries = entries.filter((e) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      e.action?.toLowerCase().includes(s) ||
      e.category?.toLowerCase().includes(s) ||
      e.actorUserId?.toLowerCase().includes(s) ||
      e.resourceId?.toLowerCase().includes(s) ||
      e.ipAddress?.toLowerCase().includes(s)
    );
  });

  const columns: Column<AuditEntry>[] = [
    {
      header: tr('Datum a čas','Date and time'),
      accessor: (item) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-dim)' }}>
          <time dateTime={item.occurredAt} title={item.occurredAt}>{displayDate(item.occurredAt)}</time>
        </span>
      ),
      sortKey: 'occurredAt',
      width: '200px',
    },
    {
      header: tr('Kategorie','Category'),
      accessor: (item) => (
        <span
          style={{
            fontSize: '10px',
            fontWeight: 700,
            textTransform: 'uppercase',
            padding: '2px 5px',
            background: 'var(--color-bg-subtle)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: '3px',
            color: 'var(--color-text-muted)',
          }}
        >
          {item.category}
        </span>
      ),
      width: '120px',
    },
    {
      header: tr('Provedená akce','Action Executed'),
      accessor: (item) => (
        <span style={{ fontWeight: 600, color: 'var(--color-text-main)', fontSize: '12px' }}>
          {item.action}
        </span>
      ),
      sortKey: 'action',
    },
    {
      header: tr('Uživatel / aktér','Actor User'),
      accessor: (item) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-dim)' }}>
          {item.actorUserId ? item.actorUserId.slice(0, 8) : tr('Systém','System')}
        </span>
      ),
      width: '130px',
    },
    {
      header: tr('Cílový záznam','Target Resource'),
      accessor: (item) => (
        item.resourceId ? (
          <RecordIdentifier id={item.resourceId} prefix="" />
        ) : (
          <span style={{ color: 'var(--color-text-dim)', fontSize: '11px' }}>—</span>
        )
      ),
      width: '130px',
    },
    {
      header: tr('IP adresa původu','Origin IP'),
      accessor: (item) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-dim)' }}>
          {item.ipAddress || '—'}
        </span>
      ),
      width: '110px',
    },
  ];

  return (
    <AppShell
      breadcrumbs={[
        { label: 'Administration' },
        { label: tr('Bezpečnostní audit','Security & System Audit') },
      ]}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        {/* Header */}
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
              <ShieldAlert size={18} color="var(--color-accent-ops)" />
              {tr('Bezpečnostní audit a historie změn','Security & audit history')}
            </h1>
            <p style={{ margin: '3px 0 0 0', fontSize: '11px', color: 'var(--color-text-dim)' }}>
              {tr('Neměnné auditní záznamy provozu. Detail každé události obsahuje uložené metainformace.','Immutable operational audit history with stored event metadata.')}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={fetchAudit}
              className="btn btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', fontSize: '12px' }}
            >
              <RefreshCw size={13} className={loading ? 'spin' : ''} />
              {tr('Obnovit záznamy','Refresh logs')}
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <FilterBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder={tr('Hledat akci, uživatele, záznam nebo IP adresu…','Search action, user, resource or IP address…')}
            filters={[
              {
                label: tr('Kategorie','Category'),
                value: categoryFilter,
                options: [
                  { label: tr('Všechny kategorie','All Categories'), value: '' },
                  { label: tr('Přihlášení','Auth'), value: 'AUTH' },
                  { label: tr('Vyšetřování','Investigation'), value: 'INVESTIGATION' },
                  { label: tr('Důkazy','Evidence'), value: 'EVIDENCE' },
                  { label: tr('Laboratoř','Laboratory'), value: 'LABORATORY' },
                  { label: tr('Administrace','Admin'), value: 'ADMIN' },
                ],
                onChange: setCategoryFilter,
              },
            ]}
            onReset={() => {
              setSearch('');
              setCategoryFilter('');
            }}
            totalResults={filteredEntries.length}
          />
        </div>

        {/* Workspace Canvas with Table & Inspector */}
        <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '40px' }}>
                <LoadingState message={tr('Načítám auditní záznamy…','Loading audit records…')} />
              </div>
            ) : error ? (
              <div style={{ padding: '40px' }}>
                <ErrorState message={error} onRetry={fetchAudit} />
              </div>
            ) : entries.length === 0 ? (
              <EmptyState title={tr('Žádné auditní záznamy','Audit register is empty')} description={tr('Zatím nebyla nalezena žádná zaznamenaná událost.','No audit records found.')} />
            ) : (
              <DataTable
                columns={columns}
                data={filteredEntries}
                keyExtractor={(item) => item.id}
                onRowClick={(item) => setSelectedEntry(item)}
              />
            )}
          </div>

          {/* Right Inspector: Audit Event Payload Inspector */}
          {selectedEntry && (
            <div
              style={{
                width: '380px',
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
                  <FileCode size={14} color="var(--color-accent-ops)" />
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-main)' }}>
                    {tr('Detail auditní události','Audit record inspector')}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedEntry(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--color-text-dim)', cursor: 'pointer', fontSize: '11px' }}
                >
                  {tr('Zavřít','Close')}
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
                    {selectedEntry.category}
                  </span>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text-main)', marginTop: '6px' }}>
                    {selectedEntry.action}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', marginBottom: '16px' }}>
                  <div>
                    <span style={{ color: 'var(--color-text-dim)' }}>{tr('ID záznamu','Record ID')}: </span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{selectedEntry.id}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-text-dim)' }}>{tr('Datum a čas','Timestamp')}: </span>
                    <span>{displayDate(selectedEntry.occurredAt)}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-text-dim)' }}>{tr('ID aktéra','Actor user ID')}: </span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{selectedEntry.actorUserId || 'SYSTEM'}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-text-dim)' }}>{tr('Cílový záznam','Target resource')}: </span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{selectedEntry.resourceId || 'N/A'}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-text-dim)' }}>{tr('IP klienta','Client IP')}: </span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{selectedEntry.ipAddress || '—'}</span>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: '12px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-dim)', marginBottom: '8px' }}>
                    {tr('Metainformace události','Audit payload and diff')}
                  </div>
                  <pre
                    style={{
                      margin: 0,
                      padding: '10px',
                      background: 'var(--color-bg-panel)',
                      border: '1px solid var(--color-border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      color: 'var(--color-text-muted)',
                      maxHeight: '300px',
                      overflow: 'auto',
                    }}
                  >
                    {JSON.stringify(selectedEntry.metadata || {}, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
