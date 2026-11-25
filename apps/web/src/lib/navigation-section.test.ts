import {test} from 'node:test';
import assert from 'node:assert/strict';
import {navigationSectionMode} from './navigation-section.js';
test('singleton and small groups never require disclosure',()=>{assert.equal(navigationSectionMode(1,false,false,true),'direct');assert.equal(navigationSectionMode(3,false,false,true),'heading');assert.equal(navigationSectionMode(8,true,false,true),'direct');});
test('larger groups default open and active destinations remain visible',()=>{assert.equal(navigationSectionMode(5,false,false),'open');assert.equal(navigationSectionMode(5,false,false,true),'closed');assert.equal(navigationSectionMode(5,false,true,true),'open');});
