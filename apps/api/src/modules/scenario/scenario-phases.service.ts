import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { eq, and, desc, asc, ne } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import {
  scenarioPhases,
  activityEvents,
  ActivityVisibility,
} from '@cyris/db';
import { generateId } from '@cyris/shared';
import type {
  CreateScenarioPhaseInput,
  UpdateScenarioPhaseInput,
  ScenarioPhaseResponse,
} from '@cyris/contracts';

@Injectable()
export class ScenarioPhasesService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditService: AuditService
  ) {}

  private get db() {
    return this.databaseService.client;
  }

  async listPhases(eventId: string): Promise<ScenarioPhaseResponse[]> {
    const rows = await this.db
      .select()
      .from(scenarioPhases)
      .where(eq(scenarioPhases.eventId, eventId))
      .orderBy(asc(scenarioPhases.sequence), asc(scenarioPhases.createdAt));

    return rows.map((r) => this.mapPhase(r));
  }

  async getPhase(eventId: string, phaseId: string): Promise<ScenarioPhaseResponse> {
    const [row] = await this.db
      .select()
      .from(scenarioPhases)
      .where(and(eq(scenarioPhases.eventId, eventId), eq(scenarioPhases.id, phaseId)))
      .limit(1);

    if (!row) {
      throw new NotFoundException(`Scenario phase '${phaseId}' not found in event '${eventId}'`);
    }

    return this.mapPhase(row);
  }

  async createPhase(
    eventId: string,
    input: CreateScenarioPhaseInput,
    userId: string
  ): Promise<ScenarioPhaseResponse> {
    const phaseId = generateId();

    const [row] = await this.db
      .insert(scenarioPhases)
      .values({
        id: phaseId,
        eventId,
        code: input.code,
        title: input.title,
        description: input.description ?? null,
        sequence: input.sequence ?? 0,
        status: input.status ?? 'DRAFT',
        plannedStartAt: input.plannedStartAt ? new Date(input.plannedStartAt) : null,
        plannedEndAt: input.plannedEndAt ? new Date(input.plannedEndAt) : null,
        activatedAt: input.status === 'ACTIVE' ? new Date() : null,
        controllerNotes: input.controllerNotes ?? null,
        createdByUserId: userId,
      })
      .returning();

    await this.auditService.record({
      action: 'scenario.phase.created',
      category: 'scenario',
      eventId,
      resourceType: 'scenario_phase',
      resourceId: phaseId,
      actorUserId: userId,
      metadata: {
        code: input.code,
        title: input.title,
        status: input.status,
      },
    });

    return this.mapPhase(row);
  }

  async updatePhase(
    eventId: string,
    phaseId: string,
    input: UpdateScenarioPhaseInput,
    userId: string
  ): Promise<ScenarioPhaseResponse> {
    const current = await this.getPhase(eventId, phaseId);

    // If activating this phase, check if another phase is currently active
    if (input.status === 'ACTIVE' && current.status !== 'ACTIVE') {
      const activePhases = await this.db
        .select()
        .from(scenarioPhases)
        .where(
          and(
            eq(scenarioPhases.eventId, eventId),
            eq(scenarioPhases.status, 'ACTIVE'),
            ne(scenarioPhases.id, phaseId)
          )
        );

      if (activePhases.length > 0 && !input.forceActive) {
        const activeNames = activePhases.map((p) => p.code).join(', ');
        throw new ConflictException(
          `Phase ${activeNames} is currently ACTIVE. To activate '${input.code ?? current.code}', provide forceActive: true to confirm transition.`
        );
      }

      // Complete previously active phases upon confirmed transition unless forceActive was passed to preserve both
      if (activePhases.length > 0 && input.forceActive) {
        for (const prev of activePhases) {
          await this.db
            .update(scenarioPhases)
            .set({
              status: 'COMPLETED',
              completedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(scenarioPhases.id, prev.id));

          await this.auditService.record({
            action: 'scenario.phase.completed',
            category: 'scenario',
            eventId,
            resourceType: 'scenario_phase',
            resourceId: prev.id,
            actorUserId: userId,
            metadata: { code: prev.code, reason: `Superseded by activation of ${input.code ?? current.code}` },
          });
        }
      }
    }

    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (input.code !== undefined) updateData.code = input.code;
    if (input.title !== undefined) updateData.title = input.title;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.sequence !== undefined) updateData.sequence = input.sequence;
    if (input.controllerNotes !== undefined) updateData.controllerNotes = input.controllerNotes;
    if (input.plannedStartAt !== undefined) {
      updateData.plannedStartAt = input.plannedStartAt ? new Date(input.plannedStartAt) : null;
    }
    if (input.plannedEndAt !== undefined) {
      updateData.plannedEndAt = input.plannedEndAt ? new Date(input.plannedEndAt) : null;
    }

    if (input.status !== undefined) {
      updateData.status = input.status;
      if (input.status === 'ACTIVE' && current.status !== 'ACTIVE') {
        updateData.activatedAt = new Date();
      } else if (input.status === 'COMPLETED' && current.status !== 'COMPLETED') {
        updateData.completedAt = new Date();
      }
    }

    const [updatedRow] = await this.db
      .update(scenarioPhases)
      .set(updateData)
      .where(and(eq(scenarioPhases.eventId, eventId), eq(scenarioPhases.id, phaseId)))
      .returning();

    // Audit transition
    await this.auditService.record({
      action: input.status && input.status !== current.status
        ? `scenario.phase.${input.status.toLowerCase()}`
        : 'scenario.phase.updated',
      category: 'scenario',
      eventId,
      resourceType: 'scenario_phase',
      resourceId: phaseId,
      actorUserId: userId,
      metadata: {
        previousStatus: current.status,
        newStatus: input.status ?? current.status,
      },
    });

    // Record scenario activity on activation or completion
    if (input.status === 'ACTIVE' && current.status !== 'ACTIVE') {
      await this.db.insert(activityEvents).values({
        id: generateId(),
        eventId,
        activityType: 'scenario.phase.activated',
        title: `Phase Activated: ${updatedRow.code} — ${updatedRow.title}`,
        summary: updatedRow.description ?? `Exercise transitioned to ${updatedRow.code}`,
        actorUserId: userId,
        visibility: ActivityVisibility.SCENARIO,
      });
    } else if (input.status === 'COMPLETED' && current.status !== 'COMPLETED') {
      await this.db.insert(activityEvents).values({
        id: generateId(),
        eventId,
        activityType: 'scenario.phase.completed',
        title: `Phase Completed: ${updatedRow.code} — ${updatedRow.title}`,
        summary: `Exercise concluded ${updatedRow.code}`,
        actorUserId: userId,
        visibility: ActivityVisibility.SCENARIO,
      });
    }

    return this.mapPhase(updatedRow);
  }

  async reorderPhases(eventId: string, phaseIds: string[], userId: string): Promise<ScenarioPhaseResponse[]> {
    for (let index = 0; index < phaseIds.length; index++) {
      const pid = phaseIds[index];
      await this.db
        .update(scenarioPhases)
        .set({ sequence: index + 1, updatedAt: new Date() })
        .where(and(eq(scenarioPhases.eventId, eventId), eq(scenarioPhases.id, pid)));
    }

    await this.auditService.record({
      action: 'scenario.phases.reordered',
      category: 'scenario',
      eventId,
      resourceType: 'scenario_phase',
      resourceId: phaseIds[0] ?? eventId,
      actorUserId: userId,
      metadata: { order: phaseIds },
    });

    return this.listPhases(eventId);
  }

  private mapPhase(r: typeof scenarioPhases.$inferSelect): ScenarioPhaseResponse {
    return {
      id: r.id,
      eventId: r.eventId,
      code: r.code,
      title: r.title,
      description: r.description,
      sequence: r.sequence,
      status: r.status,
      plannedStartAt: r.plannedStartAt ? r.plannedStartAt.toISOString() : null,
      plannedEndAt: r.plannedEndAt ? r.plannedEndAt.toISOString() : null,
      activatedAt: r.activatedAt ? r.activatedAt.toISOString() : null,
      completedAt: r.completedAt ? r.completedAt.toISOString() : null,
      controllerNotes: r.controllerNotes,
      createdByUserId: r.createdByUserId,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}
