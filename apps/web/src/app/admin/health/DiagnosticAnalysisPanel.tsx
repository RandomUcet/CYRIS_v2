'use client';
import {useEffect,useRef,useState} from 'react';
import {DiagnosticSummarySchema,type DiagnosticAnalysisResult} from '@cyris/contracts';
import {apiClient} from '@/lib/api-client';
import {useAuth} from '@/contexts/AuthContext';
export function DiagnosticAnalysisPanel({cs}:{cs:boolean}){
 const {currentUser,viewAs,isPlatformAdmin}=useAuth();
 if(!isPlatformAdmin||viewAs)return null;
 return <Panel key={currentUser?.user.id??''} cs={cs}/>;
}
function Panel({cs}:{cs:boolean}){
 const tr=(c:string,e:string)=>cs?c:e;
 const [raw,setRaw]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<DiagnosticAnalysisResult|null>(null),[copied,setCopied]=useState(false);
 const lock=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 async function analyze(){
  if(lock.current)return;
  let value:unknown;try{value=JSON.parse(raw);}catch{setError(tr('Vložte platný JSON souhrn.','Paste a valid JSON summary.'));return;}
  const parsed=DiagnosticSummarySchema.safeParse(value);if(!parsed.success){setError(tr('Povolen je pouze strukturovaný výstup cyrisctl bez původních logů.','Only the structured cyrisctl summary without raw logs is accepted.'));return;}
  lock.current=true;setBusy(true);setError('');setResult(null);setCopied(false);
  try{const r=await apiClient.analyzeOperationalDiagnostics({summary:parsed.data,locale:cs?'cs':'en'});if(!alive.current)return;if(r.ok&&r.data)setResult(r.data);else setError(r.error||tr('Analýza selhala','Analysis failed'));}
  catch{if(alive.current)setError(tr('Analýza selhala','Analysis failed'));}finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 async function copy(){if(!result)return;try{await navigator.clipboard.writeText(JSON.stringify(result,null,2));if(alive.current)setCopied(true);}catch{if(alive.current)setError(tr('Kopírování se nezdařilo.','Copy failed.'));}}
 return <section style={{padding:16,border:'1px solid var(--border-default)',background:'var(--bg-panel)',borderRadius:6,display:'grid',gap:12}}>
 <div><h3 style={{margin:0}}>{tr('Diagnostika se Sparkem','Spark log diagnostics')}</h3><p style={{color:'var(--text-secondary)'}}>{tr('Vložte souhrn kategorií chyb z provozního serveru. Spark nabízí hypotézy, nikoli potvrzené příčiny.','Paste classified error counts from the host. Spark suggests hypotheses, not confirmed causes.')}</p></div>
 <code style={{overflowWrap:'anywhere'}}>sudo cyrisctl diagnostics --summary --minutes 60</code>
 <form onSubmit={e=>{e.preventDefault();void analyze();}} style={{display:'grid',gap:8}}>
 <label>{tr('JSON souhrn','JSON summary')}<textarea className="input-field" style={{display:'block',width:'100%',minHeight:100,resize:'vertical'}} value={raw} disabled={busy} maxLength={12000} onChange={e=>{setRaw(e.target.value);setError('');setResult(null);}} required/></label>
 <button type="submit" className="btn btn-primary" style={{justifySelf:'start'}} disabled={busy||!raw.trim()}>{busy?tr('Analyzuji…','Analyzing…'):tr('Analyzovat Sparkem','Analyze with Spark')}</button>
 </form>{error&&<p role="alert">{error}</p>}
 {result&&<><p><strong>{result.report.summary}</strong></p><p style={{color:'var(--text-muted)'}}>{result.model} · {(result.durationMs/1000).toFixed(1)} s · {tr('Počet řádků, ne incidentů','Line counts, not incidents')}</p>
 <div style={{overflowX:'auto'}}><table className="data-table"><thead><tr><th>{tr('Služba / signál','Service / signal')}</th><th>{tr('Hypotéza','Hypothesis')}</th><th>{tr('Další kontrola','Next check')}</th></tr></thead><tbody>{result.report.findings.map(f=>{const s=result.source.services[f.service];return <tr key={f.service+f.category}><td>{f.service} · {f.category}<br/>{f.severity} · {s.status==='sampled'?s.categories[f.category]:0}</td><td>{f.hypothesis}</td><td>{f.nextCheck}</td></tr>})}</tbody></table></div>
 <button type="button" className="btn btn-secondary" style={{justifySelf:'start'}} onClick={()=>void copy()}>{copied?tr('Zkopírováno','Copied'):tr('Zkopírovat report','Copy report')}</button><p>{tr('Žádné změny systému nebyly provedeny.','No system changes were made.')}</p></>}
 </section>;
}
