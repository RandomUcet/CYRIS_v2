import {test} from 'node:test';
import assert from 'node:assert/strict';
import {OpenAICompatibleProvider} from './openai-compatible.provider.js';

const config={id:'test',name:'Test provider',endpoint:'https://example.invalid/v1',chatModel:'test-model',timeoutSeconds:5,tlsVerify:false};
type DispatcherState={destroyed:boolean};
test('explicit TLS override releases its operation dispatcher on success and HTTP failure',async t=>{
  const agents:DispatcherState[]=[];
  let fail=false;
  t.mock.method(globalThis,'fetch',async (_input:unknown,init:{dispatcher?:DispatcherState})=>{
    assert.ok(init.dispatcher);agents.push(init.dispatcher);
    return fail?new Response('error',{status:503}):Response.json({choices:[{message:{content:'ok'}}]});
  });
  const provider=new OpenAICompatibleProvider(config);
  assert.equal((await provider.generate([{role:'user',content:'test'}])).text,'ok');
  assert.equal(agents[0]?.destroyed,true);
  fail=true;
  await assert.rejects(provider.generate([{role:'user',content:'test'}]),/503/);
  assert.equal(agents[1]?.destroyed,true);
  assert.notEqual(agents[0],agents[1]);
});
test('standard TLS probe releases unread bodies before returning',async t=>{
  const models=new Response('not found',{status:404});
  const probe=new Response('probe response',{status:200});
  let calls=0;
  t.mock.method(globalThis,'fetch',async (_input:unknown,init:{dispatcher?:DispatcherState})=>{
    assert.equal(init.dispatcher,undefined);
    return calls++===0?models:probe;
  });
  const provider=new OpenAICompatibleProvider({...config,tlsVerify:true});
  assert.equal((await provider.testConnection()).success,true);
  assert.equal(models.bodyUsed,true);
  assert.equal(probe.bodyUsed,true);
});

test('structured requests set JSON mode and reject truncated or empty completions',async t=>{
 let finish='stop',content='{"ok":true}';
 t.mock.method(globalThis,'fetch',async (_input:unknown,init:{body:string})=>{
  const body=JSON.parse(init.body);assert.deepEqual(body.response_format,{type:'json_object'});assert.equal(body.chat_template_kwargs.enable_thinking,false);
  return Response.json({choices:[{finish_reason:finish,message:{content}}]});
 });
 const provider=new OpenAICompatibleProvider({...config,tlsVerify:true});
 const run=()=>provider.generate([{role:'user',content:'test'}],{responseFormat:'json_object',reasoning:'disabled'});
 assert.equal((await run()).text,content);
 finish='length';await assert.rejects(run,/TRUNCATED/);
 finish='stop';content='';await assert.rejects(run,/EMPTY_OUTPUT/);
});
