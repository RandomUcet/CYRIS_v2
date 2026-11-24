import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
test('modular C replaces the initial letter rather than repeating it',()=>{
 const asset=read('../../public/brand/cyris.svg'),icon=read('../app/icon.svg'),brand=read('../components/layout/Brand.tsx');
 assert.match(asset,/viewBox="0 0 121 32"/);
 assert.match(asset,/id="letters" transform="translate\(-19 0\)" d="M73\.97/);
 assert.match(asset,/id="signal"/);assert.match(asset,/#f97316/);assert.match(icon,/#f97316/);
 assert.match(brand,/0 0 38 32/);assert.match(brand,/0 0 121 32/);
});

test('wordmark has positive optical gap beyond orange facet and enough viewBox space',()=>{
 const asset=read('../../public/brand/cyris.svg');
 const shift=Number(asset.match(/id="letters" transform="translate\((-?\d+) 0\)"/)?.[1]);
 assert.ok(60.83+shift-37>=4&&60.83+shift-37<=7);
 assert.ok(137.35+shift<121);
 assert.match(read('../components/layout/Brand.tsx'),/cyris\.svg\?v=2#signal/);
});
