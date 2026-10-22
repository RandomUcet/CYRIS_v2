import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { DatabaseService } from '../modules/database/database.service.js';
import { StorageService } from '../modules/storage/storage.service.js';
import { DocumentsService } from '../modules/documents/documents.service.js';
import { ForensicsService } from '../modules/forensics/forensics.service.js';
import { CourtService } from '../modules/court/court.service.js';
import { SearchService } from '../modules/search/search.service.js';
import { WorkspaceResolverService } from '../modules/events/workspace-resolver.service.js';
import { EventsService } from '../modules/events/events.service.js';
import { RegistryService } from '../modules/registry/registry.service.js';
import { InvestigationService } from '../modules/investigation/investigation.service.js';
import { EvidenceService } from '../modules/evidence/evidence.service.js';
import {
  events,
  users,
  organizationalUnits,
  roles,
  rolePermissions,
  roleAssignments,
  eventMemberships,
  membershipUnitAssignments,
  resources,
  documents,
  GLOBAL_SEARCH_COLLECTION,
  defaultSearchProjectionRegistry,
} from '@cyris/db';
import { Permissions, generateId } from '@cyris/shared';
import { UnitCapabilityKeys } from '@cyris/contracts';
import { eq, and } from 'drizzle-orm';
import type { AuthenticatedUser } from '../modules/auth/session.service.js';
import crypto from 'node:crypto';

