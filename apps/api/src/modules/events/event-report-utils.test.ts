import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeActivityDays, previewResourceSelection } from './event-report-utils.js';
import { EventAfterActionReportSchema } from '@cyris/contracts';

test('after-action UTC totals are sorted, aggregate duplicate day rows and never expose content',()=>{
  const daily=mergeActivityDays([
    {day:'2026-11-22',auditEvents:3,denied:1,failures:0},
    {day:'2026-11-20',auditEvents:1,denied:0,failures:1},
    {day:'2026-11-22',auditEvents:2,denied:0,failures:1},
  ],[
    {day:'2026-11-21',operationalEvents:4},
    {day:'2026-11-22',operationalEvents:6},
  ]);
  assert.deepEqual(daily,[
    {day:'2026-11-20',auditEvents:1,operationalEvents:0,denied:0,failures:1},
    {day:'2026-11-21',auditEvents:0,operationalEvents:4,denied:0,failures:0},
    {day:'2026-11-22',auditEvents:5,operationalEvents:6,denied:1,failures:1},
  ]);
  assert.throws(()=>mergeActivityDays([{day:'invalid',auditEvents:1,denied:0,failures:0}],[]),/UTC/);
  assert.deepEqual(mergeActivityDays([],[]),[]);
});

test('non-destructive purge preview reports only direct resource counts and rejects unknown types',()=>{
  const counts={device:5,person:4,evidence:2};
  assert.deepEqual(previewResourceSelection(counts,['evidence','device','device']),{
    resourceTypes:['device','evidence'],matchingResources:7,unselectedResources:4,
    directlyCounted:{device:5,evidence:2},
  });
  const all=previewResourceSelection(counts,undefined);
  assert.equal(all.matchingResources,11);
  assert.equal(all.unselectedResources,0);
  assert.throws(()=>previewResourceSelection(counts,['other']),/Invalid/);
  assert.throws(()=>previewResourceSelection(counts,Array(2001).fill('device')),/safety cap|Invalid/);
});

test('UTC date validation accepts ISO days but rejects backslash escape strings',()=>{
  const value={ day:'2026-11-22',auditEvents:1,operationalEvents:0,denied:0,failures:0 };
  const schema=EventAfterActionReportSchema.shape.dailyActivity;
  assert.equal(schema.safeParse([value]).success,true);
  assert.equal(schema.safeParse([{...value,day:'\\\\d{4}-11-22'}]).success,false);
  assert.equal(schema.safeParse([{...value,day:'2026/11/22'}]).success,false);
});
