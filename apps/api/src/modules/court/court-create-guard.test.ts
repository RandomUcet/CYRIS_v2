import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('court case creation is permission guarded before any allocation or mutation',()=>{
  const path=new URL('./court.controller.ts',import.meta.url);
  const source=readFileSync(path,'utf8');
  assert.match(source,/@Post\(\)\s*@UseGuards\(PermissionsGuard\)\s*@RequirePermission\(Permissions\.COURT_CREATE, PermissionScopes\.EVENT\)\s*async createCase/);
});
