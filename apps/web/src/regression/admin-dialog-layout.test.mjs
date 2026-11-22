import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('administration forms are viewport-bounded and keyboard accessible', () => {
  const expected = [
    ['../app/admin/events/page.tsx', 4],
    ['../app/admin/units/page.tsx', 2],
    ['../app/admin/settings/identity/page.tsx', 1],
  ];
  for (const [path, count] of expected) {
    const src = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.ok(src.includes('useDialogAccessibility('), 'Missing keyboard trap: ' + path);
    const surfaces = (src.match(/className="dialog-surface form-dialog-surface" role="dialog"/g) ?? []).length;
    assert.equal(surfaces, count, 'Missing accessible dialog surfaces: ' + path);
    assert.equal((src.match(/className="dialog-overlay dialog-overlay-top"/g) ?? []).length, count);
  }
});
