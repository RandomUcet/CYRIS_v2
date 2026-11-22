import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SupportInboxQuerySchema } from '@cyris/contracts';

describe('Support request search and filtering contract', () => {
  it('accepts permitted category and bounded plain-text search', () => {
    const parsed = SupportInboxQuerySchema.parse({
      page: '2', status: 'OPEN', category: 'TECHNICAL', q: ' lost access ', 
    });
    assert.deepEqual(parsed, { page: 2, status: 'OPEN', category: 'TECHNICAL', q: 'lost access' });
  });
  it('rejects malformed, oversized, and cross-domain query values', () => {
    for (const candidate of [
      { category: 'ADMIN' }, { q: 'x' }, { q: 'x'.repeat(81) },
      { page: '0' }, { status: 'UNASSIGNED' },
    ]) {
      assert.equal(SupportInboxQuerySchema.safeParse(candidate).success, false);
    }
  });
  it('keeps old clients valid without optional filters', () => {
    assert.ok(SupportInboxQuerySchema.safeParse({ page: '1' }).success);
    assert.ok(SupportInboxQuerySchema.safeParse({}).success);
  });
});
