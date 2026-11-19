import { Injectable, Logger } from '@nestjs/common';
import { eq, and, lte, inArray } from 'drizzle-orm';
import {
  getDbClient,
  type CyrisDb,
  scenarioInjects,
  scenarioInjectTargets,
  scenarioInjectActions,
  scenarioInjectReleases,
  scenarioDeliveries,
  scenarioInjectDependencies,
  scenarioInjectConditions,
  cases,
  incidents,
  evidence,
  labAnalyses,
  operationalTasks,
  recoveryObjectives,
  resources,
  resourceAccessControl,
  auditEvents,
  activityEvents,
  outboxEvents,
  AuditActorType,
  AuditOutcome,
  ActivityVisibility,
  OutboxStatus,
} from '@cyris/db';
import { generateId } from '@cyris/shared';
import { loadConfig } from '@cyris/config';

@Injectable()
export class ScenarioSchedulerWorkerService {
  private readonly logger = new Logger('Worker-ScenarioScheduler');
  private db: CyrisDb;
  private isProcessing = false;

  constructor() {
    const config = loadConfig();
    this.db = getDbClient({ url: config.DATABASE_URL });
  }

  /**
   * Main scheduling & reconciliation tick executed inside the Worker background process.
   */
  async tick(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // 1. Process Due Scheduled Injects
      const now = new Date();
      const dueInjects = await this.db
        .select({
          id: scenarioInjects.id,
          eventId: scenarioInjects.eventId,
          injectNumber: scenarioInjects.injectNumber,
        })
        .from(scenarioInjects)
        .where(
          and(
            eq(scenarioInjects.status, 'SCHEDULED'),
            lte(scenarioInjects.scheduledAt, now)
          )
        );

      for (const due of dueInjects) {
        this.logger.log(`Worker processing scheduled release for inject ${due.injectNumber} (${due.id})`);
        try {
          await this.executeRelease(due.eventId, due.id, 'AUTO');
        } catch (err) {
          this.logger.error(`Worker error releasing scheduled inject ${due.injectNumber}: ${(err as Error).message}`);
        }
      }

      // 2. Condition Reconciliation Scan (evaluates BLOCKED condition injects)
      await this.evaluateAllBlockedInjects();
    } catch (err) {
      this.logger.error(`Worker Scenario Scheduler tick error: ${(err as Error).message}`);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Atomic, idempotent release transaction executed by background worker.
   */
  async executeRelease(
    eventId: string,
    injectId: string,
    releaseType: 'MANUAL' | 'AUTO' | 'OVERRIDE' = 'AUTO'
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      // 1. Lock row FOR UPDATE
      const [inject] = await tx
        .select()
        .from(scenarioInjects)
        .where(and(eq(scenarioInjects.eventId, eventId), eq(scenarioInjects.id, injectId)))
        .for('update');

      if (!inject) return;

      // 2. Idempotency Check: if already RELEASED, skip
      if (inject.status === 'RELEASED') {
        this.logger.log(`Inject ${inject.injectNumber} already released. Skipping.`);
        return;
      }

      if (inject.status === 'CANCELLED') return;

      const releaseId = generateId();
      const now = new Date();

      // 3. Targets and Actions
      const targets = await tx
        .select()
        .from(scenarioInjectTargets)
        .where(eq(scenarioInjectTargets.injectId, injectId));

      const actions = await tx
        .select()
        .from(scenarioInjectActions)
        .where(eq(scenarioInjectActions.injectId, injectId));

      // 4. Release snapshot
      await tx.insert(scenarioInjectReleases).values({
        id: releaseId,
        eventId,
        injectId,
        releaseType,
        overrideReason: null,
        participantTitle: inject.participantTitle ?? inject.title,
        participantContent: inject.participantContent ?? null,
        audienceSnapshot: targets.map((t) => ({
          targetType: t.targetType,
          targetUnitId: t.targetUnitId,
          targetUserId: t.targetUserId,
        })),
        actionsSnapshot: actions.map((a) => ({
          actionType: a.actionType,
          resourceId: a.resourceId,
          targetType: a.targetType,
          targetUnitId: a.targetUnitId,
          targetUserId: a.targetUserId,
          newVisibility: a.newVisibility,
          parameters: a.parameters,
        })),
        releasedByUserId: null,
        releasedAt: now,
      });

      // 5. Deliveries
      let deliveriesCount = 0;
      if (targets.length === 0) {
        await tx.insert(scenarioDeliveries).values({
          id: generateId(),
          eventId,
          releaseId,
          injectId,
          recipientUserId: null,
          targetUnitId: null,
          deliveredAt: now,
        });
        deliveriesCount++;
      } else {
        for (const target of targets) {
          await tx.insert(scenarioDeliveries).values({
            id: generateId(),
            eventId,
            releaseId,
            injectId,
            recipientUserId: target.targetType === 'USER' ? target.targetUserId : null,
            targetUnitId: target.targetType === 'UNIT' ? target.targetUnitId : null,
            deliveredAt: now,
          });
          deliveriesCount++;
        }
      }

      // 6. Resource disclosure
      let disclosedCount = 0;
      for (const action of actions) {
        if (!action.resourceId) continue;

        if (action.actionType === 'GRANT_RESOURCE_ACCESS') {
          const principalType = action.targetType === 'USER' ? 'USER' : 'UNIT';
          const principalId = action.targetType === 'USER' ? action.targetUserId : action.targetUnitId;
          if (principalId) {
            await tx
              .insert(resourceAccessControl)
              .values({
                id: generateId(),
                resourceId: action.resourceId,
                principalType,
                principalId,
                grantedByUserId: null,
                grantedAt: now,
              })
              .onConflictDoNothing();
            disclosedCount++;
          }
        } else if (action.actionType === 'CHANGE_RESOURCE_VISIBILITY' && action.newVisibility) {
          await tx
            .update(resources)
            .set({ visibility: action.newVisibility, updatedAt: now })
            .where(eq(resources.id, action.resourceId));
          disclosedCount++;
        }
      }

      // 7. Update inject status
      await tx
        .update(scenarioInjects)
        .set({
          status: 'RELEASED',
          releasedAt: now,
          updatedAt: now,
        })
        .where(eq(scenarioInjects.id, injectId));

      // 8. Audit event
      await tx.insert(auditEvents).values({
        id: generateId(),
        occurredAt: now,
        actorUserId: null,
        actorType: AuditActorType.SYSTEM,
        eventId,
        action: 'scenario.inject.released',
        category: 'scenario',
        resourceType: 'scenario_inject',
        resourceId: injectId,
        outcome: AuditOutcome.SUCCESS,
        metadata: {
          injectNumber: inject.injectNumber,
          releaseType,
          deliveriesCount,
          disclosedResourcesCount: disclosedCount,
          source: 'worker',
        },
      });

      // 9. Activity events
      await tx.insert(activityEvents).values({
        id: generateId(),
        eventId,
        activityType: 'scenario.inject.auto_released',
        title: `Inject Released: ${inject.injectNumber} — ${inject.title}`,
        summary: `Released via auto policy by CYRIS Worker`,
        actorUserId: null,
        visibility: ActivityVisibility.SCENARIO,
        occurredAt: now,
      });

      if (inject.participantTitle) {
        await tx.insert(activityEvents).values({
          id: generateId(),
          eventId,
          activityType: 'briefing.delivered',
          title: inject.participantTitle,
          summary: inject.participantContent?.substring(0, 180) ?? 'New operational briefing released',
          actorUserId: null,
          visibility: ActivityVisibility.EVENT,
          occurredAt: now,
        });
      }

      // 10. Outbox event
      await tx.insert(outboxEvents).values({
        id: generateId(),
        eventType: 'scenario.inject.released',
        status: OutboxStatus.PENDING,
        payload: {
          eventId,
          injectId,
          injectNumber: inject.injectNumber,
          releaseType,
          releasedAt: now.toISOString(),
          source: 'worker',
        },
      });
    });
  }

  /**
   * Evaluates all blocked/scheduled injects conditions.
   */
  async evaluateAllBlockedInjects(eventId?: string): Promise<number> {
    const whereConditions = [inArray(scenarioInjects.status, ['BLOCKED', 'SCHEDULED'])];
    if (eventId) {
      whereConditions.push(eq(scenarioInjects.eventId, eventId));
    }

    const pendingInjects = await this.db
      .select({ id: scenarioInjects.id })
      .from(scenarioInjects)
      .where(and(...whereConditions));

    let evaluatedCount = 0;
    for (const item of pendingInjects) {
      await this.evaluateInject(item.id);
      evaluatedCount++;
    }

    return evaluatedCount;
  }

  async evaluateInject(injectId: string): Promise<boolean> {
    const [inject] = await this.db
      .select()
      .from(scenarioInjects)
      .where(eq(scenarioInjects.id, injectId))
      .limit(1);

    if (!inject || inject.status === 'RELEASED' || inject.status === 'CANCELLED') {
      return false;
    }

    // 1. Dependencies
    const dependencies = await this.db
      .select({
        depId: scenarioInjectDependencies.dependsOnInjectId,
        depStatus: scenarioInjects.status,
      })
      .from(scenarioInjectDependencies)
      .innerJoin(scenarioInjects, eq(scenarioInjectDependencies.dependsOnInjectId, scenarioInjects.id))
      .where(and(eq(scenarioInjectDependencies.injectId, injectId), eq(scenarioInjectDependencies.eventId, inject.eventId)));

    const dependenciesSatisfied = dependencies.every((d) => d.depStatus === 'RELEASED');

    // 2. Conditions
    const conditions = await this.db
      .select()
      .from(scenarioInjectConditions)
      .where(and(eq(scenarioInjectConditions.injectId, injectId), eq(scenarioInjectConditions.eventId, inject.eventId)));

    let satisfiedConditionCount = 0;
    for (const cond of conditions) {
      let isMet = false;
      switch (cond.conditionType) {
        case 'INJECT_RELEASED': {
          if (cond.targetResourceId) {
            const [dep] = await this.db
              .select({ status: scenarioInjects.status })
              .from(scenarioInjects)
              .where(eq(scenarioInjects.id, cond.targetResourceId))
              .limit(1);
            isMet = dep?.status === 'RELEASED';
          }
          break;
        }
        case 'CASE_STATUS': {
          if (cond.targetResourceId || cond.targetIdentifier) {
            const whereClause = cond.targetResourceId
              ? eq(cases.id, cond.targetResourceId)
              : eq(cases.caseNumber, cond.targetIdentifier!);
            const [c] = await this.db.select({ status: cases.status }).from(cases).where(whereClause).limit(1);
            isMet = Boolean(c && c.status === cond.targetStatus);
          }
          break;
        }
        case 'INCIDENT_STATUS': {
          if (cond.targetResourceId || cond.targetIdentifier) {
            const whereClause = cond.targetResourceId
              ? eq(incidents.id, cond.targetResourceId)
              : eq(incidents.incidentNumber, cond.targetIdentifier!);
            const [inc] = await this.db.select({ status: incidents.status }).from(incidents).where(whereClause).limit(1);
            isMet = Boolean(inc && inc.status === cond.targetStatus);
          }
          break;
        }
        case 'EVIDENCE_STATUS': {
          if (cond.targetResourceId || cond.targetIdentifier) {
            const whereClause = cond.targetResourceId
              ? eq(evidence.id, cond.targetResourceId)
              : eq(evidence.evidenceNumber, cond.targetIdentifier!);
            const [e] = await this.db.select({ status: evidence.status }).from(evidence).where(whereClause).limit(1);
            isMet = Boolean(e && e.status === cond.targetStatus);
          }
          break;
        }
        case 'LAB_STATUS': {
          if (cond.targetResourceId || cond.targetIdentifier) {
            const whereClause = cond.targetResourceId
              ? eq(labAnalyses.id, cond.targetResourceId)
              : eq(labAnalyses.analysisNumber, cond.targetIdentifier!);
            const [lab] = await this.db.select({ status: labAnalyses.status }).from(labAnalyses).where(whereClause).limit(1);
            isMet = Boolean(lab && lab.status === cond.targetStatus);
          }
          break;
        }
        case 'TASK_STATUS': {
          if (cond.targetResourceId || cond.targetIdentifier) {
            const whereClause = cond.targetResourceId
              ? eq(operationalTasks.id, cond.targetResourceId)
              : eq(operationalTasks.taskNumber, cond.targetIdentifier!);
            const [task] = await this.db.select({ status: operationalTasks.status }).from(operationalTasks)
              .where(and(whereClause, eq(operationalTasks.eventId, inject.eventId))).limit(1);
            isMet = Boolean(task && task.status === cond.targetStatus);
          }
          break;
        }
        case 'RECOVERY_OBJECTIVE_STATUS': {
          if (cond.targetResourceId || cond.targetIdentifier) {
            const whereClause = cond.targetResourceId
              ? eq(recoveryObjectives.id, cond.targetResourceId)
              : eq(recoveryObjectives.title, cond.targetIdentifier!);
            const [objective] = await this.db.select({ status: recoveryObjectives.status }).from(recoveryObjectives)
              .where(and(whereClause, eq(recoveryObjectives.eventId, inject.eventId))).limit(1);
            isMet = Boolean(objective && objective.status === cond.targetStatus);
          }
          break;
        }
        case 'ACTIVITY_OCCURRED': {
          if (cond.activityType) {
            const whereClause = cond.targetResourceId
              ? and(eq(activityEvents.eventId, inject.eventId), eq(activityEvents.activityType, cond.activityType), eq(activityEvents.resourceId, cond.targetResourceId))
              : and(eq(activityEvents.eventId, inject.eventId), eq(activityEvents.activityType, cond.activityType));
            const [act] = await this.db.select({ id: activityEvents.id }).from(activityEvents).where(whereClause).limit(1);
            isMet = Boolean(act);
          }
          break;
        }
      }

      if (isMet && !cond.isSatisfied) {
        await this.db
          .update(scenarioInjectConditions)
          .set({ isSatisfied: true, satisfiedAt: new Date() })
          .where(eq(scenarioInjectConditions.id, cond.id));
      } else if (!isMet && cond.isSatisfied) {
        await this.db
          .update(scenarioInjectConditions)
          .set({ isSatisfied: false, satisfiedAt: null })
          .where(eq(scenarioInjectConditions.id, cond.id));
      }

      if (isMet) satisfiedConditionCount++;
    }

    let conditionsSatisfied = true;
    if (conditions.length > 0) {
      conditionsSatisfied =
        inject.conditionLogic === 'ANY'
          ? satisfiedConditionCount > 0
          : satisfiedConditionCount === conditions.length;
    }

    const isReady = dependenciesSatisfied && conditionsSatisfied;

    if (isReady && inject.status === 'BLOCKED') {
      await this.db
        .update(scenarioInjects)
        .set({ status: 'READY', updatedAt: new Date() })
        .where(eq(scenarioInjects.id, injectId));

      await this.db.insert(activityEvents).values({
        id: generateId(),
        eventId: inject.eventId,
        activityType: 'scenario.inject.ready',
        title: `Inject Ready: ${inject.injectNumber} — ${inject.title}`,
        summary: `Prerequisites and conditions satisfied for ${inject.injectNumber}`,
        visibility: ActivityVisibility.SCENARIO,
      });

      if (inject.releasePolicy === 'AUTO_RELEASE') {
        this.logger.log(`Worker auto-releasing satisfied inject ${inject.injectNumber} (${inject.id})`);
        try {
          await this.executeRelease(inject.eventId, inject.id, 'AUTO');
        } catch (err) {
          this.logger.error(`Worker failed to auto-release inject ${inject.injectNumber}: ${(err as Error).message}`);
        }
      }
    }

    return isReady;
  }
}
