import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MedicalService } from './medical.service.js';
import { MedicalController } from './medical.controller.js';

const user = { id: 'staff-user', status: 'ACTIVE' } as never;
const denyAuth = {
  authorize: async () => false,
  hasEventCapability: async () => false,
};

function medicalService(authorization: object) {
  return new MedicalService(
    {} as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, {} as never, authorization as never,
  );
}

test('medical creation refuses signed-in users without medical.create before touching a database', async () => {
  const service = medicalService(denyAuth);
  await assert.rejects(
    service.createEncounter('event-a', { triageCategory: 'UNKNOWN', visibility: 'UNIT' } as never, user),
    ForbiddenException,
  );
});

test('medical operational summary refuses users without command.read or medical.read', async () => {
  const service = medicalService(denyAuth);
  await assert.rejects(service.getOperationalSummary('event-a', user), ForbiddenException);
});

test('all medical record routes reject an event/record mismatch before calling domain methods', async () => {
  const calls: string[] = [];
  const fake = {
    assertEncounterInEvent: async (eventId: string, encounterId: string) => {
      calls.push('scope');
      assert.equal(eventId, 'event-a');
      assert.equal(encounterId, 'encounter-b');
      throw new NotFoundException();
    },
    getEncounterDetail: () => { calls.push('read'); },
    updateEncounter: () => { calls.push('update'); },
    triageEncounter: () => { calls.push('triage'); },
    addObservation: () => { calls.push('observe'); },
    addIntervention: () => { calls.push('intervene'); },
    stabilizeEncounter: () => { calls.push('stabilize'); },
    receiveTransferredEncounter: () => { calls.push('receive'); },
    transferEncounter: () => { calls.push('transfer'); },
    closeEncounter: () => { calls.push('close'); },
  };
  const controller = new MedicalController(fake as never);
  const routes = [
    () => controller.getEncounter('event-a', 'encounter-b', user),
    () => controller.updateEncounter('event-a', 'encounter-b', { chiefComplaint: 'Test' }, user),
    () => controller.triageEncounter('event-a', 'encounter-b', { triageCategory: 'MINOR' }, user),
    () => controller.addObservation('event-a', 'encounter-b', { observationType: 'OTHER', value: 'test' }, user),
    () => controller.addIntervention('event-a', 'encounter-b', { interventionType: 'test', description: 'Test' }, user),
    () => controller.stabilizeEncounter('event-a', 'encounter-b', user),
    () => controller.receiveTransferredEncounter('event-a', 'encounter-b', user),
    () => controller.transferEncounter('event-a', 'encounter-b', { targetLocationId: '00000000-0000-4000-8000-000000000001', disposition: 'Test' }, user),
    () => controller.closeEncounter('event-a', 'encounter-b', { status: 'CLOSED', disposition: 'Test' }, user),
  ];
  for (const route of routes) await assert.rejects(route(), NotFoundException);
  assert.deepEqual(calls, Array(routes.length).fill('scope'));
});
