'use client';

import React, { useState, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { LoadingState, EmptyState } from './StateViews';
import { usePreferences } from '@/contexts/PreferencesContext';

export interface Column<T> {
  key?: string;
  header: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  sortKey?: string;
  render?: (row: T) => React.ReactNode;
  accessor?: (row: T) => React.ReactNode;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyField?: keyof T | ((row: T) => string);
  keyExtractor?: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectedRowId?: string | null;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyMessage?: string;
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  keyField,
  keyExtractor,
  onRowClick,
  selectedRowId,
  loading = false,
  emptyTitle,
  emptyDescription,
  emptyMessage,
}: DataTableProps<T>) {
  const { t } = usePreferences();
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleHeaderClick = (col: Column<T>) => {
    const sKey = col.sortKey || col.key;
    const isSortable = col.sortable ?? Boolean(col.sortKey);
    if (!isSortable || !sKey) return;

    if (sortKey === sKey) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortKey(null);
        setSortDirection('asc');
      }
    } else {
      setSortKey(sKey);
      setSortDirection('asc');
    }
  };

  const sortedData = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];
      if (valA === valB) return 0;
      if (valA == null) return 1;
      if (valB == null) return -1;
      const res = valA > valB ? 1 : -1;
      return sortDirection === 'asc' ? res : -res;
    });
  }, [data, sortKey, sortDirection]);

  const getRowId = (row: T): string => {
    if (keyExtractor) {
      return keyExtractor(row);
    }
    if (typeof keyField === 'function') {
      return keyField(row);
    }
    if (keyField) {
      return String(row[keyField]);
    }
    return row.id ? String(row.id) : JSON.stringify(row);
  };

  if (loading) {
    return <LoadingState message="Loading records..." />;
  }

  if (data.length === 0) {
    return (
      <EmptyState
        title={emptyTitle || t('state.emptyTitle')}
        description={emptyDescription || emptyMessage || t('state.emptyDescription')}
      />
    );
  }

  return (
    <div className="data-table-container">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col, idx) => {
              const colKey = col.key || col.sortKey || String(idx);
              const sKey = col.sortKey || col.key;
              const isSortable = col.sortable ?? Boolean(col.sortKey);

              return (
                <th
                  key={colKey}
                  style={{
                    width: col.width,
                    textAlign: col.align || 'left',
                    cursor: isSortable ? 'pointer' : 'default',
                    userSelect: 'none',
                  }}
                  onClick={() => handleHeaderClick(col)}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <span>{col.header}</span>
                    {isSortable && (
                      <span style={{ color: sortKey === sKey ? 'var(--color-accent-ops)' : 'var(--color-text-dim)' }}>
                        {sortKey === sKey ? (
                          sortDirection === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                        ) : (
                          <ArrowUpDown size={11} style={{ opacity: 0.5 }} />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedData.map((row) => {
            const rowId = getRowId(row);
            const isSelected = selectedRowId === rowId;
            return (
              <tr
                key={rowId}
                className={`${onRowClick ? 'clickable' : ''} ${isSelected ? 'selected' : ''}`}
                onClick={() => onRowClick && onRowClick(row)}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={(e) => {
                  if (onRowClick && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onRowClick(row);
                  }
                }}
              >
                {columns.map((col, idx) => {
                  const colKey = col.key || col.sortKey || String(idx);
                  const renderFn = col.accessor || col.render;
                  return (
                    <td key={colKey} style={{ textAlign: col.align || 'left' }}>
                      {renderFn ? renderFn(row) : (col.key && row[col.key] != null ? String(row[col.key]) : '—')}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
