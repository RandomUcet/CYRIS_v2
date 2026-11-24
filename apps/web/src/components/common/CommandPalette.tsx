'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, FileText, Shield, AlertTriangle, Cpu, Terminal, ArrowRight, CornerDownLeft } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import type { SearchResultItem } from '@cyris/contracts';
import { useEvent } from '@/contexts/EventContext';
import { useAuth } from '@/contexts/AuthContext';
import { safeNotificationHref } from '@/lib/notification-navigation';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CommandAction {
  id: string;
  title: string;
  category: 'Commands';
  action: () => void;
  shortcut?: string;
}

export function CommandPalette({isOpen,onClose}:CommandPaletteProps){
  const {selectedEventId}=useEvent();
  const {currentUser,viewAs}=useAuth();
  if(!isOpen||!currentUser)return null;
  return <PaletteWorkspace key={[currentUser.user.id,viewAs?.id??'',selectedEventId??''].join(':')} isOpen={isOpen} onClose={onClose}/>;
}
function PaletteWorkspace({ isOpen, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const { selectedEventId } = useEvent();
  const {isPlatformAdmin}=useAuth();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError,setSearchError]=useState(false);
  const [resultQuery,setResultQuery]=useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement | null>(null);

  // Focus on open
  useEffect(() => {
    if (isOpen) {
      const timer=setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
      return()=>clearTimeout(timer);
    }
  }, [isOpen]);

  // Static quick navigation commands
  const commands: CommandAction[] = useMemo(() => {
    const list: CommandAction[] = [
      {
        id: 'cmd-overview',
        title: 'Go to Operations Overview',
        category: 'Commands',
        action: () => {
          if (selectedEventId) router.push(`/events/${selectedEventId}/overview`);
          onClose();
        },
      },
      {
        id: 'cmd-timeline',
        title: 'Open Operational Timeline',
        category: 'Commands',
        action: () => {
          if (selectedEventId) router.push(`/events/${selectedEventId}/timeline`);
          onClose();
        },
      },
      {
        id: 'cmd-cases',
        title: 'View Investigation Cases',
        category: 'Commands',
        action: () => {
          if (selectedEventId) router.push(`/events/${selectedEventId}/cases`);
          onClose();
        },
      },
      {
        id: 'cmd-evidence',
        title: 'View Evidence & Chain of Custody',
        category: 'Commands',
        action: () => {
          if (selectedEventId) router.push(`/events/${selectedEventId}/evidence`);
          onClose();
        },
      },
      {
        id: 'cmd-lab',
        title: 'Open Laboratory Workflows',
        category: 'Commands',
        action: () => {
          if (selectedEventId) router.push(`/events/${selectedEventId}/lab`);
          onClose();
        },
      },
      {
        id: 'cmd-registry',
        title: 'Browse Scenario Registry',
        category: 'Commands',
        action: () => {
          if (selectedEventId) router.push(`/events/${selectedEventId}/registry`);
          onClose();
        },
      },
      {
        id: 'cmd-relationships',
        title: 'Explore Relationship Graph',
        category: 'Commands',
        action: () => {
          if (selectedEventId) router.push(`/events/${selectedEventId}/relationships`);
          onClose();
        },
      },
      {
        id: 'cmd-audit',
        title: 'Open Audit Log',
        category: 'Commands',
        action: () => {
          router.push('/admin/audit');
          onClose();
        },
      },
    ];
    return list.filter(command=>command.id==='cmd-audit'?isPlatformAdmin:Boolean(selectedEventId));
  }, [selectedEventId, router, onClose,isPlatformAdmin]);

  // Cancel older requests and hide results immediately when the query changes.
  useEffect(()=>{
    const q=query.trim();
    setResults([]);setResultQuery('');setSearchError(false);setSelectedIndex(0);
    if(!q){setSearching(false);return;}
    setSearching(true);
    const controller=new AbortController();
    const timer=setTimeout(async()=>{
      try{
        const res=await apiClient.search(q,{eventId:selectedEventId||undefined,limit:20,signal:controller.signal});
        if(controller.signal.aborted)return;
        if(!res.ok||!res.data){setSearchError(true);return;}
        setResults(res.data.results);setResultQuery(q);setSelectedIndex(0);
      }catch{if(!controller.signal.aborted)setSearchError(true);}
      finally{if(!controller.signal.aborted)setSearching(false);}
    },220);
    return()=>{clearTimeout(timer);controller.abort();};
  },[query,selectedEventId]);
  const visibleResults=resultQuery===query.trim()?results:[];

  // Filter commands by query if no or few results
  const matchingCommands = useMemo(() => {
    if (!query.trim()) return commands.slice(0, 5);
    const q = query.toLowerCase();
    return commands.filter((c) => c.title.toLowerCase().includes(q));
  }, [commands, query]);

  // Group search results by entity type
  const groupedResults = useMemo(() => {
    const groups: Record<string, SearchResultItem[]> = {};
    for (const item of visibleResults) {
      const type = item.type || 'entity';
      if (!groups[type]) groups[type] = [];
      groups[type]!.push(item);
    }
    return groups;
  }, [visibleResults]);

  const allListItems = useMemo(() => {
    const list: { type: 'item' | 'command'; item?: SearchResultItem; command?: CommandAction }[] = [];
    for (const group of Object.values(groupedResults))for(const item of group){
      list.push({ type: 'item', item });
    }
    for (const command of matchingCommands) {
      list.push({ type: 'command', command });
    }
    return list;
  }, [groupedResults, matchingCommands]);

  const handleSelect = (idx: number) => {
    const target = allListItems[idx];
    if (!target) return;

    if (target.type === 'command' && target.command) {
      target.command.action();
    } else if (target.type === 'item' && target.item) {
      const route=safeNotificationHref(target.item.route);
      if (route) {
        router.push(route);
      } else if (selectedEventId) {
        const t = target.item.type;
        if (t === 'case') router.push(`/events/${selectedEventId}/cases/${target.item.canonicalId}`);
        else if (t === 'evidence') router.push(`/events/${selectedEventId}/evidence/${target.item.canonicalId}`);
        else if (t === 'lab_analysis') router.push(`/events/${selectedEventId}/lab/${target.item.canonicalId}`);
        else if (t === 'incident') router.push(`/events/${selectedEventId}/incidents/${target.item.canonicalId}`);
        else router.push(`/events/${selectedEventId}/registry`);
      }
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < allListItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : Math.max(0,allListItems.length - 1)));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSelect(selectedIndex);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(2px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '640px',
          maxWidth: '92vw',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.65)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        role="dialog" aria-modal="true" aria-label="Search CYRIS"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-default)',
            background: 'var(--bg-surface)',
          }}
        >
          <Search size={18} style={{ color: 'var(--accent-active)' }} />
          <input
            ref={inputRef}
            type="text" aria-label="Search CYRIS"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cases, evidence (E-0001), persons, commands..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              padding: 0,
              fontSize: '14px',
              color: 'var(--text-primary)',
            }}
          />
          <kbd style={{ fontSize: '10px' }}>ESC</kbd>
        </div>

        {/* Results & Commands List */}
        <div style={{ maxHeight: '420px', overflowY: 'auto', padding: '8px 0' }}>
          {searching && (
            <div style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-muted)' }}>
              Searching CYRIS intelligence…
            </div>
          )}

          {searchError&&!searching&&<div role="alert" style={{padding:'12px 16px',color:'var(--status-danger)'}}>Search is temporarily unavailable. Try again.</div>}
          {allListItems.length === 0 && !searching && !searchError && query.trim() && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
              No operational matches found for "{query}".
            </div>
          )}

          {/* Grouped Entity Results */}
          {Object.entries(groupedResults).map(([type, groupItems]) => (
            <div key={type} style={{ marginBottom: '6px' }}>
              <div
                style={{
                  padding: '4px 16px',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                  letterSpacing: '0.05em',
                }}
              >
                {type.replace(/_/g, ' ')} ({groupItems.length})
              </div>
              {groupItems.map((item) => {
                const itemIndex = allListItems.findIndex((x) => x.type === 'item' && x.item?.id === item.id);
                const isSelected = itemIndex === selectedIndex;
                const isIdMatch = item.title.includes('-00') || item.id.includes('-00');

                return (
                  <div
                    key={item.id}
                    onClick={() => handleSelect(itemIndex)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 16px',
                      cursor: 'pointer',
                      background: isSelected ? 'var(--bg-active)' : 'transparent',
                      borderLeft: isSelected ? '3px solid var(--accent-active)' : '3px solid transparent',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                      <FileText size={15} style={{ color: isIdMatch ? 'var(--cylab-orange)' : 'var(--accent-primary)', flexShrink: 0 }} />
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                          {item.title}
                        </div>
                        {item.subtitle && (
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            {item.subtitle}
                          </div>
                        )}
                      </div>
                    </div>
                    {isSelected && <CornerDownLeft size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
                  </div>
                );
              })}
            </div>
          ))}

          {/* Commands Section */}
          {matchingCommands.length > 0 && (
            <div>
              <div
                style={{
                  padding: '6px 16px',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                  letterSpacing: '0.05em',
                  borderTop: results.length > 0 ? '1px solid var(--border-subtle)' : 'none',
                  marginTop: results.length > 0 ? '4px' : 0,
                }}
              >
                Quick Actions
              </div>
              {matchingCommands.map((cmd) => {
                const cmdIndex = allListItems.findIndex((x) => x.type === 'command' && x.command?.id === cmd.id);
                const isSelected = cmdIndex === selectedIndex;

                return (
                  <div
                    key={cmd.id}
                    onClick={() => handleSelect(cmdIndex)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '7px 16px',
                      cursor: 'pointer',
                      background: isSelected ? 'var(--bg-active)' : 'transparent',
                      borderLeft: isSelected ? '3px solid var(--accent-active)' : '3px solid transparent',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Terminal size={14} style={{ color: 'var(--text-muted)' }} />
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{cmd.title}</span>
                    </div>
                    {isSelected && <CornerDownLeft size={13} style={{ color: 'var(--text-muted)' }} />}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Hint */}
        <div
          style={{
            padding: '8px 16px',
            borderTop: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface)',
            fontSize: '11px',
            color: 'var(--text-muted)',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>Use ↑ ↓ to navigate · Enter to select</span>
          <span>CYRIS Operational Intelligence</span>
        </div>
      </div>
    </div>
  );
}
