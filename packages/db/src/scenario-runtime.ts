import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { generateId } from '@cyris/shared';
import type { CyrisDatabase } from './client.js';
import {
  scenarioInjects, scenarioInjectDependencies, scenarioInjectConditions, scenarioInjectTargets,
  scenarioInjectActions, scenarioInjectReleases, scenarioDeliveries, scenarioInjectTranslations,
  scenarioClocks, scenarioPhases, resources, resourceAccessControl, identifierCounters,
  cases, incidents, evidence, labAnalyses, operationalTasks, recoveryObjectives,
  events, eventMemberships, membershipUnitAssignments, organizationalUnits, users, userPreferences,
  activityEvents, auditEvents, outboxEvents, notifications,
} from './schema/index.js';

type Transaction = Parameters<Parameters<CyrisDatabase['transaction']>[0]>[0];
type Executor = CyrisDatabase | Transaction;
type Inject = typeof scenarioInjects.$inferSelect;
type Condition = Pick<typeof scenarioInjectConditions.$inferSelect,
  'conditionType' | 'targetResourceId' | 'targetIdentifier' | 'targetStatus' | 'activityType'>;

export class ScenarioRuntimeError extends Error {
  constructor(readonly code: 'NOT_FOUND' | 'INVALID' | 'CONFLICT', message: string) {
    super(message);
    this.name = 'ScenarioRuntimeError';
  }
}

export function calculateScenarioTime(clock: Partial<typeof scenarioClocks.$inferSelect> | null | undefined, now = new Date()): Date {
  if (clock?.pausedScenarioTime) return clock.pausedScenarioTime;
  if (clock?.mode === 'SCENARIO_TIME' && clock.scenarioBaseTime && clock.realBaseTime) {
    return new Date(clock.scenarioBaseTime.getTime() + (now.getTime() - clock.realBaseTime.getTime()) * (clock.speedMultiplier ?? 1));
  }
  return now;
}

export function scenarioReleaseGate(
  inject: Pick<Inject, 'status' | 'triggerType' | 'releasePolicy' | 'scheduledAt'>,
  releaseType: 'MANUAL' | 'AUTO' | 'OVERRIDE',
  prerequisitesReady: boolean,
  eventStatus: string,
  clock: Partial<typeof scenarioClocks.$inferSelect> | null | undefined,
  now = new Date(),
): string | null {
  if (['CLOSED', 'ARCHIVED'].includes(eventStatus)) return 'The exercise is closed';
  if (inject.status === 'CANCELLED') return 'The inject is cancelled';
  if (releaseType === 'OVERRIDE') return null;
  if (inject.status === 'DRAFT') return 'A draft cannot be released';
  if (!prerequisitesReady) return 'Prerequisites or conditions are not satisfied';
  if (inject.triggerType === 'SCHEDULED_TIME' && (!inject.scheduledAt || inject.scheduledAt > calculateScenarioTime(clock, now))) {
    return 'The scheduled scenario time has not been reached';
  }
  if (releaseType === 'AUTO') {
    if (!['PREPARATION', 'ACTIVE'].includes(eventStatus)) return 'Automatic release is disabled for this exercise state';
    if (clock?.pausedAt || clock?.pausedScenarioTime) return 'The scenario clock is paused';
    if (inject.releasePolicy !== 'AUTO_RELEASE') return 'Manual confirmation is required';
    if (!['CONDITION', 'SCHEDULED_TIME'].includes(inject.triggerType)) return 'This trigger requires an explicit release';
  }
  return null;
}

