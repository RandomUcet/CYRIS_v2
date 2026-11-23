import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const page=readFileSync(new URL('../app/events/[eventId]/medical/page.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');

test('medical create form uses the full responsive stacking and modal styling',()=>{
  assert.match(page,/className="dialog-overlay medical-dialog-overlay"/);
  assert.match(page,/className="dialog-surface medical-dialog-surface"/);
  assert.match(page,/className="dialog-body medical-dialog-body"/);
  assert.match(css,/\.medical-dialog-overlay\s*\{[^}]*z-index:\s*1100/);
  assert.match(css,/\.medical-dialog-body\s*\{[^}]*overflow-y:\s*auto/);
});

test('medical fields have linked accessible labels, and submission cannot be dismissed mid-save',()=>{
  for(const id of ['new-medical-team','medical-new-complaint','medical-new-mechanism',
    'medical-new-triage','medical-new-assessment']){
    assert.ok(page.includes('htmlFor="'+id+'"'),'label missing for '+id);
    assert.ok(page.includes('id="'+id+'"'),'input id missing for '+id);
  }
  assert.match(page,/onClick=\{\(\) => setShowCreateModal\(false\)\}\s+disabled=\{submitting\}/);
  assert.ok(!page.includes("document.addEventListener('keydown', handleKeyDown)"),
    'useDialogAccessibility already owns Escape and focus management');
  assert.match(page,/aria-modal="true"/);
});
