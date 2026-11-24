import {test} from 'node:test';import assert from 'node:assert/strict';import {snapshotFreshness,exconAttention} from './excon-workspace';
test('freshness never presents failed or expired snapshots as current',()=>{
 const now=Date.parse('2026-11-24T18:00:00Z');const asOf=new Date(now-20000).toISOString();
 assert.equal(snapshotFreshness(asOf,now,true,false),'fresh');assert.equal(snapshotFreshness(asOf,now,false,false),'paused');assert.equal(snapshotFreshness(asOf,now,true,true),'stale');assert.equal(snapshotFreshness(asOf,now+70000,true,false),'stale');assert.equal(snapshotFreshness(undefined,now,true,false),'stale');
});
test('EXCON shows nonzero actionable categories in operational order',()=>{
 const rows=exconAttention({holds:{active:1,modules:[]},broadcasts:{draft:0,scheduled:0,failed:2,sent:0},participation:{activeUsers:2,activeTeams:1,briefingReceipts:0,briefingsRead:0,briefingsAcknowledged:0,broadcastReceipts:3,broadcastsRead:0,urgentUnread:3},injects:{total:5,ready:5,blocked:0,scheduled:0,released:0,draft:0}});
 assert.deepEqual(rows.map(x=>x.key),['holds','failed','urgent','ready']);
});