async function conditionTarget(db: Executor, eventId: string, condition: Condition): Promise<{ status?: string } | undefined> {
  const id = condition.targetResourceId;
  const identifier = condition.targetIdentifier;
  if (!id && !identifier) return undefined;
  if (condition.conditionType === 'INJECT_RELEASED') {
    if (!id) return undefined;
    const [row] = await db.select({ status: scenarioInjects.status }).from(scenarioInjects)
      .where(and(eq(scenarioInjects.id, id), eq(scenarioInjects.eventId, eventId))).limit(1);
    return row;
  }
  if (condition.conditionType === 'TASK_STATUS') {
    const [row] = await db.select({ status: operationalTasks.status }).from(operationalTasks)
      .where(and(eq(operationalTasks.eventId, eventId), id ? eq(operationalTasks.id, id) : eq(operationalTasks.taskNumber, identifier!))).limit(1);
    return row;
  }
  if (condition.conditionType === 'RECOVERY_OBJECTIVE_STATUS') {
    const rows = await db.select({ status: recoveryObjectives.status }).from(recoveryObjectives)
      .where(and(eq(recoveryObjectives.eventId, eventId), id ? eq(recoveryObjectives.id, id) : eq(recoveryObjectives.title, identifier!))).limit(2);
    // Titles are not unique identifiers; never select an arbitrary matching objective.
    return rows.length === 1 ? rows[0] : undefined;
  }
  if (condition.conditionType === 'CASE_STATUS') {
    const [row] = await db.select({ status: cases.status }).from(cases).innerJoin(resources, eq(resources.id, cases.id))
      .where(and(eq(resources.eventId, eventId), id ? eq(cases.id, id) : eq(cases.caseNumber, identifier!))).limit(1);
    return row;
  }
  if (condition.conditionType === 'INCIDENT_STATUS') {
    const [row] = await db.select({ status: incidents.status }).from(incidents).innerJoin(resources, eq(resources.id, incidents.id))
      .where(and(eq(resources.eventId, eventId), id ? eq(incidents.id, id) : eq(incidents.incidentNumber, identifier!))).limit(1);
    return row;
  }
  if (condition.conditionType === 'EVIDENCE_STATUS') {
    const [row] = await db.select({ status: evidence.status }).from(evidence).innerJoin(resources, eq(resources.id, evidence.id))
      .where(and(eq(resources.eventId, eventId), id ? eq(evidence.id, id) : eq(evidence.evidenceNumber, identifier!))).limit(1);
    return row;
  }
  if (condition.conditionType === 'LAB_STATUS') {
    const [row] = await db.select({ status: labAnalyses.status }).from(labAnalyses).innerJoin(resources, eq(resources.id, labAnalyses.id))
      .where(and(eq(resources.eventId, eventId), id ? eq(labAnalyses.id, id) : eq(labAnalyses.analysisNumber, identifier!))).limit(1);
    return row;
  }
  return undefined;
}

export async function evaluateScenarioPrerequisites(db: Executor, inject: Inject): Promise<{ isReady: boolean; blockedReasons: string[] }> {
  const dependencies = await db.select().from(scenarioInjectDependencies)
    .where(and(eq(scenarioInjectDependencies.injectId, inject.id), eq(scenarioInjectDependencies.eventId, inject.eventId)));
  const blockedReasons: string[] = [];
  for (const dependency of dependencies) {
    const [target] = await db.select({ status: scenarioInjects.status }).from(scenarioInjects)
      .where(and(eq(scenarioInjects.id, dependency.dependsOnInjectId), eq(scenarioInjects.eventId, inject.eventId))).limit(1);
    if (target?.status !== 'RELEASED') blockedReasons.push('A prerequisite inject has not been released in this exercise');
  }
  const conditions = await db.select().from(scenarioInjectConditions)
    .where(and(eq(scenarioInjectConditions.injectId, inject.id), eq(scenarioInjectConditions.eventId, inject.eventId)));
  const results: boolean[] = [];
  for (const condition of conditions) {
    let met = false;
    if (condition.conditionType === 'ACTIVITY_OCCURRED' && condition.activityType) {
      const [row] = await db.select({ id: activityEvents.id }).from(activityEvents).where(and(
        eq(activityEvents.eventId, inject.eventId), eq(activityEvents.activityType, condition.activityType),
        condition.targetResourceId ? eq(activityEvents.resourceId, condition.targetResourceId) : undefined,
      )).limit(1);
      met = Boolean(row);
    } else {
      const target = await conditionTarget(db, inject.eventId, condition);
      const expected = condition.conditionType === 'INJECT_RELEASED' ? 'RELEASED' : condition.targetStatus;
      met = Boolean(target && expected && target.status === expected);
    }
    results.push(met);
    if (met !== condition.isSatisfied) await db.update(scenarioInjectConditions)
      .set({ isSatisfied: met, satisfiedAt: met ? new Date() : null })
      .where(eq(scenarioInjectConditions.id, condition.id));
  }
  const conditionsReady = results.length === 0 || (inject.conditionLogic === 'ANY' ? results.some(Boolean) : results.every(Boolean));
  if (!conditionsReady) blockedReasons.push('Scenario conditions are not satisfied');
  return { isReady: blockedReasons.length === 0, blockedReasons };
}

