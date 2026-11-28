import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveTeamGuides,teamGuideV1,TeamGuideSchema} from './team-guides.js';
import {canonicalTeamRoleSlugs} from './team-role-profiles.js';
test('each canonical team has a distinct bilingual starter and no unknown team is inferred',()=>{
 assert.deepEqual(Object.keys(teamGuideV1).sort(),Object.keys(canonicalTeamRoleSlugs).sort());
 for(const slug of Object.keys(teamGuideV1)){
   const unitId='a0000000-0000-4000-8000-000000000001';
   const guides=resolveTeamGuides([{unitId,unitName:'Fixture',unitSlug:slug}]);
   assert.equal(guides.length,1);assert.equal(guides[0]?.unitId,unitId);
   assert.ok(TeamGuideSchema.safeParse(guides[0]).success);
   assert.ok(guides[0]!.items.every(item=>item.cs.length>10&&item.en.length>10));
 }
 assert.deepEqual(resolveTeamGuides([{unitId:'unknown',unitName:'Kybernetický forenzní tým',unitSlug:'custom'},{unitId:'other',unitName:'Other',unitSlug:'__proto__'}]),[]);
 assert.deepEqual(resolveTeamGuides([]),[]);
});
