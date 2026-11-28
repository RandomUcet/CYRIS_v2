import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../app/events/[eventId]/lab/[analysisId]/page.tsx',import.meta.url),'utf8');
test('lab assignment clears stale selections and ignores obsolete worker responses',()=>{
 assert.ok(source.includes('if (!active) return;'));
 assert.ok(source.includes('return ()=>{active=false;}'));
 assert.ok(source.includes("setSelectedWorkerId('');setEligibleWorkers([]);"));
 assert.ok(source.includes('eligibleWorkers.some(worker=>worker.id===selectedWorkerId)'));
 assert.ok(source.includes('workersLoading || workersError'));
});
test('lab assignment is a single labelled responsive form with retry and unchanged permission gate',()=>{
 assert.ok(source.includes('aria-labelledby="lab-assignment-title"'));
 assert.ok(source.includes('!viewAs && hasPermission(\'lab.reassign\', eventId)'));
 assert.ok(source.includes('role="alert">{workersError}'));
 assert.ok(source.includes('setWorkersRetry(n=>n+1)'));
 assert.ok(!source.includes('Distribute to queue'));
});

test('assignment accessible names exclude dynamic option text',()=>{
 for(const id of ['unit','worker','reason']) {
  assert.ok(source.includes('id="lab-assignment-'+id+'-label"'));
  assert.ok(source.includes('aria-labelledby="lab-assignment-'+id+'-label"'));
 }
});