type Target = { targetType: string; targetUnitId?: string | null; targetUserId?: string | null };
type Action = Target & { actionType: string; resourceId?: string | null; newVisibility?: string | null };
export async function validateScenarioReferences(db: Executor, eventId: string, input: {
  phaseId?: string | null;
  targets?: readonly Target[];
  actions?: readonly Action[];
  conditions?: readonly Partial<Condition>[];
}): Promise<void> {
  if (input.phaseId) {
    const [phase] = await db.select({ id: scenarioPhases.id }).from(scenarioPhases)
      .where(and(eq(scenarioPhases.id, input.phaseId), eq(scenarioPhases.eventId, eventId))).limit(1);
    if (!phase) throw new ScenarioRuntimeError('INVALID', 'Scenario phase must belong to this exercise');
  }
  const validateTarget = async (target: Target) => {
    if (target.targetType === 'EVENT') {
      if (target.targetUnitId || target.targetUserId) throw new ScenarioRuntimeError('INVALID', 'Event audience must not specify a unit or user');
    } else if (target.targetType === 'UNIT' && target.targetUnitId && !target.targetUserId) {
      const [unit] = await db.select({ id: organizationalUnits.id }).from(organizationalUnits)
        .where(and(eq(organizationalUnits.id, target.targetUnitId), eq(organizationalUnits.eventId, eventId), isNull(organizationalUnits.archivedAt))).limit(1);
      if (!unit) throw new ScenarioRuntimeError('INVALID', 'Audience unit must be active in this exercise');
    } else if (target.targetType === 'USER' && target.targetUserId && !target.targetUnitId) {
      const [member] = await db.select({ id: eventMemberships.id }).from(eventMemberships)
        .where(and(eq(eventMemberships.eventId, eventId), eq(eventMemberships.userId, target.targetUserId), eq(eventMemberships.status, 'ACTIVE'))).limit(1);
      if (!member) throw new ScenarioRuntimeError('INVALID', 'Audience user must be an active member of this exercise');
    } else throw new ScenarioRuntimeError('INVALID', 'Invalid scenario audience');
  };
  for (const target of input.targets ?? []) await validateTarget(target);
  for (const action of input.actions ?? []) {
    if (action.actionType === 'GRANT_RESOURCE_ACCESS') {
      if (action.targetType === 'EVENT') throw new ScenarioRuntimeError('INVALID', 'Explicit access requires a user or unit');
      await validateTarget(action);
    }
    if (['GRANT_RESOURCE_ACCESS', 'CHANGE_RESOURCE_VISIBILITY'].includes(action.actionType)) {
      if (!action.resourceId) throw new ScenarioRuntimeError('INVALID', 'Disclosure requires a resource');
      const [resource] = await db.select({ id: resources.id }).from(resources)
        .where(and(eq(resources.id, action.resourceId), eq(resources.eventId, eventId))).limit(1);
      if (!resource) throw new ScenarioRuntimeError('INVALID', 'Disclosure resource must belong to this exercise');
    }
    if (action.actionType === 'CHANGE_RESOURCE_VISIBILITY' && !['EVENT', 'RESTRICTED', 'SCENARIO'].includes(action.newVisibility ?? '')) {
      throw new ScenarioRuntimeError('INVALID', 'Visibility must be EVENT, RESTRICTED or SCENARIO');
    }
  }
  for (const inputCondition of input.conditions ?? []) {
    const condition = { targetResourceId: null, targetIdentifier: null, targetStatus: null, activityType: null, ...inputCondition } as Condition;
    if (condition.conditionType === 'ACTIVITY_OCCURRED') {
      if (!condition.activityType) throw new ScenarioRuntimeError('INVALID', 'Activity condition requires an activity type');
      if (condition.targetResourceId) {
        const [resource] = await db.select({ id: resources.id }).from(resources)
          .where(and(eq(resources.id, condition.targetResourceId), eq(resources.eventId, eventId))).limit(1);
        if (!resource) throw new ScenarioRuntimeError('INVALID', 'Activity target must belong to this exercise');
      }
    } else {
      if (condition.conditionType !== 'INJECT_RELEASED' && !condition.targetStatus) throw new ScenarioRuntimeError('INVALID', 'Status condition requires a target status');
      if (condition.targetResourceId && !(await conditionTarget(db, eventId, condition))) throw new ScenarioRuntimeError('INVALID', 'Condition target must match its type and exercise');
      if (!condition.targetResourceId && !condition.targetIdentifier) throw new ScenarioRuntimeError('INVALID', 'Condition requires a target');
      if (condition.conditionType === 'INJECT_RELEASED' && !condition.targetResourceId) throw new ScenarioRuntimeError('INVALID', 'Inject condition requires an inject ID');
    }
  }
}

