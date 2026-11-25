'use client';
import {useState} from 'react';
import {StorageReportSchema,type StorageReport} from '@cyris/contracts';
import {useAuth} from '@/contexts/AuthContext';
function size(n:number|null){if(n===null)return '—';const units=['B','KiB','MiB','GiB','TiB','PiB'];let i=0;while(n>=1024&&i<units.length-1){n/=1024;i++;}return n.toLocaleString(undefined,{maximumFractionDigits:2})+' '+units[i];}
export function StorageReportPanel({cs}:{cs:boolean}){const {currentUser,isPlatformAdmin,viewAs}=useAuth();if(!isPlatformAdmin||viewAs)return null;return <Panel key={currentUser?.user.id??''} cs={cs}/>;}
function Panel({cs}:{cs:boolean}){
 const tr=(c:string,e:string)=>cs?c:e;
 const [raw,setRaw]=useState(''),[report,setReport]=useState<StorageReport|null>(null),[error,setError]=useState('');
 const disk=report?.filesystems.root;const unavailable=disk&&disk.totalBytes>0?(1-disk.availableBytes/disk.totalBytes)*100:null;
 const old=report&&Math.abs(Date.now()-new Date(report.collectedAt).getTime())>15*60_000;
 function load(){try{const parsed=StorageReportSchema.safeParse(JSON.parse(raw));if(!parsed.success)throw Error();setReport(parsed.data);setError('');}catch{setReport(null);setError(tr('Neplatný výstup příkazu storage --json.','Invalid storage --json output.'));}}
 return <section style={{padding:16,border:'1px solid var(--border-default)',borderRadius:6,background:'var(--bg-panel)',display:'grid',gap:12}}>
 <h3 style={{margin:0}}>{tr('Správa úložiště','Storage management')}</h3>
 <p>{tr('Přehled skutečného hostitele z ručně importovaného měření. Žádná přímá správa Dockeru z webu.','Host storage from a manually imported snapshot. No Docker control from the web.')}</p>
 <code>sudo cyrisctl storage --json</code>
 <form onSubmit={e=>{e.preventDefault();load();}} style={{display:'grid',gap:8}}><label>{tr('JSON měření','JSON snapshot')}<textarea value={raw} onChange={e=>{setRaw(e.target.value);setReport(null);setError('');}} maxLength={16000} className="input-field" style={{display:'block',width:'100%',minHeight:70}} required/></label><button className="btn btn-primary" style={{justifySelf:'start'}} disabled={!raw.trim()}>{tr('Načíst měření','Load snapshot')}</button></form>
 {error&&<p role="alert">{error}</p>}
 {report&&<><p>{tr('Čas měření','Snapshot time')}: {new Date(report.collectedAt).toLocaleString()} · {report.version}{old&&(' · '+tr('Starší nebo časově nesouhlasící měření','Old or clock-skewed snapshot'))}</p>
 {unavailable!==null&&<div><strong>{tr('Kořenový disk','Root filesystem')}: {size(disk!.availableBytes)} / {size(disk!.totalBytes)} {tr('volno','available')}</strong><progress aria-label={tr('Nedostupná kapacita','Unavailable capacity')} max={100} value={unavailable} style={{width:'100%',height:12}}/>{unavailable>=85&&<p role="alert">{tr('Pozor: zbývá nejvýše 15 % kapacity.','Warning: at most 15% capacity remains available.')}</p>}</div>}
 <div style={{overflowX:'auto'}}><table className="data-table"><thead><tr><th>{tr('Souborový systém','Filesystem')}</th><th>{tr('Celkem','Total')}</th><th>{tr('Dostupné','Available')}</th></tr></thead><tbody>{Object.entries(report.filesystems).map(([name,v])=><tr key={name}><td>{name}</td><td>{size(v?.totalBytes??null)}</td><td>{size(v?.availableBytes??null)}</td></tr>)}</tbody></table></div>
 <div style={{overflowX:'auto'}}><table className="data-table"><thead><tr><th>{tr('Data služeb','Service data')}</th><th>{tr('Obsazeno','Allocated')}</th></tr></thead><tbody>{Object.entries(report.components).map(([name,n])=><tr key={name}><td>{name}</td><td>{size(n)}</td></tr>)}</tbody></table></div>
 <div style={{overflowX:'auto'}}><table className="data-table"><thead><tr><th>{tr('Adresář','Directory')}</th><th>{tr('Obsazeno','Allocated')}</th></tr></thead><tbody>{Object.entries(report.directories).map(([name,n])=><tr key={name}><td>{name}</td><td>{size(n)}</td></tr>)}</tbody></table></div>
 <div style={{overflowX:'auto'}}><table className="data-table"><thead><tr><th>Docker</th><th>{tr('Aktivní / celkem','Active / total')}</th><th>{tr('Velikost','Size')}</th><th>{tr('Potenciálně uvolnitelné','Potentially reclaimable')}</th></tr></thead><tbody>{Object.entries(report.docker).map(([name,v])=><tr key={name}><td>{name}</td><td>{v?v.active+' / '+v.total:'—'}</td><td>{size(v?.sizeBytes??null)}</td><td>{size(v?.reclaimableBytes??null)}</td></tr>)}</tbody></table></div>
 <p>{tr('Údaje se mohou překrývat. Uvolnitelné místo není bezpečný seznam k mazání; zachovejte zálohy a rollback images.','Values may overlap. Reclaimable is not a safe deletion list; retain backups and rollback images.')}</p></>}
 </section>;
}
