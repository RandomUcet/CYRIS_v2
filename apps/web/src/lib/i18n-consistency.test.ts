import assert from 'node:assert/strict';
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
