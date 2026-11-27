import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const page=readFileSync(new URL('../app/events/[eventId]/lab/[analysisId]/page.tsx',import.meta.url),'utf8');
test('lab correction uses a labelled inline form and explicit confirmation',()=>{
 assert.ok(!page.includes('window.prompt'));
 for(const marker of ['aria-labelledby="lab-correction-title"','htmlFor="lab-correction-reason"','required minLength={3}','aria-expanded={showCorrection}','role="alert"','correctionTrigger.current?.focus()','correctionField.current?.focus()'])assert.ok(page.includes(marker),marker);
});
test('lab correction preserves authorization, trimmed reason and retry state',()=>{
 const handler=page.slice(page.indexOf('const handleCorrection ='),page.indexOf('const handleDistribute ='));
 assert.ok(handler.includes('if(updating||!canCorrect||!showCorrection)return'));
 assert.ok(handler.includes('reason=correctionReason.trim()'));
 assert.ok(handler.includes('reason.length<3'));
 assert.ok(handler.includes("status:'REQUESTED', reason"));
 assert.ok(handler.indexOf('setCorrectionReason(\'\')')>handler.indexOf('if (!res.ok)'));
 assert.ok(handler.includes('catch(err)'));
 assert.ok(page.includes('const canCorrect = !viewAs && hasPermission'));
});
