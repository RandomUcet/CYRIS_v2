import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { eq, and, desc, asc, inArray, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import { IdentifierAllocatorService } from '../resources/identifier-allocator.service.js';
import {
  scenarioPhases,
  events,
  validateScenarioReferences,
  scenarioInjects,
  scenarioInjectDependencies,
  scenarioInjectConditions,
  scenarioInjectTargets,
  scenarioInjectActions,
  scenarioInjectReleases,
  scenarioInjectTranslations,
  organizationalUnits,
  users,
  resources,
  activityEvents,
  ActivityVisibility,
} from '@cyris/db';
import { generateId } from '@cyris/shared';
import { ScenarioConditionEvaluatorService } from './scenario-condition-evaluator.service.js';
import { ScenarioClockService } from './scenario-clock.service.js';
import { rethrowScenarioError } from './scenario-release.service.js';
import type {
  CreateScenarioInjectInput,
  UpdateScenarioInjectInput,
  ScenarioInjectResponse,
  ScenarioControlRunSheet,
  AudiencePreviewResponse,
  ScenarioInjectTranslationInput,
  ScenarioInjectTranslationResponse,
} from '@cyris/contracts';

@Injectable()
export class ScenarioInjectsService {
  private readonly logger = new Logger(ScenarioInjectsService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditService: AuditService,
    private readonly identifierAllocator: IdentifierAllocatorService,
    @Inject(forwardRef(() => ScenarioConditionEvaluatorService))
    private readonly conditionEvaluator: ScenarioConditionEvaluatorService,
    private readonly clockService: ScenarioClockService
  ) {}

  private get db() {
    return this.databaseService.client;
  }

  async getControlRunSheet(eventId: string): Promise<ScenarioControlRunSheet> {
    const clock = await this.clockService.getState(eventId);
    // 1. Fetch phases
    const phases = await this.db
      .select()
      .from(scenarioPhases)
      .where(eq(scenarioPhases.eventId, eventId))
      .orderBy(asc(scenarioPhases.sequence), asc(scenarioPhases.createdAt));

    const activePhaseRow = phases.find((p) => p.status === 'ACTIVE') ?? null;
    const activePhase = activePhaseRow
      ? {
          id: activePhaseRow.id,
          eventId: activePhaseRow.eventId,
          code: activePhaseRow.code,
          title: activePhaseRow.title,
          description: activePhaseRow.description,
          sequence: activePhaseRow.sequence,
          status: activePhaseRow.status,
          plannedStartAt: activePhaseRow.plannedStartAt ? activePhaseRow.plannedStartAt.toISOString() : null,
          plannedEndAt: activePhaseRow.plannedEndAt ? activePhaseRow.plannedEndAt.toISOString() : null,
          activatedAt: activePhaseRow.activatedAt ? activePhaseRow.activatedAt.toISOString() : null,
          completedAt: activePhaseRow.completedAt ? activePhaseRow.completedAt.toISOString() : null,
          controllerNotes: activePhaseRow.controllerNotes,
          createdByUserId: activePhaseRow.createdByUserId,
          createdAt: activePhaseRow.createdAt.toISOString(),
          updatedAt: activePhaseRow.updatedAt.toISOString(),
        }
      : null;

    const mappedPhases = phases.map((p) => ({
      id: p.id,
      eventId: p.eventId,
      code: p.code,
      title: p.title,
      description: p.description,
      sequence: p.sequence,
      status: p.status,
      plannedStartAt: p.plannedStartAt ? p.plannedStartAt.toISOString() : null,
      plannedEndAt: p.plannedEndAt ? p.plannedEndAt.toISOString() : null,
      activatedAt: p.activatedAt ? p.activatedAt.toISOString() : null,
      completedAt: p.completedAt ? p.completedAt.toISOString() : null,
      controllerNotes: p.controllerNotes,
      createdByUserId: p.createdByUserId,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }));

    // 2. Fetch all injects
    const injects = (await this.listInjects(eventId))
      .sort((a, b) => {
        if (a.scheduledAt && b.scheduledAt) {
          return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
        }
        if (a.scheduledAt) return -1;
        if (b.scheduledAt) return 1;
        return a.injectNumber.localeCompare(b.injectNumber);
      })
      .map((inject) => ({
        ...inject,
        isDue: Boolean(
          inject.scheduledAt &&
          new Date(inject.scheduledAt).getTime() <= new Date(clock.scenarioTime).getTime() &&
          ['READY', 'SCHEDULED'].includes(inject.status)
        ),
      }));

    const summary = {
      total: injects.length,
      draft: injects.filter((i) => i.status === 'DRAFT').length,
      blocked: injects.filter((i) => i.status === 'BLOCKED').length,
      ready: injects.filter((i) => i.status === 'READY').length,
      scheduled: injects.filter((i) => i.status === 'SCHEDULED').length,
      released: injects.filter((i) => i.status === 'RELEASED').length,
      cancelled: injects.filter((i) => i.status === 'CANCELLED').length,
    };

    return {
      clock,
      activePhase,
      phases: mappedPhases,
      summary,
      injects,
    };
  }

  async listInjects(eventId: string, phaseId?: string): Promise<ScenarioInjectResponse[]> {
    const whereConditions = [eq(scenarioInjects.eventId, eventId)];
    if (phaseId) {
      whereConditions.push(eq(scenarioInjects.phaseId, phaseId));
    }

    const rows = await this.db
      .select({
        inject: scenarioInjects,
        phaseCode: scenarioPhases.code,
        phaseTitle: scenarioPhases.title,
      })
      .from(scenarioInjects)
      .leftJoin(scenarioPhases, eq(scenarioInjects.phaseId, scenarioPhases.id))
      .where(and(...whereConditions))
      .orderBy(asc(scenarioInjects.injectNumber));

    const result: ScenarioInjectResponse[] = [];
    for (const r of rows) {
      const detailed = await this.enrichInject(r.inject, r.phaseTitle ? `${r.phaseCode} — ${r.phaseTitle}` : null);
      result.push(detailed);
    }

    return result;
  }

  async getInject(eventId: string, injectId: string): Promise<ScenarioInjectResponse> {
    const [row] = await this.db
      .select({
        inject: scenarioInjects,
        phaseCode: scenarioPhases.code,
        phaseTitle: scenarioPhases.title,
      })
      .from(scenarioInjects)
      .leftJoin(scenarioPhases, eq(scenarioInjects.phaseId, scenarioPhases.id))
      .where(and(eq(scenarioInjects.eventId, eventId), eq(scenarioInjects.id, injectId)))
      .limit(1);

    if (!row) {
      throw new NotFoundException(`Scenario inject '${injectId}' not found in event '${eventId}'`);
    }

    return await this.enrichInject(row.inject, row.phaseTitle ? `${row.phaseCode} — ${row.phaseTitle}` : null);
  }

  async createInject(
    eventId: string,
    input: CreateScenarioInjectInput,
    userId: string
  ): Promise<ScenarioInjectResponse> {
    const injectId = generateId();
    const injectNumber = await this.identifierAllocator.allocate(eventId, 'scenario_inject', 'INJ');


    let initialStatus: string = 'DRAFT';
    if ((input.triggerType ?? 'MANUAL') === 'MANUAL') {
      initialStatus = (input.dependencies?.length ?? 0) > 0 ? 'BLOCKED' : 'READY';
    } else if (input.triggerType === 'SCHEDULED_TIME') {
      initialStatus = 'SCHEDULED';
    } else if (input.triggerType === 'CONDITION') {
      initialStatus = 'BLOCKED';
    }

    await this.db.transaction(async (tx) => {
      await this.lockScenarioEvent(tx, eventId);
      try { await validateScenarioReferences(tx, eventId, { ...input, actions: input.actions?.map(action => ({ ...action, targetType: action.targetType ?? 'UNIT' })) }); }
      catch (error) { rethrowScenarioError(error); }
      if (input.triggerType === 'SCHEDULED_TIME' && !input.scheduledAt) throw new BadRequestException('Scheduled inject requires a scenario time');
      await this.validateNoCycles(eventId, injectId, [
        ...(input.dependencies ?? []),
        ...(input.conditions ?? []).filter(condition => condition.conditionType === 'INJECT_RELEASED' && condition.targetResourceId).map(condition => condition.targetResourceId!),
      ], tx);
      await tx.insert(scenarioInjects).values({
        id: injectId,
        eventId,
        phaseId: input.phaseId ?? null,
        injectNumber,
        title: input.title,
        controllerSummary: input.controllerSummary,
        participantTitle: input.participantTitle ?? null,
        participantContent: input.participantContent ?? null,
        status: initialStatus,
        priority: input.priority ?? 'NORMAL',
        triggerType: input.triggerType ?? 'MANUAL',
        releasePolicy: input.releasePolicy ?? 'MANUAL_CONFIRMATION',
        conditionLogic: input.conditionLogic ?? 'ALL',
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        requiresAcknowledgement: input.requiresAcknowledgement ?? false,
        controllerNotes: input.controllerNotes ?? null,
        createdByUserId: userId,
      });

      // Insert dependencies
      if (input.dependencies && input.dependencies.length > 0) {
        for (const depId of input.dependencies) {
          await tx.insert(scenarioInjectDependencies).values({
            id: generateId(),
            eventId,
            injectId,
            dependsOnInjectId: depId,
          });
        }
      }

      // Insert conditions
      if (input.conditions && input.conditions.length > 0) {
        for (const cond of input.conditions) {
          await tx.insert(scenarioInjectConditions).values({
            id: generateId(),
            eventId,
            injectId,
            conditionType: cond.conditionType,
            targetResourceId: cond.targetResourceId ?? null,
            targetIdentifier: cond.targetIdentifier ?? null,
            targetStatus: cond.targetStatus ?? null,
            activityType: cond.activityType ?? null,
            expectedValue: cond.expectedValue ?? null,
          });
        }
      }

      // Insert targets
      if (input.targets && input.targets.length > 0) {
        for (const target of input.targets) {
          await tx.insert(scenarioInjectTargets).values({
            id: generateId(),
            eventId,
            injectId,
            targetType: target.targetType,
            targetUnitId: target.targetUnitId ?? null,
            targetUserId: target.targetUserId ?? null,
          });
        }
      }

      // Insert actions
      if (input.actions && input.actions.length > 0) {
        for (const act of input.actions) {
          await tx.insert(scenarioInjectActions).values({
            id: generateId(),
            eventId,
            injectId,
            actionType: act.actionType,
            resourceId: act.resourceId ?? null,
            targetType: act.targetType ?? 'UNIT',
            targetUnitId: act.targetUnitId ?? null,
            targetUserId: act.targetUserId ?? null,
            newVisibility: act.newVisibility ?? null,
            parameters: act.parameters ?? null,
          });
        }
      }
    });

    await this.auditService.record({
      action: 'scenario.inject.created',
      category: 'scenario',
      eventId,
      resourceType: 'scenario_inject',
      resourceId: injectId,
      actorUserId: userId,
      metadata: {
        injectNumber,
        title: input.title,
        triggerType: input.triggerType,
        status: initialStatus,
      },
    });

    // Run initial condition evaluation
    await this.conditionEvaluator.evaluateInject(injectId);

    return this.getInject(eventId, injectId);
  }

  async updateInject(
    eventId: string,
    injectId: string,
    input: UpdateScenarioInjectInput,
    userId: string
  ): Promise<ScenarioInjectResponse> {
    const current = await this.getInject(eventId, injectId);

    if (current.status === 'RELEASED') {
      throw new BadRequestException(`Cannot modify released inject ${current.injectNumber}. Release snapshot is immutable.`);
    }

    await this.db.transaction(async (tx) => {
      await this.lockScenarioEvent(tx, eventId);
      const [locked] = await tx.select().from(scenarioInjects)
        .where(and(eq(scenarioInjects.eventId, eventId), eq(scenarioInjects.id, injectId))).for('update');
      if (!locked || ['RELEASED', 'CANCELLED'].includes(locked.status)) throw new BadRequestException('Released or cancelled injects cannot be modified');
      try { await validateScenarioReferences(tx, eventId, { ...input, actions: input.actions?.map(action => ({ ...action, targetType: action.targetType ?? 'UNIT' })) }); }
      catch (error) { rethrowScenarioError(error); }
      if ((input.triggerType ?? locked.triggerType) === 'SCHEDULED_TIME' && !(input.scheduledAt === undefined ? locked.scheduledAt : input.scheduledAt)) {
        throw new BadRequestException('Scheduled inject requires a scenario time');
      }
      const currentDependencies = await tx.select().from(scenarioInjectDependencies).where(eq(scenarioInjectDependencies.injectId, injectId));
      const currentConditions = await tx.select().from(scenarioInjectConditions).where(eq(scenarioInjectConditions.injectId, injectId));
      await this.validateNoCycles(eventId, injectId, [
        ...(input.dependencies ?? currentDependencies.map(dependency => dependency.dependsOnInjectId)),
        ...(input.conditions ?? currentConditions).filter(condition => condition.conditionType === 'INJECT_RELEASED' && condition.targetResourceId).map(condition => condition.targetResourceId!),
      ], tx);
      const updateData: Record<string, any> = {
        updatedAt: new Date(),
      };

      if (input.phaseId !== undefined) updateData.phaseId = input.phaseId;
      if (input.title !== undefined) updateData.title = input.title;
      if (input.controllerSummary !== undefined) updateData.controllerSummary = input.controllerSummary;
      if (input.participantTitle !== undefined) updateData.participantTitle = input.participantTitle;
      if (input.participantContent !== undefined) updateData.participantContent = input.participantContent;
      if (input.priority !== undefined) updateData.priority = input.priority;
      if (input.triggerType !== undefined) updateData.triggerType = input.triggerType;
      if (input.releasePolicy !== undefined) updateData.releasePolicy = input.releasePolicy;
      if (input.conditionLogic !== undefined) updateData.conditionLogic = input.conditionLogic;
      if (input.scheduledAt !== undefined) {
        updateData.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
      }
      if (input.requiresAcknowledgement !== undefined) {
        updateData.requiresAcknowledgement = input.requiresAcknowledgement;
      }
      if (input.controllerNotes !== undefined) updateData.controllerNotes = input.controllerNotes;

      await tx.update(scenarioInjects).set(updateData).where(eq(scenarioInjects.id, injectId));

      // Replace dependencies if provided
      if (input.dependencies !== undefined) {
        await tx.delete(scenarioInjectDependencies).where(eq(scenarioInjectDependencies.injectId, injectId));
        for (const depId of input.dependencies) {
          await tx.insert(scenarioInjectDependencies).values({
            id: generateId(),
            eventId,
            injectId,
            dependsOnInjectId: depId,
          });
        }
      }

      // Replace conditions if provided
      if (input.conditions !== undefined) {
        await tx.delete(scenarioInjectConditions).where(eq(scenarioInjectConditions.injectId, injectId));
        for (const cond of input.conditions) {
          await tx.insert(scenarioInjectConditions).values({
            id: generateId(),
            eventId,
            injectId,
            conditionType: cond.conditionType,
            targetResourceId: cond.targetResourceId ?? null,
            targetIdentifier: cond.targetIdentifier ?? null,
            targetStatus: cond.targetStatus ?? null,
            activityType: cond.activityType ?? null,
            expectedValue: cond.expectedValue ?? null,
          });
        }
      }

      // Replace targets if provided
      if (input.targets !== undefined) {
        await tx.delete(scenarioInjectTargets).where(eq(scenarioInjectTargets.injectId, injectId));
        for (const target of input.targets) {
          await tx.insert(scenarioInjectTargets).values({
            id: generateId(),
            eventId,
            injectId,
            targetType: target.targetType,
            targetUnitId: target.targetUnitId ?? null,
            targetUserId: target.targetUserId ?? null,
          });
        }
      }

      // Replace actions if provided
      if (input.actions !== undefined) {
        await tx.delete(scenarioInjectActions).where(eq(scenarioInjectActions.injectId, injectId));
        for (const act of input.actions) {
          await tx.insert(scenarioInjectActions).values({
            id: generateId(),
            eventId,
            injectId,
            actionType: act.actionType,
            resourceId: act.resourceId ?? null,
            targetType: act.targetType ?? 'UNIT',
            targetUnitId: act.targetUnitId ?? null,
            targetUserId: act.targetUserId ?? null,
            newVisibility: act.newVisibility ?? null,
            parameters: act.parameters ?? null,
          });
        }
      }
    });

    await this.auditService.record({
      action: 'scenario.inject.updated',
      category: 'scenario',
      eventId,
      resourceType: 'scenario_inject',
      resourceId: injectId,
      actorUserId: userId,
      metadata: {
        injectNumber: current.injectNumber,
        title: input.title ?? current.title,
      },
    });

    // Re-evaluate condition readiness
    await this.conditionEvaluator.evaluateInject(injectId);

    return this.getInject(eventId, injectId);
  }

  async cancelInject(eventId: string, injectId: string, userId: string): Promise<ScenarioInjectResponse> {
    const current = await this.getInject(eventId, injectId);

    if (current.status === 'RELEASED') {
      throw new BadRequestException(`Cannot cancel already RELEASED inject ${current.injectNumber}`);
    }

    await this.db.transaction(async tx => {
      const [locked] = await tx.select({ status: scenarioInjects.status }).from(scenarioInjects)
        .where(and(eq(scenarioInjects.eventId, eventId), eq(scenarioInjects.id, injectId))).for('update');
      if (!locked || locked.status === 'RELEASED') throw new BadRequestException('A released inject cannot be cancelled');
      await tx.update(scenarioInjects).set({ status: 'CANCELLED', cancelledAt: new Date(), updatedAt: new Date() })
        .where(and(eq(scenarioInjects.eventId, eventId), eq(scenarioInjects.id, injectId)));
    });

    await this.auditService.record({
      action: 'scenario.inject.cancelled',
      category: 'scenario',
      eventId,
      resourceType: 'scenario_inject',
      resourceId: injectId,
      actorUserId: userId,
      metadata: { injectNumber: current.injectNumber },
    });

    await this.db.insert(activityEvents).values({
      id: generateId(),
      eventId,
      activityType: 'scenario.inject.cancelled',
      title: `Inject Cancelled: ${current.injectNumber} — ${current.title}`,
      actorUserId: userId,
      visibility: ActivityVisibility.SCENARIO,
    });

    return this.getInject(eventId, injectId);
  }

  async getAudiencePreview(
    eventId: string,
    injectId: string,
    params: { unitId?: string; userId?: string }
  ): Promise<AudiencePreviewResponse> {
    const inject = await this.getInject(eventId, injectId);

    // Target audience description
    let targetDesc = 'Entire Event (All verified participants)';
    if (inject.targets.length > 0) {
      const descriptions = inject.targets.map((t) => {
        if (t.targetType === 'EVENT') return 'All participants';
        if (t.targetType === 'UNIT') return `Unit: ${t.unitName ?? t.targetUnitId}`;
        if (t.targetType === 'USER') return `User: ${t.userFullName ?? t.targetUserId}`;
        return t.targetType;
      });
      targetDesc = descriptions.join(', ');
    }

    const disclosedResources = inject.actions
      .filter((a) => a.resourceId)
      .map((a) => ({
        resourceId: a.resourceId!,
        resourceType: 'resource',
        identifier: a.resourceIdentifier ?? undefined,
        title: a.resourceTitle ?? undefined,
        visibilityAction: a.actionType === 'GRANT_RESOURCE_ACCESS'
          ? `Grant explicit access to ${a.unitName ?? a.userName ?? 'Target Audience'}`
          : `Change visibility to ${a.newVisibility}`,
      }));

    return {
      injectNumber: inject.injectNumber,
      targetAudienceDescription: targetDesc,
      participantTitle: inject.participantTitle?.trim() || `Briefing ${inject.injectNumber}`,
      participantContent: inject.participantContent,
      requiresAcknowledgement: inject.requiresAcknowledgement,
      disclosedResources,
      hiddenControllerMetadata: [
        'Controller Summary & Controller Notes',
        'Trigger conditions & Evaluation status',
        'Prerequisite dependencies',
        'Release policy & Scheduled delivery timestamp',
        'Internal controller authorship and audit history',
      ],
    };
  }

  /**
   * Validates that adding candidate prerequisite dependencies doesn't introduce a cycle.
   * Performs DFS cycle traversal.
   */
  private async lockScenarioEvent(tx: any, eventId: string): Promise<void> {
    // Serialize graph edits without taking a parent-row lock that can deadlock release FK checks.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${eventId}, 0))`);
    const [event] = await tx.select({ id: events.id, status: events.status }).from(events).where(eq(events.id, eventId)).limit(1);
    if (!event) throw new NotFoundException('Exercise not found');
    if (['CLOSED', 'ARCHIVED'].includes(event.status)) throw new BadRequestException('The exercise is closed');
  }

  private async validateNoCycles(eventId: string, currentInjectId: string, candidateDepIds: string[], db: any = this.db): Promise<void> {
    if (candidateDepIds.includes(currentInjectId)) {
      throw new BadRequestException('Inject cannot depend on itself.');
    }
    const candidates = await db
      .select({ id: scenarioInjects.id, eventId: scenarioInjects.eventId })
      .from(scenarioInjects)
      .where(inArray(scenarioInjects.id, candidateDepIds));
    if (candidates.length !== new Set(candidateDepIds).size || candidates.some((candidate: { eventId: string }) => candidate.eventId !== eventId)) {
      throw new BadRequestException('Dependencies must reference injects in the same event.');
    }

    const allDeps = await db
      .select({
        injectId: scenarioInjectDependencies.injectId,
        dependsOnId: scenarioInjectDependencies.dependsOnInjectId,
      })
      .from(scenarioInjectDependencies)
      .where(eq(scenarioInjectDependencies.eventId, eventId));

    const conditionalEdges = await db.select({ injectId: scenarioInjectConditions.injectId, dependsOnId: scenarioInjectConditions.targetResourceId })
      .from(scenarioInjectConditions).where(and(eq(scenarioInjectConditions.eventId, eventId), eq(scenarioInjectConditions.conditionType, 'INJECT_RELEASED')));
    allDeps.push(...conditionalEdges.filter((edge: { dependsOnId: string | null }) => edge.dependsOnId));

    // Build adjacency list: node -> prerequisites
    const adj = new Map<string, string[]>();
    for (const d of allDeps) {
      if (d.injectId === currentInjectId) continue; // replace current inject's outgoing deps
      const list = adj.get(d.injectId) ?? [];
      list.push(d.dependsOnId);
      adj.set(d.injectId, list);
    }
    adj.set(currentInjectId, [...candidateDepIds]);

    // DFS for cycle starting from each candidateDepId
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const hasCycle = (node: string): boolean => {
      visited.add(node);
      recStack.add(node);

      const neighbors = adj.get(node) ?? [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (hasCycle(neighbor)) return true;
        } else if (recStack.has(neighbor)) {
          return true;
        }
      }

      recStack.delete(node);
      return false;
    };

    for (const startNode of adj.keys()) {
      if (!visited.has(startNode)) {
        if (hasCycle(startNode)) {
          throw new BadRequestException('Circular dependency detected between scenario injects.');
        }
      }
    }
  }

  private async enrichInject(
    inj: typeof scenarioInjects.$inferSelect,
    phaseName: string | null
  ): Promise<ScenarioInjectResponse> {
    const dependencies = await this.db
      .select({
        id: scenarioInjectDependencies.id,
        dependsOnInjectId: scenarioInjectDependencies.dependsOnInjectId,
        injectNumber: scenarioInjects.injectNumber,
        title: scenarioInjects.title,
        status: scenarioInjects.status,
      })
      .from(scenarioInjectDependencies)
      .innerJoin(scenarioInjects, eq(scenarioInjectDependencies.dependsOnInjectId, scenarioInjects.id))
      .where(and(eq(scenarioInjectDependencies.injectId, inj.id), eq(scenarioInjectDependencies.eventId, inj.eventId)));

    const conditions = await this.db
      .select()
      .from(scenarioInjectConditions)
      .where(and(eq(scenarioInjectConditions.injectId, inj.id), eq(scenarioInjectConditions.eventId, inj.eventId)));

    const targets = await this.db
      .select({
        id: scenarioInjectTargets.id,
        injectId: scenarioInjectTargets.injectId,
        targetType: scenarioInjectTargets.targetType,
        targetUnitId: scenarioInjectTargets.targetUnitId,
        targetUserId: scenarioInjectTargets.targetUserId,
        unitName: organizationalUnits.name,
        userFullName: users.displayName,
      })
      .from(scenarioInjectTargets)
      .leftJoin(organizationalUnits, eq(scenarioInjectTargets.targetUnitId, organizationalUnits.id))
      .leftJoin(users, eq(scenarioInjectTargets.targetUserId, users.id))
      .where(eq(scenarioInjectTargets.injectId, inj.id));

    const actions = await this.db
      .select({
        id: scenarioInjectActions.id,
        injectId: scenarioInjectActions.injectId,
        actionType: scenarioInjectActions.actionType,
        resourceId: scenarioInjectActions.resourceId,
        targetType: scenarioInjectActions.targetType,
        targetUnitId: scenarioInjectActions.targetUnitId,
        targetUserId: scenarioInjectActions.targetUserId,
        newVisibility: scenarioInjectActions.newVisibility,
        parameters: scenarioInjectActions.parameters,
        unitName: organizationalUnits.name,
        userName: users.displayName,
      })
      .from(scenarioInjectActions)
      .leftJoin(organizationalUnits, eq(scenarioInjectActions.targetUnitId, organizationalUnits.id))
      .leftJoin(users, eq(scenarioInjectActions.targetUserId, users.id))
      .where(eq(scenarioInjectActions.injectId, inj.id));

    // Compute blocked reasons
    const blockedReasons: string[] = [];
    for (const dep of dependencies) {
      if (dep.status !== 'RELEASED') {
        blockedReasons.push(`Prerequisite ${dep.injectNumber} (${dep.status})`);
      }
    }
    for (const cond of conditions) {
      if (!cond.isSatisfied) {
        blockedReasons.push(`${cond.conditionType}: ${cond.targetIdentifier ?? cond.activityType ?? 'unmet'}`);
      }
    }

    // Query translations
    const translations = await this.db
      .select()
      .from(scenarioInjectTranslations)
      .where(eq(scenarioInjectTranslations.injectId, inj.id));

    return {
      id: inj.id,
      eventId: inj.eventId,
      phaseId: inj.phaseId,
      phaseName,
      injectNumber: inj.injectNumber,
      title: inj.title,
      controllerSummary: inj.controllerSummary,
      participantTitle: inj.participantTitle,
      participantContent: inj.participantContent,
      status: inj.status,
      priority: inj.priority,
      triggerType: inj.triggerType,
      releasePolicy: inj.releasePolicy,
      conditionLogic: inj.conditionLogic,
      scheduledAt: inj.scheduledAt ? inj.scheduledAt.toISOString() : null,
      requiresAcknowledgement: inj.requiresAcknowledgement,
      controllerNotes: inj.controllerNotes,
      createdByUserId: inj.createdByUserId,
      releasedAt: inj.releasedAt ? inj.releasedAt.toISOString() : null,
      releasedByUserId: inj.releasedByUserId,
      cancelledAt: inj.cancelledAt ? inj.cancelledAt.toISOString() : null,
      createdAt: inj.createdAt.toISOString(),
      updatedAt: inj.updatedAt.toISOString(),
      translations: translations.map((t) => ({
        id: t.id,
        injectId: t.injectId,
        locale: t.locale,
        participantTitle: t.participantTitle,
        participantContent: t.participantContent,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
      dependencies: dependencies.map((d) => ({
        id: d.id,
        dependsOnInjectId: d.dependsOnInjectId,
        injectNumber: d.injectNumber,
        title: d.title,
        status: d.status,
      })),
      conditions: conditions.map((c) => ({
        id: c.id,
        injectId: c.injectId,
        conditionType: c.conditionType as any,
        targetResourceId: c.targetResourceId,
        targetIdentifier: c.targetIdentifier,
        targetStatus: c.targetStatus,
        activityType: c.activityType,
        expectedValue: (c.expectedValue as Record<string, any>) ?? null,
        isSatisfied: c.isSatisfied,
        satisfiedAt: c.satisfiedAt ? c.satisfiedAt.toISOString() : null,
        label: `${c.conditionType}: ${c.targetIdentifier ?? c.activityType ?? ''} == ${c.targetStatus ?? 'satisfied'}`,
      })),
      targets: targets.map((t) => ({
        id: t.id,
        injectId: t.injectId,
        targetType: t.targetType as any,
        targetUnitId: t.targetUnitId,
        targetUserId: t.targetUserId,
        unitName: t.unitName,
        userFullName: t.userFullName,
      })),
      actions: actions.map((a) => ({
        id: a.id,
        injectId: a.injectId,
        actionType: a.actionType as any,
        resourceId: a.resourceId,
        targetType: a.targetType as any,
        targetUnitId: a.targetUnitId,
        targetUserId: a.targetUserId,
        newVisibility: a.newVisibility,
        parameters: a.parameters as any,
        resourceIdentifier: undefined,
        resourceTitle: undefined,
        unitName: a.unitName,
        userName: a.userName,
      })),
      blockedReasons,
    };
  }

  async addOrUpdateTranslation(
    eventId: string,
    injectId: string,
    input: ScenarioInjectTranslationInput,
    userId: string
  ): Promise<ScenarioInjectTranslationResponse> {
    const [saved] = await this.db.transaction(async tx => {
      const [inject] = await tx.select({ id: scenarioInjects.id, status: scenarioInjects.status }).from(scenarioInjects)
        .where(and(eq(scenarioInjects.eventId, eventId), eq(scenarioInjects.id, injectId))).for('update');
      if (!inject) throw new NotFoundException('Scenario inject not found in this exercise');
      if (['RELEASED', 'CANCELLED'].includes(inject.status)) throw new BadRequestException('Released or cancelled translations cannot be changed');
      const now = new Date();
      return tx.insert(scenarioInjectTranslations).values({ id: generateId(), injectId, locale: input.locale.toLowerCase(),
        participantTitle: input.participantTitle, participantContent: input.participantContent, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({ target: [scenarioInjectTranslations.injectId, scenarioInjectTranslations.locale],
          set: { participantTitle: input.participantTitle, participantContent: input.participantContent, updatedAt: now } }).returning();
    });

    await this.auditService.record({
      action: 'scenario.inject.translation_saved',
      category: 'scenario',
      eventId,
      resourceType: 'scenario_inject',
      resourceId: injectId,
      actorUserId: userId,
      metadata: { locale: input.locale.toLowerCase() },
    });

    return {
      id: saved.id,
      injectId: saved.injectId,
      locale: saved.locale,
      participantTitle: saved.participantTitle,
      participantContent: saved.participantContent,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString(),
    };
  }

  async getTranslations(eventId: string, injectId: string): Promise<ScenarioInjectTranslationResponse[]> {
    const [inject] = await this.db.select({ id: scenarioInjects.id }).from(scenarioInjects)
      .where(and(eq(scenarioInjects.id, injectId), eq(scenarioInjects.eventId, eventId))).limit(1);
    if (!inject) throw new NotFoundException('Scenario inject not found in this exercise');
    const rows = await this.db
      .select()
      .from(scenarioInjectTranslations)
      .where(eq(scenarioInjectTranslations.injectId, injectId));

    return rows.map((r) => ({
      id: r.id,
      injectId: r.injectId,
      locale: r.locale,
      participantTitle: r.participantTitle,
      participantContent: r.participantContent,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }
}
