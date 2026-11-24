'use client';

import React, { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
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

export function ResourcePicker(props:ResourcePickerProps){
  const {currentUser,viewAs}=useAuth();
  return <PickerWorkspace key={[currentUser?.user.id??'',viewAs?.id??'',props.eventId??'',props.types??''].join(':')} {...props}/>;
}
function PickerWorkspace({
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
  const [resolving,setResolving]=useState(false);
  const [resolveError,setResolveError]=useState(false);
  const [resultQuery,setResultQuery]=useState('');
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(()=>{
    setResolveError(false);
    if(!value){setSelected(null);setResolving(false);return;}
    if(selected?.canonicalId===value){setResolving(false);return;}
    setSelected(null);setResolving(true);
    const controller=new AbortController();
    const timer=window.setTimeout(async()=>{
      try{
        if(eventId && types === 'person'){
          const response=await apiClient.getPerson(eventId, value, controller.signal);
          if(controller.signal.aborted)return;
          if(!response.ok||!response.data){setResolveError(true);return;}
          const person=response.data;
          setSelected({id:value,canonicalId:value,type:'person',
            title:String(person.displayName||person.name||value),subtitle:person.identifier||undefined,eventId,highlights:[],tags:[]});
        }else{
          const response=await apiClient.search(value,{eventId,types,limit:5,signal:controller.signal});
          if(controller.signal.aborted)return;
          const match=response.ok?response.data?.results.find(item=>item.canonicalId===value):undefined;
          if(match)setSelected(match);else setResolveError(true);
        }
      }catch{if(!controller.signal.aborted)setResolveError(true);}
      finally{if(!controller.signal.aborted)setResolving(false);}
    },120);
    return()=>{controller.abort();window.clearTimeout(timer);};
  },[eventId,types,value,selected?.canonicalId]);

  useEffect(()=>{
    setResults([]);setResultQuery('');setSearchError(null);
    if(disabled||value||query.trim().length<2){setLoading(false);return;}
    setLoading(true);
    const controller=new AbortController();
    const timer=window.setTimeout(async()=>{
      try{
        if(eventId && types === 'person'){
          const response=await apiClient.searchRegistryRecords(eventId, query.trim(), controller.signal);
          if(controller.signal.aborted)return;
          setResults(response.ok&&response.data?response.data.filter(item=>item.entityType === 'persons').map(item=>({
            id:item.id,canonicalId:item.id,type:'person',title:item.label,subtitle:item.identifier??undefined,eventId:item.eventId,highlights:[],tags:[],
          })):[]);
          if(!response.ok)setSearchError(response.error||'Search is unavailable');
        }else{
          const response=await apiClient.search(query.trim(),{eventId,types,limit:8,signal:controller.signal});
          if(controller.signal.aborted)return;
          setResults(response.ok?response.data?.results??[]:[]);
          if(!response.ok)setSearchError(response.error||'Search is unavailable');
        }
        setResultQuery(query.trim());
      }catch{if(!controller.signal.aborted)setSearchError('Search is unavailable');}
      finally{if(!controller.signal.aborted)setLoading(false);}
    },220);
    return()=>{controller.abort();window.clearTimeout(timer);};
  },[eventId,query,types,value,disabled]);

  const visibleResults=resultQuery===query.trim()?results:[];
  const visibleSelection=selected?.canonicalId===value?selected:null;

  const choose = (item: SearchResultItem) => {
    if(disabled||!visibleResults.some(row=>row.canonicalId===item.canonicalId))return;
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
      {value ? (
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
            <strong>{visibleSelection?.title??(resolving?'Loading selected record…':'Selected record')}</strong>
            {visibleSelection?.subtitle ? ` · ${visibleSelection.subtitle}` : ''}
            {resolveError&&!visibleSelection&&<span role="alert" style={{display:'block',color:'var(--status-danger)'}}>Unable to resolve record. Clear and select again.</span>}
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
              aria-label={label}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={placeholder}
              required={required}
              disabled={disabled}
              autoComplete="off"
            />
          </div>
          {searchError && <div role="alert" style={{ fontSize: 12, color: 'var(--status-danger)', marginTop: 6 }}>{searchError}</div>}
          {loading && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Searching…</div>}
          {visibleResults.length > 0 && (
            <div
              role="listbox"
              aria-label={label + " search results"}
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
              {visibleResults.map((item) => (
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
