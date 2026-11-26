'use client';
import {useEffect,useState} from 'react';
import {apiClient} from '@/lib/api-client';
import type {TeamRoleReviewItem} from '@cyris/contracts';
export function TeamRoleReview({eventId,cs,onApplied}:{eventId:string;cs:boolean;onApplied:()=>void}){
 const tr=(cz:string,en:string)=>cs?cz:en;
 const [rows,setRows]=useState<TeamRoleReviewItem[]>([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{let active=true;setRows([]);setError('');setLoading(true);
  void apiClient.getTeamRoleReview(eventId).then(r=>{if(!active)return;if(r.ok&&r.data)setRows(r.data);else setError(r.error||'HTTP');}).catch(e=>{if(active)setError(String(e));}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[eventId,revision]);
 async function initialize(){if(saving)return;setSaving(true);setError('');try{
   const r=await apiClient.initializeTeamTemplates(eventId);if(!r.ok)throw Error(r.error||'HTTP');setRevision(v=>v+1);onApplied();
 }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setSaving(false);}}
 return <section className="card" style={{padding:16,display:'grid',gap:12}}>
   <div style={{display:'flex',gap:12,justifyContent:'space-between',flexWrap:'wrap',alignItems:'center'}}>
     <h2 style={{fontSize:16}}>{tr('Kontrola týmových profilů','Team role profile review')}</h2>
     <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
       <button className="btn btn-secondary" disabled={loading||saving} onClick={()=>setRevision(v=>v+1)}>{tr('Obnovit','Refresh')}</button>
       <button className="btn btn-primary" disabled={loading||saving||!!error||!rows.some(r=>!r.rolePresent)} onClick={initialize}>{saving?tr('Doplňuji…','Adding…'):tr('Doplnit chybějící šablony','Add missing templates')}</button>
     </div>
   </div>
   <p style={{fontSize:13,color:'var(--text-secondary)'}}>{tr('Porovnání šablon rolí a jejich přímého přiřazení k týmu. Nevypovídá o přístupu ke konkrétnímu záznamu. Doplňování vytvoří pouze chybějící role a týmy, nepřiděluje oprávnění uživatelům ani nemění vlastní role. Vedoucí role je volitelná.','Compares role templates and direct unit assignments, not record-level access. Adding templates creates missing roles and teams only; it does not assign users or change custom roles. Lead roles are optional.')}</p>
   {loading?<p role="status">{tr('Načítám…','Loading…')}</p>:error?<p role="alert">{error}</p>:!rows.length?<p>{tr('Žádný standardní tým v tomto cvičení.','No canonical team in this exercise.')}</p>:
    <div style={{overflowX:'auto'}}><table style={{width:'100%',minWidth:660,textAlign:'left',fontSize:13,borderCollapse:'collapse'}}>
     <thead><tr>{[tr('Tým a profil','Team and profile'),tr('Šablona','Template'),tr('Přímé přiřazení v týmu','Unit-bound assignments'),tr('Odchylky oprávnění','Grant differences')].map(t=><th key={t} style={{padding:8}}>{t}</th>)}</tr></thead>
     <tbody>{rows.map(row=><tr key={row.unitId+':'+row.roleSlug} style={{borderTop:'1px solid var(--border-default)'}}>
       <td style={{padding:8}}><strong>{row.unitName}</strong><div>{row.roleName}</div></td>
       <td style={{padding:8}}>{row.rolePresent?tr('Existuje','Present'):tr('Chybí','Missing')}</td>
       <td style={{padding:8}}>{row.unitBoundCount} / {row.memberCount}</td>
       <td style={{padding:8}}>{row.missing.length||row.additional.length?<details><summary>{tr('Chybí','Missing')} {row.missing.length} · {tr('Navíc','Additional')} {row.additional.length}</summary>
         {row.missing.map(g=><div key={'missing:'+g}>− {g}</div>)}{row.additional.map(g=><div key={'extra:'+g}>+ {g}</div>)}
       </details>:tr('Shoda šablony','Template matches')}</td>
     </tr>)}</tbody>
    </table></div>}
 </section>;
}
