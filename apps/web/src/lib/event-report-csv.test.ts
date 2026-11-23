import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { EventAfterActionReport } from '@cyris/contracts';
import { buildEventReportSummaryCsv, reportCsvCell } from './event-report-csv.js';

function fixture(): EventAfterActionReport {
  return {
    eventId: '00000000-0000-4000-8000-000000000014',
    eventName: 'CyberTron, 2026', status: 'CLOSED',
    generatedAt: '2026-11-23T19:00:00.000Z',
    startsAt: '2026-11-01T09:00:00.000Z', endsAt: null,
    membershipCount: 16, operationalEvents: 25, auditEvents: 35, activeAuditOperators: 4,
    resources: { evidence: 3, device: 10 },
    courtStatus: { OPEN: 1 }, medicalStatus: { CLOSED: 2 },
    legalRequests: { PENDING: 5 }, taskStatus: { DONE: 8 },
    supportStatus: { RESOLVED: 6 }, auditCategories: { authorization: 7 },
    auditOutcomes: { DENIED: 2, FAILURE: 1 },
    dailyActivity: [{ day: '2026-11-23', auditEvents: 35, operationalEvents: 25, denied: 2, failures: 1 }],
  };
}

test('after-action CSV exports a UTF-8 BOM, stable columns and aggregate-only values', () => {
  const csv = buildEventReportSummaryCsv(fixture());
  assert.ok(csv.startsWith('\uFEFF"section","field","value"\r\n'));
  for (const entry of [
    '"event","event_name","CyberTron, 2026"',
    '"event","snapshot_generated_at_utc","2026-11-23T19:00:00.000Z"',
    '"overview","memberships","16"',
    '"overview","denied_operations","2"',
    '"resources","device","10"',
    '"court_status","OPEN","1"',
    '"legal_requests","PENDING","5"',
    '"medical_status","CLOSED","2"',
    '"task_status","DONE","8"',
    '"support_status","RESOLVED","6"',
    '"audit_categories","authorization","7"',
    '"audit_outcomes","FAILURE","1"',
  ]) assert.ok(csv.includes(entry), 'Missing ' + entry);
  assert.ok(!csv.includes('dailyActivity'), 'Timeline is exported separately');
  assert.ok(csv.endsWith('\r\n'));
});

test('spreadsheet formula injection is neutralized in untrusted event names and labels', () => {
  assert.equal(reportCsvCell('=HYPERLINK("https://example.test")'),
    '"\'=HYPERLINK(""https://example.test"")"');
  assert.equal(reportCsvCell('\t+cmd|calc'), '"\' +cmd|calc"');
  assert.equal(reportCsvCell('quoted "value", with comma'), '"quoted ""value"", with comma"');
  const csv = buildEventReportSummaryCsv({
    ...fixture(), eventName: '=1+1', resources: { '@SUM(A1)': 4 },
  });
  assert.ok(csv.includes('"event","event_name","\'=1+1"'));
  assert.ok(csv.includes('"resources","\'@SUM(A1)","4"'));
  assert.ok(!csv.includes('\t'));
  assert.ok(!csv.includes('\n='));
});

test('bad numeric totals are rejected rather than exported as misleading spreadsheet cells', () => {
  assert.throws(() => reportCsvCell(-1), /nonnegative/);
  assert.throws(() => reportCsvCell(Number.POSITIVE_INFINITY), /safe integer/);
  assert.throws(() => reportCsvCell(1.5), /safe integer/);
});

test('empty category inventories and missing audit outcomes still produce valid snapshots', () => {
  const csv = buildEventReportSummaryCsv({
    ...fixture(), resources: {}, auditCategories: {}, auditOutcomes: {},
  });
  assert.ok(csv.includes('"overview","denied_operations","0"'));
  assert.ok(csv.includes('"overview","failed_operations","0"'));
  assert.ok(!csv.includes('"resources","device"'));
});
