import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertApprovalHasReport, assertLinkedDisruptionActive, assertNoDuplicateReport, assertObjectiveTransition, assertPublishedAudienceAccess, assertReportAllowed } from './recovery-policy.js';

describe('recovery objective policy', () => {
  it('requires explicit publish, review and restore transitions', () => {
    assert.doesNotThrow(() => assertObjectiveTransition('DRAFT', 'PUBLISHED'));
    assert.doesNotThrow(() => assertObjectiveTransition('PUBLISHED', 'APPROVED'));
    assert.doesNotThrow(() => assertObjectiveTransition('APPROVED', 'RESTORED'));
    assert.throws(() => assertObjectiveTransition('DRAFT', 'APPROVED'));
    assert.throws(() => assertObjectiveTransition('PUBLISHED', 'RESTORED'));
  });

  it('does not restore automatically when a report is submitted', () => {
    assert.doesNotThrow(() => assertReportAllowed('PUBLISHED', true));
    assert.throws(() => assertReportAllowed('APPROVED', true));
    assert.throws(() => assertReportAllowed('PUBLISHED', false));
  });

  it('requires a report before approval', () => {
    assert.doesNotThrow(() => assertApprovalHasReport(true));
    assert.throws(() => assertApprovalHasReport(false));
  });

  it('guards publication, audience scope, duplicate reports and linked disruption state', () => {
    assert.doesNotThrow(() => assertPublishedAudienceAccess(true, true));
    assert.throws(() => assertPublishedAudienceAccess(false, true));
    assert.throws(() => assertPublishedAudienceAccess(true, false));
    assert.doesNotThrow(() => assertNoDuplicateReport(false));
    assert.throws(() => assertNoDuplicateReport(true));
    assert.doesNotThrow(() => assertLinkedDisruptionActive(true));
    assert.throws(() => assertLinkedDisruptionActive(false));
  });
});
