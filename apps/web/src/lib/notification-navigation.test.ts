import {test} from 'node:test';
import assert from 'node:assert/strict';
import {safeNotificationHref} from './notification-navigation.js';
test('notification links are local app paths, never executable or external',()=>{
  assert.equal(safeNotificationHref('/events/example/tasks'),' /events/example/tasks'.trim());
  assert.equal(safeNotificationHref('/admin/health'),'/admin/health');
  for(const unsafe of [null,undefined,'','https://attacker.invalid','javascript:alert(1)','//attacker.invalid',
    '/\\attacker.invalid','\n/events/example','/events/\nfoo']){
    assert.equal(safeNotificationHref(unsafe),null,String(unsafe));
  }
});