export interface ScenarioReleaseResult {
  alreadyReleased: boolean; releaseId: string; injectNumber: string; releasedAt: string;
  deliveriesCount: number; disclosedResourcesCount: number; createdIncidentNumber?: string;
}

async function executeLockedRelease(tx: Transaction, inject: Inject, releaseType: 'MANUAL' | 'AUTO' | 'OVERRIDE', userId?: string, overrideReason?: string): Promise<ScenarioReleaseResult> {
  const eventId = inject.eventId;
  const [existing] = await tx.select().from(scenarioInjectReleases).where(eq(scenarioInjectReleases.injectId, inject.id)).limit(1);
  if (existing) {
    const deliveries = await tx.select({ id: scenarioDeliveries.id }).from(scenarioDeliveries).where(eq(scenarioDeliveries.releaseId, existing.id));
    return { alreadyReleased: true, releaseId: existing.id, injectNumber: inject.injectNumber, releasedAt: existing.releasedAt.toISOString(), deliveriesCount: deliveries.length, disclosedResourcesCount: 0 };
  }
  if (inject.status === 'RELEASED') throw new ScenarioRuntimeError('CONFLICT', 'Released inject is missing its immutable snapshot');
  const [event] = await tx.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!event) throw new ScenarioRuntimeError('NOT_FOUND', 'Exercise not found');
  const [clock] = await tx.select().from(scenarioClocks).where(eq(scenarioClocks.eventId, eventId)).limit(1);
  const prerequisites = await evaluateScenarioPrerequisites(tx, inject);
  const gate = scenarioReleaseGate(inject, releaseType, prerequisites.isReady, event.status, clock);
  if (gate) throw new ScenarioRuntimeError('CONFLICT', gate);
  if (releaseType === 'OVERRIDE' && (!userId || !overrideReason || overrideReason.trim().length < 5)) throw new ScenarioRuntimeError('INVALID', 'Override requires an operator and a reason of at least five characters');
  const targets = await tx.select().from(scenarioInjectTargets).where(and(eq(scenarioInjectTargets.injectId, inject.id), eq(scenarioInjectTargets.eventId, eventId)));
  const actions = await tx.select().from(scenarioInjectActions).where(and(eq(scenarioInjectActions.injectId, inject.id), eq(scenarioInjectActions.eventId, eventId)));
  await validateScenarioReferences(tx, eventId, { phaseId: inject.phaseId, targets, actions });
  const now = new Date();
  const releaseId = generateId();
  // Internal titles and controller summaries are never implicit participant content.
  const participantTitle = inject.participantTitle?.trim() || `Briefing ${inject.injectNumber}`;
  await tx.insert(scenarioInjectReleases).values({
    id: releaseId, eventId, injectId: inject.id, releaseType, overrideReason: overrideReason ?? null,
    participantTitle, participantContent: inject.participantContent,
    audienceSnapshot: targets.map(({ targetType, targetUnitId, targetUserId }) => ({ targetType, targetUnitId, targetUserId })),
    actionsSnapshot: actions.map(({ actionType, resourceId, targetType, targetUnitId, targetUserId, newVisibility, parameters }) => ({ actionType, resourceId, targetType, targetUnitId, targetUserId, newVisibility, parameters })),
    releasedByUserId: userId ?? null, releasedAt: now,
  });
  const translations = await tx.select().from(scenarioInjectTranslations).where(eq(scenarioInjectTranslations.injectId, inject.id));
  const members = await tx.select({ userId: users.id, membershipId: eventMemberships.id, locale: userPreferences.locale, channels: userPreferences.notificationChannels })
    .from(eventMemberships).innerJoin(users, eq(users.id, eventMemberships.userId)).leftJoin(userPreferences, eq(userPreferences.userId, users.id))
    .where(and(eq(eventMemberships.eventId, eventId), eq(eventMemberships.status, 'ACTIVE'), eq(users.status, 'ACTIVE')));
  const assignments = members.length ? await tx.select({ membershipId: membershipUnitAssignments.membershipId, unitId: membershipUnitAssignments.unitId })
    .from(membershipUnitAssignments).where(inArray(membershipUnitAssignments.membershipId, members.map(m => m.membershipId))) : [];
  const audience = targets.length ? targets : [{ targetType: 'EVENT', targetUnitId: null, targetUserId: null }];
  const recipients = members.filter(member => audience.some(target => target.targetType === 'EVENT' ||
    target.targetType === 'USER' && target.targetUserId === member.userId ||
    target.targetType === 'UNIT' && assignments.some(a => a.membershipId === member.membershipId && a.unitId === target.targetUnitId)));
  // Each released audience is materialized; joining a team later does not reveal an earlier secret briefing.
  for (const recipient of recipients) {
    const preferredLocale = recipient.locale ?? event.defaultLocale ?? 'en';
    const translation = translations.find(t => t.locale.toLowerCase() === preferredLocale.toLowerCase());
    const title = translation?.participantTitle ?? participantTitle;
    await tx.insert(scenarioDeliveries).values({ id: generateId(), eventId, releaseId, injectId: inject.id, recipientUserId: recipient.userId,
      targetUnitId: null, locale: translation?.locale ?? event.defaultLocale, participantTitle: title,
      participantContent: translation?.participantContent ?? inject.participantContent, deliveredAt: now });
    await tx.insert(activityEvents).values({ eventId, activityType: 'briefing.delivered', title,
      summary: (translation?.participantContent ?? inject.participantContent)?.slice(0, 180),
      actorUserId: userId ?? null, visibility: 'RESTRICTED',
      metadata: { audience: { type: 'USER', id: recipient.userId }, releaseId } });
    const channels = recipient.channels as { inApp?: boolean } | null;
    if (inject.requiresAcknowledgement || channels?.inApp !== false) await tx.insert(notifications).values({
      id: generateId(), userId: recipient.userId, eventId, type: inject.requiresAcknowledgement ? 'BRIEFING_ACK_REQUIRED' : 'BRIEFING_NEW',
      severity: inject.requiresAcknowledgement ? 'ACTION' : 'INFO', templateKey: inject.requiresAcknowledgement ? 'briefing.requiresAcknowledgement' : 'briefing.new',
      templateParams: { injectNumber: inject.injectNumber, title }, actionUrl: `/events/${eventId}/briefings`, sourceEventId: `briefing-delivery-${releaseId}-${recipient.userId}`,
    }).onConflictDoNothing();
  }
  let disclosedResourcesCount = 0;
  let createdIncidentNumber: string | undefined;
  for (const action of actions) {
    if (action.actionType === 'CREATE_INCIDENT') {
      const params = (action.parameters ?? {}) as Record<string, unknown>;
      const maximum = await tx.execute(sql`SELECT COALESCE(MAX(CAST(SUBSTRING(i.incident_number FROM '[0-9]+$') AS INTEGER)), 0) AS m FROM incidents i JOIN resources r ON r.id = i.id WHERE r.event_id = ${eventId}`);
      const next = Number(maximum[0]?.m ?? 0) + 1;
      const [counter] = await tx.insert(identifierCounters).values({ eventId, entityType: 'INC', lastValue: next })
        .onConflictDoUpdate({ target: [identifierCounters.eventId, identifierCounters.entityType], set: { lastValue: sql`GREATEST(${identifierCounters.lastValue} + 1, ${next})` } })
        .returning({ value: identifierCounters.lastValue });
      createdIncidentNumber = `INC-${String(counter!.value).padStart(4, '0')}`;
      const incidentId = generateId();
      const title = typeof params.title === 'string' && params.title.trim() ? params.title.trim() : participantTitle;
      const description = typeof params.description === 'string' ? params.description : inject.participantContent;
      await tx.insert(resources).values({ id: incidentId, eventId, resourceType: 'incident', visibility: 'EVENT', ownerUserId: userId ?? null });
      await tx.insert(incidents).values({ id: incidentId, incidentNumber: createdIncidentNumber, title, description,
        status: 'NEW', priority: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(String(params.priority)) ? String(params.priority) : 'MEDIUM', occurredAt: calculateScenarioTime(clock, now), detectedAt: now });
      await tx.insert(activityEvents).values({ eventId, resourceId: incidentId, activityType: 'incident.created', title: `Created incident ${createdIncidentNumber}: ${title}`, actorUserId: userId ?? null, visibility: 'EVENT' });
      await tx.insert(outboxEvents).values({ eventType: 'search.upsert', payload: { type: 'incident', id: incidentId } });
    } else if (action.actionType === 'GRANT_RESOURCE_ACCESS' && action.resourceId) {
      await tx.insert(resourceAccessControl).values({ resourceId: action.resourceId, principalType: action.targetType === 'USER' ? 'USER' : 'UNIT',
        principalId: (action.targetType === 'USER' ? action.targetUserId : action.targetUnitId)!, grantedByUserId: userId ?? null }).onConflictDoNothing();
      disclosedResourcesCount++;
    } else if (action.actionType === 'CHANGE_RESOURCE_VISIBILITY' && action.resourceId && action.newVisibility) {
      await tx.update(resources).set({ visibility: action.newVisibility, updatedAt: now }).where(and(eq(resources.id, action.resourceId), eq(resources.eventId, eventId)));
      disclosedResourcesCount++;
    }
  }
  await tx.update(scenarioInjects).set({ status: 'RELEASED', releasedAt: now, releasedByUserId: userId ?? null, updatedAt: now }).where(eq(scenarioInjects.id, inject.id));
  const auditId = generateId();
  const auditRow = { id: auditId, occurredAt: now, eventId, actorUserId: userId ?? null, actorType: userId ? 'USER' : 'SYSTEM', action: releaseType === 'OVERRIDE' ? 'scenario.inject.overridden' : 'scenario.inject.released', category: 'scenario', resourceType: 'scenario_inject', resourceId: inject.id,
    metadata: { injectNumber: inject.injectNumber, releaseType, overrideReason: overrideReason ?? null, deliveriesCount: recipients.length, disclosedResourcesCount } };
  await tx.insert(auditEvents).values(auditRow);
  await tx.insert(outboxEvents).values({ eventType: 'audit.archival', payload: { ...auditRow, occurredAt: now.toISOString() } });
  await tx.insert(activityEvents).values({ eventId, activityType: 'scenario.inject.released', title: `Inject Released: ${inject.injectNumber} — ${inject.title}`, actorUserId: userId ?? null, visibility: 'SCENARIO' });
  await tx.insert(outboxEvents).values({ eventType: 'scenario.inject.released', payload: { eventId, injectId: inject.id, injectNumber: inject.injectNumber, releaseType, releasedAt: now.toISOString() } });
  return { alreadyReleased: false, releaseId, injectNumber: inject.injectNumber, releasedAt: now.toISOString(), deliveriesCount: recipients.length, disclosedResourcesCount, createdIncidentNumber };
}