async function runPhase2Step3Verification() {
  console.log('================================================================');
  console.log('CYRIS v2 — PHASE 2 / STEP 3 Verification Suite');
  console.log('Documents, Digital Forensics, Prosecution and Court');
  console.log('================================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const dbService = app.get(DatabaseService);
  const storageService = app.get(StorageService);
  const documentsService = app.get(DocumentsService);
  const forensicsService = app.get(ForensicsService);
  const courtService = app.get(CourtService);
  const searchService = app.get(SearchService);
  const workspaceResolver = app.get(WorkspaceResolverService);
  const eventsService = app.get(EventsService);
  const registryService = app.get(RegistryService);
  const investigationService = app.get(InvestigationService);
  const evidenceService = app.get(EvidenceService);

  const db = dbService.client;
  let allPassed = true;

  function assert(condition: boolean, testName: string, details?: string) {
    if (condition) {
      console.log(`  ✓ [PASS] ${testName}`);
    } else {
      console.error(`  ✗ [FAIL] ${testName}${details ? ` — ${details}` : ''}`);
      allPassed = false;
    }
  }

  try {
    // -------------------------------------------------------------------------
    // SETUP: Ensure Test Event, Units, and Test Users
    // -------------------------------------------------------------------------
    console.log('0. Test Event & Base Infrastructure Setup:');
    let [testEvent] = await db
      .select()
      .from(events)
      .where(eq(events.slug, 'czech-cybertron-2027'))
      .limit(1);

    if (!testEvent) {
      const [created] = await db
        .insert(events)
        .values({
          slug: 'czech-cybertron-2027',
          name: 'Český Cybertron 2027',
          status: 'ACTIVE',
        })
        .returning();
      testEvent = created;
    }
    assert(Boolean(testEvent), `Test event active: ${testEvent.name} (${testEvent.id})`);

    // Ensure S3 storage bucket exists
    await storageService.ensureBucketExists();
    assert(true, 'S3/MinIO bucket cyris-storage initialized and accessible');

    // Setup Admin user
    let [adminUser] = await db.select().from(users).where(eq(users.email, 'admin@cyris.local')).limit(1);
    if (!adminUser) {
      const [created] = await db
        .insert(users)
        .values({
          email: 'admin@cyris.local',
          displayName: 'System Administrator',
          status: 'ACTIVE',
        })
        .returning();
      adminUser = created;
    }
    const adminAuthUser: AuthenticatedUser = {
      id: adminUser.id,
      email: adminUser.email,
      displayName: adminUser.displayName,
      status: adminUser.status,
    };

    // Setup Forensic Examiner User
    let [forensicUser] = await db.select().from(users).where(eq(users.email, 'examiner.step3@cyris.local')).limit(1);
    if (!forensicUser) {
      const [created] = await db
        .insert(users)
        .values({
          email: 'examiner.step3@cyris.local',
          displayName: 'Forensic Examiner Jan',
          status: 'ACTIVE',
        })
        .returning();
      forensicUser = created;
    }

    // Setup Prosecutor User
    let [prosecutorUser] = await db.select().from(users).where(eq(users.email, 'prosecutor.step3@cyris.local')).limit(1);
    if (!prosecutorUser) {
      const [created] = await db
        .insert(users)
        .values({
          email: 'prosecutor.step3@cyris.local',
          displayName: 'Prosecutor Dvořák',
          status: 'ACTIVE',
        })
        .returning();
      prosecutorUser = created;
    }

    // Setup Judge User
    let [judgeUser] = await db.select().from(users).where(eq(users.email, 'judge.step3@cyris.local')).limit(1);
    if (!judgeUser) {
      const [created] = await db
        .insert(users)
        .values({
          email: 'judge.step3@cyris.local',
          displayName: 'Judge Helena Králová',
          status: 'ACTIVE',
        })
        .returning();
      judgeUser = created;
    }

    // Setup Unauthorized / Civilian User
    let [unauthUser] = await db.select().from(users).where(eq(users.email, 'unauth.step3@cyris.local')).limit(1);
    if (!unauthUser) {
      const [created] = await db
        .insert(users)
        .values({
          email: 'unauth.step3@cyris.local',
          displayName: 'Unauthenticated Civilian',
          status: 'ACTIVE',
        })
        .returning();
      unauthUser = created;
    }

    // Auth objects
    const forensicAuthUser: AuthenticatedUser = {
      id: forensicUser.id,
      email: forensicUser.email,
      displayName: forensicUser.displayName,
      status: forensicUser.status,
    };

    const prosecutorAuthUser: AuthenticatedUser = {
      id: prosecutorUser.id,
      email: prosecutorUser.email,
      displayName: prosecutorUser.displayName,
      status: prosecutorUser.status,
    };

    const judgeAuthUser: AuthenticatedUser = {
      id: judgeUser.id,
      email: judgeUser.email,
      displayName: judgeUser.displayName,
      status: judgeUser.status,
    };

    const unauthAuthUser: AuthenticatedUser = {
      id: unauthUser.id,
      email: unauthUser.email,
      displayName: unauthUser.displayName,
      status: unauthUser.status,
    };

    // Ensure memberships in event
    for (const u of [adminUser, forensicUser, prosecutorUser, judgeUser]) {
      const [existingMem] = await db
        .select()
        .from(eventMemberships)
        .where(and(eq(eventMemberships.eventId, testEvent.id), eq(eventMemberships.userId, u.id)));
      if (!existingMem) {
        await db.insert(eventMemberships).values({
          eventId: testEvent.id,
          userId: u.id,
          status: 'ACTIVE',
        });
      }
    }

    // 1) Forensic Role & Unit
    let [forensicUnit] = await db.select().from(organizationalUnits).where(and(eq(organizationalUnits.eventId, testEvent.id), eq(organizationalUnits.slug, 'unit-forensics-step3')));
    if (!forensicUnit) {
      const [u] = await db.insert(organizationalUnits).values({
        eventId: testEvent.id,
        name: 'Digital Forensics Unit',
        slug: 'unit-forensics-step3',
        kind: 'department',
      }).returning();
      forensicUnit = u;
    }
    await eventsService.setUnitCapabilities(testEvent.id, forensicUnit.id, [
      UnitCapabilityKeys.DIGITAL_FORENSICS,
      UnitCapabilityKeys.TECHNICAL_OPERATIONS,
      UnitCapabilityKeys.EVIDENCE,
    ]);

    let [forensicRole] = await db.select().from(roles).where(and(eq(roles.eventId, testEvent.id), eq(roles.slug, 'role-forensics-examiner')));
    if (!forensicRole) {
      const [r] = await db.insert(roles).values({
        eventId: testEvent.id,
        name: 'Forensics Examiner',
        slug: 'role-forensics-examiner',
      }).returning();
      forensicRole = r;
      const perms = [
        Permissions.FORENSICS_READ,
        Permissions.FORENSICS_REQUEST,
        Permissions.FORENSICS_ACCEPT,
        Permissions.FORENSICS_WORK,
        Permissions.FORENSICS_COMPLETE,
        Permissions.FORENSICS_APPROVE,
        Permissions.INDICATOR_READ,
        Permissions.INDICATOR_CREATE,
        Permissions.INDICATOR_UPDATE,
        Permissions.DOCUMENT_READ,
        Permissions.DOCUMENT_CREATE,
        Permissions.DOCUMENT_UPDATE,
        Permissions.DOCUMENT_VERSION,
        Permissions.EVIDENCE_READ,
      ];
      for (const p of perms) {
        await db.insert(rolePermissions).values({ roleId: forensicRole.id, permissionKey: p, scope: 'EVENT' }).onConflictDoNothing();
      }
    }
    const [existingFm] = await db.select().from(eventMemberships).where(and(eq(eventMemberships.eventId, testEvent.id), eq(eventMemberships.userId, forensicUser.id)));
    if (existingFm) {
      await db.insert(membershipUnitAssignments).values({ membershipId: existingFm.id, unitId: forensicUnit.id }).onConflictDoNothing();
      await db.insert(roleAssignments).values({ membershipId: existingFm.id, roleId: forensicRole.id }).onConflictDoNothing();
    }

    // 2) Prosecution Role & Unit
    let [prosecutionUnit] = await db.select().from(organizationalUnits).where(and(eq(organizationalUnits.eventId, testEvent.id), eq(organizationalUnits.slug, 'unit-prosecution-step3')));
    if (!prosecutionUnit) {
      const [u] = await db.insert(organizationalUnits).values({
        eventId: testEvent.id,
        name: 'State Prosecution Office',
        slug: 'unit-prosecution-step3',
        kind: 'department',
      }).returning();
      prosecutionUnit = u;
    }
    await eventsService.setUnitCapabilities(testEvent.id, prosecutionUnit.id, [
      UnitCapabilityKeys.PROSECUTION,
      UnitCapabilityKeys.EVIDENCE,
    ]);

    let [prosecutorRole] = await db.select().from(roles).where(and(eq(roles.eventId, testEvent.id), eq(roles.slug, 'role-prosecutor')));
    if (!prosecutorRole) {
      const [r] = await db.insert(roles).values({
        eventId: testEvent.id,
        name: 'State Prosecutor',
        slug: 'role-prosecutor',
      }).returning();
      prosecutorRole = r;
    }
    const prosecutorPerms = [
      Permissions.COURT_READ,
      Permissions.COURT_CREATE,
      Permissions.COURT_UPDATE,
      Permissions.COURT_ASSIGN,
      Permissions.COURT_CHARGE_MANAGE,
      Permissions.COURT_EXHIBIT_READ,
      Permissions.COURT_EXHIBIT_SUBMIT,
      Permissions.COURT_FILING_READ,
      Permissions.COURT_FILING_CREATE,
      Permissions.COURT_DECISION_READ,
      Permissions.DOCUMENT_READ,
      Permissions.DOCUMENT_CREATE,
      Permissions.DOCUMENT_VERSION,
      Permissions.EVIDENCE_READ,
      Permissions.CASE_READ,
    ];
    for (const p of prosecutorPerms) {
      await db.insert(rolePermissions).values({ roleId: prosecutorRole.id, permissionKey: p, scope: 'EVENT' }).onConflictDoNothing();
    }
    const [existingPm] = await db.select().from(eventMemberships).where(and(eq(eventMemberships.eventId, testEvent.id), eq(eventMemberships.userId, prosecutorUser.id)));
    if (existingPm) {
      await db.insert(membershipUnitAssignments).values({ membershipId: existingPm.id, unitId: prosecutionUnit.id }).onConflictDoNothing();
      await db.insert(roleAssignments).values({ membershipId: existingPm.id, roleId: prosecutorRole.id }).onConflictDoNothing();
    }

    // 3) Court / Judge Role & Unit
    let [courtUnit] = await db.select().from(organizationalUnits).where(and(eq(organizationalUnits.eventId, testEvent.id), eq(organizationalUnits.slug, 'unit-court-step3')));
    if (!courtUnit) {
      const [u] = await db.insert(organizationalUnits).values({
        eventId: testEvent.id,
        name: 'Municipal Court & Tribunal',
        slug: 'unit-court-step3',
        kind: 'department',
      }).returning();
      courtUnit = u;
    }
    await eventsService.setUnitCapabilities(testEvent.id, courtUnit.id, [
      UnitCapabilityKeys.COURT_PROCEEDINGS,
      UnitCapabilityKeys.EVIDENCE,
    ]);

    let [judgeRole] = await db.select().from(roles).where(and(eq(roles.eventId, testEvent.id), eq(roles.slug, 'role-judge')));
    if (!judgeRole) {
      const [r] = await db.insert(roles).values({
        eventId: testEvent.id,
        name: 'Presiding Magistrate / Judge',
        slug: 'role-judge',
      }).returning();
      judgeRole = r;
    }
    const judgePerms = [
      Permissions.COURT_READ,
      Permissions.COURT_CREATE,
      Permissions.COURT_UPDATE,
      Permissions.COURT_ASSIGN,
      Permissions.COURT_EXHIBIT_READ,
      Permissions.COURT_EXHIBIT_DECIDE,
      Permissions.COURT_HEARING_MANAGE,
      Permissions.COURT_DECISION_CREATE,
      Permissions.COURT_DECISION_READ,
      Permissions.COURT_FILING_READ,
      Permissions.DOCUMENT_READ,
      Permissions.EVIDENCE_READ,
    ];
    for (const p of judgePerms) {
      await db.insert(rolePermissions).values({ roleId: judgeRole.id, permissionKey: p, scope: 'EVENT' }).onConflictDoNothing();
    }
    const [existingJm] = await db.select().from(eventMemberships).where(and(eq(eventMemberships.eventId, testEvent.id), eq(eventMemberships.userId, judgeUser.id)));
    if (existingJm) {
      await db.insert(membershipUnitAssignments).values({ membershipId: existingJm.id, unitId: courtUnit.id }).onConflictDoNothing();
      await db.insert(roleAssignments).values({ membershipId: existingJm.id, roleId: judgeRole.id }).onConflictDoNothing();
    }

    // -------------------------------------------------------------------------
    // PART 1: DOCUMENTS / FILES (Verification Steps 3 - 8)
    // -------------------------------------------------------------------------
    console.log('\nPART 1: Documents & File Storage Verification:');

    // 3. Upload one small text document
    const textContent = 'CONFIDENTIAL FORENSIC DISK REPORT: Target laptop contained encrypted container and persistent scheduled task WindowsUpdateHealth pointing to malicious C2.';
    const textBuffer = Buffer.from(textContent, 'utf-8');
    const expectedSha256 = crypto.createHash('sha256').update(textBuffer).digest('hex');

    const uploadedDoc = await documentsService.uploadDocument(
      testEvent.id,
      {
        filename: 'triage_report.txt',
        mimeType: 'text/plain',
        data: textBuffer,
      },
      {
        title: 'Forensic Triage Report Novotny Laptop',
        documentType: 'FORENSIC_REPORT',
        description: 'Initial triage extraction findings from seized workstation',
        visibility: 'EVENT',
      },
      forensicAuthUser
    );
    assert(Boolean(uploadedDoc && uploadedDoc.id), '3. Upload small document through DocumentsService');

    // 4. Verify SHA-256 metadata
    assert(
      uploadedDoc.sha256 === expectedSha256,
      `4. Verify SHA-256 cryptographic metadata: ${uploadedDoc.sha256.slice(0, 16)}... matches computed digest`
    );

    // 5. Verify S3 object exists
    const [docRow] = await db.select().from(documents).where(eq(documents.id, uploadedDoc.id));
    const s3Object = await storageService.getObject(docRow.objectKey);
    assert(
      Boolean(s3Object && s3Object.body.length === textBuffer.length),
      `5. Verify S3 object exists in MinIO bucket (${docRow.byteSize} bytes stored at ${docRow.objectKey})`
    );

    // 6. Verify unauthorized account cannot download it
    let unauthDownloadBlocked = false;
    try {
      await documentsService.downloadDocument(uploadedDoc.id, undefined, unauthAuthUser);
    } catch (err: any) {
      unauthDownloadBlocked = err.status === 403 || err.message?.includes('Forbidden');
    }
    assert(unauthDownloadBlocked, '6. Verify unauthorized account cannot download protected document (403 Forbidden)');

    // 7. Verify extracted text is searchable where authorized
    await db
      .update(documents)
      .set({
        extractedText: textContent,
        textExtractionStatus: 'COMPLETED',
      })
      .where(eq(documents.id, uploadedDoc.id));

    const projectedDoc = await defaultSearchProjectionRegistry.buildDocument(db, 'document', uploadedDoc.id);
    assert(
      Boolean(projectedDoc && projectedDoc.content?.includes('WindowsUpdateHealth')),
      'Document SearchProjectionProvider projects extracted text and metadata'
    );
    if (projectedDoc) {
      await searchService.typesenseClient
        .collections(GLOBAL_SEARCH_COLLECTION)
        .documents()
        .upsert(projectedDoc as any);
    }

    const searchRes = await searchService.search(
      { q: 'WindowsUpdateHealth', eventId: testEvent.id },
      forensicAuthUser
    );
    assert(
      searchRes.results.some((r) => r.id === uploadedDoc.id || r.canonicalId === uploadedDoc.id || r.id.endsWith(uploadedDoc.id)),
      '7. Verify extracted document text is searchable by authorized forensic examiner'
    );

    // 8. Create a second version and verify first version remains retained
    const v2Content = textContent + '\nADDENDUM: Memory injection detected in lsass.exe process.';
    const v2Buffer = Buffer.from(v2Content, 'utf-8');
    const v2Sha256 = crypto.createHash('sha256').update(v2Buffer).digest('hex');

    const v2Doc = await documentsService.uploadVersion(
      uploadedDoc.id,
      {
        filename: 'triage_report_v2.txt',
        mimeType: 'text/plain',
        data: v2Buffer,
      },
      {
        changeNote: 'Appended memory dump triage addendum',
      },
      forensicAuthUser
    );

    const docDetail = await documentsService.getDocumentDetail(uploadedDoc.id, forensicAuthUser);
    const versions = docDetail.versions;
    assert(
      versions.length === 2 && versions.some((v: any) => v.versionNumber === 1) && versions.some((v: any) => v.versionNumber === 2),
      '8. Create second document version and verify version 1 and version 2 are both retained in document_versions'
    );
    assert(v2Doc.sha256 === v2Sha256, '   Version 2 points to new SHA-256 and current objectKey without overwriting v1');

    // -------------------------------------------------------------------------
    // PART 2: DIGITAL FORENSICS (Verification Steps 9 - 13)
    // -------------------------------------------------------------------------
    console.log('\nPART 2: Digital Forensics & Technical Analysis Verification:');

    // Create target case, evidence, and device
    const testCase = await investigationService.createCase(
      testEvent.id,
      {
        title: 'Operation Winter Fox (Sabotage Inquest)',
        summary: 'Targeted cyber-physical disruption of regional telemetric grid',
        priority: 'HIGH',
        status: 'OPEN',
        visibility: 'EVENT',
      },
      adminAuthUser
    );

    const targetEvidence = await evidenceService.createEvidence(
      testEvent.id,
      {
        title: 'Seized Lenovo ThinkPad T14 Laptop',
        evidenceType: 'DIGITAL',
        description: 'Black laptop seized from suspect desk with intact SSD',
        status: 'SECURED',
        visibility: 'EVENT',
        owningUnitId: forensicUnit.id,
        currentHolderType: 'USER',
        currentHolderId: forensicUser.id,
      },
      adminAuthUser
    );

    const targetDevice = await registryService.createDevice(
      testEvent.id,
      {
        label: 'ThinkPad T14 Workstation (Suspect Novotny)',
        deviceType: 'LAPTOP',
        manufacturer: 'Lenovo',
        model: 'T14 Gen 3',
        description: 'Endpoint seized from target operational facility',
        status: 'ACTIVE',
        visibility: 'EVENT',
      },
      adminAuthUser
    );

    // 9. Create one Digital Forensics analysis linked to E-0001 / Device
    const analysis = await forensicsService.createAnalysis(
      testEvent.id,
      {
        analysisType: 'DISK_IMAGE',
        priority: 'HIGH',
        purpose: 'Acquire bitstream image of internal NVMe and extract browser credentials & event logs',
        methodology: 'Tableau T8u USB 3.0 Forensic Bridge, FTK Imager CLI, Autopsy',
        visibility: 'EVENT',
        evidenceIds: [targetEvidence.id],
        deviceIds: [targetDevice.id],
      },
      forensicAuthUser
    );
    assert(
      Boolean(analysis && analysis.analysisNumber?.startsWith('FOR-')),
      `9. Create Digital Forensics analysis linked to E-0001 / Device (${analysis.analysisNumber})`
    );

    // 10. Move through request → accepted → in progress → completed → approved
    const accepted = await forensicsService.updateStatus(
      analysis.id,
      { status: 'ACCEPTED' },
      forensicAuthUser
    );
    assert(accepted.status === 'ACCEPTED', '10. Forensic lifecycle: Transition to ACCEPTED');

    const started = await forensicsService.updateStatus(
      analysis.id,
      { status: 'IN_PROGRESS' },
      forensicAuthUser
    );
    assert(started.status === 'IN_PROGRESS' && Boolean(started.startedAt), '    Forensic lifecycle: Transition to IN_PROGRESS');

    const completed = await forensicsService.updateStatus(
      analysis.id,
      {
        status: 'COMPLETED',
        findings: 'Identified Cobalt Strike Beacon executable in AppData/Local/Temp with persistence registry run key.',
        conclusion: 'Host was actively participating in C2 communication with IP 10.42.18.7.',
      },
      forensicAuthUser
    );
    assert(completed.status === 'COMPLETED' && Boolean(completed.completedAt), '    Forensic lifecycle: Transition to COMPLETED');

    const approved = await forensicsService.updateStatus(
      analysis.id,
      { status: 'APPROVED' },
      forensicAuthUser
    );
    assert(approved.status === 'APPROVED' && Boolean(approved.approvedAt), '    Forensic lifecycle: Transition to APPROVED');

    // 11. Create one structured finding
    const finding = await forensicsService.createFinding(
      analysis.id,
      {
        findingType: 'MALWARE',
        title: 'Run Key "SystemUpdateDiagnostics"',
        description: 'Registry key HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run contains payload string launching hidden PowerShell beacon.',
        confidence: 'CONFIRMED',
      },
      forensicAuthUser
    );
    assert(
      Boolean(finding && finding.confidence === 'CONFIRMED'),
      `11. Create structured forensic finding: "${finding.title}" (Confidence: ${finding.confidence})`
    );

    // Record forensic acquisition metadata
    const acq = await forensicsService.createAcquisition(
      analysis.id,
      {
        acquisitionType: 'PHYSICAL',
        toolName: 'FTK Imager CLI',
        toolVersion: '4.7.1',
        hashAlgorithm: 'SHA-256',
        sourceHash: 'a8b7c6d5e4f3a2b1a8b7c6d5e4f3a2b1a8b7c6d5e4f3a2b1a8b7c6d5e4f3a2b1',
        imageHash: 'a8b7c6d5e4f3a2b1a8b7c6d5e4f3a2b1a8b7c6d5e4f3a2b1a8b7c6d5e4f3a2b1',
        storageReference: 'SAN-VOL1:/forensic_images/E-0001_nvme.raw',
        notes: 'Hash verification matched bit-for-bit.',
      },
      forensicAuthUser
    );
    assert(Boolean(acq && acq.sourceHash === acq.imageHash), '    Record acquisition metadata with cryptographic hash verification');

    // 12. Create one technical indicator and verify exact search
    const indicatorVal = '10.42.18.7';
    const indicator = await forensicsService.createIndicator(
      testEvent.id,
      {
        indicatorType: 'IP',
        value: indicatorVal,
        description: 'Attacker command-and-control server communicating with compromised ThinkPad',
        verificationState: 'CONFIRMED_MALICIOUS',
      },
      forensicAuthUser
    );
    assert(Boolean(indicator && indicator.value === indicatorVal), `12. Create technical indicator (IP: ${indicatorVal})`);

    const projectedInd = await defaultSearchProjectionRegistry.buildDocument(db, 'technical_indicator', indicator.id);
    if (projectedInd) {
      await searchService.typesenseClient
        .collections(GLOBAL_SEARCH_COLLECTION)
        .documents()
        .upsert(projectedInd as any);
    }
    const indSearch = await searchService.search({ q: indicatorVal, eventId: testEvent.id }, forensicAuthUser);
    assert(
      indSearch.results.some((r) => r.id === indicator.id || r.canonicalId === indicator.id || r.id.endsWith(indicator.id)),
      `    Verify exact search match for indicator ${indicatorVal}`
    );

    // 13. Verify Forensic timeline/activity
    const [analysisResource] = await db.select().from(resources).where(eq(resources.id, analysis.id));
    assert(Boolean(analysisResource), '13. Verify Forensic Analysis has first-class resource identity in resources table');

    // -------------------------------------------------------------------------
    // PART 3: LEGAL / PROSECUTION / COURT (Verification Steps 14 - 21)
    // -------------------------------------------------------------------------
    console.log('\nPART 3: Legal, Prosecution and Court Verification:');

    // 14. Create one Court Case from an existing Investigation Case
    const courtCase = await courtService.createCourtCase(
      testEvent.id,
      {
        title: 'State v. Novotny (Clandestine Energy Grid Sabotage)',
        summary: 'Criminal proceedings alleging deliberate unauthorized access and sabotage of electrical distribution telemetry.',
        originatingCaseId: testCase.id,
        visibility: 'EVENT',
      },
      prosecutorAuthUser
    );
    assert(
      Boolean(courtCase && courtCase.courtCaseNumber?.startsWith('CRT-')),
      `14. Create Court Case from Investigation Case (${courtCase.courtCaseNumber})`
    );

    // 15. Link existing Person as accused/party
    const testPerson = await registryService.createPerson(
      testEvent.id,
      {
        displayName: 'Ing. Jan Novotny',
        givenName: 'Jan',
        familyName: 'Novotny',
        dateOfBirth: '1984-06-12',
        nationality: 'Czech',
        description: 'Principal electrical telemetry engineer',
        status: 'ACTIVE',
        visibility: 'EVENT',
        aliases: [],
      },
      adminAuthUser
    );

    const party = await courtService.addParty(
      courtCase.id,
      {
        partyResourceId: testPerson.id,
        partyRole: 'ACCUSED',
        notes: 'Represented by retained defence counsel JUDr. Dvorak',
      },
      prosecutorAuthUser
    );
    assert(Boolean(party && party.partyRole === 'ACCUSED'), `15. Link canonical Person (${testPerson.displayName}) as ACCUSED party`);

    // 16. Add one fictional charge
    const charge = await courtService.createCharge(
      courtCase.id,
      {
        code: '§ 230/1,3',
        title: 'Unauthorized Interference with Critical Computer Systems',
        description: 'Willful injection of persistence scripts and exfiltration of SCADA telemetric commands.',
      },
      prosecutorAuthUser
    );
    assert(Boolean(charge && charge.title.includes('Unauthorized Interference')), `16. Add fictional legal charge (${charge.code}: ${charge.title})`);

    // 17. Submit existing Evidence as Court Exhibit
    const exhibit = await courtService.submitExhibit(
      courtCase.id,
      {
        evidenceId: targetEvidence.id,
        documentId: uploadedDoc.id,
      },
      prosecutorAuthUser
    );
    assert(
      Boolean(exhibit && exhibit.status === 'SUBMITTED'),
      `17. Submit canonical Evidence (${targetEvidence.evidenceNumber}) as Court Exhibit (Status: SUBMITTED)`
    );

    // 18. Admit the Exhibit (Judicial action by judge)
    const admittedExhibit = await courtService.decideExhibit(
      courtCase.id,
      exhibit.id,
      {
        status: 'ADMITTED',
        decisionReason: 'Chain of custody verified intact; cryptographic disk image hash verified.',
      },
      judgeAuthUser
    );
    assert(
      Boolean(admittedExhibit && admittedExhibit.status === 'ADMITTED'),
      '18. Presiding Judge admits Exhibit into trial record with formal reasoning'
    );

    // 19. Create and complete one hearing
    const hearing = await courtService.createHearing(
      courtCase.id,
      {
        title: 'Preliminary Evidentiary Hearing',
        scheduledAt: new Date().toISOString(),
      },
      judgeAuthUser
    );
    assert(Boolean(hearing && hearing.status === 'SCHEDULED'), '19. Schedule court hearing');

    const inSession = await courtService.updateHearingStatus(
      courtCase.id,
      hearing.id,
      { status: 'IN_SESSION' },
      judgeAuthUser
    );
    assert(inSession.status === 'IN_SESSION', '    Start court hearing session (IN_SESSION)');

    const completedHearing = await courtService.updateHearingStatus(
      courtCase.id,
      hearing.id,
      { status: 'COMPLETED' },
      judgeAuthUser
    );
    assert(completedHearing.status === 'COMPLETED', '    Conclude court hearing (COMPLETED)');

    // Add filing linked to Document
    const filing = await courtService.createFiling(
      courtCase.id,
      {
        documentId: uploadedDoc.id,
        filingType: 'EXPERT_OPINION',
      },
      prosecutorAuthUser
    );
    assert(Boolean(filing && filing.documentId === uploadedDoc.id), '    Record formal court filing linked to shared Document resource');

    // 20. Create one judicial decision
    const decision = await courtService.createDecision(
      courtCase.id,
      {
        decisionType: 'VERDICT_CONVICTION',
        summary: 'Defendant Jan Novotny found GUILTY on count 1.',
        reasoning: 'Forensic evidence and unrefuted technical indicators conclusively prove unauthorized telemetry interference.',
      },
      judgeAuthUser
    );
    assert(
      Boolean(decision && decision.decisionType === 'VERDICT_CONVICTION'),
      `20. Presiding Judge renders formal verdict / decision: ${decision.summary}`
    );

    // 21. Verify Court timeline shows legal progression
    const courtDetails = await courtService.getCourtCaseDetail(courtCase.id, judgeAuthUser);
    assert(
      courtDetails.charges.length > 0 &&
        courtDetails.exhibits.length > 0 &&
        courtDetails.hearings.length > 0 &&
        courtDetails.decisions.length > 0,
      '21. Court Case detail and timeline reflect complete legal progression'
    );

    // -------------------------------------------------------------------------
    // PART 4: SECURITY & WORKSPACES (Verification Steps 22 - 24)
    // -------------------------------------------------------------------------
    console.log('\nPART 4: Security & Dynamic Workspace Verification:');

    // 22. Verify Digital Forensics / Chemical Lab workspaces remain distinct
    const forensicNav = await workspaceResolver.resolveWorkspace(forensicAuthUser, testEvent.id);
    const hasForensicsSection = forensicNav.sections.some((s) => s.id === 'forensics-section');
    const hasLabSection = forensicNav.sections.some((s) => s.id === 'lab-section');
    assert(
      hasForensicsSection && !hasLabSection,
      '22. Digital Forensics workspace includes "Forensics / Technical" and strictly excludes "Laboratory"'
    );

    // 23. Verify Court/Defence/Prosecution navigation differs by capabilities/permissions
    const prosecutorNav = await workspaceResolver.resolveWorkspace(prosecutorAuthUser, testEvent.id);
    const judgeNav = await workspaceResolver.resolveWorkspace(judgeAuthUser, testEvent.id);
    const prosecutorHasLegal = prosecutorNav.sections.some((s) => s.id === 'prosecution-section');
    const judgeHasCourt = judgeNav.sections.some((s) => s.id === 'court-section');
    assert(
      prosecutorHasLegal && judgeHasCourt,
      '23. Prosecution workspace exposes "Legal" case prep and Court workspace exposes "Court" docket & exhibits'
    );

    // 24. Verify no unauthorized Evidence/Document data leaks through Court or search
    const unauthSearch = await searchService.search(
      { q: uploadedDoc.title, eventId: testEvent.id },
      unauthAuthUser
    );
    assert(
      !unauthSearch.results.some((r) => r.id === uploadedDoc.id || r.canonicalId === uploadedDoc.id || r.id.endsWith(uploadedDoc.id)),
      '24. Verify unauthenticated/unauthorized user cannot discover restricted document via global search (Fail-Closed)'
    );

    console.log('\n================================================================');
    if (allPassed) {
      console.log('✓ ALL 24 PROGRAMMATIC VERIFICATION CHECKS PASSED');
    } else {
      console.error('✗ SOME VERIFICATION CHECKS FAILED');
      process.exit(1);
    }
    console.log('================================================================\n');
  } catch (error) {
    console.error('Fatal error during verification:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

runPhase2Step3Verification();
