import 'reflect-metadata';
import {test} from 'node:test';import assert from 'node:assert/strict';
import {LegalSourceInputSchema,LegalDateSchema,LegalResearchInputSchema} from '@cyris/contracts';
import {validateLegalDraft,LegalLibraryService} from './legal-library.service.js';
import {ForbiddenException} from '@nestjs/common';
const id='12345678-1234-4123-8123-123456789abc';
test('source requires real date, official host and explicit provenance attestation',()=>{
 const source={act:'40/2009',provision:'§ test',heading:'Fixture',text:'Fictional test only, not actual legislation.',effectiveFrom:'2026-01-01',effectiveTo:null,sourceUrl:'https://e-sbirka.gov.cz/',confirmedSource:true};
 assert.ok(LegalSourceInputSchema.safeParse(source).success);
 for(const x of [{...source,sourceUrl:'https://e-sbirka.gov.cz.evil.test/'},{...source,confirmedSource:false},{...source,effectiveTo:'2025-01-01'}])assert.ok(!LegalSourceInputSchema.safeParse(x).success);
 assert.ok(!LegalDateSchema.safeParse('2026-02-30').success);
 assert.ok(!LegalResearchInputSchema.safeParse({question:'A legal question',asOf:'2026-01-01',sourceIds:[id,id]}).success);
});
test('legal answer refuses invented citations or execution fields',()=>{
 const response={points:[{analysis:'Review this excerpt',sourceIds:[id]}],missingFacts:[],limitations:['Incomplete excerpt']};
 assert.deepEqual(validateLegalDraft(JSON.stringify(response),[id]),response);
 assert.throws(()=>validateLegalDraft(JSON.stringify(response),[]));
 assert.throws(()=>validateLegalDraft(JSON.stringify({...response,execute:true}),[id]));
});
test('unauthorized reader cannot query the database or model',async()=>{
 const service=new LegalLibraryService({} as any,{authorize:async()=>false} as any,{} as any,{} as any);
 await assert.rejects(service.search(id,{id} as any,'','2026-01-01'),ForbiddenException);
 await assert.rejects(service.research(id,{id} as any,{} as any),ForbiddenException);
});
