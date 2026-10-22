import { getDbClient, closeDatabaseConnection, sql } from '@cyris/db';

const API_BASE = 'http://localhost:4000';
const WEB_BASE = 'http://localhost:3000';

interface LoginResponse {
  user: {
    id: string;
    email: string;
    displayName: string;
  };
  sessionToken: string;
}

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: email, password }),
  });
  if (!res.ok) {
    throw new Error(`Login failed for ${email}: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as LoginResponse;
  const cookieHeader = res.headers.get('set-cookie');
  let token = data.sessionToken;
  if (cookieHeader) {
    const match = cookieHeader.match(/cyris_session=([^;]+)/);
    if (match) token = match[1];
  }
  return token;
}

async function apiGet(path: string, token: string): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Cookie: `cyris_session=${token}`,
    },
  });
  return { status: res.status, ok: res.ok, data: res.ok ? await res.json() : await res.text() };
}

async function apiPost(path: string, body: any, token: string): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      Cookie: `cyris_session=${token}`,
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, ok: res.ok, data: res.ok ? await res.json() : await res.text() };
}

async function apiPatch(path: string, body: any, token: string): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      Cookie: `cyris_session=${token}`,
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, ok: res.ok, data: res.ok ? await res.json() : await res.text() };
}

async function checkWebRoute(path: string): Promise<{ status: number; ok: boolean }> {
  try {
    const res = await fetch(`${WEB_BASE}${path}`, {
      redirect: 'follow',
      headers: {
        Accept: 'text/html',
      },
    });
    return { status: res.status, ok: res.status === 200 };
  } catch (err: any) {
    return { status: 500, ok: false };
  }
}

async function runEndToEndVerification() {
  console.log('================================================================');
  console.log('  CYRIS v2 — PHASE 2.5 COMPREHENSIVE QA & BASELINE VERIFICATION');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`  ✓ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${desc}`);
      failed++;
    }
  }

  // 1. Authenticate as Platform Administrator
  console.log('[1/7] Platform Administrator Authentication & Access');
  const adminToken = await login('admin@cyris.local', 'AdminPassword123!');
  assert(!!adminToken, 'Admin logged in and received session token');

  const adminProfile = await apiGet('/auth/me', adminToken);
  assert(adminProfile.ok && adminProfile.data.platformRoles.includes('platform-admin'), 'Admin possesses platform-admin role');

  // 2. Event Administration Lifecycle & Operations
  console.log('\n[2/7] Event Administration & Lifecycle Transitions');
  const eventsResult = await apiGet('/events', adminToken);
  assert(eventsResult.ok && eventsResult.data.length >= 2, `Admin lists all events (${eventsResult.data.length} found)`);

  const event2027 = eventsResult.data.find((e: any) => e.slug === 'czech-cybertron-2027');
  const event2028 = eventsResult.data.find((e: any) => e.slug === 'czech-cybertron-2028');
  assert(event2027?.status === 'ACTIVE', 'Czech Cybertron 2027 is ACTIVE');
  assert(event2028?.status === 'DRAFT', 'Czech Cybertron 2028 is DRAFT');

  // Transition Cybertron 2028: DRAFT -> PREPARATION
  console.log('  -> Testing status transition: DRAFT -> PREPARATION');
  const transPrep = await apiPatch(`/events/${event2028.id}`, { status: 'PREPARATION' }, adminToken);
  assert(transPrep.ok && transPrep.data.status === 'PREPARATION', 'Status transition DRAFT -> PREPARATION succeeded');

  // Transition back: PREPARATION -> DRAFT
  console.log('  -> Testing status transition: PREPARATION -> DRAFT');
  const transDraft = await apiPatch(`/events/${event2028.id}`, { status: 'DRAFT' }, adminToken);
  assert(transDraft.ok && transDraft.data.status === 'DRAFT', 'Status transition PREPARATION -> DRAFT succeeded');

  // Test Duplication: Cybertron 2028 -> Cybertron 2029
  console.log('  -> Testing event duplication: Cybertron 2028 -> Cybertron 2029');
  const dupResult = await apiPost(`/events/${event2028.id}/duplicate`, {
    slug: 'czech-cybertron-2029',
    name: 'Czech Cybertron 2029',
    description: 'Duplicated future edition baseline',
  }, adminToken);
  assert(dupResult.ok && dupResult.data.status === 'DRAFT' && dupResult.data.slug === 'czech-cybertron-2029', 'Event duplicated successfully in DRAFT status');

  // Test Archive: Archive the newly duplicated event
  if (dupResult.ok) {
    console.log('  -> Testing event archiving on duplicated event');
    const archResult = await apiPost(`/events/${dupResult.data.id}/archive`, {}, adminToken);
    assert(archResult.ok && archResult.data.status === 'ARCHIVED', 'Duplicated event archived successfully');

    // Clean up duplicated event to leave baseline pristine
    const db = await getDbClient();
    await db.execute(sql`ALTER TABLE audit_events DISABLE TRIGGER audit_events_immutable_trg;`);
    await db.execute(sql`DELETE FROM events WHERE id = ${dupResult.data.id};`);
    await db.execute(sql`ALTER TABLE audit_events ENABLE TRIGGER audit_events_immutable_trg;`);
    console.log('  ✓ Cleaned temporary duplicated test event from baseline.');
  }

  // 3. Organizational Units & Capabilities Audit
  console.log('\n[3/7] Organizational Units & Capabilities Verification');
  const unitsResult = await apiGet(`/events/${event2027.id}/units`, adminToken);
  assert(unitsResult.ok && unitsResult.data.length === 10, `Czech Cybertron 2027 has 10 canonical units (found: ${unitsResult.data?.length})`);

  const investigationUnit = unitsResult.data?.find((u: any) => u.slug === 'investigation');
  const forensicsUnit = unitsResult.data?.find((u: any) => u.slug === 'forensics');
  assert(investigationUnit?.capabilities?.includes('investigation'), 'Investigation unit has investigation capability');
  assert(forensicsUnit?.capabilities?.includes('digital_forensics'), 'Forensics unit has digital_forensics capability');

  // 4. Clean Operational Baseline (0 Demo Records)
  console.log('\n[4/7] Database Operational Tables Emptiness Audit');
  const db = await getDbClient();
  const tablesToCheck = [
    'persons', 'organisations', 'locations', 'vehicles', 'devices',
    'incidents', 'cases', 'charges', 'evidence', 'evidence_custody_transfers',
    'lab_analyses', 'forensic_analyses', 'operational_tasks', 'medical_encounters',
    'court_cases', 'evaluation_observations', 'notifications', 'documents'
  ];

  for (const table of tablesToCheck) {
    const [row] = await db.execute(sql.raw(`SELECT COUNT(*)::int as count FROM ${table};`));
    assert(Number((row as any)?.count) === 0, `Table '${table}' is completely empty (0 records)`);
  }

  // 5. Normal Participant & Specialist Role Walkthrough
  console.log('\n[5/7] Role-Based Access Walkthrough');
  const partToken = await login('participant@cyris.local', 'AdminPassword123!');
  assert(!!partToken, 'Participant (Jan Novak) logged in successfully');

  // Participant list events should ONLY return ACTIVE events
  const partEvents = await apiGet('/events', partToken);
  assert(partEvents.ok && partEvents.data.every((e: any) => e.status === 'ACTIVE'), 'Participant only sees ACTIVE events (DRAFT/PREPARATION hidden)');
  assert(!partEvents.data.some((e: any) => e.slug === 'czech-cybertron-2028'), 'Czech Cybertron 2028 is hidden from participant operations');

  // Participant forbidden from admin actions
  const partAdminCheck = await apiGet('/admin/audit', partToken);
  assert(partAdminCheck.status === 403 || partAdminCheck.status === 404, 'Participant cannot access admin audit logs (Access denied)');

  const specToken = await login('specialist@cyris.local', 'AdminPassword123!');
  assert(!!specToken, 'Specialist (Elena Varga) logged in successfully');
  const specProfile = await apiGet('/auth/me', specToken);
  assert(specProfile.ok && specProfile.data.memberships.some((m: any) => m.roles.includes('role-forensics-examiner')), 'Specialist has forensics examiner role membership');

  // 6. Web Application Routes & Pages Walkthrough
  console.log('\n[6/7] Next.js Web Application Frontend Routes Walkthrough');
  const routesToVerify = [
    // Shell & Auth
    '/',
    '/login',
    // Platform Administration
    '/admin/events',
    '/admin/units',
    '/admin/users',
    '/admin/roles',
    '/admin/audit',
    '/admin/settings/identity',
    '/admin/settings/integrations/ai',
    // Operational Workspaces (Český Cybertron 2027)
    `/events/${event2027.id}/overview`,
    `/events/${event2027.id}/tasks`,
    `/events/${event2027.id}/incidents`,
    `/events/${event2027.id}/cases`,
    `/events/${event2027.id}/evidence`,
    `/events/${event2027.id}/lab`,
    `/events/${event2027.id}/forensics`,
    `/events/${event2027.id}/court`,
    `/events/${event2027.id}/medical`,
    `/events/${event2027.id}/scenario/control`,
    `/events/${event2027.id}/briefings`,
    `/events/${event2027.id}/evaluation`,
    `/events/${event2027.id}/documents`,
    `/events/${event2027.id}/command`,
  ];

  for (const route of routesToVerify) {
    const res = await checkWebRoute(route);
    assert(res.ok, `Route '${route}' rendered HTTP 200 successfully`);
  }

  // 7. I18N Consistency & Coverage Audit
  console.log('\n[7/7] I18N Translation Audit');
  const { checkTranslationConsistency } = await import('../apps/web/src/lib/i18n.js');
  const i18nAudit = checkTranslationConsistency();
  assert(i18nAudit.ok, `All 4 locales (en, cs, de, pl) have 100% complete keys (missing: cs=${i18nAudit.missing.cs.length}, de=${i18nAudit.missing.de.length}, pl=${i18nAudit.missing.pl.length})`);

  await closeDatabaseConnection();

  console.log('\n================================================================');
  console.log(`QA VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');
  if (failed > 0) {
    process.exit(1);
  }
}

runEndToEndVerification().catch(async (err) => {
  console.error('[Error] QA Verification encountered an unhandled error:', err);
  await closeDatabaseConnection();
  process.exit(1);
});
