import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('medical workspace visual tokens apply in normal screen rendering (not only @media print)', () => {
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  const medical = css.indexOf('/* Medical workspace design tokens apply on screen as well as print. */');
  const print = css.indexOf('@media print');
  assert.ok(medical > 0 && print > medical, 'Medical screen styles must appear before print-only styles');
  assert.ok(css.slice(medical, print).includes('.medical-workspace .bg-slate-950'));
  assert.ok(css.slice(medical, print).includes('.medical-workspace .text-slate-200'));
  assert.ok(css.slice(medical, print).includes('.medical-workspace .border-slate-800'));
});
