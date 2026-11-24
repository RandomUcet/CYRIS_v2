import {test} from 'node:test';
import assert from 'node:assert/strict';
import {relationshipRecordHref as href} from './relationship-routing';
const eventId='e1';
test('links supported resources inside their own exercise',()=>{
  assert.equal(href(eventId,{id:'lic1',type:'LICENCE'}),'/events/e1/registry/licences/lic1');
  assert.equal(href(eventId,{id:'p1',type:'PERSON'}),'/events/e1/registry/persons/p1');
  assert.equal(href(eventId,{id:'org',type:'ORGANIZATION'}),'/events/e1/registry/organisations/org');
  assert.equal(href(eventId,{id:'i1',type:'INCIDENT'}),'/events/e1/incidents/i1');
  assert.equal(href(eventId,{id:'la',type:'LAB_ANALYSIS'}),'/events/e1/lab/la');
});
test('does not open external or cross-exercise metadata routes',()=>{
  assert.equal(href(eventId,{id:'p1',type:'person',route:'https://example.org'}),'/events/e1/registry/persons/p1');
  assert.equal(href(eventId,{id:'p1',type:'person',route:'/events/e2/registry/persons/p1'}),'/events/e1/registry/persons/p1');
  assert.equal(href(eventId,{id:'x',type:'UNKNOWN',route:'/events/e2/incidents/x'}),null);
  assert.equal(href(eventId,{id:'x',type:'UNKNOWN'}),null);
});
