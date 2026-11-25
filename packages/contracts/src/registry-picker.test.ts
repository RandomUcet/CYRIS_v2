import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RegistryPickerQuerySchema,RegistryPickerResultSchema} from './registry.js';
test('registry picker enforces bounded search queries',()=>{
  assert.equal(RegistryPickerQuerySchema.safeParse({q:'O'}).success,false);
  assert.equal(RegistryPickerQuerySchema.safeParse({q:'Pardubice',limit:31}).success,false);
  const good=RegistryPickerQuerySchema.parse({q:' Novák ',limit:'20'});
  assert.deepEqual(good,{q:'Novák',limit:20});
});
test('registry picker response requires event scope and canonical identifiers',()=>{
  assert.equal(RegistryPickerResultSchema.safeParse({
    id:'00000000-0000-4000-8000-000000000099',
    eventId:'00000000-0000-4000-8000-000000000100',
    entityType:'persons',identifier:'PER-1',label:'Fictional Person',
  }).success,true);
  assert.equal(RegistryPickerResultSchema.safeParse({
    id:'not-uuid',eventId:'x',entityType:'persons',identifier:null,label:'x',
  }).success,false);
});

test('canonical picker supports bounded device and party filters',()=>{
 for(const types of ['persons','organisations','persons,organisations','devices','locations','vehicles','weapons','licences'])assert.equal(RegistryPickerQuerySchema.safeParse({q:'Record',types}).success,true);
 for(const types of ['person','*','devices,persons','persons,persons','unknown'])assert.equal(RegistryPickerQuerySchema.safeParse({q:'Record',types}).success,false);
});
