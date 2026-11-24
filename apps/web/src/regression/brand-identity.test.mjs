import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
test('modular C replaces the initial letter rather than repeating it',()=>{
 const asset=read('../../public/brand/cyris.svg'),icon=read('../app/icon.svg'),brand=read('../components/layout/Brand.tsx');
 assert.match(asset,/viewBox="0 0 110 32"/);
 assert.match(asset,/id="letters" transform="translate\(-30 0\)" d="M73\.97/);
 assert.match(asset,/id="signal"/);assert.match(asset,/#f97316/);assert.match(icon,/#f97316/);
 assert.match(brand,/0 0 38 32/);assert.match(brand,/0 0 110 32/);
});
