import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('Court and Forensics legacy forms have a globally defined, scrollable modal surface', () => {
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  const root = css.indexOf('CYRIS V2 SHARED LEGACY DIALOG CONTRACT');
  assert.ok(root >= 0, 'Missing shared legacy dialog contract');
  const rules = css.slice(root);
  for (const selector of ['.modal-backdrop', '.modal-dialog', '.modal-header',
    '.modal-body', '.modal-footer', '.modal-title', '.field-label', '.field-input',
    '.form-dialog-surface', '.form-dialog-body']) {
    assert.ok(rules.includes(selector), 'Missing selector ' + selector);
  }
  assert.match(rules, /max-height:\s*calc\(100dvh/);
  assert.match(rules, /overflow-y:\s*auto/);
  assert.match(rules, /min-width:\s*0/);
  assert.match(rules, /@media\s*\(max-width:\s*600px\)/);
  for (const path of [
    '../app/events/[eventId]/court/page.tsx',
    '../app/events/[eventId]/court/[courtCaseId]/page.tsx',
    '../app/events/[eventId]/forensics/page.tsx',
    '../app/events/[eventId]/forensics/[analysisId]/page.tsx',
  ]) {
    const page = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.ok(page.includes('modal-backdrop') && page.includes('modal-dialog'), path);
  }
});
