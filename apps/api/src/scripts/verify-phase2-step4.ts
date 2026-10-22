import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { DatabaseService } from '../modules/database/database.service.js';
import { TasksService } from '../modules/tasks/tasks.service.js';
import { MedicalService } from '../modules/medical/medical.service.js';
import { EvaluationService } from '../modules/evaluation/evaluation.service.js';
import { CommandService } from '../modules/command/command.service.js';
import { SearchService } from '../modules/search/search.service.js';
import { WorkspaceResolverService } from '../modules/events/workspace-resolver.service.js';
import { AIContextService } from '../modules/ai/ai-context.service.js';
import { InvestigationService } from '../modules/investigation/investigation.service.js';
import { RegistryService } from '../modules/registry/registry.service.js';
import { DocumentsService } from '../modules/documents/documents.service.js';
import { EventsService } from '../modules/events/events.service.js';
import {
  events,
  users,
  organizationalUnits,
  roles,
  rolePermissions,
  roleAssignments,
  eventMemberships,
  membershipUnitAssignments,
  defaultSearchProjectionRegistry,
  evaluationObjectives,
  evaluationObservations,
} from '@cyris/db';
import { Permissions } from '@cyris/shared';
import { UnitCapabilityKeys } from '@cyris/contracts';
import { eq, and } from 'drizzle-orm';
import type { AuthenticatedUser } from '../modules/auth/session.service.js';

