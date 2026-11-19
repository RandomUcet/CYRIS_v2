'use client';

import React, { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import type { SearchResultItem } from '@cyris/contracts';

interface ResourcePickerProps {
  eventId?: string;
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  types?: string;
  required?: boolean;
  disabled?: boolean;
}

export function ResourcePicker({
  eventId,
  value,
  onChange,
  label,
  placeholder = 'Search by identifier or name…',
  types,
  required,
  disabled,
}: ResourcePickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [selected, setSelected] = useState<SearchResultItem | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!value) {
      setSelected(null);
      return;
    }
    if (selected?.canonicalId === value) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const response = await apiClient.search(value, { eventId, types, limit: 5 });
      if (!cancelled && response.ok) {
        const match = response.data?.results.find((item) => item.canonicalId === value);
        if (match) setSelected(match);
      }
      if (!cancelled) setLoading(false);
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [eventId, types, value, selected?.canonicalId]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const response = await apiClient.search(query.trim(), { eventId, types, limit: 8 });
      if (!cancelled) {
        setResults(response.ok ? response.data?.results ?? [] : []);
        setLoading(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [eventId, query, types]);

  const choose = (item: SearchResultItem) => {
    setSelected(item);
    setQuery('');
    setResults([]);
    onChange(item.canonicalId);
  };

  return (
    <div style={{ position: 'relative' }}>
      <label className="field-label">
        {label}{required ? ' *' : ''}
      </label>
      {selected ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            minHeight: 34,
            padding: '6px 8px',
            border: '1px solid var(--border-default)',
            background: 'var(--bg-surface)',
            borderRadius: 4,
          }}
        >
          <span style={{ minWidth: 0, fontSize: 12 }}>
            <strong>{selected.title}</strong>
            {selected.subtitle ? ` · ${selected.subtitle}` : ''}
          </span>
          {!disabled && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSelected(null); onChange(''); }} aria-label={`Clear ${label}`}>
              <X size={13} />
            </button>
          )}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              className="field-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={placeholder}
              required={required}
              disabled={disabled}
              autoComplete="off"
            />
          </div>
          {loading && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Searching…</div>}
          {results.length > 0 && (
            <div
              role="listbox"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: '100%',
                zIndex: 40,
                marginTop: 4,
                maxHeight: 220,
                overflowY: 'auto',
                background: 'var(--bg-panel)',
                border: '1px solid var(--border-strong)',
                borderRadius: 4,
                boxShadow: '0 8px 20px rgba(0,0,0,.18)',
              }}
            >
              {results.map((item) => (
                <button
                  key={item.canonicalId}
                  type="button"
                  role="option"
                  onClick={() => choose(item)}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '8px 10px',
                    textAlign: 'left',
                    border: 0,
                    borderBottom: '1px solid var(--border-subtle)',
                    background: 'transparent',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  <strong style={{ fontSize: 12 }}>{item.title}</strong>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>
                    {item.subtitle || item.type}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
