import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('registry detail gates record actions and rejects stale responses',()=>{
 const p=readFileSync(new URL('../app/events/[eventId]/registry/[entityType]/[id]/page.tsx',import.meta.url),'utf8');
 for(const part of ['getRegistryRecordActions(eventId,id)','Boolean(actions?.edit)','Boolean(actions?.link)','Boolean(actions?.timeline)','scopeRef.current===scope&&detailRequest.current===request','res.data.eventId!==eventId','relationsLoadError','timelineError'])assert.ok(p.includes(part),part);
 assert.ok(!p.includes("hasPermission('registry.update'"));
});
