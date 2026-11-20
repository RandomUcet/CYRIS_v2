'use client';

import React from 'react';
import { Search, X } from 'lucide-react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { workspaceLabel } from '@/lib/workspace-navigation';

export interface FilterOption {
  label: string;
  value: string;
}

export interface FilterConfig {
  key?: string;
  label: string;
  value?: string;
  options: FilterOption[];
  onChange?: (val: string) => void;
}

export interface FilterBarProps {
  searchQuery?: string;
  searchValue?: string;
  onSearchChange?: (query: string) => void;
  searchPlaceholder?: string;
  filters?: FilterConfig[];
  selectedFilters?: Record<string, string>;
  onFilterChange?: (key: string, value: string) => void;
  onClearAll?: () => void;
  onReset?: () => void;
  totalResults?: number;
  extraActions?: React.ReactNode;
}

export function FilterBar({
  searchQuery,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Filter records...',
  filters = [],
  selectedFilters = {},
  onFilterChange,
  onClearAll,
  onReset,
  totalResults,
  extraActions,
}: FilterBarProps) {
  const {locale} = usePreferences();
  const currentSearch = searchValue ?? searchQuery ?? '';
  const clearHandler = onReset ?? onClearAll;

  const activeCount =
    Object.values(selectedFilters).filter(Boolean).length +
    filters.filter((f) => f.value && f.value !== '').length +
    (currentSearch ? 1 : 0);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        padding: '8px 12px',
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-sm)',
        flexWrap: 'wrap',
        marginBottom: '14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flex: 1 }}>
        {onSearchChange && (
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search
              size={13}
              style={{ position: 'absolute', left: '8px', color: 'var(--color-text-dim)', pointerEvents: 'none' }}
            />
            <input
              type="text"
              value={currentSearch}
              onChange={(e) => onSearchChange(e.target.value)}
              aria-label={workspaceLabel(locale, searchPlaceholder)}
              placeholder={workspaceLabel(locale, searchPlaceholder)}
              className="input-field"
              style={{
                paddingLeft: '28px',
                paddingRight: currentSearch ? '24px' : '8px',
                height: '28px',
                fontSize: '12px',
                width: '240px',
              }}
            />
            {currentSearch && (
              <button
                type="button"
                aria-label={workspaceLabel(locale, 'Clear')}
                onClick={() => onSearchChange('')}
                className="btn btn-ghost"
                style={{
                  position: 'absolute',
                  right: '2px',
                  padding: '2px',
                  height: '20px',
                  width: '20px',
                  minWidth: 'auto',
                }}
              >
                <X size={12} />
              </button>
            )}
          </div>
        )}

        {filters.map((filter, idx) => {
          const filterKey = filter.key || filter.label || String(idx);
          const filterVal = filter.value !== undefined ? filter.value : (selectedFilters[filterKey] || '');

          return (
            <select
              key={filterKey}
              aria-label={workspaceLabel(locale, filter.label)}
              value={filterVal}
              onChange={(e) => {
                if (filter.onChange) {
                  filter.onChange(e.target.value);
                } else if (onFilterChange) {
                  onFilterChange(filterKey, e.target.value);
                }
              }}
              className="select-field"
              style={{
                height: '28px',
                fontSize: '12px',
                padding: '2px 8px',
                borderColor: filterVal ? 'var(--color-accent-ops)' : 'var(--color-border-subtle)',
                backgroundColor: filterVal ? 'rgba(2, 132, 199, 0.1)' : 'var(--color-bg-panel)',
              }}
            >
              {filter.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          );
        })}

        {activeCount > 0 && clearHandler && (
          <button
            type="button"
            onClick={clearHandler}
            className="btn btn-ghost"
            style={{ height: '28px', fontSize: '11px', padding: '0 8px', color: 'var(--color-text-dim)' }}
          >
            {workspaceLabel(locale, 'Clear')} ({activeCount})
          </button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {totalResults !== undefined && (
          <span style={{ fontSize: '11px', color: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)' }}>
            {totalResults} {locale === 'cs' ? (totalResults === 1 ? 'záznam' : totalResults >= 2 && totalResults <= 4 ? 'záznamy' : 'záznamů') : totalResults === 1 ? 'record' : 'records'}
          </span>
        )}
        {extraActions}
      </div>
    </div>
  );
}
