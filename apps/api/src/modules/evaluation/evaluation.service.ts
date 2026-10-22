import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { ResourceAccessService } from '../resources/resource-access.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import {
  evaluationObjectives,
  evaluationCriteria,
  evaluationObservations,
  users,
  organizationalUnits,
  scenarioPhases,
  scenarioInjects,
} from '@cyris/db';
import { generateId, Permissions, type PermissionKey } from '@cyris/shared';
import type {
  EvaluationObjectiveItem,
  EvaluationCriterionItem,
  EvaluationObservationItem,
  AfterActionReviewResponse,
  CreateEvaluationObjectiveRequest,
  UpdateEvaluationObjectiveRequest,
  CreateEvaluationCriterionRequest,
  CreateEvaluationObservationRequest,
  UpdateEvaluationObservationRequest,
  LockEvaluationRequest,
  PublishEvaluationRequest,
  EvaluationQueryFilters,
} from '@cyris/contracts';

@Injectable()
export class EvaluationService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly resourceAccessService: ResourceAccessService,
    private readonly authzService: AuthorizationService,
    private readonly auditService: AuditService
  ) {}

  private get db() {
    return this.databaseService.client;
  }

  /**
   * Asserts user has required evaluation permission in the event context.
   * STRICT SEPARATION: Non-evaluators (including Command & Scenario Control) are rejected unless granted.
   */
  private async assertEvaluationPermission(
    user: AuthenticatedUser,
    eventId: string,
    permission: PermissionKey
  ): Promise<void> {
    const allowed = await this.authzService.authorize({
      user,
      permission,
      context: { eventId },
    });

    if (!allowed) {
      throw new ForbiddenException(
        `Forbidden: Missing evaluation authority '${permission}' for event '${eventId}'`
      );
    }
  }

  /**
   * Checks if evaluation for event is locked.
   */
  private async isEventEvaluationLocked(eventId: string): Promise<boolean> {
    const [locked] = await this.db
      .select({ id: evaluationObjectives.id })
      .from(evaluationObjectives)
      .where(
        and(
          eq(evaluationObjectives.eventId, eventId),
          eq(evaluationObjectives.status, 'LOCKED')
        )
      )
      .limit(1);

    return Boolean(locked);
  }

  /**
   * Creates an evaluation objective (benchmark / grading rubric).
   */
  async createObjective(
    eventId: string,
    dto: CreateEvaluationObjectiveRequest,
    user: AuthenticatedUser
  ): Promise<EvaluationObjectiveItem> {
    await this.assertEvaluationPermission(user, eventId, Permissions.EVALUATION_MANAGE);

    if (await this.isEventEvaluationLocked(eventId)) {
      throw new BadRequestException('Evaluation for this event is LOCKED. Objective creation is prohibited.');
    }

    const objId = generateId();
    const now = new Date();

    const [created] = await this.db
      .insert(evaluationObjectives)
      .values({
        id: objId,
        eventId,
        code: dto.code,
        title: dto.title,
        description: dto.description,
        category: dto.category || null,
        scenarioPhaseId: dto.scenarioPhaseId || null,
        scenarioInjectId: dto.scenarioInjectId || null,
        targetUnitId: dto.targetUnitId || null,
        weight: dto.weight || 1,
        status: dto.status || 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await this.auditService.record({
      action: 'evaluation.objective.created',
      category: 'evaluation',
      eventId,
      resourceType: 'evaluation_objective',
      resourceId: objId,
      actorUserId: user.id,
      metadata: { code: dto.code, title: dto.title },
    });

    return this.getObjective(eventId, objId, user);
  }

  /**
   * Updates an evaluation objective.
   */
  async updateObjective(
    eventId: string,
    objectiveId: string,
    dto: UpdateEvaluationObjectiveRequest,
    user: AuthenticatedUser
  ): Promise<EvaluationObjectiveItem> {
    await this.assertEvaluationPermission(user, eventId, Permissions.EVALUATION_MANAGE);

    if (await this.isEventEvaluationLocked(eventId)) {
      throw new BadRequestException('Evaluation for this event is LOCKED. Objective updates are prohibited.');
    }

    const [existing] = await this.db
      .select()
      .from(evaluationObjectives)
      .where(and(eq(evaluationObjectives.id, objectiveId), eq(evaluationObjectives.eventId, eventId)))
      .limit(1);

    if (!existing) {
      throw new NotFoundException(`Objective '${objectiveId}' not found in event '${eventId}'`);
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.title !== undefined) updates.title = dto.title;
    if (dto.description !== undefined) updates.description = dto.description;
    if (dto.category !== undefined) updates.category = dto.category;
    if (dto.weight !== undefined) updates.weight = dto.weight;
    if (dto.status !== undefined) updates.status = dto.status;

    await this.db
      .update(evaluationObjectives)
      .set(updates)
      .where(eq(evaluationObjectives.id, objectiveId));

    await this.auditService.record({
      action: 'evaluation.objective.updated',
      category: 'evaluation',
      eventId,
      resourceType: 'evaluation_objective',
      resourceId: objectiveId,
      actorUserId: user.id,
      metadata: updates,
    });

    return this.getObjective(eventId, objectiveId, user);
  }

  /**
   * Adds an evaluation criterion to an objective.
   */
  async createCriterion(
    eventId: string,
    objectiveId: string,
    dto: CreateEvaluationCriterionRequest,
    user: AuthenticatedUser
  ): Promise<EvaluationCriterionItem> {
    await this.assertEvaluationPermission(user, eventId, Permissions.EVALUATION_MANAGE);

    if (await this.isEventEvaluationLocked(eventId)) {
      throw new BadRequestException('Evaluation for this event is LOCKED. Criterion creation is prohibited.');
    }

    const [objective] = await this.db
      .select()
      .from(evaluationObjectives)
      .where(and(eq(evaluationObjectives.id, objectiveId), eq(evaluationObjectives.eventId, eventId)))
      .limit(1);

    if (!objective) {
      throw new NotFoundException(`Objective '${objectiveId}' not found in event '${eventId}'`);
    }

    const critId = generateId();
    const now = new Date();

    const [created] = await this.db
      .insert(evaluationCriteria)
      .values({
        id: critId,
        objectiveId,
        description: dto.description,
        measurementType: dto.measurementType || 'SCORE',
        maximumScore: dto.maximumScore || null,
        sequence: dto.sequence || 0,
        createdAt: now,
      })
      .returning();

    await this.auditService.record({
      action: 'evaluation.criterion.created',
      category: 'evaluation',
      eventId,
      resourceType: 'evaluation_criterion',
      resourceId: critId,
      actorUserId: user.id,
      metadata: { objectiveId, description: dto.description },
    });

    return {
      id: created!.id,
      objectiveId: created!.objectiveId,
      description: created!.description,
      measurementType: created!.measurementType as any,
      maximumScore: created!.maximumScore,
      sequence: created!.sequence,
      createdAt: created!.createdAt.toISOString(),
    };
  }

  /**
   * Records an evaluator observation note.
   * Can link to objective, criterion, inject, target unit, target user, or system activity event.
   */
  async createObservation(
    eventId: string,
    dto: CreateEvaluationObservationRequest,
    user: AuthenticatedUser
  ): Promise<EvaluationObservationItem> {
    await this.assertEvaluationPermission(user, eventId, Permissions.EVALUATION_OBSERVE);

    if (await this.isEventEvaluationLocked(eventId)) {
      throw new BadRequestException('Evaluation for this event is LOCKED. New observations are prohibited.');
    }

    const obsId = generateId();
    const now = new Date();

    const [created] = await this.db
      .insert(evaluationObservations)
      .values({
        id: obsId,
        eventId,
        observerUserId: user.id,
        observedAt: dto.observedAt ? new Date(dto.observedAt) : now,
        objectiveId: dto.objectiveId || null,
        criterionId: dto.criterionId || null,
        targetUnitId: dto.targetUnitId || null,
        targetUserId: dto.targetUserId || null,
        scenarioInjectId: dto.scenarioInjectId || null,
        relatedResourceId: dto.relatedResourceId || null,
        relatedActivityEventId: dto.relatedActivityEventId || null,
        observationType: dto.observationType || 'NOTE',
        note: dto.note,
        score: dto.score !== undefined ? dto.score : null,
        result: dto.result || null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await this.auditService.record({
      action: 'evaluation.observation.created',
      category: 'evaluation',
      eventId,
      resourceType: 'evaluation_observation',
      resourceId: obsId,
      actorUserId: user.id,
      metadata: {
        observationType: dto.observationType,
        objectiveId: dto.objectiveId,
        criterionId: dto.criterionId,
        targetUnitId: dto.targetUnitId,
      },
    });

    return this.getObservation(eventId, obsId, user);
  }

  /**
   * Updates an existing observation note or score.
   */
  async updateObservation(
    eventId: string,
    observationId: string,
    dto: UpdateEvaluationObservationRequest,
    user: AuthenticatedUser
  ): Promise<EvaluationObservationItem> {
    await this.assertEvaluationPermission(user, eventId, Permissions.EVALUATION_OBSERVE);

    if (await this.isEventEvaluationLocked(eventId)) {
      throw new BadRequestException('Evaluation for this event is LOCKED. Observation edits are prohibited.');
    }

    const [existing] = await this.db
      .select()
      .from(evaluationObservations)
      .where(and(eq(evaluationObservations.id, observationId), eq(evaluationObservations.eventId, eventId)))
      .limit(1);

    if (!existing) {
      throw new NotFoundException(`Observation '${observationId}' not found in event '${eventId}'`);
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.note !== undefined) updates.note = dto.note;
    if (dto.score !== undefined) updates.score = dto.score;
    if (dto.result !== undefined) updates.result = dto.result;

    await this.db
      .update(evaluationObservations)
      .set(updates)
      .where(eq(evaluationObservations.id, observationId));

    await this.auditService.record({
      action: 'evaluation.observation.updated',
      category: 'evaluation',
      eventId,
      resourceType: 'evaluation_observation',
      resourceId: observationId,
      actorUserId: user.id,
      metadata: updates,
    });

    return this.getObservation(eventId, observationId, user);
  }

  /**
   * Locks the evaluation for an exercise.
   * Freezes all objectives, criteria, and observations from further edits.
   */
  async lockEvaluation(
    eventId: string,
    dto: LockEvaluationRequest,
    user: AuthenticatedUser
  ): Promise<{ status: string; message: string }> {
    await this.assertEvaluationPermission(user, eventId, Permissions.EVALUATION_LOCK);

    const now = new Date();
    await this.db
      .update(evaluationObjectives)
      .set({
        status: 'LOCKED',
        updatedAt: now,
      })
      .where(eq(evaluationObjectives.eventId, eventId));

    await this.auditService.record({
      action: 'evaluation.locked',
      category: 'evaluation',
      eventId,
      resourceType: 'evaluation_session',
      resourceId: eventId,
      actorUserId: user.id,
      metadata: { reason: dto.reason },
    });

    return {
      status: 'LOCKED',
      message: `Evaluation for event '${eventId}' has been locked: ${dto.reason}`,
    };
  }

  /**
   * Publishes evaluation results for post-exercise review.
   */
  async publishEvaluation(
    eventId: string,
    dto: PublishEvaluationRequest,
    user: AuthenticatedUser
  ): Promise<{ status: string; message: string }> {
    await this.assertEvaluationPermission(user, eventId, Permissions.EVALUATION_PUBLISH);

    const now = new Date();
    await this.db
      .update(evaluationObjectives)
      .set({
        status: 'PUBLISHED',
        updatedAt: now,
      })
      .where(eq(evaluationObjectives.eventId, eventId));

    await this.auditService.record({
      action: 'evaluation.published',
      category: 'evaluation',
      eventId,
      resourceType: 'evaluation_session',
      resourceId: eventId,
      actorUserId: user.id,
      metadata: { notes: dto.notes },
    });

    return {
      status: 'PUBLISHED',
      message: `Evaluation for event '${eventId}' has been published for After Action Review`,
    };
  }

  /**
   * Compiles After Action Review aggregate report for evaluators/controllers.
   */
  async getAfterActionReview(
    eventId: string,
    user: AuthenticatedUser
  ): Promise<AfterActionReviewResponse> {
    await this.assertEvaluationPermission(user, eventId, Permissions.EVALUATION_READ);

    const objectives = await this.listObjectives(eventId, {}, user);
    const observations = await this.listObservations(eventId, { page: 1, limit: 100 }, user);

    // Aggregate by participating unit
    const unitMap = new Map<string, { unitName: string; count: number; scores: number[] }>();

    for (const obs of observations) {
      if (obs.targetUnitId && obs.targetUnitName) {
        let entry = unitMap.get(obs.targetUnitId);
        if (!entry) {
          entry = { unitName: obs.targetUnitName, count: 0, scores: [] };
          unitMap.set(obs.targetUnitId, entry);
        }
        entry.count++;
        if (obs.score !== null && obs.score !== undefined) {
          entry.scores.push(obs.score);
        }
      }
    }

    const unitSummaries = Array.from(unitMap.entries()).map(([unitId, data]) => ({
      unitId,
      unitName: data.unitName,
      observationsCount: data.count,
      scoresRecorded: data.scores.length,
      averageScore: data.scores.length > 0
        ? Number((data.scores.reduce((a, b) => a + b, 0) / data.scores.length).toFixed(1))
        : null,
    }));

    const isLocked = objectives.some((o) => o.status === 'LOCKED');
    const isPublished = objectives.length > 0 && objectives.every((o) => o.status === 'PUBLISHED');

    return {
      eventId,
      status: isPublished ? 'PUBLISHED' : isLocked ? 'LOCKED' : 'ACTIVE',
      objectivesCount: objectives.length,
      observationsCount: observations.length,
      unitSummaries,
      objectives,
      recentObservations: observations.slice(0, 25),
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Retrieves single objective with criteria.
   */
  async getObjective(
    eventId: string,
    objectiveId: string,
    user: AuthenticatedUser
  ): Promise<EvaluationObjectiveItem> {
    await this.assertEvaluationPermission(user, eventId, Permissions.EVALUATION_READ);

    const [row] = await this.db
      .select({
        obj: evaluationObjectives,
        phase: scenarioPhases,
        inject: scenarioInjects,
        unit: organizationalUnits,
      })
      .from(evaluationObjectives)
      .leftJoin(scenarioPhases, eq(evaluationObjectives.scenarioPhaseId, scenarioPhases.id))
      .leftJoin(scenarioInjects, eq(evaluationObjectives.scenarioInjectId, scenarioInjects.id))
      .leftJoin(organizationalUnits, eq(evaluationObjectives.targetUnitId, organizationalUnits.id))
      .where(and(eq(evaluationObjectives.id, objectiveId), eq(evaluationObjectives.eventId, eventId)))
      .limit(1);

    if (!row) {
      throw new NotFoundException(`Objective '${objectiveId}' not found in event '${eventId}'`);
    }

    const criteriaRows = await this.db
      .select()
      .from(evaluationCriteria)
      .where(eq(evaluationCriteria.objectiveId, objectiveId))
      .orderBy(evaluationCriteria.sequence);

    return {
      id: row.obj.id,
      eventId: row.obj.eventId,
      code: row.obj.code,
      title: row.obj.title,
      description: row.obj.description,
      category: row.obj.category,
      scenarioPhaseId: row.obj.scenarioPhaseId,
      scenarioPhaseTitle: row.phase?.title,
      scenarioInjectId: row.obj.scenarioInjectId,
      scenarioInjectNumber: row.inject?.injectNumber,
      targetUnitId: row.obj.targetUnitId,
      targetUnitName: row.unit?.name,
      weight: row.obj.weight || 1,
      status: row.obj.status as any,
      criteria: criteriaRows.map((c) => ({
        id: c.id,
        objectiveId: c.objectiveId,
        description: c.description,
        measurementType: c.measurementType as any,
        maximumScore: c.maximumScore,
        sequence: c.sequence,
        createdAt: c.createdAt.toISOString(),
      })),
      createdAt: row.obj.createdAt.toISOString(),
      updatedAt: row.obj.updatedAt.toISOString(),
    };
  }

  /**
   * Lists all evaluation objectives for event.
   */
  async listObjectives(
    eventId: string,
    filters: { status?: string },
    user: AuthenticatedUser
  ): Promise<EvaluationObjectiveItem[]> {
    await this.assertEvaluationPermission(user, eventId, Permissions.EVALUATION_READ);

    const whereConditions = [eq(evaluationObjectives.eventId, eventId)];
    if (filters.status) {
      whereConditions.push(eq(evaluationObjectives.status, filters.status));
    }

    const rows = await this.db
      .select({
        obj: evaluationObjectives,
        phase: scenarioPhases,
        inject: scenarioInjects,
        unit: organizationalUnits,
      })
      .from(evaluationObjectives)
      .leftJoin(scenarioPhases, eq(evaluationObjectives.scenarioPhaseId, scenarioPhases.id))
      .leftJoin(scenarioInjects, eq(evaluationObjectives.scenarioInjectId, scenarioInjects.id))
      .leftJoin(organizationalUnits, eq(evaluationObjectives.targetUnitId, organizationalUnits.id))
      .where(and(...whereConditions))
      .orderBy(evaluationObjectives.code);

    const result: EvaluationObjectiveItem[] = [];
    for (const r of rows) {
      const criteriaRows = await this.db
        .select()
        .from(evaluationCriteria)
        .where(eq(evaluationCriteria.objectiveId, r.obj.id))
        .orderBy(evaluationCriteria.sequence);

      result.push({
        id: r.obj.id,
        eventId: r.obj.eventId,
        code: r.obj.code,
        title: r.obj.title,
        description: r.obj.description,
        category: r.obj.category,
        scenarioPhaseId: r.obj.scenarioPhaseId,
        scenarioPhaseTitle: r.phase?.title,
        scenarioInjectId: r.obj.scenarioInjectId,
        scenarioInjectNumber: r.inject?.injectNumber,
        targetUnitId: r.obj.targetUnitId,
        targetUnitName: r.unit?.name,
        weight: r.obj.weight || 1,
        status: r.obj.status as any,
        criteria: criteriaRows.map((c) => ({
          id: c.id,
          objectiveId: c.objectiveId,
          description: c.description,
          measurementType: c.measurementType as any,
          maximumScore: c.maximumScore,
          sequence: c.sequence,
          createdAt: c.createdAt.toISOString(),
        })),
        createdAt: r.obj.createdAt.toISOString(),
        updatedAt: r.obj.updatedAt.toISOString(),
      });
    }

    return result;
  }

  /**
   * Retrieves single observation item.
   */
  async getObservation(
    eventId: string,
    observationId: string,
    user: AuthenticatedUser
  ): Promise<EvaluationObservationItem> {
    await this.assertEvaluationPermission(user, eventId, Permissions.EVALUATION_READ);

    const [row] = await this.db
      .select({
        obs: evaluationObservations,
        observer: users,
        objective: evaluationObjectives,
        criterion: evaluationCriteria,
        targetUnit: organizationalUnits,
        targetUser: users,
        inject: scenarioInjects,
      })
      .from(evaluationObservations)
      .leftJoin(users, eq(evaluationObservations.observerUserId, users.id))
      .leftJoin(evaluationObjectives, eq(evaluationObservations.objectiveId, evaluationObjectives.id))
      .leftJoin(evaluationCriteria, eq(evaluationObservations.criterionId, evaluationCriteria.id))
      .leftJoin(organizationalUnits, eq(evaluationObservations.targetUnitId, organizationalUnits.id))
      .leftJoin(scenarioInjects, eq(evaluationObservations.scenarioInjectId, scenarioInjects.id))
      .where(and(eq(evaluationObservations.id, observationId), eq(evaluationObservations.eventId, eventId)))
      .limit(1);

    if (!row) {
      throw new NotFoundException(`Observation '${observationId}' not found in event '${eventId}'`);
    }

    return {
      id: row.obs.id,
      eventId: row.obs.eventId,
      observerUserId: row.obs.observerUserId,
      observerUserDisplayName: row.observer?.displayName,
      observedAt: row.obs.observedAt.toISOString(),
      objectiveId: row.obs.objectiveId,
      objectiveCode: row.objective?.code,
      objectiveTitle: row.objective?.title,
      criterionId: row.obs.criterionId,
      criterionDescription: row.criterion?.description,
      targetUnitId: row.obs.targetUnitId,
      targetUnitName: row.targetUnit?.name,
      targetUserId: row.obs.targetUserId,
      scenarioInjectId: row.obs.scenarioInjectId,
      scenarioInjectNumber: row.inject?.injectNumber,
      relatedResourceId: row.obs.relatedResourceId,
      relatedActivityEventId: row.obs.relatedActivityEventId,
      observationType: row.obs.observationType as any,
      note: row.obs.note,
      score: row.obs.score,
      result: row.obs.result as any,
      createdAt: row.obs.createdAt.toISOString(),
      updatedAt: row.obs.updatedAt.toISOString(),
    };
  }

  /**
   * Lists observations for event.
   */
  async listObservations(
    eventId: string,
    filters: EvaluationQueryFilters,
    user: AuthenticatedUser
  ): Promise<EvaluationObservationItem[]> {
    await this.assertEvaluationPermission(user, eventId, Permissions.EVALUATION_READ);

    const whereConditions = [eq(evaluationObservations.eventId, eventId)];
    if (filters.objectiveId) {
      whereConditions.push(eq(evaluationObservations.objectiveId, filters.objectiveId));
    }
    if (filters.targetUnitId) {
      whereConditions.push(eq(evaluationObservations.targetUnitId, filters.targetUnitId));
    }
    if (filters.scenarioInjectId) {
      whereConditions.push(eq(evaluationObservations.scenarioInjectId, filters.scenarioInjectId));
    }
    if (filters.observerUserId) {
      whereConditions.push(eq(evaluationObservations.observerUserId, filters.observerUserId));
    }

    const rows = await this.db
      .select({
        obs: evaluationObservations,
        observer: users,
        objective: evaluationObjectives,
        criterion: evaluationCriteria,
        targetUnit: organizationalUnits,
        inject: scenarioInjects,
      })
      .from(evaluationObservations)
      .leftJoin(users, eq(evaluationObservations.observerUserId, users.id))
      .leftJoin(evaluationObjectives, eq(evaluationObservations.objectiveId, evaluationObjectives.id))
      .leftJoin(evaluationCriteria, eq(evaluationObservations.criterionId, evaluationCriteria.id))
      .leftJoin(organizationalUnits, eq(evaluationObservations.targetUnitId, organizationalUnits.id))
      .leftJoin(scenarioInjects, eq(evaluationObservations.scenarioInjectId, scenarioInjects.id))
      .where(and(...whereConditions))
      .orderBy(desc(evaluationObservations.observedAt))
      .limit(filters.limit || 50);

    return rows.map((r) => ({
      id: r.obs.id,
      eventId: r.obs.eventId,
      observerUserId: r.obs.observerUserId,
      observerUserDisplayName: r.observer?.displayName,
      observedAt: r.obs.observedAt.toISOString(),
      objectiveId: r.obs.objectiveId,
      objectiveCode: r.objective?.code,
      objectiveTitle: r.objective?.title,
      criterionId: r.obs.criterionId,
      criterionDescription: r.criterion?.description,
      targetUnitId: r.obs.targetUnitId,
      targetUnitName: r.targetUnit?.name,
      targetUserId: r.obs.targetUserId,
      scenarioInjectId: r.obs.scenarioInjectId,
      scenarioInjectNumber: r.inject?.injectNumber,
      relatedResourceId: r.obs.relatedResourceId,
      relatedActivityEventId: r.obs.relatedActivityEventId,
      observationType: r.obs.observationType as any,
      note: r.obs.note,
      score: r.obs.score,
      result: r.obs.result as any,
      createdAt: r.obs.createdAt.toISOString(),
      updatedAt: r.obs.updatedAt.toISOString(),
    }));
  }
}
