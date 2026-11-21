import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CyrisApiClient} from './api-client.js';

test('DELETE treats empty 204, empty 200 and a successful JSON response as successful operations',async()=>{
  const oldFetch=globalThis.fetch;
  const client=new CyrisApiClient('https://cyris.invalid/api');
  try{
    for(const [status,payload] of [[204,null],[200,null],[200,JSON.stringify({success:true})]] as const){
      globalThis.fetch=async(_url,opts)=>{
        assert.equal(opts?.method,'DELETE');
        return new Response(payload,{status});
      };
      const result=await client.dismissNotification('00000000-0000-4000-8000-000000000001');
      assert.equal(result.ok,true,'DELETE '+status+' must succeed without JSON parse error');
      assert.equal(result.error,undefined);
    }
    globalThis.fetch=async()=>new Response(JSON.stringify({message:'Access denied'}),{
      status:403,headers:{'Content-Type':'application/json'}
    });
    const denied=await client.dismissNotification('00000000-0000-4000-8000-000000000001');
    assert.equal(denied.ok,false);
    assert.equal(denied.error,'Access denied');
  }finally{
    globalThis.fetch=oldFetch;
  }
});
