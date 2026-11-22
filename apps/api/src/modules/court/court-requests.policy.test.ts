import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CreateCourtRequestSchema, ReplyCourtRequestSchema, CourtRequestItemSchema } from '@cyris/contracts';
describe('formal legal request validation',()=>{
  it('accepts explicit types and legal response revision',()=>{
    assert.equal(CreateCourtRequestSchema.safeParse({
      kind:'EXPERT_OPINION',subject:'Toxicological expert opinion',
      details:'Provide laboratory conclusions about seized samples.',
    }).success,true);
    assert.equal(ReplyCourtRequestSchema.safeParse({
      status:'FULFILLED',response:'Expert report filed.',expectedRevision:1,
    }).success,true);
  });
  it('rejects empty, unbounded or forged state and negative revisions',()=>{
    for(const value of [
      {kind:'MEDICAL_REPORT',subject:'A',details:'too short'},
      {kind:'OTHER',subject:'x'.repeat(260),details:'Long enough explanation'},
      {kind:'DROP_TABLES',subject:'Evidence report',details:'Provide a complete analysis.'},
    ]) assert.equal(CreateCourtRequestSchema.safeParse(value).success,false);
    for(const status of ['CANCELLED','OPEN','CLOSED','DECIDED']){
      assert.equal(ReplyCourtRequestSchema.safeParse({expectedRevision:1,status,response:'reason'}).success,false);
    }
    assert.equal(ReplyCourtRequestSchema.safeParse({expectedRevision:0,status:'FULFILLED',response:'reason'}).success,false);
  });
  it('requires canonical UUID event and case references on outgoing responses',()=>{
    assert.equal(CourtRequestItemSchema.safeParse({id:'not-uuid'}).success,false);
  });
});
