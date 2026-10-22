import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { eq, and, lte } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { scenarioInjects } from '@cyris/db';
import { ScenarioReleaseService } from './scenario-release.service.js';
import { ScenarioConditionEvaluatorService } from './scenario-condition-evaluator.service.js';

@Injectable()
export class ScenarioSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScenarioSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly releaseService: ScenarioReleaseService,
    private readonly conditionEvaluator: ScenarioConditionEvaluatorService
  ) {}

  private get db() {
    return this.databaseService.client;
  }

  onModuleInit(): void {
    if (process.env.ENABLE_API_SCENARIO_SCHEDULER === 'true') {
      this.logger.log('Starting Scenario Scheduler engine in API process (polling interval: 4 seconds)...');
      this.timer = setInterval(() => {
        void this.tick();
      }, 4000);
    } else {
      this.logger.log('Scenario Scheduler background polling delegated to CYRIS Worker runtime (API polling dormant).');
    }
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Main scheduling & reconciliation tick.
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
        this.logger.log(`Processing scheduled release for inject ${due.injectNumber} (${due.id})`);
        try {
          await this.releaseService.executeRelease(due.eventId, due.id, 'AUTO');
        } catch (err) {
          this.logger.error(`Error releasing scheduled inject ${due.injectNumber}: ${(err as Error).message}`);
        }
      }

      // 2. Condition Reconciliation Scan (lightweight check of blocked condition injects)
      await this.conditionEvaluator.evaluateAllBlockedInjects();
    } catch (err) {
      this.logger.error(`Error in Scenario Scheduler tick: ${(err as Error).message}`);
    } finally {
      this.isProcessing = false;
    }
  }
}
