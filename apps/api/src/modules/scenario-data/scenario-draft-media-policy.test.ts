import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ScenarioDraftMediaUploadSchema, ScenarioDraftMediaImageQuerySchema,
  ScenarioDraftRecordListQuerySchema } from '@cyris/contracts';
import { validRegistryImage } from '../registry/registry-image-policy.js';

const base = { kind: 'persons', index: 0, filename: 'photo.png', mimeType: 'image/png' };
const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);

describe('Persisted Spark draft image boundaries', () => {
  it('allows only event-scoped, typed draft slots and non-executable image MIME', () => {
    assert.ok(ScenarioDraftMediaUploadSchema.safeParse({ ...base, data: png.toString('base64') }).success);
    assert.equal(ScenarioDraftMediaUploadSchema.safeParse({ ...base, mimeType: 'image/svg+xml', data: 'PHN2Zz4=' }).success, false);
    assert.equal(ScenarioDraftMediaUploadSchema.safeParse({ ...base, index: -1, data: png.toString('base64') }).success, false);
    assert.equal(ScenarioDraftMediaUploadSchema.safeParse({ ...base, filename: '', data: png.toString('base64') }).success, false);
  });
  it('requires a real raster signature, not a forged MIME label', () => {
    assert.equal(validRegistryImage('image/png', png), true);
    assert.equal(validRegistryImage('image/png', Buffer.from('<svg onload=alert(1)>')), false);
  });
  it('parses URL query indexes while bounding pagination', () => {
    assert.deepEqual(ScenarioDraftMediaImageQuerySchema.parse({ kind: 'vehicles', index: '7' }),
      { kind: 'vehicles', index: 7 });
    assert.equal(ScenarioDraftRecordListQuerySchema.safeParse({ kind: 'persons', page: '0' }).success, false);
    assert.equal(ScenarioDraftRecordListQuerySchema.safeParse({ kind: 'persons', limit: '51' }).success, false);
  });
});
