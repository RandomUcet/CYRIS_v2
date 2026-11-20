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

test('preview forbids all mutation verbs, unknown routes and out-of-event services',()=>{
  for(const method of ['POST','PATCH','PUT','DELETE','HEAD'])assert.equal(allow(method,'/events/:eventId/support','e','e'),false);
  assert.equal(allow('GET','/events/:eventId/support','e','other'),false);
  assert.equal(allow('GET','/events/:eventId/support','e','e'),true);
  assert.equal(allow('GET','/search',undefined,'e'),false);
  assert.equal(allow('GET','/notifications',undefined,'e'),false);
});
