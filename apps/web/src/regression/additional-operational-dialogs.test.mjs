import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('all primary operational and intelligence modals provide named, focus-managed surfaces', () => {
  for (const file of [
    '../app/events/[eventId]/forensics/indicators/page.tsx',
    '../app/events/[eventId]/registry/[entityType]/[id]/page.tsx',
    '../app/events/[eventId]/command/page.tsx',
    '../app/events/[eventId]/cases/page.tsx',
    '../app/events/[eventId]/evidence/page.tsx',
    '../app/events/[eventId]/incidents/page.tsx',
    '../app/events/[eventId]/registry/page.tsx',
  ]) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.ok(source.includes('useDialogAccessibility('), 'No focus trap for ' + file);
    assert.ok(source.includes('role="dialog"'), 'No dialog role for ' + file);
    assert.ok(source.includes('aria-modal="true"'), 'No aria-modal for ' + file);
    assert.ok(source.includes('aria-label=') || source.includes('aria-labelledby='), 'No accessible name for ' + file);
  }
});
test('generic dialog body scrolls within bounded surface', () => {
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  assert.ok(css.includes('.dialog-surface > form {'));
  assert.ok(css.includes('overscroll-behavior: contain'));
  assert.ok(css.includes('.dialog-surface :is(input[type="checkbox"], input[type="radio"])'));
});
