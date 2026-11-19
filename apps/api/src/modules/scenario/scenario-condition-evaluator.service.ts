import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { eq, and, inArray } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import {
  scenarioInjects,
  scenarioInjectDependencies,
  scenarioInjectConditions,
  cases,
  incidents,
  evidence,
  labAnalyses,
  operationalTasks,
  recoveryObjectives,
  activityEvents,
  ActivityVisibility,
} from '@cyris/db';
import { generateId } from '@cyris/shared';
import { ScenarioReleaseService } from './scenario-release.service.js';

@Injectable()
export class ScenarioConditionEvaluatorService {
  private readonly logger = new Logger(ScenarioConditionEvaluatorService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    @Inject(forwardRef(() => ScenarioReleaseService))
    private readonly releaseService: ScenarioReleaseService
  ) {}

  private get db() {
    return this.databaseService.client;
  }

  /**
   * Evaluates prerequisites and conditions for an inject.
   * If dependencies and conditions are satisfied:
   * - If status is BLOCKED, transitions to READY
   * - If releasePolicy is AUTO_RELEASE, triggers automatic release!
   */
  async evaluateInject(injectId: string, txClient?: any): Promise<{ isReady: boolean; blockedReasons: string[] }> {
    const db = txClient || this.db;

    const [inject] = await db
      .select()
      .from(scenarioInjects)
      .where(eq(scenarioInjects.id, injectId))
      .limit(1);

    if (!inject || inject.status === 'RELEASED' || inject.status === 'CANCELLED') {
      return { isReady: false, blockedReasons: [] };
    }

    const blockedReasons: string[] = [];

    // 1. Evaluate Dependencies (all prerequisite injects must be RELEASED)
    const dependencies = await db
      .select({
        depId: scenarioInjectDependencies.dependsOnInjectId,
        depNumber: scenarioInjects.injectNumber,
        depStatus: scenarioInjects.status,
      })
      .from(scenarioInjectDependencies)
      .innerJoin(scenarioInjects, eq(scenarioInjectDependencies.dependsOnInjectId, scenarioInjects.id))
      .where(and(eq(scenarioInjectDependencies.injectId, injectId), eq(scenarioInjectDependencies.eventId, inject.eventId)));

    for (const dep of dependencies) {
      if (dep.depStatus !== 'RELEASED') {
        blockedReasons.push(`Waiting for prerequisite ${dep.depNumber} to be RELEASED (current: ${dep.depStatus})`);
      }
    }

    // 2. Evaluate Typed Conditions
    const conditions = await db
      .select()
      .from(scenarioInjectConditions)
      .where(eq(scenarioInjectConditions.injectId, injectId));

    let satisfiedConditionCount = 0;

    for (const cond of conditions) {
      let isMet = false;

      switch (cond.conditionType) {
        case 'INJECT_RELEASED': {
          if (cond.targetResourceId) {
            const [dep] = await db
              .select({ status: scenarioInjects.status })
              .from(scenarioInjects)
              .where(and(eq(scenarioInjects.id, cond.targetResourceId), eq(scenarioInjects.eventId, inject.eventId)))
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

            const [c] = await db.select({ status: cases.status }).from(cases).where(whereClause).limit(1);
            isMet = Boolean(c && c.status === cond.targetStatus);
          }
          break;
        }

        case 'INCIDENT_STATUS': {
          if (cond.targetResourceId || cond.targetIdentifier) {
            const whereClause = cond.targetResourceId
              ? eq(incidents.id, cond.targetResourceId)
              : eq(incidents.incidentNumber, cond.targetIdentifier!);

            const [inc] = await db.select({ status: incidents.status }).from(incidents).where(whereClause).limit(1);
            isMet = Boolean(inc && inc.status === cond.targetStatus);
          }
          break;
        }

        case 'EVIDENCE_STATUS': {
          if (cond.targetResourceId || cond.targetIdentifier) {
            const whereClause = cond.targetResourceId
              ? eq(evidence.id, cond.targetResourceId)
              : eq(evidence.evidenceNumber, cond.targetIdentifier!);

            const [e] = await db.select({ status: evidence.status }).from(evidence).where(whereClause).limit(1);
            isMet = Boolean(e && e.status === cond.targetStatus);
          }
          break;
        }

        case 'LAB_STATUS': {
          if (cond.targetResourceId || cond.targetIdentifier) {
            const whereClause = cond.targetResourceId
              ? eq(labAnalyses.id, cond.targetResourceId)
              : eq(labAnalyses.analysisNumber, cond.targetIdentifier!);

            const [lab] = await db.select({ status: labAnalyses.status }).from(labAnalyses).where(whereClause).limit(1);
            isMet = Boolean(lab && lab.status === cond.targetStatus);
          }
          break;
        }

        case 'TASK_STATUS': {
          if (cond.targetResourceId || cond.targetIdentifier) {
            const whereClause = cond.targetResourceId
              ? eq(operationalTasks.id, cond.targetResourceId)
              : eq(operationalTasks.taskNumber, cond.targetIdentifier!);
            const [task] = await db.select({ status: operationalTasks.status }).from(operationalTasks)
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
            const [objective] = await db.select({ status: recoveryObjectives.status }).from(recoveryObjectives)
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

            const [act] = await db.select({ id: activityEvents.id }).from(activityEvents).where(whereClause).limit(1);
            isMet = Boolean(act);
          }
          break;
        }
      }

      if (isMet && !cond.isSatisfied) {
        await db
          .update(scenarioInjectConditions)
          .set({ isSatisfied: true, satisfiedAt: new Date() })
          .where(eq(scenarioInjectConditions.id, cond.id));
      } else if (!isMet && cond.isSatisfied) {
        await db
          .update(scenarioInjectConditions)
          .set({ isSatisfied: false, satisfiedAt: null })
          .where(eq(scenarioInjectConditions.id, cond.id));
      }

      if (isMet) {
        satisfiedConditionCount++;
      } else {
        const condDesc = cond.targetIdentifier ?? cond.activityType ?? cond.conditionType;
        blockedReasons.push(`Condition unmet: ${cond.conditionType} (${condDesc} == ${cond.targetStatus ?? 'present'})`);
      }
    }

    // Evaluate overall condition satisfaction
    let conditionsSatisfied = true;
    if (conditions.length > 0) {
      if (inject.conditionLogic === 'ANY') {
        conditionsSatisfied = satisfiedConditionCount > 0;
      } else {
        // ALL
        conditionsSatisfied = satisfiedConditionCount === conditions.length;
      }
    }

    const dependenciesSatisfied = dependencies.every((d: { depStatus: string }) => d.depStatus === 'RELEASED');
    const isReady = dependenciesSatisfied && conditionsSatisfied;

    if (isReady) {
      if (inject.status === 'BLOCKED') {
        await db
          .update(scenarioInjects)
          .set({ status: 'READY', updatedAt: new Date() })
          .where(eq(scenarioInjects.id, injectId));

        await db.insert(activityEvents).values({
          id: generateId(),
          eventId: inject.eventId,
          activityType: 'scenario.inject.ready',
          title: `Inject Ready: ${inject.injectNumber} — ${inject.title}`,
          summary: `Prerequisites and conditions satisfied for ${inject.injectNumber}`,
          visibility: ActivityVisibility.SCENARIO,
        });

        // Auto release check
        if (inject.releasePolicy === 'AUTO_RELEASE') {
          this.logger.log(`Auto-releasing satisfied inject ${inject.injectNumber} (${inject.id})`);
          try {
            await this.releaseService.executeRelease(inject.eventId, inject.id, 'AUTO');
          } catch (err) {
            this.logger.error(`Failed to auto-release inject ${inject.injectNumber}: ${(err as Error).message}`);
          }
        }
      }
    } else {
      if (inject.status === 'READY') {
        // Regressed back to BLOCKED
        await db
          .update(scenarioInjects)
          .set({ status: 'BLOCKED', updatedAt: new Date() })
          .where(eq(scenarioInjects.id, injectId));
      }
    }

    return { isReady, blockedReasons };
  }

  /**
   * Periodic reconciliation scan to evaluate all BLOCKED condition injects.
   * Guarantees that system restart or lost transient events cannot leave satisfied injects blocked.
   */
  async evaluateAllBlockedInjects(eventId?: string): Promise<number> {
    const whereConditions = [
      inArray(scenarioInjects.status, ['BLOCKED', 'SCHEDULED']),
    ];
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
}
