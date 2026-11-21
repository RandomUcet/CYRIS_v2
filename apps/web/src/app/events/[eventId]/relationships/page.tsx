'use client';
import {useEffect,useMemo,useState} from 'react';
import {useParams} from 'next/navigation';
import {RefreshCw,Share2,Filter} from 'lucide-react';
import {AppShell} from '@/components/layout/AppShell';
import {RelationshipGraph} from '@/components/common/RelationshipGraph';
import {LoadingState,EmptyState,ErrorState} from '@/components/common/StateViews';
import {apiClient} from '@/lib/api-client';
import {usePreferences} from '@/contexts/PreferencesContext';

type RelationshipRecord={id?:string;relationshipType?:string;sourceId?:string;targetId?:string;sourceResourceId?:string;targetResourceId?:string;source?:unknown;target?:unknown};

export default function DedicatedRelationshipsPage(){
  const {eventId}=useParams<{eventId:string}>();
  const {locale}=usePreferences();
  const cs=locale==='cs';
  const tr=(cz:string,en:string)=>cs?cz:en;
  const [relationships,setRelationships]=useState<RelationshipRecord[]>([]);
  const [loadedEvent,setLoadedEvent]=useState('');
  const [filter,setFilter]=useState('ALL');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    let active=true;
    setRelationships([]);setLoadedEvent('');setFilter('ALL');setError('');setLoading(true);
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
  const visible=useMemo(()=>filter==='ALL'?records:records.filter(r=>r.relationshipType===filter),[records,filter]);
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
      </header>
      <p className="relationships-count" role="status">
        {tr('Zobrazené vazby','Visible relationships')}: <strong>{visible.length}</strong>
        {filter!=='ALL'&&<button type="button" onClick={()=>setFilter('ALL')}>{tr('Vymazat filtr','Clear filter')}</button>}
      </p>
      <div className="relationships-stage">
        {loading?<LoadingState message={tr('Načítám vazby…','Loading relationships…')}/>:
          error?<ErrorState message={error} onRetry={()=>setRevision(n=>n+1)}/>:
          visible.length===0?<EmptyState title={tr('Žádné odpovídající vazby','No matching relationships')}
            description={filter!=='ALL'?tr('Zkuste jiný typ vazby nebo vymažte filtr.','Try another relationship type or clear the filter.'):tr('Zatím zde nejsou propojené žádné záznamy.','No linked records have been created yet.')}/>:
          <RelationshipGraph eventId={eventId} relationships={visible} height="100%"/>
        }
      </div>
    </div>
  </AppShell>;
}
