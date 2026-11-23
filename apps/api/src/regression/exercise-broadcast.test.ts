import assert from 'node:assert/strict';
import test from 'node:test';
import { ExerciseBroadcastRequestSchema, ExerciseBroadcastAudienceQuerySchema } from '@cyris/contracts';
import { readFileSync } from 'node:fs';

test('broadcast schema enforces scope and bounded, nonempty message', () => {
  const valid={nonce:'82f48cad-79f2-4973-84b7-de8a43159c11',audience:'ALL',kind:'INFO',title:'Exercise update',message:'Team briefing moved to 11:00'};
  assert.equal(ExerciseBroadcastRequestSchema.safeParse(valid).success,true);
  assert.equal(ExerciseBroadcastRequestSchema.safeParse({...valid,audience:'UNIT'}).success,false);
  assert.equal(ExerciseBroadcastRequestSchema.safeParse({...valid,unitId:'82f48cad-79f2-4973-84b7-de8a43159c11'}).success,false);
  assert.equal(ExerciseBroadcastRequestSchema.safeParse({...valid,message:'x'.repeat(901)}).success,false);
  assert.equal(ExerciseBroadcastAudienceQuerySchema.safeParse({audience:'UNIT',kind:'INFO'}).success,false);
  assert.equal(ExerciseBroadcastAudienceQuerySchema.safeParse({audience:'ALL',kind:'INFO',unitId:valid.nonce}).success,false);
});
test('participant notification center renders organizer broadcasts as text, not executable markup', () => {
  const center=readFileSync(new URL('../../../web/src/components/layout/NotificationCenter.tsx',import.meta.url),'utf8');
  assert.match(center,/case 'exercise\.broadcast':return typeof p\.title==='string'\?p\.title/);
  assert.match(center,/\{detailText\}/);
  assert.doesNotMatch(center,/dangerouslySetInnerHTML/);
  const screen=readFileSync(new URL('../../../web/src/app/events/[eventId]/broadcast/page.tsx',import.meta.url),'utf8');
  assert.match(screen,/apiClient\.sendExerciseBroadcast/);
  assert.match(screen,/apiClient\.previewExerciseBroadcastAudience/);
  assert.match(screen,/listExerciseBroadcasts/);
});
