'use client';
import {useEffect,useState} from 'react';
import {apiClient} from '@/lib/api-client';
import type {ServiceStatusResponse} from '@cyris/contracts';
export function useServiceStatus(eventId:string){
  const [data,setData]=useState<ServiceStatusResponse|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [nonce,refresh]=useState(0);
  useEffect(()=>{
    let active=true,inflight=false;
    setData(null);setError(null);
    async function load(){
      if(!active||inflight||!eventId)return;
      inflight=true;
      try{
        const r=await apiClient.getServiceStatus(eventId);
        if(active){if(r.ok&&r.data){setData(r.data);setError(null);}else{setError(r.error||'Unable to load service status');}}
      }catch(e){if(active)setError(String(e));}
      finally{inflight=false;}
    }
    void load();
    const interval=window.setInterval(load,15000);
    return ()=>{active=false;window.clearInterval(interval);};
  },[eventId,nonce]);
  return {data:data?.eventId===eventId?data:null,error,refresh:()=>refresh(n=>n+1)};
}
