import {test} from 'node:test';import assert from 'node:assert/strict';
import {testAccountUsable} from './session.service.js';
import {CreateLocalTestAccountSchema} from '@cyris/contracts';
test('local test account expiry is enforced at the exact boundary',()=>{assert.equal(testAccountUsable(null,1000),true);assert.equal(testAccountUsable(new Date(1001),1000),true);assert.equal(testAccountUsable(new Date(1000),1000),false);});
test('test account payload cannot specify platform roles, password or email',()=>{const base={displayName:'Tester',roleId:'12345678-1234-4123-8123-123456789abc',unitId:'12345678-1234-4123-8123-123456789abd',validHours:24};assert.ok(CreateLocalTestAccountSchema.safeParse(base).success);for(const bad of [{...base,validHours:169},{...base,password:'secret'},{...base,email:'admin@example.test'},{...base,platformAdmin:true}])assert.ok(!CreateLocalTestAccountSchema.safeParse(bad).success);});
