import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CreateLicenceRequestSchema, UpdateLicenceRequestSchema, effectiveLicenceStatus, licenceDatesOrdered } from './registry.js';
const input = {title:'Fictional licence',category:'DRIVING',holderId:'00000000-0000-4000-8000-000000000001',issuerId:'00000000-0000-4000-8000-000000000002',validFrom:'2026-01-01',validUntil:'2026-12-31'};
test('licence validates calendar dates and distinct principals', () => {
  assert.equal(CreateLicenceRequestSchema.safeParse(input).success,true);
  for (const invalid of [{validFrom:'2026-02-30'},{validUntil:'2025-12-31'},{issuerId:input.holderId},{category:'UNKNOWN'}])
    assert.equal(CreateLicenceRequestSchema.safeParse({...input,...invalid}).success,false);
  assert.equal(UpdateLicenceRequestSchema.safeParse({holderId:input.issuerId}).success,false);
  assert.equal(UpdateLicenceRequestSchema.safeParse({validUntil:null}).success,true);
  assert.equal(licenceDatesOrdered('2026-02-01','2026-01-01'),false);
});
test('licence validity uses exercise date and inclusive end date', () => {
  assert.equal(effectiveLicenceStatus('ISSUED',input.validFrom,input.validUntil,'2025-12-31'),'NOT_YET_VALID');
  assert.equal(effectiveLicenceStatus('ISSUED',input.validFrom,input.validUntil,'2026-12-31'),'VALID');
  assert.equal(effectiveLicenceStatus('ISSUED',input.validFrom,input.validUntil,'2027-01-01'),'EXPIRED');
  assert.equal(effectiveLicenceStatus('REVOKED',input.validFrom,input.validUntil,'2026-04-01'),'REVOKED');
});
