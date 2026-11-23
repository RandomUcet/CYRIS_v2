import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { ExerciseBroadcastPlanInputSchema,ExerciseBroadcastPlanRevisionSchema,
  ExerciseBroadcastPlanTransitionSchema } from '@cyris/contracts';

test('planned EXCON messages enforce type, audience, immutable nonce and revision',()=>{
  const nonce='6cc6d6e6-21ef-4a88-8322-e7a1482f2700';
  const sample={nonce,kind:'UPDATE',audience:'ALL',title:'New time for briefing',message:'We will meet at the EXCON desk.'};
  assert.equal(ExerciseBroadcastPlanInputSchema.safeParse(sample).success,true);
  assert.equal(ExerciseBroadcastPlanInputSchema.safeParse({...sample,unitId:nonce}).success,false);
  assert.equal(ExerciseBroadcastPlanRevisionSchema.safeParse({...sample,revision:0}).success,false);
  assert.equal(ExerciseBroadcastPlanTransitionSchema.safeParse({revision:1,scheduledAt:'garbage'}).success,false);
});
test('worker retains dedicated due-time processing and operator UI allows cancelling',()=>{
  const worker=readFileSync(new URL('../../../worker/src/scenario/scenario-scheduler.service.ts',import.meta.url),'utf8');
  const runtime=readFileSync(new URL('../../../../packages/db/src/broadcast-runtime.ts',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../../../web/src/app/events/[eventId]/broadcast/page.tsx',import.meta.url),'utf8');
  assert.match(worker,/dispatchDueExerciseBroadcasts/);
  assert.match(runtime,/skipLocked:true/);
  assert.match(runtime,/isOperationalAutoReleaseHeld/);
  assert.match(runtime,/event\?\.status==='ACTIVE'/);
  assert.match(ui,/getExerciseBroadcastPlans/);
  assert.match(ui,/scheduleExerciseBroadcastPlan/);
  assert.match(ui,/cancelExerciseBroadcastPlan/);
  assert.match(ui,/Uložit koncept/);
});
