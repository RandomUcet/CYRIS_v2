'use client';

import { useState, useEffect, useRef } from 'react';
import { apiClient } from '@/lib/api-client';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { parseSearchHighlight, safeSearchResultRoute } from '@/lib/search-result-safety';
import type { SearchResultItem, SearchResponse } from '@cyris/contracts';

interface SearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SearchDialog({isOpen,onClose}:SearchDialogProps){
  const {currentUser,viewAs}=useAuth();
  if(!isOpen||!currentUser)return null;
  return <SearchWorkspace key={[currentUser.user.id,viewAs?.id??''].join(':')} isOpen={isOpen} onClose={onClose}/>;
}
function SearchWorkspace({ isOpen, onClose }: SearchDialogProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedResultFeedback, setSelectedResultFeedback] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const requestRef=useRef<AbortController|null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus input when dialog opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setError(null);
      setSelectedIndex(0);
      setSelectedResultFeedback(null);
      const timer=setTimeout(() => inputRef.current?.focus(),50);
      return()=>{clearTimeout(timer);if(debounceTimerRef.current)clearTimeout(debounceTimerRef.current);requestRef.current?.abort();};
    }
  }, [isOpen]);

  const handleQueryChange=(e:React.ChangeEvent<HTMLInputElement>)=>{
    const val=e.target.value;setQuery(val);setSelectedResultFeedback(null);
    if(debounceTimerRef.current)clearTimeout(debounceTimerRef.current);
    requestRef.current?.abort();setResults([]);setSelectedIndex(0);setError(null);
    if(!val.trim()){setLoading(false);return;}
    setLoading(true);
    const controller=new AbortController();requestRef.current=controller;
    debounceTimerRef.current=setTimeout(async()=>{
      try{
        const res=await apiClient.search(val.trim(),{limit:15,signal:controller.signal});
        if(controller.signal.aborted)return;
        if(res.ok&&res.data)setResults(res.data.results);
        else setError(res.error||'Search query failed');
      }catch{if(!controller.signal.aborted)setError('Search query failed');}
      finally{if(!controller.signal.aborted)setLoading(false);}
    },220);
  };

  const handleSelectResult = (item: SearchResultItem) => {
    const route = safeSearchResultRoute(item.route);
    if (!route) {
      setSelectedResultFeedback('This result has no safe, available destination.');
      return;
    }
    onClose();
    router.push(route);
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
                  <div className="search-item-highlights">
                    {parseSearchHighlight(item.highlights[0] || '').map((part, partIndex) =>
                      part.highlighted ? <mark key={partIndex}>{part.text}</mark> : <span key={partIndex}>{part.text}</span>
                    )}
                  </div>
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
