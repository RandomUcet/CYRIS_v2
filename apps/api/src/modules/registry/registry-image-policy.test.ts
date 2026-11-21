import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validRegistryImage} from './registry-image-policy.js';
test('only raster images with matching signatures are accepted',()=>{
 assert.equal(validRegistryImage('image/png',Uint8Array.from([137,80,78,71,13,10,26,10,0])),true);
 assert.equal(validRegistryImage('image/jpeg',Uint8Array.from([255,216,255,224])),true);
 assert.equal(validRegistryImage('image/gif',Buffer.from('GIF89a123')) ,true);
 assert.equal(validRegistryImage('image/webp',Buffer.from('RIFF1234WEBP')),true);
 assert.equal(validRegistryImage('image/svg+xml',Buffer.from('<svg onload="alert(1)"/>')),false);
 assert.equal(validRegistryImage('image/png',Buffer.from('<script>')),false);
 assert.equal(validRegistryImage('image/png',Uint8Array.from([])),false);
});
