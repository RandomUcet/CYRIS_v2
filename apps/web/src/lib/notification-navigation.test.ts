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

import type { NotificationItem } from '@cyris/contracts';
import { notificationDetail, selectNotificationItems } from './notification-navigation.js';

function notice(id:string, severity:NotificationItem['severity'], readAt:string|null,
  title:string, description:string, templateKey='exercise.broadcast'):NotificationItem {
  return {
    id, userId:'user', eventId:'event', type:'EXERCISE_INFO', severity,
    templateKey, templateParams:{title,description}, createdAt:'2026-11-23T14:00:00Z',
    readAt, dismissedAt:null, actionUrl:'/events/event/overview',
  };
}

test('EXCON notifications show the instruction body, not a duplicate title',()=>{
  const broadcast=notice('1','URGENT',null,'Evakuace','Přejděte na shromaždiště.');
  assert.equal(notificationDetail(broadcast),'Přejděte na shromaždiště.');
  assert.equal(notificationDetail(notice('2','INFO',null,'Zásah','Zdravotníci vyjíždějí','task.assigned')),'Zásah');
  assert.equal(notificationDetail({...broadcast,templateParams:{title:'Bez textu'}}),'');
  assert.equal(notificationDetail({...broadcast,templateParams:{description:{unsafe:true}}}),'');
});

test('inbox filters respect read state and urgency without changing the source',()=>{
  const items=[
    notice('1','INFO',null,'Denní přehled','Vše beze změn'),
    notice('2','ACTION',null,'Instrukce','Kontaktujte EXCON'),
    notice('3','URGENT','2026-11-23T14:01:00Z','Výstraha','Izolujte systém'),
    notice('4','URGENT',null,'Poplach','Proveďte kontrolu'),
  ];
  const title=(n:NotificationItem)=>String(n.templateParams.title);
  assert.deepEqual(selectNotificationItems(items,'UNREAD','',title).map(x=>x.id),['1','2','4']);
  assert.deepEqual(selectNotificationItems(items,'ATTENTION','',title).map(x=>x.id),['2','3','4']);
  assert.deepEqual(selectNotificationItems(items,'ALL','iZoLujTE',title).map(x=>x.id),['3']);
  assert.deepEqual(selectNotificationItems(items,'ALL','  výSTRAHA ',title).map(x=>x.id),['3']);
  assert.deepEqual(selectNotificationItems(items,'ALL','nothing',title),[]);
  assert.equal(items.length,4);
});
