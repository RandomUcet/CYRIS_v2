import {test} from 'node:test';import assert from 'node:assert/strict';
import {observerBucket,observerChange,type ExerciseObserverSnapshot} from '@cyris/contracts';
const previous:ExerciseObserverSnapshot={eventId:'12345678-1234-4123-8123-123456789abc',observedAt:'2026-11-24T18:01:00.000Z',pending:5,unchanged:2,blocked:1,reviewAfterHours:12};
test('UTC buckets are stable across minutes and reset at the next interval',()=>{
 assert.equal(observerBucket(new Date('2026-11-24T18:14:59Z')).toISOString(),'2026-11-24T18:00:00.000Z');
 assert.equal(observerBucket(new Date('2026-11-24T18:15:00Z')).toISOString(),'2026-11-24T18:15:00.000Z');
});
test('trend comparisons refuse gaps, changed thresholds and other events',()=>{
 const next={...previous,observedAt:'2026-11-24T18:16:00.000Z',pending:4,unchanged:1};
 assert.deepEqual(observerChange(previous,next),{pending:-1,unchanged:-1,blocked:0});
 assert.equal(observerChange(previous,{...next,reviewAfterHours:6}),null);
 assert.equal(observerChange(previous,{...next,observedAt:'2026-11-24T18:46:00.000Z'}),null);
 assert.equal(observerChange(previous,{...next,eventId:'other'}),null);
});
