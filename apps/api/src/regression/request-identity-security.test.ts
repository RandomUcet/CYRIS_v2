import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { ForbiddenException } from '@nestjs/common';
import { sanitizeRequestId } from '../request-identity.js';
import { PermissionsGuard } from '../modules/authorization/guards/permissions.guard.js';
import { Permissions } from '@cyris/shared';
import { readFileSync } from 'node:fs';

test('Fastify cannot bypass sanitized request IDs through the X-Request-ID header', async () => {
  const api = Fastify({
    requestIdHeader: false,
    genReqId: (req) => sanitizeRequestId(req.headers['x-request-id']),
  });
  try {
    api.get('/id', async (request, reply) => {
      reply.header('X-Request-ID', request.id);
      return {id:request.id};
    });
    const valid = await api.inject({method:'GET',url:'/id',headers:{'x-request-id':'VALID_TRACE_12345'}});
    assert.equal(valid.statusCode,200);
    assert.equal(valid.json().id,'VALID_TRACE_12345');
    assert.equal(valid.headers['x-request-id'],'VALID_TRACE_12345');

    const hostile = await api.inject({method:'GET',url:'/id',headers:{
      'x-request-id':'<script>spoof-audit-id</script>',
      'x-forwarded-for':'203.0.113.77',
    }});
    assert.equal(hostile.statusCode,200);
    assert.match(hostile.json().id,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    assert.equal(hostile.headers['x-request-id'],hostile.json().id);
    assert.notEqual(hostile.json().id,'<script>spoof-audit-id</script>');
  } finally {
    await api.close();
  }
});

test('request identity accepts only modest, allowlisted caller correlation hints', () => {
  for(const bad of [undefined,'','x','a'.repeat(65),'evil\r\naudit','<script>alert(1)</script>',[],['VALID_TRACE_12345'],{}]) {
    assert.match(sanitizeRequestId(bad),/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  }
  assert.equal(sanitizeRequestId(' GOOD_CORRELATION_ID '),'GOOD_CORRELATION_ID');
});

test('event administration controllers use validated request IDs for audit', () => {
  const paths = [
    '../modules/events/units.controller.ts',
    '../modules/events/roles.controller.ts',
    '../modules/events/events.controller.ts',
    '../modules/events/memberships.controller.ts',
  ];
  for (const path of paths) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /req\.headers\['x-request-id'\]/,
      `Controller ${path} must not read raw request correlation headers`);
    assert.match(source, /const requestId = req\.id;/);
  }
});

test('denied-permission audit never trusts caller X-Forwarded-For or X-Request-ID', async () => {
  const records: Array<{ipAddress:string;requestId:string}> = [];
  const guard = new PermissionsGuard(
    {getAllAndOverride: () => ({permission:Permissions.MEDICAL_READ,scope:'EVENT'})} as never,
    {authorize:async()=>false} as never,
    {record:async (entry:{ipAddress:string;requestId:string}) => {records.push(entry);}} as never
  );
  const req = {
    user:{id:'sample-user',status:'ACTIVE'},
    params:{eventId:'sample-event'},
    headers:{'x-forwarded-for':'203.0.113.99','x-request-id':'spoofedRequestId'},
    ip:'172.18.0.6',
    id:'VALID_TRACE_12345',
  };
  const ctx = {getClass:()=>Object,getHandler:()=>Object,switchToHttp:()=>({getRequest:()=>req})};
  await assert.rejects(guard.canActivate(ctx as never),ForbiddenException);
  assert.equal(records.length,1);
  assert.equal(records[0]?.ipAddress,'172.18.0.6');
  assert.equal(records[0]?.requestId,'VALID_TRACE_12345');
  const source=readFileSync(new URL('../modules/auth/auth.controller.ts',import.meta.url),'utf8');
  assert.equal((source.match(/const requestId = req\.id \|\| null;/g)??[]).length,2);
  const entry=readFileSync(new URL('../main.ts',import.meta.url),'utf8');
  assert.match(entry,/requestIdHeader: false/);
  assert.doesNotMatch(entry,/requestIdHeader: 'x-request-id'/);
});
