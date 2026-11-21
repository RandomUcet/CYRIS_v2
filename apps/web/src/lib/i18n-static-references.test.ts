import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import {join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {translations} from './i18n.js';

/** Catalog parity alone cannot detect a typo like notification.markAllRead. */
const webSourceRoot=fileURLToPath(new URL('../',import.meta.url));
function sourceFiles(dir:string):string[]{
  return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    if(['node_modules','dist','.next'].includes(entry.name))return [];
    const path=join(dir,entry.name);
    if(entry.isDirectory())return sourceFiles(path);
    if(!/\.(tsx?|jsx?)$/.test(entry.name)||entry.name.endsWith('.test.ts'))return [];
    return [path];
  });
}

test('every literal t(key) reference resolves in all four supported UI locales',()=>{
  const missing:string[]=[];
  let references=0;
  // A concatenated prefix such as t('serviceStatus.impact.' + mode) is dynamic, not a missing literal key.
  for(const path of sourceFiles(webSourceRoot)){
    const source=readFileSync(path,'utf8');
    for(const match of source.matchAll(/\bt\s*\(\s*(['"])([A-Za-z][\w.-]+)\1\s*(?=[,)])/g)){
      references++;
      const key=match[2];
      const line=source.slice(0,match.index).split('\n').length;
      for(const locale of ['en','cs','de','pl'] as const){
        if(!Object.hasOwn(translations[locale],key)){
          missing.push(relative(webSourceRoot,path)+':'+line+' ['+locale+'] '+key);
        }
      }
    }
  }
  assert.ok(references>25,'expected a meaningful scan of translated UI controls');
  assert.deepEqual(missing,[], 'Every visible static translation must exist; do not show raw keys to students.');
});
