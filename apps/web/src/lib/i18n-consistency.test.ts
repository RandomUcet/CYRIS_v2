import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {checkTranslationConsistency,translations,translate} from './i18n.js';
test('all selectable UI locales contain every canonical translation key',()=>{
  const report=checkTranslationConsistency();
  assert.equal(report.ok,true,JSON.stringify(report.missing));
});
test('translation interpolation remains functional',()=>{
  assert.equal(translate('en','notification.taskAssigned',{taskNumber:'TASK-001'}).includes('TASK-001'),true);
  for(const loc of ['cs','de','pl'] as const){
    assert.ok(Object.keys(translations[loc]).length>=Object.keys(translations.en).length);
  }
});

test('notification controls reference only defined translations in all supported locales',()=>{
  const source=readFileSync(new URL('../components/layout/NotificationCenter.tsx',import.meta.url),'utf8');
  const keys=[...source.matchAll(/\bt\(\s*['"]([^'"]+)['"]/g)].map(match=>match[1]);
  assert.ok(keys.includes('action.markAllRead'));
  for(const locale of ['en','cs','de','pl'] as const){
    for(const key of keys)assert.ok(translations[locale][key],locale+' missing UI translation '+key);
  }
});
