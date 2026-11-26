'use client';
import {usePreferences} from '@/contexts/PreferencesContext';
export type ActionMessage={kind:'success'|'error';message:string};
export function ActionFeedback({message,busy,onDismiss}:{message:ActionMessage|null;busy:boolean;onDismiss:()=>void}){
 const {locale}=usePreferences(),cs=locale==='cs';
 if(!message&&!busy)return null;
 return <div className={'action-feedback'+(message?' action-feedback-'+message.kind:'')} aria-busy={busy}>
  <div role={message?.kind==='error'?'alert':'status'}><strong>{busy?(cs?'Zpracovávám požadavek…':'Processing request…'):message?.kind==='error'?(cs?'Akci se nepodařilo dokončit':'Action could not be completed'):(cs?'Změna uložena':'Change saved')}</strong>
  {!busy&&message&&<p>{message.message}</p>}</div>
  {!busy&&message&&<button type="button" className="btn btn-secondary" onClick={onDismiss}>{cs?'Zavřít':'Dismiss'}</button>}
 </div>;
}
