import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
const source=readFileSync(new URL('../app/events/[eventId]/lab/[analysisId]/page.tsx',import.meta.url),'utf8');
test('lab metadata refresh does not overwrite the protocol editor',()=>{
  assert.match(source,/fetchAnalysisDetails = async \(preserveDraft = false\)/);
  assert.match(source,/if \(!preserveDraft\) \{\s*setMethod\(res\.data\.method \|\| ''\);\s*setFindings\(res\.data\.findings \|\| ''\);\s*setConclusion\(res\.data\.conclusion \|\| ''\);\s*\}/);
  assert.match(source,/setReceiptNotes\(old=>\(\{\.\.\.old,\[item\.id\]:''\}\)\);\s*await fetchAnalysisDetails\(true\)/);
  assert.equal((source.match(/setReassignReason\(''\);\s*await fetchAnalysisDetails\(true\)/g)||[]).length,2);
  assert.match(source,/Analysis draft saved\.'\);\s*await fetchAnalysisDetails\(\)/);
});
