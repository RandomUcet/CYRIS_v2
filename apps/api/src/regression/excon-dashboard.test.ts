import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { statusCounter } from '../modules/command/excon-dashboard.service.js';

test('EXCON grouped counters have zero defaults and ignore other statuses',()=>{
  const rows=[{status:'READY',n:4},{status:'BLOCKED',n:2},{status:'CANCELLED',n:10}];
  assert.equal(statusCounter(rows,'READY'),4);
  assert.equal(statusCounter(rows,'BLOCKED'),2);
  assert.equal(statusCounter(rows,'SCHEDULED'),0);
  assert.equal(statusCounter([], 'READY'),0);
});
test('EXCON dashboard route is protected and organizer-only across backend and frontend',()=>{
  const controller=readFileSync(new URL('../modules/command/excon-dashboard.controller.ts',import.meta.url),'utf8');
  const service=readFileSync(new URL('../modules/command/excon-dashboard.service.ts',import.meta.url),'utf8');
  const screen=readFileSync(new URL('../../../web/src/app/events/[eventId]/excon/page.tsx',import.meta.url),'utf8');
  const nav=readFileSync(new URL('../../../web/src/components/layout/SideNav.tsx',import.meta.url),'utf8');
  assert.match(controller,/@UseGuards\(AuthGuard\)/);
  assert.match(controller,/@Param\('eventId',ParseUUIDPipe\)/);
  assert.match(service,/Permissions.SCENARIO_MANAGE/);
  assert.match(service,/eq\(notifications.eventId,eventId\)/);
  assert.match(service,/eq\(exerciseBroadcastPlans.eventId,eventId\)/);
  assert.match(service,/eq\(scenarioInjects.eventId,eventId\)/);
  assert.match(screen,/!viewAs && hasPermission\('scenario.manage',eventId\)/);
  assert.match(screen,/getExconDashboard/);
  assert.match(nav,/!viewAs && selectedEventId && hasPermission\('scenario.manage', selectedEventId\)/);
  assert.doesNotMatch(screen,/dangerouslySetInnerHTML/);
});
