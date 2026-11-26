import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=p=>readFileSync(join(root,p),'utf8');
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);}
test('2.5.2 release keeps full retention internal and exposes read-only review only',()=>{
  const controller=read('apps/api/src/modules/events/event-after-action.controller.ts');
  assert.match(controller,/@Get\('retention-plan'\)/);
  assert.match(controller,/@Get\('purge-preview'\)/);
  assert.doesNotMatch(controller,/@(?:Post|Put|Patch|Delete)\(/);
  assert.match(controller,/RequirePermission\(Permissions\.PLATFORM_MANAGE, PermissionScopes\.PLATFORM\)/);
  const cli=read('deploy/cyrisctl');
  assert.match(cli,/CLEANUP_SCOPES = \("read-notifications", "terminal-tasks"\)/);
  for(const path of walk(join(root,'apps/api/src/modules')).filter(p=>p.endsWith('.ts')&&!p.endsWith('.test.ts'))){
    assert.doesNotMatch(readFileSync(path,'utf8'),/retention-(?:approved-plan|relational-execution|finish|object-recovery)/,path);
  }
  const page=read('apps/web/src/app/admin/events/[eventId]/data/page.tsx');
  assert.match(page,/Full execution is still blocked/);
  assert.match(page,/This is not deletion authorization/);
});
