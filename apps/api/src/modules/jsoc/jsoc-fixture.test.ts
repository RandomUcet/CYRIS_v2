import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSyntheticJsocLogs} from './jsoc-fixture.js';
import {GenerateJsocLogsSchema} from '@cyris/contracts';
test('simulated telemetry is deterministic and never contains live host addresses',()=>{
  const input={seed:1234,count:30,scenario:'Exercise scenario'};
  const a=createSyntheticJsocLogs(input,new Date('2026-01-01T12:00:00.000Z'));
  const b=createSyntheticJsocLogs(input,new Date('2026-01-01T12:00:00.000Z'));
  assert.deepEqual(a,b);
  assert.equal(a.length,30);
  assert.ok(a.every(x=>x.message.startsWith('Simulated ')&&x.source.startsWith('training-')&&
    x.sourceAddress.startsWith('192.0.2.')&&
    (x.destinationAddress.startsWith('198.51.100.')||x.destinationAddress.startsWith('203.0.113.'))));
});
test('generation is bounded and rejects invalid payloads',()=>{
  assert.equal(GenerateJsocLogsSchema.safeParse({seed:1,count:1001,scenario:'test'}).success,false);
  assert.equal(GenerateJsocLogsSchema.safeParse({seed:1,count:100,scenario:'test'}).success,true);
  assert.equal(GenerateJsocLogsSchema.safeParse({seed:1,count:0,scenario:'test'}).success,false);
});
