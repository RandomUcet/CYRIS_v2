import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterRelationships, relatedNodeCount, relationshipNeighborhood, relationshipEndpoint, relationshipGraphAllowed } from './relationship-filter.js';

const records = [
  { id: 'r1', relationshipType: 'OWNS', sourceResourceId: 'alice', targetResourceId: 'device',
    source: { title: 'Alice Example', identifier: 'PER-0001' }, target: { title: 'Server A' } },
  { id: 'r2', relationshipType: 'RELATED_TO', sourceResourceId: 'alice', targetResourceId: 'case',
    source: { title: 'Alice Example' }, target: { title: 'Investigation B', identifier: 'CASE-0042' } },
  { id: 'r3', relationshipType: 'LOCATED_AT', sourceResourceId: 'vehicle', targetResourceId: 'location',
    source: { title: 'Fleet 15' }, target: { label: 'Warehouse' } },
];
describe('Relationship graph controls', () => {
  it('filters by link type AND readable record metadata', () => {
    assert.deepEqual(filterRelationships(records, 'OWNS', 'server').map(x=>x.id), ['r1']);
    assert.deepEqual(filterRelationships(records, 'ALL', 'per-0001').map(x=>x.id), ['r1']);
    assert.deepEqual(filterRelationships(records, 'RELATED_TO', 'case-0042').map(x=>x.id), ['r2']);
    assert.deepEqual(filterRelationships(records, 'ALL', 'warehouse').map(x=>x.id), ['r3']);
    assert.deepEqual(filterRelationships(records, 'OWNS', 'warehouse'), []);
    assert.equal(filterRelationships(records, 'ALL', '').length, 3);
  });
  it('counts unique connected records, not graph elements or filtered-out nodes', () => {
    assert.equal(relatedNodeCount(records), 5);
    assert.equal(relatedNodeCount(filterRelationships(records, 'OWNS', '')), 2);
  });
  it('handles sparse records without rendering errors', () => {
    assert.deepEqual(filterRelationships([{ id: 'empty' }], 'ALL', 'name'), []);
    assert.equal(relatedNodeCount([{ id: 'empty' }]), 0);
  });
});

it('finds Czech words with accents and multiple tokens',()=>{
  const rows=[{source:{title:'Černá skříň'},target:{title:'Praha'}}];
  assert.equal(filterRelationships(rows,'ALL','praha cerna').length,1);
});
it('traverses direct and two-hop links without including disconnected components',()=>{
  const rows=[...records,{id:'r4',sourceResourceId:'device',targetResourceId:'server'}];
  assert.deepEqual(relationshipNeighborhood(rows,'alice',1).map(r=>r.id),['r1','r2']);
  assert.deepEqual(relationshipNeighborhood(rows,'alice',2).map(r=>r.id),['r1','r2','r4']);
  assert.deepEqual(relationshipNeighborhood(rows,'server',2).map(r=>r.id),['r1','r4']);
  assert.deepEqual(relationshipNeighborhood(rows,'missing',2),[]);
  assert.deepEqual(relationshipNeighborhood(rows,'',1),rows);
});
it('bounds graph rendering without dropping rows and handles endpoint metadata',()=>{
  const many=Array.from({length:301},(_,i)=>({sourceId:'a',targetId:'b',id:String(i)}));
  assert.equal(relationshipGraphAllowed(many),false);
  assert.equal(relationshipGraphAllowed(records),true);
  assert.deepEqual(relationshipEndpoint(records[0]!,'source'),{id:'alice',title:'Alice Example',identifier:'PER-0001',type:'resource'});
  assert.equal(relationshipEndpoint({},'target'),null);
});