async function runPhase2Step4Verification() {
  console.log('================================================================');
  console.log('CYRIS v2 — PHASE 2 / STEP 4 Verification Suite');
  console.log('Operational Tasking, Medical, Command & Observer/Evaluation');
  console.log('================================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const dbService = app.get(DatabaseService);
  const tasksService = app.get(TasksService);
  const medicalService = app.get(MedicalService);
  const evaluationService = app.get(EvaluationService);
  const commandService = app.get(CommandService);
  const searchService = app.get(SearchService);
  const workspaceResolver = app.get(WorkspaceResolverService);
  const aiContextService = app.get(AIContextService);
  const investigationService = app.get(InvestigationService);
  const registryService = app.get(RegistryService);
  const documentsService = app.get(DocumentsService);
  const eventsService = app.get(EventsService);

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
    // 0. Base Infrastructure & Test Users Setup
    // -------------------------------------------------------------------------
    console.log('0. Base Infrastructure & Test Context Setup:');
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

    // Clean up any evaluation records from prior test runs to ensure clean active slate
    await db.delete(evaluationObservations).where(eq(evaluationObservations.eventId, testEvent.id));
    await db.delete(evaluationObjectives).where(eq(evaluationObjectives.eventId, testEvent.id));

    // Helper: Find or Create User
    async function getOrCreateUser(email: string, displayName: string): Promise<AuthenticatedUser> {
      let [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!u) {
        const [created] = await db
          .insert(users)
          .values({
            email,
            displayName,
            status: 'ACTIVE',
          })
          .returning();
        u = created;
      }
      return {
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        status: u.status,
      };
    }

    // Helper: Find or Create Unit
    async function getOrCreateUnit(slug: string, name: string): Promise<string> {
      let [u] = await db
        .select()
        .from(organizationalUnits)
        .where(and(eq(organizationalUnits.eventId, testEvent.id), eq(organizationalUnits.slug, slug)))
        .limit(1);
      if (!u) {
        const [created] = await db
          .insert(organizationalUnits)
          .values({
            eventId: testEvent.id,
            slug,
            name,
            kind: 'department',
          })
          .returning();
        u = created;
      }
      return u.id;
    }

    // Helper: Assign Role with permissions
    async function assignUserRole(
      userId: string,
      roleSlug: string,
      roleName: string,
      perms: string[],
      unitId?: string
    ) {
      // 1. Role
      let [r] = await db
        .select()
        .from(roles)
        .where(and(eq(roles.eventId, testEvent.id), eq(roles.slug, roleSlug)))
        .limit(1);
      if (!r) {
        const [created] = await db
          .insert(roles)
          .values({
            eventId: testEvent.id,
            slug: roleSlug,
            name: roleName,
          })
          .returning();
        r = created;
      }

      // 2. Role Permissions
      for (const p of perms) {
        await db
          .insert(rolePermissions)
          .values({ roleId: r.id, permissionKey: p, scope: 'EVENT' })
          .onConflictDoNothing();
      }

      // 3. Event Membership
      let [mem] = await db
        .select()
        .from(eventMemberships)
        .where(and(eq(eventMemberships.eventId, testEvent.id), eq(eventMemberships.userId, userId)))
        .limit(1);
      if (!mem) {
        const [created] = await db
          .insert(eventMemberships)
          .values({
            eventId: testEvent.id,
            userId,
            status: 'ACTIVE',
          })
          .returning();
        mem = created;
      }

      // 4. Role Assignment
      await db
        .insert(roleAssignments)
        .values({
          membershipId: mem.id,
          roleId: r.id,
        })
        .onConflictDoNothing();

      // 5. Unit Assignment
      if (unitId) {
        await db
          .insert(membershipUnitAssignments)
          .values({
            membershipId: mem.id,
            unitId,
          })
          .onConflictDoNothing();
      }
    }

    // Setup Units
    const tacticalUnitId = await getOrCreateUnit('tactical-alpha', 'Tactical Alpha');
    const commandUnitId = await getOrCreateUnit('command-hq', 'Command HQ');
    const medicalUnitId = await getOrCreateUnit('medical-field', 'Field Medical Response');
    const evalUnitId = await getOrCreateUnit('exercise-control-eval', 'Observer / Evaluation Unit');
    const investigUnitId = await getOrCreateUnit('investigation-div', 'Investigation Division');

    await eventsService.setUnitCapabilities(testEvent.id, tacticalUnitId, [
      UnitCapabilityKeys.TACTICAL_OPERATIONS,
      UnitCapabilityKeys.INCIDENT_OPERATIONS,
      UnitCapabilityKeys.EVIDENCE,
    ]);

    await eventsService.setUnitCapabilities(testEvent.id, commandUnitId, [
      UnitCapabilityKeys.CRISIS_MANAGEMENT,
      UnitCapabilityKeys.INCIDENT_OPERATIONS,
    ]);

    await eventsService.setUnitCapabilities(testEvent.id, medicalUnitId, [
      UnitCapabilityKeys.MEDICAL_OPERATIONS,
      UnitCapabilityKeys.EVIDENCE,
    ]);

    await eventsService.setUnitCapabilities(testEvent.id, evalUnitId, [
      UnitCapabilityKeys.EVALUATION,
    ]);

    await eventsService.setUnitCapabilities(testEvent.id, investigUnitId, [
      UnitCapabilityKeys.INVESTIGATION,
    ]);

    // Setup Users
    const adminUser = await getOrCreateUser('admin@cyris.local', 'Platform Admin');
    const tacticalUser = await getOrCreateUser('tactical.lead@cyris.local', 'Tactical Lead Jan');
    const commandUser = await getOrCreateUser('commander@cyris.local', 'Incident Commander Novak');
    const medicalUser = await getOrCreateUser('doctor.step4@cyris.local', 'Dr. Alena Svobodova');
    const evalUser = await getOrCreateUser('evaluator.step4@cyris.local', 'Chief Evaluator Petr');
    const investigatorUser = await getOrCreateUser('investigator.step4@cyris.local', 'Investigator Karel');

    // Assign roles & permissions
    await assignUserRole(adminUser.id, 'admin-role', 'Platform Admin', [Permissions.PLATFORM_MANAGE]);

    await assignUserRole(
      tacticalUser.id,
      'tactical-role',
      'Tactical Operator',
      [
        Permissions.TASK_READ,
        Permissions.TASK_ACKNOWLEDGE,
        Permissions.TASK_WORK,
        Permissions.TASK_COMPLETE,
        Permissions.INCIDENT_READ,
        Permissions.EVIDENCE_READ,
      ],
      tacticalUnitId
    );

    await assignUserRole(
      commandUser.id,
      'command-role',
      'Crisis Commander',
      [
        Permissions.TASK_READ,
        Permissions.TASK_CREATE,
        Permissions.TASK_UPDATE,
        Permissions.TASK_ASSIGN,
        Permissions.TASK_CANCEL,
        Permissions.INCIDENT_READ,
        Permissions.INCIDENT_CREATE,
        Permissions.DOCUMENT_READ,
        Permissions.DOCUMENT_CREATE,
      ],
      commandUnitId
    );

    await assignUserRole(
      medicalUser.id,
      'medical-role',
      'Medical Officer',
      [
        Permissions.MEDICAL_READ,
        Permissions.MEDICAL_CREATE,
        Permissions.MEDICAL_UPDATE,
        Permissions.MEDICAL_TRIAGE,
        Permissions.MEDICAL_OBSERVE,
        Permissions.MEDICAL_INTERVENE,
        Permissions.MEDICAL_TRANSFER,
        Permissions.MEDICAL_CLOSE,
        Permissions.TASK_READ,
        Permissions.TASK_CREATE,
      ],
      medicalUnitId
    );

    await assignUserRole(
      evalUser.id,
      'eval-role',
      'Exercise Evaluator',
      [
        Permissions.EVALUATION_READ,
        Permissions.EVALUATION_MANAGE,
        Permissions.EVALUATION_OBSERVE,
        Permissions.EVALUATION_SCORE,
        Permissions.EVALUATION_LOCK,
        Permissions.EVALUATION_PUBLISH,
        Permissions.TASK_READ,
      ],
      evalUnitId
    );

    await assignUserRole(
      investigatorUser.id,
      'investig-role',
      'Investigator',
      [
        Permissions.CASE_READ,
        Permissions.CASE_CREATE,
        Permissions.INCIDENT_READ,
        Permissions.TASK_READ,
        Permissions.TASK_CREATE,
      ],
      investigUnitId
    );

    console.log('✓ Test units, users, roles, capabilities, and event context configured.\n');

    // -------------------------------------------------------------------------
    // PART 1 — OPERATIONAL TASKING
    // -------------------------------------------------------------------------
    console.log('--- PART 1: OPERATIONAL TASKING ---');

    // Setup an incident as task source
    const incident = await investigationService.createIncident(
      testEvent.id,
      {
        title: 'Perimeter Intrusion at Gate 4',
        description: 'Sensor trip and breached security perimeter near data center.',
        priority: 'HIGH',
        status: 'NEW',
        visibility: 'EVENT',
      },
      commandUser
    );
    assert(Boolean(incident.id), 'Test incident created as task origin', incident.incidentNumber);

    // 3. Create TASK-0001 from existing Incident
    const task = await tasksService.createTask(
      testEvent.id,
      {
        title: 'Secure Gate 4 Perimeter and Recover Access Card',
        description: 'Deploy tactical response to Gate 4, contain breach and log physical indicators.',
        priority: 'HIGH',
        visibility: 'EVENT',
        owningUnitId: commandUnitId,
        sourceType: 'INCIDENT',
        sourceResourceId: incident.id,
      },
      commandUser
    );
    assert(Boolean(task.id), `Step 3: Created ${task.taskNumber} linked to Incident ${incident.incidentNumber}`);
    assert(task.taskNumber.startsWith('TASK-'), `Task identifier allocated safely: ${task.taskNumber}`);

    // 4. Assign it to Tactical unit
    const assignedTask = await tasksService.assignTask(
      task.id,
      {
        assignedUnitId: tacticalUnitId,
        assignedUserId: tacticalUser.id,
      },
      commandUser
    );
    assert(assignedTask.assignedUnitId === tacticalUnitId, 'Step 4: Task successfully assigned to Tactical unit');
    assert(assignedTask.assignedUserId === tacticalUser.id, 'Task assigned to Tactical lead user');

    // 5. Verify Tactical user sees / acknowledges / starts / completes it
    const tacticalTaskList = await tasksService.listTasks(testEvent.id, { page: 1, limit: 50 }, tacticalUser);
    const foundTask = tacticalTaskList.find((t) => t.id === task.id);
    assert(Boolean(foundTask), 'Step 5a: Tactical user sees assigned task in run-sheet');

    const ackTask = await tasksService.acknowledgeTask(task.id, {}, tacticalUser);
    assert(ackTask.status === 'ACKNOWLEDGED', 'Step 5b: Tactical user acknowledges task');

    const startedTask = await tasksService.startTask(task.id, {}, tacticalUser);
    assert(startedTask.status === 'IN_PROGRESS', 'Step 5c: Tactical user starts task work');

    const completedTask = await tasksService.completeTask(
      task.id,
      { completionNote: 'Perimeter secured. Recovered employee card E-0042 at site.' },
      tacticalUser
    );
    assert(completedTask.status === 'COMPLETED', 'Step 5d: Tactical user completes task with completion note');

    // 6. Verify unrelated unit cannot access restricted task
    const restrictedTask = await tasksService.createTask(
      testEvent.id,
      {
        title: 'Classified Tactical Deployment Order',
        priority: 'HIGH',
        owningUnitId: tacticalUnitId,
        visibility: 'UNIT',
        sourceType: 'MANUAL',
      },
      tacticalUser
    );

    let accessDenied = false;
    try {
      await tasksService.getTaskDetail(restrictedTask.id, investigatorUser);
    } catch {
      accessDenied = true;
    }
    assert(accessDenied, 'Step 6: Unrelated unit (Investigator) cannot access UNIT-restricted Tactical task');

    console.log();

    // -------------------------------------------------------------------------
    // PART 2 — COMMAND / CRISIS MANAGEMENT
    // -------------------------------------------------------------------------
    console.log('--- PART 2: COMMAND / CRISIS MANAGEMENT ---');

    // 7. Verify Command workspace aggregates existing incidents/tasks/activity without duplicating records
    const opPicture = await commandService.getOperationalPicture(testEvent.id, commandUser);
    assert(Boolean(opPicture), 'Step 7a: Command Operational Picture successfully compiled');
    assert(opPicture.criticalIncidents.length > 0, `Operational picture includes ${opPicture.criticalIncidents.length} critical/high incidents`);
    assert(opPicture.priorityTasks.length > 0, `Operational picture includes ${opPicture.priorityTasks.length} priority tasks`);
    assert(opPicture.recentActivities.length > 0, `Operational picture includes recent timeline moments (${opPicture.recentActivities.length})`);
    assert(Boolean(opPicture.medicalSummary), 'Operational picture includes aggregated medical operational summary');

    // 8. Create one SITREP Document linked to relevant records
    const sitrepDoc = await commandService.createSitrep(
      testEvent.id,
      {
        title: 'SITREP-01 — Gate 4 Breach & Response Posture',
        summary: 'Perimeter breach contained by Tactical Alpha. Access card seized. Zero casualties reported.',
        incidentIds: [incident.id],
        taskIds: [task.id],
        includeMedicalSummary: true,
        visibility: 'EVENT',
      },
      commandUser
    );
    assert(Boolean(sitrepDoc.id), `Step 8: SITREP created via Documents infrastructure (${sitrepDoc.documentNumber})`);
    assert(sitrepDoc.documentType === 'SITREP', 'Document has explicit type SITREP');

    console.log();

    // -------------------------------------------------------------------------
    // PART 3 — MEDICAL RESPONSE
    // -------------------------------------------------------------------------
    console.log('--- PART 3: MEDICAL RESPONSE ---');

    // Create a Person registry record to verify link
    const person = await registryService.createPerson(
      testEvent.id,
      {
        displayName: 'Jan Kovář',
        status: 'ACTIVE',
        visibility: 'EVENT',
        aliases: [],
        nationality: 'CZE',
      },
      adminUser
    );

    // 9. Create MED-0001 linked to existing Incident and Person
    const encounter = await medicalService.createEncounter(
      testEvent.id,
      {
        personId: person.id,
        incidentId: incident.id,
        chiefComplaint: 'Acute chemical vapor inhalation, coughing, dyspnea',
        mechanismOfInjury: 'Exposure near damaged HVAC unit during breach',
        assessmentSummary: 'Airway patent, wheezing in bilateral lung fields. Responsive, GCS 15.',
        triageCategory: 'UNKNOWN',
        visibility: 'UNIT',
      },
      medicalUser
    );
    assert(Boolean(encounter.id), `Step 9: Created ${encounter.medicalNumber} linked to Incident and Person`);
    assert(encounter.medicalNumber.startsWith('MED-'), `Medical number formatted: ${encounter.medicalNumber}`);
    assert(encounter.status === 'RECEIVED', `Initial operational status: ${encounter.status}`);

    // 10. Triage encounter
    const triagedEnc = await medicalService.triageEncounter(
      encounter.id,
      {
        triageCategory: 'IMMEDIATE',
        notes: 'Respiratory distress deteriorating. Immediate high-flow O2 required.',
      },
      medicalUser
    );
    assert(triagedEnc.triageCategory === 'IMMEDIATE', 'Step 10: Triage category updated to IMMEDIATE (Red)');
    assert(triagedEnc.status === 'TRIAGED', 'Status moved to TRIAGED');

    // 11. Add structured observation
    const obsHR = await medicalService.addObservation(
      encounter.id,
      {
        observationType: 'HEART_RATE',
        value: '128',
        unit: 'bpm',
        note: 'Sinus tachycardia',
      },
      medicalUser
    );
    assert(obsHR.observationType === 'HEART_RATE' && obsHR.value === '128', 'Step 11a: Recorded Heart Rate observation (128 bpm)');

    const obsSPO2 = await medicalService.addObservation(
      encounter.id,
      {
        observationType: 'SPO2',
        value: '88',
        unit: '%',
        note: 'Hypoxia room air',
      },
      medicalUser
    );
    assert(obsSPO2.value === '88', 'Step 11b: Recorded SpO2 observation (88%)');

    // 12. Add intervention
    const intervention = await medicalService.addIntervention(
      encounter.id,
      {
        interventionType: 'OXYGEN_THERAPY',
        description: 'Administered 15L/min O2 via non-rebreather mask and bronchodilator nebulizer',
        outcome: 'IMPROVED',
      },
      medicalUser
    );
    assert(intervention.outcome === 'IMPROVED', 'Step 12: Recorded intervention (Oxygen therapy, outcome: IMPROVED)');

    // Stabilize
    const stabilized = await medicalService.stabilizeEncounter(encounter.id, medicalUser);
    assert(stabilized.status === 'STABILIZED', 'Casualty stabilized under care');

    // 13. Transfer casualty to another Location
    const hospitalLoc = await registryService.createLocation(
      testEvent.id,
      {
        name: 'Military Field Hospital 4',
        visibility: 'EVENT',
        locationType: 'MEDICAL_FACILITY',
      },
      adminUser
    );

    const transferred = await medicalService.transferEncounter(
      encounter.id,
      {
        targetLocationId: hospitalLoc.id,
        disposition: 'AMBULANCE',
      },
      medicalUser
    );
    assert(transferred.status === 'TRANSFERRED', 'Step 13: Transferred casualty to AMBULANCE disposition');

    // 14. Verify unauthorized Investigator cannot read detailed medical record
    let medAccessDenied = false;
    try {
      await medicalService.getEncounterDetail(encounter.id, investigatorUser);
    } catch {
      medAccessDenied = true;
    }
    assert(medAccessDenied, 'Step 14: Unauthorized Investigator cannot read detailed clinical medical encounter');

    // 15. Verify Command sees only allowed operational summary, not clinical notes
    const medSummary = await medicalService.getOperationalSummary(testEvent.id, commandUser);
    assert(medSummary.transferredCasualties >= 1, `Step 15a: Command receives aggregate transferred casualties count (${medSummary.transferredCasualties})`);
    assert(medSummary.triageCounts.IMMEDIATE >= 1, `Step 15b: Command receives aggregate triage count (IMMEDIATE: ${medSummary.triageCounts.IMMEDIATE})`);
    assert(!('chiefComplaint' in medSummary), 'Step 15c: Command summary strictly omits clinical chief complaints and vitals');

    console.log();

    // -------------------------------------------------------------------------
    // PART 4 — OBSERVER / EVALUATION
    // -------------------------------------------------------------------------
    console.log('--- PART 4: OBSERVER / EVALUATION ---');

    // 16. Create one evaluation objective linked to Scenario
    const objective = await evaluationService.createObjective(
      testEvent.id,
      {
        code: 'OBJ-04',
        title: 'Preserve Digital and Physical Evidence Integrity',
        description: 'Verify field and investigative personnel maintain chain of custody and hash verification.',
        category: 'FORENSICS_AND_EVIDENCE',
        weight: 2,
        status: 'ACTIVE',
      },
      evalUser
    );
    assert(Boolean(objective.id), `Step 16: Created evaluation objective ${objective.code}: ${objective.title}`);

    // 17. Add criterion
    const criterion = await evaluationService.createCriterion(
      testEvent.id,
      objective.id,
      {
        description: 'First responder documents initial condition and secures physical chain of custody.',
        measurementType: 'SCORE',
        maximumScore: 5,
        sequence: 1,
      },
      evalUser
    );
    assert(Boolean(criterion.id), 'Step 17: Added measurement criterion (SCORE, max: 5)');

    // 18. Observer records observation linked to existing Activity / Resource
    const observation = await evaluationService.createObservation(
      testEvent.id,
      {
        objectiveId: objective.id,
        criterionId: criterion.id,
        targetUnitId: tacticalUnitId,
        relatedResourceId: task.id,
        observationType: 'NOTE',
        note: 'Tactical Alpha successfully secured access card E-0042 and recorded seal numbers before completing task.',
        result: 'MET',
      },
      evalUser
    );
    assert(Boolean(observation.id), 'Step 18: Evaluator recorded field observation linked to Task and Tactical unit');

    // 19. Score criterion manually
    const scoredObs = await evaluationService.updateObservation(
      testEvent.id,
      observation.id,
      {
        score: 4,
        result: 'EXCEEDED',
      },
      evalUser
    );
    assert(Number(scoredObs.score) === 4, 'Step 19: Manually scored criterion (4 / 5) by human evaluator');

    // 20. Verify normal participant cannot discover evaluation record
    let evalAccessDenied = false;
    try {
      await evaluationService.listObservations(testEvent.id, { page: 1, limit: 50 }, tacticalUser);
    } catch {
      evalAccessDenied = true;
    }
    assert(evalAccessDenied, 'Step 20: Tactical participant cannot discover or list evaluation records');

    // 21. Lock evaluation
    const lockResult = await evaluationService.lockEvaluation(
      testEvent.id,
      { reason: 'Phase 2 live exercise completed. Locking evaluations for AAR compilation.' },
      evalUser
    );
    assert(lockResult.status === 'LOCKED', 'Step 21: Evaluation framework locked by controller');

    // 22. Verify ordinary editing is blocked
    let editBlocked = false;
    try {
      await evaluationService.createObservation(
        testEvent.id,
        {
          note: 'Post-exercise retroactive edit attempt',
          observationType: 'NOTE',
        },
        evalUser
      );
    } catch {
      editBlocked = true;
    }
    assert(editBlocked, 'Step 22: Ordinary observation creation is strictly blocked when evaluation is locked');

    // After Action Review Compilation
    const aar = await evaluationService.getAfterActionReview(testEvent.id, evalUser);
    assert(aar.objectives.length > 0, `Compiled AAR: ${aar.objectives.length} objectives with evaluator observations`);

    console.log();

    // -------------------------------------------------------------------------
    // PART 5 — WORKSPACE RESOLVER
    // -------------------------------------------------------------------------
    console.log('--- PART 5: WORKSPACE RESOLVER DIFFERENTIATION ---');

    // 23. Verify Medical / Command / Tactical / Evaluation navigation differs appropriately
    const [medNav, cmdNav, tacNav, evalNav] = await Promise.all([
      workspaceResolver.resolveWorkspace(medicalUser, testEvent.id),
      workspaceResolver.resolveWorkspace(commandUser, testEvent.id),
      workspaceResolver.resolveWorkspace(tacticalUser, testEvent.id),
      workspaceResolver.resolveWorkspace(evalUser, testEvent.id),
    ]);

    const medSections = medNav.sections.map((s) => s.id);
    const cmdSections = cmdNav.sections.map((s) => s.id);
    const tacSections = tacNav.sections.map((s) => s.id);
    const evalSections = evalNav.sections.map((s) => s.id);

    assert(
      medSections.includes('medical-section') && !medSections.includes('command-section'),
      `Step 23a: Medical unit has 'medical-section' and no command section (${medSections.join(', ')})`
    );

    assert(
      cmdSections.includes('command-section') && !cmdSections.includes('medical-section'),
      `Step 23b: Command unit has 'command-section' (${cmdSections.join(', ')})`
    );

    assert(
      tacSections.includes('operations-section') && !tacSections.includes('medical-section'),
      `Step 23c: Tactical unit has 'operations-section' (${tacSections.join(', ')})`
    );

    assert(
      evalSections.includes('evaluation-section') && !evalSections.includes('medical-section'),
      `Step 23d: Evaluation unit has 'evaluation-section' (${evalSections.join(', ')})`
    );

    console.log();

    // -------------------------------------------------------------------------
    // PART 6 — SECURITY: SEARCH & AI CONTAINMENT
    // -------------------------------------------------------------------------
    console.log('--- PART 6: SECURITY & CONTAINMENT ---');

    // 24. Verify global search does not leak Evaluation data
    const evalSearchProjection = defaultSearchProjectionRegistry.getProvider('evaluation_observation');
    assert(evalSearchProjection === undefined, 'Step 24a: Evaluation observations have ZERO search projections registered');

    const evalObjSearchProjection = defaultSearchProjectionRegistry.getProvider('evaluation_objective');
    assert(evalObjSearchProjection === undefined, 'Step 24b: Evaluation objectives have ZERO search projections registered');

    // 25. Verify AI context does not expose Evaluation or restricted Medical data
    const tacticalAIContext = await aiContextService.buildCatchMeUpContext(tacticalUser, testEvent.id, 'TODAY');
    const hasLeakedEval = tacticalAIContext.items.some((item) => item.category === 'EVALUATION');
    const hasLeakedMed = tacticalAIContext.items.some((item) => item.category === 'MEDICAL');
    assert(!hasLeakedEval, 'Step 25a: AI Catch Me Up context for Tactical participant contains ZERO evaluation records');
    assert(!hasLeakedMed, 'Step 25b: AI Catch Me Up context for Tactical participant contains ZERO restricted medical clinical records');

    console.log('\n================================================================');
    if (allPassed) {
      console.log('🎉 ALL 26 VERIFICATION STEPS PASSED SUCCESSFULLY!');
    } else {
      console.error('❌ ONE OR MORE VERIFICATION STEPS FAILED');
      process.exitCode = 1;
    }
    console.log('================================================================\n');
  } catch (err) {
    console.error('Fatal verification error:', err);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

runPhase2Step4Verification();
