import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DiagnosticSummarySchema,validateDiagnosticEvidence} from './operational-diagnostics.js';
const unavailable={status:'unavailable'} as const;
const source={schema:'cyris.diagnostic-summary.v1',collectedAt:'2026-11-25T10:00:00+00:00',version:'2.5.1',windowMinutes:60,maxLinesPerService:500,services:{api:{status:'sampled',sampledLines:5,categories:{TIMEOUT:2}},worker:unavailable,web:unavailable,postgres:unavailable,redis:unavailable,typesense:unavailable,minio:unavailable}};
test('diagnostics rejects arbitrary log text and invalid counts',()=>{
 assert.ok(DiagnosticSummarySchema.safeParse(source).success);
 assert.ok(!DiagnosticSummarySchema.safeParse({...source,rawLogs:'secret'}).success);
 assert.ok(!DiagnosticSummarySchema.safeParse({...source,services:{...source.services,api:{...source.services.api,categories:{TIMEOUT:6}}}}).success);
 assert.ok(!DiagnosticSummarySchema.safeParse({...source,services:{...source.services,api:{...source.services.api,categories:{RAW_SECRET:1}}}}).success);
});
test('model findings require evidence and cannot be duplicated',()=>{
 const input=DiagnosticSummarySchema.parse(source),finding={service:'api',category:'TIMEOUT',severity:'WARNING',hypothesis:'Slow dependency',nextCheck:'Check dependency latency'};
 assert.equal(validateDiagnosticEvidence(input,{summary:'Possible delay',findings:[finding]}).findings.length,1);
 for(const findings of [[{...finding,service:'worker'}],[{...finding,category:'ERROR'}],[finding,finding]])assert.throws(()=>validateDiagnosticEvidence(input,{summary:'Report',findings}));
});
