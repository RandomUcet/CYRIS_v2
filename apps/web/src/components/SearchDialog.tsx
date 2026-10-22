'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import type { SearchResultItem, SearchResponse } from '@cyris/contracts';

interface SearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SearchDialog({ isOpen, onClose }: SearchDialogProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedResultFeedback, setSelectedResultFeedback] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Focus input when dialog opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setError(null);
      setSelectedIndex(0);
      setSelectedResultFeedback(null);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Execute search with debounce
  const executeSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const res = await apiClient.search(searchQuery, { limit: 15 });
    setLoading(false);

    if (res.ok && res.data) {
      setResults(res.data.results);
      setSelectedIndex(0);
    } else {
      setResults([]);
      setError(res.error || 'Search query failed');
    }
  }, []);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setSelectedResultFeedback(null);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      void executeSearch(val);
    }, 200);
  };

  const handleSelectResult = (item: SearchResultItem) => {
    const route = item.route || `/${item.type}s/${item.canonicalId}`;
    setSelectedResultFeedback(`Navigating to ${route} (${item.title})`);
    setTimeout(() => {
      onClose();
    }, 400);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (results.length > 0) {
        setSelectedIndex((prev) => (prev + 1) % results.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (results.length > 0) {
        setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results.length > 0 && results[selectedIndex]) {
        handleSelectResult(results[selectedIndex]!);
      }
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && results.length > 0) {
      const activeEl = listRef.current.children[selectedIndex] as HTMLElement | undefined;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, results]);

  if (!isOpen) return null;

  return (
    <div
      className="search-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Global Search"
    >
      <div className="search-dialog" onKeyDown={handleKeyDown}>
        <div className="search-input-header">
          <span className="search-icon" aria-hidden="true">
            🔍
          </span>
          <input
            ref={inputRef}
            type="text"
            className="search-input"
            placeholder="Search events, units, roles, identifiers (e.g. 'type:unit', 'Cybertron')..."
            value={query}
            onChange={handleQueryChange}
            aria-autocomplete="list"
            aria-controls="search-results-list"
          />
          {loading && <span className="search-spinner" aria-label="Searching">⏳</span>}
          <button
            type="button"
            className="search-close-btn"
            onClick={onClose}
            aria-label="Close search"
          >
            Esc
          </button>
        </div>

        {selectedResultFeedback && (
          <div className="search-feedback-banner">
            {selectedResultFeedback}
          </div>
        )}

        <div id="search-results-list" className="search-results-list" ref={listRef} role="listbox">
          {error && (
            <div className="search-empty-state error" role="alert">
              {error}
            </div>
          )}

          {!loading && !error && query.trim().length > 0 && results.length === 0 && (
            <div className="search-empty-state">
              No results found for &ldquo;<strong>{query}</strong>&rdquo;
            </div>
          )}

          {!loading && !error && query.trim().length === 0 && (
            <div className="search-empty-state subtle">
              Type a keyword, technical identifier, or syntax such as <code>type:unit</code> or <code>event:cybertron</code>
            </div>
          )}

          {results.map((item, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <div
                key={item.id}
                role="option"
                aria-selected={isSelected}
                className={`search-result-item ${isSelected ? 'selected' : ''}`}
                onClick={() => handleSelectResult(item)}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <div className="search-item-header">
                  <span className={`search-badge badge-${item.type.toLowerCase()}`}>
                    {item.type.toUpperCase()}
                  </span>
                  <span className="search-item-title">{item.title}</span>
                  {item.status && (
                    <span className="search-item-status">{item.status}</span>
                  )}
                </div>

                {item.subtitle && (
                  <div className="search-item-subtitle">{item.subtitle}</div>
                )}

                {item.highlights && item.highlights.length > 0 && (
                  <div
                    className="search-item-highlights"
                    dangerouslySetInnerHTML={{ __html: item.highlights[0] || '' }}
                  />
                )}

                <div className="search-item-route">
                  {item.route || `/${item.type}s/${item.canonicalId}`}
                </div>
              </div>
            );
          })}
        </div>

        <div className="search-footer">
          <div className="search-shortcuts">
            <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
            <span><kbd>↵</kbd> Select</span>
            <span><kbd>Esc</kbd> Close</span>
          </div>
          <div className="search-count">
            {results.length > 0 && `${results.length} results`}
          </div>
        </div>
      </div>
    </div>
  );
}