export async function releaseScenarioInject(db: CyrisDatabase, eventId: string, injectId: string, releaseType: 'MANUAL' | 'AUTO' | 'OVERRIDE', userId?: string, reason?: string): Promise<ScenarioReleaseResult> {
  return db.transaction(async tx => {
    const [inject] = await tx.select().from(scenarioInjects).where(and(eq(scenarioInjects.eventId, eventId), eq(scenarioInjects.id, injectId))).for('update');
    if (!inject) throw new ScenarioRuntimeError('NOT_FOUND', 'Scenario inject not found in this exercise');
    return executeLockedRelease(tx, inject, releaseType, userId, reason);
  });
}

export async function reconcileScenarioInject(db: CyrisDatabase, injectId: string): Promise<{ isReady: boolean; blockedReasons: string[] }> {
  return db.transaction(async tx => {
    const [inject] = await tx.select().from(scenarioInjects).where(eq(scenarioInjects.id, injectId)).for('update');
    if (!inject || ['RELEASED', 'CANCELLED', 'DRAFT'].includes(inject.status)) return { isReady: false, blockedReasons: [] };
    const result = await evaluateScenarioPrerequisites(tx, inject);
    const [clock] = await tx.select().from(scenarioClocks).where(eq(scenarioClocks.eventId, inject.eventId)).limit(1);
    const [event] = await tx.select({ status: events.status }).from(events).where(eq(events.id, inject.eventId)).limit(1);
    if (!event || ['CLOSED', 'ARCHIVED'].includes(event.status)) return { isReady: false, blockedReasons: ['The exercise is closed'] };
    const due = inject.triggerType !== 'SCHEDULED_TIME' || Boolean(inject.scheduledAt && inject.scheduledAt <= calculateScenarioTime(clock));
    const status = !result.isReady ? 'BLOCKED' : !due ? 'SCHEDULED' : 'READY';
    if (status !== inject.status) await tx.update(scenarioInjects).set({ status, updatedAt: new Date() }).where(eq(scenarioInjects.id, inject.id));
    if (!scenarioReleaseGate({ ...inject, status }, 'AUTO', result.isReady, event.status, clock)) await executeLockedRelease(tx, { ...inject, status }, 'AUTO');
    return { isReady: result.isReady && due, blockedReasons: due ? result.blockedReasons : [...result.blockedReasons, 'The scheduled scenario time has not been reached'] };
  });
}

export async function reconcileScenario(db: CyrisDatabase, eventId?: string, onError?: (error: unknown, injectId: string) => void): Promise<number> {
  const rows = await db.select({ id: scenarioInjects.id }).from(scenarioInjects)
    .where(and(inArray(scenarioInjects.status, ['READY', 'BLOCKED', 'SCHEDULED']), eventId ? eq(scenarioInjects.eventId, eventId) : undefined));
  for (const row of rows) {
    try { await reconcileScenarioInject(db, row.id); }
    catch (error) { if (!onError) throw error; onError(error, row.id); }
  }
  return rows.length;
}
