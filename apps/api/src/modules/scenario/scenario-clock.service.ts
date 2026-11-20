import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import { scenarioClocks, calculateScenarioTime } from '@cyris/db';
import { generateId } from '@cyris/shared';

export type ScenarioClockMode = 'REAL_TIME' | 'SCENARIO_TIME';

export interface ScenarioClockState {
  mode: ScenarioClockMode;
  operationalNow: string;
  scenarioTime: string;
  paused: boolean;
  speedMultiplier: number;
}

@Injectable()
export class ScenarioClockService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditService: AuditService,
  ) {}

  private get db() {
    return this.databaseService.client;
  }

  private async getOrCreate(eventId: string) {
    const [existing] = await this.db.select().from(scenarioClocks).where(eq(scenarioClocks.eventId, eventId)).limit(1);
    if (existing) return existing;
    const now = new Date();
    const [created] = await this.db.insert(scenarioClocks).values({
      id: generateId(),
      eventId,
      mode: 'REAL_TIME',
      scenarioBaseTime: now,
      realBaseTime: now,
    }).onConflictDoNothing().returning();
    if (created) return created;
    const [raceWinner] = await this.db.select().from(scenarioClocks).where(eq(scenarioClocks.eventId, eventId)).limit(1);
    if (!raceWinner) throw new NotFoundException(`Scenario clock for event '${eventId}' could not be initialized`);
    return raceWinner;
  }

  async getState(eventId: string): Promise<ScenarioClockState> {
    const [clock] = await this.db.select().from(scenarioClocks).where(eq(scenarioClocks.eventId, eventId)).limit(1);
    if (clock) return this.map(clock);
    const now = new Date().toISOString();
    return { mode: 'REAL_TIME', operationalNow: now, scenarioTime: now, paused: false, speedMultiplier: 1 };
  }

  async getOperationalNow(eventId: string): Promise<Date> {
    return new Date((await this.getState(eventId)).operationalNow);
  }

  async setTime(eventId: string, scenarioTime: string, userId: string): Promise<ScenarioClockState> {
    await this.getOrCreate(eventId);
    const value = new Date(scenarioTime);
    if (Number.isNaN(value.getTime())) throw new BadRequestException('Invalid scenario time');
    const now = new Date();
    await this.db.update(scenarioClocks).set({
      mode: 'SCENARIO_TIME',
      scenarioBaseTime: value,
      realBaseTime: now,
      pausedAt: null,
      pausedScenarioTime: null,
      updatedAt: now,
    }).where(eq(scenarioClocks.eventId, eventId));
    await this.audit(eventId, userId, 'scenario.clock.set', { scenarioTime: value.toISOString() });
    return this.getState(eventId);
  }

  async pause(eventId: string, userId: string): Promise<ScenarioClockState> {
    const current = await this.getOrCreate(eventId);
    const now = new Date();
    const scenarioNow = this.calculate(current, now);
    await this.db.update(scenarioClocks).set({
      pausedAt: now,
      pausedScenarioTime: scenarioNow,
      updatedAt: now,
    }).where(eq(scenarioClocks.eventId, eventId));
    await this.audit(eventId, userId, 'scenario.clock.paused', { scenarioTime: scenarioNow.toISOString() });
    return this.getState(eventId);
  }

  async resume(eventId: string, userId: string): Promise<ScenarioClockState> {
    const current = await this.getOrCreate(eventId);
    const now = new Date();
    const scenarioNow = this.calculate(current);
    await this.db.update(scenarioClocks).set({
      realBaseTime: now,
      scenarioBaseTime: scenarioNow,
      pausedAt: null,
      pausedScenarioTime: null,
      updatedAt: now,
    }).where(eq(scenarioClocks.eventId, eventId));
    await this.audit(eventId, userId, 'scenario.clock.resumed', { scenarioTime: scenarioNow.toISOString() });
    return this.getState(eventId);
  }

  async advance(eventId: string, minutes: number, userId: string): Promise<ScenarioClockState> {
    if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 24 * 60) {
      throw new BadRequestException('Advance minutes must be a positive integer up to 1440');
    }
    const current = await this.getOrCreate(eventId);
    const scenarioNow = new Date(this.calculate(current).getTime() + minutes * 60_000);
    const now = new Date();
    await this.db.update(scenarioClocks).set({
      mode: 'SCENARIO_TIME',
      scenarioBaseTime: scenarioNow,
      realBaseTime: now,
      pausedAt: current.pausedAt ? now : null,
      pausedScenarioTime: current.pausedAt ? scenarioNow : null,
      updatedAt: now,
    }).where(eq(scenarioClocks.eventId, eventId));
    await this.audit(eventId, userId, 'scenario.clock.advanced', { minutes, scenarioTime: scenarioNow.toISOString() });
    return this.getState(eventId);
  }

  private calculate(row: typeof scenarioClocks.$inferSelect, now = new Date()): Date {
    return calculateScenarioTime(row, now);
  }

  private map(row: typeof scenarioClocks.$inferSelect): ScenarioClockState {
    const scenarioTime = this.calculate(row);
    return {
      mode: row.mode as ScenarioClockMode,
      operationalNow: scenarioTime.toISOString(),
      scenarioTime: scenarioTime.toISOString(),
      paused: Boolean(row.pausedScenarioTime),
      speedMultiplier: row.speedMultiplier,
    };
  }

  private async audit(eventId: string, userId: string, action: string, metadata: Record<string, unknown>) {
    await this.auditService.record({
      action,
      category: 'scenario',
      eventId,
      resourceType: 'scenario_clock',
      resourceId: eventId,
      actorUserId: userId,
      metadata,
    });
  }
}
