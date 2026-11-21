import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rolePermissionKeys,roleScopes} from './role-catalog.js';
test('empty roles are explicitly unprivileged, not mislabelled Standard',()=>{
  assert.deepEqual(roleScopes([]),[]);
  assert.deepEqual(rolePermissionKeys([]),[]);
});
test('roles show real scopes and deduplicate permissions',()=>{
  const r=[
    {permissionKey:'case.read',scope:'UNIT' as const},
    {permissionKey:'case.read',scope:'EVENT' as const},
    {permissionKey:'task.work',scope:'ASSIGNED' as const},
  ];
  assert.deepEqual(roleScopes(r),['EVENT','UNIT','ASSIGNED']);
  assert.deepEqual(rolePermissionKeys(r),['case.read','task.work']);
});
