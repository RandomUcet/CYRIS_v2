import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../app/events/[eventId]/medical/[encounterId]/page.tsx',import.meta.url),'utf8');
test('medical triage starts from actual category, labels fields and guards preview and concurrent submit',()=>{
 assert.ok(page.includes('setNewTriage(encounter.triageCategory)'));
 assert.ok(!page.includes("useState<MedicalTriageCategory>('IMMEDIATE')"));
 for(const field of ['medical-triage-category','medical-triage-note']){
   assert.ok(page.includes('htmlFor="'+field+'"'));assert.ok(page.includes('id="'+field+'"'));
 }
 for(const permission of ['triage','observe','intervene','transfer','close'])assert.ok(page.includes("!viewAs && hasPermission('medical."+permission+"'"));
 assert.ok(page.includes('if(actionPending||!canTriage||!encounter'));
 assert.ok(page.includes('aria-labelledby="triage-dialog-title" aria-busy={actionPending}'));
});
