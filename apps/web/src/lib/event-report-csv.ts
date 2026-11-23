import type { EventAfterActionReport } from '@cyris/contracts';

/**
 * Produce an offline-friendly, aggregate-only CSV snapshot of an exercise.
 * No patient records, participant identities or evidence bodies are included.
 *
 * Spreadsheet applications can interpret values starting with = + - @ as
 * formulas, even after whitespace. Normalize control characters, neutralize
 * these prefixes, then quote every CSV cell (including metadata and labels).
 */
export function reportCsvCell(value: string | number): string {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) {
    throw new Error('Report CSV requires nonnegative safe integer counts');
  }
  const cleaned = String(value).replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ');
  const safe = /^\s*[=+\-@]/u.test(cleaned) ? "'" + cleaned : cleaned;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export function buildEventReportSummaryCsv(report: EventAfterActionReport): string {
  const rows: (string | number)[][] = [
    ['section', 'field', 'value'],
    ['event', 'event_id', report.eventId],
    ['event', 'event_name', report.eventName],
    ['event', 'status', report.status],
    ['event', 'snapshot_generated_at_utc', report.generatedAt],
    ['event', 'starts_at_utc', report.startsAt ?? ''],
    ['event', 'ends_at_utc', report.endsAt ?? ''],
    ['overview', 'memberships', report.membershipCount],
    ['overview', 'operational_events', report.operationalEvents],
    ['overview', 'audit_events', report.auditEvents],
    ['overview', 'active_audit_operators', report.activeAuditOperators],
    ['overview', 'denied_operations', report.auditOutcomes.DENIED ?? 0],
    ['overview', 'failed_operations', report.auditOutcomes.FAILURE ?? 0],
  ];
  const sections: [string, Record<string, number>][] = [
    ['resources', report.resources],
    ['court_status', report.courtStatus],
    ['legal_requests', report.legalRequests],
    ['medical_status', report.medicalStatus],
    ['task_status', report.taskStatus],
    ['support_status', report.supportStatus],
    ['audit_categories', report.auditCategories],
    ['audit_outcomes', report.auditOutcomes],
  ];
  for (const [section, counts] of sections) {
    for (const [key, count] of Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))) {
      rows.push([section, key, count]);
    }
  }
  // BOM helps Czech diacritics load correctly in spreadsheet applications.
  return '\uFEFF' + rows.map(row => row.map(reportCsvCell).join(',')).join('\r\n') + '\r\n';
}
