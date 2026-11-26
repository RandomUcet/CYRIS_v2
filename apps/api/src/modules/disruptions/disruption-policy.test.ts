import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { CreateDisruptionRequestSchema, ParticipantDisruptionStatusSchema, serviceModuleLabels } from '@cyris/contracts';
import { assertServiceOperation, assertSupportedDisruption, resolveModuleImpacts } from './disruption-policy.js';
import { serviceRouteChecks } from './service-routes.js';

describe('service availability policy', () => {
  it('uses the same allowlist for configuration and primary endpoints', () => {
    for (const module of Object.keys(serviceModuleLabels)) {
      const path = module === 'command' ? 'command/operational-picture' : module;
      assert.deepEqual(serviceRouteChecks('/events/:eventId/' + path, 'GET'), [{ module, operation: 'read' }]);
      assert.doesNotThrow(() => assertSupportedDisruption(module, 'READ_ONLY'));
      assert.equal(CreateDisruptionRequestSchema.safeParse({ targetType: 'EVENT', mode: 'UNAVAILABLE', reason: 'For review', module }).success, true);
    }
    for (const module of ['support', 'readiness', 'disruptions', 'service-status', 'constructor', '__proto__']) {
      assert.throws(() => assertSupportedDisruption(module, 'UNAVAILABLE'));
    }
    assert.throws(() => assertSupportedDisruption('tasks', 'DEGRADED'));
  });

  it('preserves the strongest current impact per module and ignores legacy advisory modes', () => {
    const entries = [
      { module: 'lab', mode: 'READ_ONLY' }, { module: 'tasks', mode: 'READ_ONLY' },
      { module: 'lab', mode: 'UNAVAILABLE' }, { module: 'registry', mode: 'DEGRADED' },
      { module: 'support', mode: 'UNAVAILABLE' },
    ];
    for (const rows of [entries, [...entries].reverse()]) {
      const impacts = resolveModuleImpacts(rows);
      assert.equal(impacts.size, 2);
      assert.equal(impacts.get('lab'), 'UNAVAILABLE');
      assert.equal(impacts.get('tasks'), 'READ_ONLY');
    }
    assert.doesNotThrow(() => assertServiceOperation('READ_ONLY', 'read'));
    assert.doesNotThrow(() => assertServiceOperation(undefined, 'write'));
    assert.throws(() => assertServiceOperation('READ_ONLY', 'write'), ForbiddenException);
    for (const operation of ['read', 'write'] as const) {
      assert.throws(() => assertServiceOperation('UNAVAILABLE', operation), ServiceUnavailableException);
    }
  });

  it('classifies secondary routes independently of raw HTTP input and preserves recovery/readiness access', () => {
    const prefix = '/events/:eventId/';
    for (const [path, module] of [
      ['resources/:sourceResourceId/relationships', 'relationships'], ['activity', 'timeline'],
      ['indicators', 'forensics'], ['legal-requests','court'], ['registry/:resourceId/primary-media', 'registry'],
    ]) {
      assert.deepEqual(serviceRouteChecks(prefix + path, 'POST'), [{ module, operation: 'write' }]);
    }
    assert.deepEqual(serviceRouteChecks('/resources/:resourceId/relationships', 'GET'), [{ module: 'relationships', operation: 'read' }]);
    assert.deepEqual(serviceRouteChecks('/resources/:resourceId/timeline', 'GET'), [{ module: 'timeline', operation: 'read' }]);
    assert.deepEqual(serviceRouteChecks('/cases/:caseId/timeline', 'HEAD'), [{ module: 'cases', operation: 'read' }, { module: 'timeline', operation: 'read' }]);
    assert.deepEqual(serviceRouteChecks(prefix + 'command/sitrep', 'POST'), [{ module: 'command', operation: 'write' }, { module: 'documents', operation: 'write' }]);
    assert.deepEqual(serviceRouteChecks(prefix + 'support/assist', 'POST'), [{ module: 'intelligence', operation: 'write' }]);
    assert.deepEqual(serviceRouteChecks(prefix + 'scenario-data/generate', 'POST'), [{ module: 'scenario', operation: 'write' }, { module: 'registry', operation: 'write' }]);
    for (const route of [
      '/auth/login', '/auth/view-as', '/health/ready', '/admin/settings/identity',
      ...['support', 'workspace', 'service-status', 'disruptions', 'disruptions/:id/restore', 'command/readiness',
        'command/defcon', 'command/team-displays', 'tasks/my-work'].map(path => prefix + path),
    ]) assert.deepEqual(serviceRouteChecks(route, 'POST'), []);
  });

  it('validates administrative target/windows and strips private properties from the legacy status DTO', () => {
    for (const invalid of [
      { targetType: 'UNIT' },
      { targetType: 'EVENT', targetId: '00000000-0000-4000-8000-000000000001' },
      { targetType: 'EVENT', startsAt: '2026-01-01T12:00:00Z', expiresAt: '2026-01-01T11:00:00Z' },
    ]) assert.equal(CreateDisruptionRequestSchema.safeParse({ module: 'tasks', mode: 'READ_ONLY', reason: 'For review', ...invalid }).success, false);
    const publicStatus = { eventId: '00000000-0000-4000-8000-000000000001', module: 'tasks', mode: 'READ_ONLY', active: true };
    assert.deepEqual(ParticipantDisruptionStatusSchema.parse({ ...publicStatus, revision: 3, reason: 'private', targetType: 'USER' }), publicStatus);
  });
});
