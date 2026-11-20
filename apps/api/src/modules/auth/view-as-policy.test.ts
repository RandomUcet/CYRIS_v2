import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {isPreviewReadAllowed as allow} from './view-as-policy.js';
test('preview allows event-scoped known reads only',()=>{
  assert.equal(allow('GET','/events/:eventId/tasks/my-work','e1','e1'),true);
  assert.equal(allow('GET','/events/:eventId/tasks/my-work','e2','e1'),false);
  assert.equal(allow('PATCH','/events/:eventId/tasks/:taskId','e1','e1'),false);
  assert.equal(allow('GET','/events/:eventId/documents/:documentId/download','e1','e1'),false);
  assert.equal(allow('GET','/admin/settings',undefined,'e1'),false);
  assert.equal(allow('GET','/auth/me',undefined,'e1'),true);
  assert.equal(allow('GET','/events/:eventId/tasks/unknown','e1','e1'),false);
});
