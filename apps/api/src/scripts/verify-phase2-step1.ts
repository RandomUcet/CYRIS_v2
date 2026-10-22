import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { DatabaseService } from '../modules/database/database.service.js';
import { EventsService } from '../modules/events/events.service.js';
import { WorkspaceResolverService } from '../modules/events/workspace-resolver.service.js';
import { AuthorizationService } from '../modules/authorization/authorization.service.js';
import {
  events,
  users,
  eventMemberships,
  organizationalUnits,
  membershipUnitAssignments,
  unitCapabilities,
  roles,
  rolePermissions,
  roleAssignments,
  MembershipStatus,
} from '@cyris/db';
import { Permissions, PermissionScopes, generateId } from '@cyris/shared';
import { UnitCapabilityKeys } from '@cyris/contracts';
import { eq, and } from 'drizzle-orm';
import type { AuthenticatedUser } from '../modules/auth/session.service.js';

async function runPhase2Step1Verification() {
  console.log('================================================================');
  console.log('CYRIS v2 — PHASE 2 / STEP 1 Verification Suite');
  console.log('Operational Workspace Architecture & Capability Resolution');
  console.log('================================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const dbService = app.get(DatabaseService);
  const eventsService = app.get(EventsService);
  const workspaceResolver = app.get(WorkspaceResolverService);
  const authzService = app.get(AuthorizationService);

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
    // 1. Get or create test Event
    console.log('1. Event & Test Setup:');
    let [testEvent] = await db
      .select()
      .from(events)
      .where(eq(events.slug, 'czech-cybertron-2027'))
      .limit(1);

    if (!testEvent) {
      const [created] = await db
        .insert(events)
        .values({
          name: 'Czech Cybertron 2027',
          slug: 'czech-cybertron-2027',
          description: 'National Cyber Security Operational Exercise',
          status: 'ACTIVE',
        })
        .returning();
      testEvent = created!;
    }
    assert(Boolean(testEvent), `Test event active: ${testEvent.name} (${testEvent.id})`);

    // 2. Create or find Investigation Unit and Chemical Laboratory Unit
    console.log('\n2. Organizational Units & Capabilities Assignment:');
    let [investigationUnit] = await db
      .select()
      .from(organizationalUnits)
      .where(
        and(
          eq(organizationalUnits.eventId, testEvent.id),
          eq(organizationalUnits.slug, 'investigation')
        )
      )
      .limit(1);

    if (!investigationUnit) {
      const [u] = await db
        .insert(organizationalUnits)
        .values({
          eventId: testEvent.id,
          name: 'Investigation Division',
          slug: 'investigation',
          kind: 'department',
          description: 'Criminal and cyber incident investigation',
        })
        .returning();
      investigationUnit = u!;
    }

    let [chemicalLabUnit] = await db
      .select()
      .from(organizationalUnits)
      .where(
        and(
          eq(organizationalUnits.eventId, testEvent.id),
          eq(organizationalUnits.slug, 'chemical-lab')
        )
      )
      .limit(1);

    if (!chemicalLabUnit) {
      const [u] = await db
        .insert(organizationalUnits)
        .values({
          eventId: testEvent.id,
          name: 'Chemical Laboratory',
          slug: 'chemical-lab',
          kind: 'laboratory',
          description: 'Specialist chemical, hazardous material, and toxicological analysis',
        })
        .returning();
      chemicalLabUnit = u!;
    }

    // Assign capabilities to Investigation
    await eventsService.setUnitCapabilities(testEvent.id, investigationUnit.id, [
      UnitCapabilityKeys.INVESTIGATION,
      UnitCapabilityKeys.INCIDENT_OPERATIONS,
      UnitCapabilityKeys.EVIDENCE,
    ]);

    const invCaps = await eventsService.getUnitCapabilities(testEvent.id, investigationUnit.id);
    assert(
      invCaps.length === 3 && invCaps.some((c) => c.capabilityKey === UnitCapabilityKeys.INVESTIGATION),
      'Investigation unit assigned capabilities: [investigation, incident_operations, evidence]'
    );

    // Assign capabilities to Chemical Laboratory
    await eventsService.setUnitCapabilities(testEvent.id, chemicalLabUnit.id, [
      UnitCapabilityKeys.CHEMICAL_ANALYSIS,
      UnitCapabilityKeys.EVIDENCE,
    ]);

    const labCaps = await eventsService.getUnitCapabilities(testEvent.id, chemicalLabUnit.id);
    assert(
      labCaps.length === 2 &&
        labCaps.some((c) => c.capabilityKey === UnitCapabilityKeys.CHEMICAL_ANALYSIS) &&
        !labCaps.some((c) => c.capabilityKey === UnitCapabilityKeys.INVESTIGATION),
      'Chemical Laboratory assigned capabilities: [chemical_analysis, evidence] (no investigation)'
    );

    // 3. Create test users:
    // User A: Investigator
    // User B: Chemical Lab Analyst
    // User C: Platform Administrator
    console.log('\n3. Operator Memberships and Role Authorizations:');

    // Investigator User
    let [invUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, 'investigator@cybertron.cz'))
      .limit(1);
    if (!invUser) {
      const [u] = await db
        .insert(users)
        .values({
          email: 'investigator@cybertron.cz',
          displayName: 'Capt. Josef Novák',
          status: 'ACTIVE',
        })
        .returning();
      invUser = u!;
    }

    // Investigator Membership
    let [invMembership] = await db
      .select()
      .from(eventMemberships)
      .where(
        and(
          eq(eventMemberships.eventId, testEvent.id),
          eq(eventMemberships.userId, invUser.id)
        )
      )
      .limit(1);
    if (!invMembership) {
      const [m] = await db
        .insert(eventMemberships)
        .values({
          eventId: testEvent.id,
          userId: invUser.id,
          status: MembershipStatus.ACTIVE,
        })
        .returning();
      invMembership = m!;
    }

    // Assign Investigator to Investigation Unit
    await db
      .insert(membershipUnitAssignments)
      .values({
        membershipId: invMembership.id,
        unitId: investigationUnit.id,
      })
      .onConflictDoNothing();

    // Grant Investigator role with case.read, incident.read, evidence.read
    let [invRole] = await db
      .select()
      .from(roles)
      .where(and(eq(roles.eventId, testEvent.id), eq(roles.slug, 'investigator')))
      .limit(1);
    if (!invRole) {
      const [r] = await db
        .insert(roles)
        .values({
          eventId: testEvent.id,
          name: 'Investigator',
          slug: 'investigator',
        })
        .returning();
      invRole = r!;

      await db.insert(rolePermissions).values([
        { roleId: invRole.id, permissionKey: Permissions.CASE_READ, scope: PermissionScopes.EVENT },
        { roleId: invRole.id, permissionKey: Permissions.INCIDENT_READ, scope: PermissionScopes.EVENT },
        { roleId: invRole.id, permissionKey: Permissions.EVIDENCE_READ, scope: PermissionScopes.EVENT },
        { roleId: invRole.id, permissionKey: Permissions.REGISTRY_READ, scope: PermissionScopes.EVENT },
      ]);
    }

    await db
      .insert(roleAssignments)
      .values({
        roleId: invRole.id,
        membershipId: invMembership.id,
      })
      .onConflictDoNothing();

    // Lab Analyst User
    let [labUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, 'chemist@cybertron.cz'))
      .limit(1);
    if (!labUser) {
      const [u] = await db
        .insert(users)
        .values({
          email: 'chemist@cybertron.cz',
          displayName: 'Dr. Marie Svobodová',
          status: 'ACTIVE',
        })
        .returning();
      labUser = u!;
    }

    let [labMembership] = await db
      .select()
      .from(eventMemberships)
      .where(
        and(
          eq(eventMemberships.eventId, testEvent.id),
          eq(eventMemberships.userId, labUser.id)
        )
      )
      .limit(1);
    if (!labMembership) {
      const [m] = await db
        .insert(eventMemberships)
        .values({
          eventId: testEvent.id,
          userId: labUser.id,
          status: MembershipStatus.ACTIVE,
        })
        .returning();
      labMembership = m!;
    }

    // Assign Lab Analyst to Chemical Lab Unit
    await db
      .insert(membershipUnitAssignments)
      .values({
        membershipId: labMembership.id,
        unitId: chemicalLabUnit.id,
      })
      .onConflictDoNothing();

    // Grant Lab role with evidence.read
    let [labRole] = await db
      .select()
      .from(roles)
      .where(and(eq(roles.eventId, testEvent.id), eq(roles.slug, 'lab-analyst')))
      .limit(1);
    if (!labRole) {
      const [r] = await db
        .insert(roles)
        .values({
          eventId: testEvent.id,
          name: 'Laboratory Analyst',
          slug: 'lab-analyst',
        })
        .returning();
      labRole = r!;

      await db.insert(rolePermissions).values([
        { roleId: labRole.id, permissionKey: Permissions.EVIDENCE_READ, scope: PermissionScopes.EVENT },
      ]);
    }

    await db
      .insert(roleAssignments)
      .values({
        roleId: labRole.id,
        membershipId: labMembership.id,
      })
      .onConflictDoNothing();

    // Platform Administrator User
    let [adminUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, 'admin@cybertron.cz'))
      .limit(1);
    if (!adminUser) {
      const [u] = await db
        .insert(users)
        .values({
          email: 'admin@cybertron.cz',
          displayName: 'Platform Admin',
          status: 'ACTIVE',
        })
        .returning();
      adminUser = u!;
    }

    // Ensure Admin has PLATFORM_MANAGE
    let [adminPlatformRole] = await db
      .select()
      .from(roles)
      .where(and(eq(roles.slug, 'platform-admin')))
      .limit(1);
    if (!adminPlatformRole) {
      const [r] = await db
        .insert(roles)
        .values({
          name: 'Platform Administrator',
          slug: 'platform-admin',
        })
        .returning();
      adminPlatformRole = r!;

      await db.insert(rolePermissions).values([
        { roleId: adminPlatformRole.id, permissionKey: Permissions.PLATFORM_MANAGE, scope: PermissionScopes.PLATFORM },
      ]);
    }

    await db
      .insert(roleAssignments)
      .values({
        roleId: adminPlatformRole.id,
        userId: adminUser.id,
      })
      .onConflictDoNothing();

    assert(true, 'Test operators and role assignments configured');

    // 4. Test Workspace Resolution for Investigator
    console.log('\n4. Workspace Resolution Verification:');

    const authInvUser: AuthenticatedUser = {
      id: invUser.id,
      email: invUser.email,
      displayName: invUser.displayName,
      status: invUser.status,
    };

    const invWorkspace = await workspaceResolver.resolveWorkspace(authInvUser, testEvent.id);
    console.log('   Investigator Workspace Sections:', invWorkspace.sections.map((s) => s.title));

    assert(
      invWorkspace.capabilities.includes(UnitCapabilityKeys.INVESTIGATION),
      'Investigator workspace contains investigation capability'
    );
    assert(
      !invWorkspace.capabilities.includes(UnitCapabilityKeys.CHEMICAL_ANALYSIS),
      'Investigator workspace DOES NOT contain chemical_analysis capability'
    );
    assert(
      invWorkspace.sections.some((s) => s.title === 'Investigation'),
      'Investigator workspace contains Investigation section'
    );
    assert(
      !invWorkspace.sections.some((s) => s.title === 'Analysis'),
      'Investigator workspace DOES NOT contain Analysis section'
    );
    assert(
      !invWorkspace.sections.some((s) => s.title === 'Administration'),
      'Investigator workspace DOES NOT contain Administration section'
    );

    // 5. Test Workspace Resolution for Chemical Lab Analyst
    const authLabUser: AuthenticatedUser = {
      id: labUser.id,
      email: labUser.email,
      displayName: labUser.displayName,
      status: labUser.status,
    };

    const labWorkspace = await workspaceResolver.resolveWorkspace(authLabUser, testEvent.id);
    console.log('   Chemical Lab Workspace Sections:', labWorkspace.sections.map((s) => s.title));

    assert(
      labWorkspace.capabilities.includes(UnitCapabilityKeys.CHEMICAL_ANALYSIS),
      'Chemical Lab workspace contains chemical_analysis capability'
    );
    assert(
      !labWorkspace.capabilities.includes(UnitCapabilityKeys.INVESTIGATION),
      'Chemical Lab workspace DOES NOT contain investigation capability'
    );
    assert(
      labWorkspace.sections.some((s) => s.title === 'Analysis'),
      'Chemical Lab workspace contains Analysis section (Work Queue, Chemical Analysis)'
    );
    assert(
      !labWorkspace.sections.some((s) => s.title === 'Investigation'),
      'Chemical Lab workspace DOES NOT contain Investigation section'
    );
    assert(
      labWorkspace.sections.some((s) => s.title === 'Evidence'),
      'Chemical Lab workspace shares platform Evidence capability'
    );
    assert(
      !labWorkspace.sections.some((s) => s.title === 'Administration'),
      'Chemical Lab operator does not see Administration section'
    );

    // 6. Test Workspace Resolution for Platform Administrator
    const authAdminUser: AuthenticatedUser = {
      id: adminUser.id,
      email: adminUser.email,
      displayName: adminUser.displayName,
      status: adminUser.status,
    };

    const adminWorkspace = await workspaceResolver.resolveWorkspace(authAdminUser, testEvent.id);
    console.log('   Platform Admin Workspace Sections:', adminWorkspace.sections.map((s) => s.title));

    assert(
      adminWorkspace.sections.some((s) => s.title === 'Administration'),
      'Platform Admin workspace contains Administration section'
    );
    assert(
      adminWorkspace.sections.some((s) => s.title === 'Investigation'),
      'Platform Admin workspace contains Investigation section'
    );
    assert(
      adminWorkspace.sections.some((s) => s.title === 'Analysis'),
      'Platform Admin workspace contains Analysis section'
    );

    // 7. Test Permission Authority: Capability DOES NOT grant permissions
    console.log('\n5. Permission Authority Enforcement (Capability != Permission):');

    // Chemical Lab operator has chemical_analysis capability, but does NOT have case.update or unit.manage
    const canLabUpdateCase = await authzService.authorize({
      user: authLabUser,
      permission: Permissions.CASE_UPDATE,
      context: { eventId: testEvent.id },
    });
    assert(
      !canLabUpdateCase,
      'Chemical Lab operator cannot update cases (capability chemical_analysis does NOT grant case.update)'
    );

    const canLabManageUnits = await authzService.authorize({
      user: authLabUser,
      permission: Permissions.UNIT_MANAGE,
      context: { eventId: testEvent.id },
    });
    assert(
      !canLabManageUnits,
      'Chemical Lab operator cannot manage units (capability does NOT grant unit.manage)'
    );

    // Investigator operator has investigation capability, but does NOT have unit.manage
    const canInvManageUnits = await authzService.authorize({
      user: authInvUser,
      permission: Permissions.UNIT_MANAGE,
      context: { eventId: testEvent.id },
    });
    assert(
      !canInvManageUnits,
      'Investigator cannot manage units without unit.manage permission'
    );

    // Platform admin has full authority
    const canAdminManageUnits = await authzService.authorize({
      user: authAdminUser,
      permission: Permissions.UNIT_MANAGE,
      context: { eventId: testEvent.id },
    });
    assert(
      canAdminManageUnits,
      'Platform Administrator retains full authority via PLATFORM_MANAGE'
    );

    console.log('\n================================================================');
    if (allPassed) {
      console.log('✓ ALL PHASE 2 / STEP 1 VERIFICATION CHECKS PASSED');
    } else {
      console.error('✗ SOME VERIFICATION CHECKS FAILED');
    }
    console.log('================================================================');
  } catch (err) {
    console.error('Verification error:', err);
    allPassed = false;
  } finally {
    await app.close();
  }

  process.exit(allPassed ? 0 : 1);
}

void runPhase2Step1Verification();
