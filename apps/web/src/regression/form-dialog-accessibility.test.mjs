import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const bases = [
  '../app/events/[eventId]/court/page.tsx',
  '../app/events/[eventId]/court/[courtCaseId]/page.tsx',
  '../app/events/[eventId]/forensics/page.tsx',
  '../app/events/[eventId]/forensics/[analysisId]/page.tsx',
  '../app/events/[eventId]/evaluation/page.tsx',
  '../app/events/[eventId]/tasks/page.tsx',
  '../app/events/[eventId]/lab/page.tsx',
  '../app/events/[eventId]/medical/page.tsx',
  '../app/events/[eventId]/medical/[encounterId]/page.tsx',
];
test('every primary high-risk record form uses accessible modal semantics and keyboard lifecycle', () => {
  for (const rel of bases) {
    const s = readFileSync(new URL(rel, import.meta.url), 'utf8');
    assert.ok(s.includes('useDialogAccessibility('), 'No keyboard dialog lifecycle: ' + rel);
    assert.ok(s.includes('role="dialog"'), 'No dialog semantics: ' + rel);
    assert.ok(s.includes('aria-modal="true"'), 'No aria-modal: ' + rel);
    assert.ok(s.includes('aria-label=') || s.includes('aria-labelledby='), 'No accessible name: ' + rel);
  }
});
test('legal and forensics dialog surfaces use defined scrollable CSS classes', () => {
  for (const rel of bases.filter(f => f.includes('/court/') || f.includes('/forensics/'))) {
    const s = readFileSync(new URL(rel, import.meta.url), 'utf8');
    const dialogCount = (s.match(/className="modal-dialog"/g) ?? []).length;
    const namedCount = (s.match(/className="modal-dialog" role="dialog" aria-modal="true" aria-label=/g) ?? []).length;
    assert.ok(dialogCount > 0 && dialogCount === namedCount, 'Unlabelled modal: ' + rel);
  }
});
test('legacy task and lab dialogs no longer depend on missing Tailwind layout classes', () => {
  const tasks = readFileSync(new URL('../app/events/[eventId]/tasks/page.tsx', import.meta.url), 'utf8');
  const lab = readFileSync(new URL('../app/events/[eventId]/lab/page.tsx', import.meta.url), 'utf8');
  assert.ok(tasks.includes('dialog-overlay dialog-overlay-top'));
  assert.ok(tasks.includes('dialog-body form-dialog-body'));
  assert.ok(lab.includes('dialog-surface form-dialog-surface'));
  assert.ok(lab.includes('className="form-dialog-body"'));
});
