'use client';
import {useEffect,useMemo,useState} from 'react';
import {useParams} from 'next/navigation';
import Link from 'next/link';
import {relationshipRecordHref} from '@/lib/relationship-routing';
import {RefreshCw,Share2,Filter,Search} from 'lucide-react';
import {AppShell} from '@/components/layout/AppShell';
import {RelationshipGraph} from '@/components/common/RelationshipGraph';
import {RelationshipComposer} from '@/components/common/RelationshipComposer';
import {LoadingState,EmptyState,ErrorState} from '@/components/common/StateViews';
import {apiClient} from '@/lib/api-client';
import {filterRelationships,relatedNodeCount,relationshipEndpoint,relationshipNeighborhood,relationshipGraphAllowed} from '@/lib/relationship-filter';
import {usePreferences} from '@/contexts/PreferencesContext';

type RelationshipRecord={id?:string;relationshipType?:string;sourceId?:string;targetId?:string;sourceResourceId?:string;targetResourceId?:string;source?:unknown;target?:unknown};

export default function DedicatedRelationshipsPage(){
  const {eventId}=useParams<{eventId:string}>();
  return <RelationshipsWorkspace key={eventId} eventId={eventId}/>;
}
function RelationshipsWorkspace({eventId}:{eventId:string}){
  const {locale}=usePreferences();
  const cs=locale==='cs';
  const tr=(cz:string,en:string)=>cs?cz:en;
  const [relationships,setRelationships]=useState<RelationshipRecord[]>([]);
  const [loadedEvent,setLoadedEvent]=useState('');
  const [filter,setFilter]=useState('ALL');
  const [search,setSearch]=useState('');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [revision,setRevision]=useState(0);
  const [mode,setMode]=useState<'GRAPH'|'LIST'>('GRAPH');
  const [focus,setFocus]=useState<{id:string;title:string}|null>(null);
  const [hops,setHops]=useState<1|2>(1);
  const [page,setPage]=useState(1);
  useEffect(()=>{
    let active=true;
    setError('');setLoading(true);
    void (async()=>{
      try{
        const response=await apiClient.getEventRelationships(eventId);
        if(!active)return;
        if(response.ok&&Array.isArray(response.data)){
          setRelationships(response.data);setLoadedEvent(eventId);
        }else{
          setError(response.error||'Unable to load relationship graph');
        }
      }catch(err){if(active)setError(err instanceof Error?err.message:String(err));}
      finally{if(active)setLoading(false);}
    })();
    return ()=>{active=false};
  },[eventId,revision]);
  const records=loadedEvent===eventId?relationships:[];
  const types=useMemo(()=>Array.from(new Set(records.map(r=>r.relationshipType).filter((type):type is string=>typeof type==='string'&&type.length>0))).sort(),[records]);
  const neighborhood=useMemo(()=>relationshipNeighborhood(records,focus?.id??'',hops),[records,focus,hops]);
  const visible=useMemo(()=>filterRelationships(neighborhood,filter,search),[neighborhood,filter,search]);
  const connected=useMemo(()=>relatedNodeCount(visible),[visible]);
  const graphAllowed=relationshipGraphAllowed(visible);
  const pageSize=40;
  const pages=Math.max(1,Math.ceil(visible.length/pageSize));
  const currentPage=Math.min(page,pages);
  const pageRows=visible.slice((currentPage-1)*pageSize,currentPage*pageSize);
  useEffect(()=>setPage(1),[filter,search,focus,hops]);
  function focusRecord(endpoint:{id:string;title:string}){setFocus(endpoint);setSearch('');setFilter('ALL');setPage(1);}
  function renderEndpoint(row:RelationshipRecord,side:'source'|'target'){
    const endpoint=relationshipEndpoint(row,side);
    if(!endpoint)return <span>—</span>;
    const href=relationshipRecordHref(eventId,endpoint);
    return <div className="relationships-endpoint"><strong>{endpoint.title}</strong><small>{endpoint.identifier||endpoint.type}</small><div>{href&&<Link href={href}>{tr('Otevřít','Open')}</Link>}<button type="button" onClick={()=>focusRecord(endpoint)}>{tr('Prozkoumat okolí','Explore connections')}</button></div></div>;
  }
  return <AppShell title={tr('Vztahy a souvislosti','Relationships')} breadcrumbs={[{label:'Investigation'},{label:'Relationships'}]}
    actions={<button type="button" className="btn btn-secondary" onClick={()=>setRevision(n=>n+1)} disabled={loading}>
      <RefreshCw size={15}/>{tr('Obnovit','Refresh')}
    </button>}>
    <div className="relationships-page">
      <header className="relationships-header">
        <div className="relationships-summary">
          <Share2 size={22} aria-hidden="true"/>
          <div><h2>{tr('Síť souvislostí','Relationship network')}</h2>
          <p>{tr('Prozkoumejte souvislosti mezi případy, důkazy, osobami a dalšími záznamy. Výběrem uzlu zobrazíte jeho detail.','Explore connections between cases, evidence, people and other records. Select a node to inspect it.')}</p></div>
        </div>
        <label className="relationships-filter">
          <Filter size={15} aria-hidden="true"/>
          <span>{tr('Typ vazby','Relationship type')}</span>
          <select value={filter} onChange={e=>setFilter(e.target.value)} disabled={loading||!types.length}>
            <option value="ALL">{tr('Všechny vazby','All relationships')} ({records.length})</option>
            {types.map(type=><option value={type} key={type}>{type}</option>)}
          </select>
        </label>
        <label className="relationships-search">
          <Search size={15} aria-hidden="true"/>
          <span>{tr('Hledat v grafu', 'Find in graph')}</span>
          <input value={search} onChange={event=>setSearch(event.target.value)}
            placeholder={tr('Osoba, případ, identifikátor…','Name, case, identifier…')}
            type="search" maxLength={100}/>
        </label>
      </header>
      <RelationshipComposer eventId={eventId} onCreated={()=>setRevision(v=>v+1)} />
      <p className="relationships-count" role="status">
        {tr('Zobrazené vazby','Visible relationships')}: <strong>{visible.length}</strong>
        <span>· {tr('Propojené záznamy','Connected records')}: <strong>{connected}</strong></span>
        {(filter!=='ALL'||search.trim()||focus)&&<button type="button" onClick={()=>{setFilter('ALL');setSearch('');setFocus(null);}}>{tr('Vymazat filtry','Clear filters')}</button>}
      </p>
      <div className="relationships-workspace-tools">
        <div role="group" aria-label={tr('Zobrazení','View')}><button type="button" className="btn btn-secondary" aria-pressed={mode==='GRAPH'} onClick={()=>setMode('GRAPH')}>{tr('Graf','Graph')}</button><button type="button" className="btn btn-secondary" aria-pressed={mode==='LIST'} onClick={()=>setMode('LIST')}>{tr('Seznam vazeb','Relationship list')}</button></div>
        {focus&&<div className="relationships-focus"><strong>{tr('Střed vyšetřování','Focus')}: {focus.title}</strong><label>{tr('Vzdálenost','Depth')} <select value={hops} onChange={e=>setHops(e.target.value==='2'?2:1)}><option value={1}>{tr('Přímé vazby','Direct links')}</option><option value={2}>{tr('Dva kroky','Two hops')}</option></select></label><button type="button" className="btn btn-secondary" onClick={()=>setFocus(null)}>{tr('Celá síť','Whole network')}</button></div>}
      </div>
      {mode==='GRAPH'&&!graphAllowed&&!loading&&!error&&<p role="status" className="relationships-network-notice">{tr('Síť je příliš rozsáhlá pro přehledný graf. Zobrazuji úplný stránkovaný seznam. Vyberte záznam a prozkoumejte jeho okolí nebo zúžte filtry.','Network is too large for a readable graph. Showing the complete paginated list. Focus a record or narrow the filters.')}</p>}
      <div className={mode==='GRAPH'&&graphAllowed?'relationships-stage':'relationships-list-stage'}>
        {loading?<LoadingState message={tr('Načítám vazby…','Loading relationships…')}/>:
          error?<ErrorState message={error} onRetry={()=>setRevision(n=>n+1)}/>:
          visible.length===0?<EmptyState title={tr('Žádné odpovídající vazby','No matching relationships')}
            description={filter!=='ALL'||search.trim()?tr('Zkuste upravit hledání nebo vymazat filtry.','Try another search or clear the filters.'):tr('Zatím zde nejsou propojené žádné záznamy.','No linked records have been created yet.')}/>:
          mode==='GRAPH'&&graphAllowed?<><RelationshipGraph eventId={eventId} relationships={visible} showTypeFilter={false} height="100%"/></>:
          <><div className="relationships-list-scroll"><table className="relationships-table"><thead><tr><th>{tr('Zdroj','Source')}</th><th>{tr('Typ vazby','Relationship')}</th><th>{tr('Cíl','Target')}</th></tr></thead><tbody>{pageRows.map((row,i)=><tr key={row.id||String((currentPage-1)*pageSize+i)}><td>{renderEndpoint(row,'source')}</td><td>{row.relationshipType||'RELATED_TO'} <span aria-hidden="true">→</span></td><td>{renderEndpoint(row,'target')}</td></tr>)}</tbody></table></div><nav className="relationships-pagination" aria-label={tr('Stránkování vazeb','Relationship pagination')}><button type="button" className="btn btn-secondary" disabled={currentPage<=1} onClick={()=>setPage(currentPage-1)}>{tr('Předchozí','Previous')}</button><span>{currentPage} / {pages}</span><button type="button" className="btn btn-secondary" disabled={currentPage>=pages} onClick={()=>setPage(currentPage+1)}>{tr('Další','Next')}</button></nav></>
        }
      </div>
    </div>
  </AppShell>;
}
