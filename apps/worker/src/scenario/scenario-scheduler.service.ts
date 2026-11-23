import { Injectable, Logger } from '@nestjs/common';
import { getDbClient, reconcileScenario, reconcileScenarioInject, releaseScenarioInject, isOperationalAutoReleaseHeld, dispatchDueExerciseBroadcasts, type CyrisDatabase } from '@cyris/db';
import { loadConfig } from '@cyris/config';

@Injectable()
export class ScenarioSchedulerWorkerService {
  private readonly logger = new Logger('Worker-ScenarioScheduler');
  private readonly db: CyrisDatabase;
  private isProcessing = false;
  constructor() { this.db = getDbClient({ url: loadConfig().DATABASE_URL }); }

  async tick(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;
    try { await this.evaluateAllBlockedInjects(); }
    catch (error) { this.logger.error(`Scenario scheduler failed: ${(error as Error).message}`); }
    try {
      const result=await dispatchDueExerciseBroadcasts(this.db);
      if(result.sent||result.failed) this.logger.log(`EXCON scheduled announcements sent=${result.sent} failed=${result.failed}`);
    } catch (error) {
      this.logger.error(`EXCON broadcast dispatch failed: ${(error as Error).message}`);
    } finally { this.isProcessing = false; }
  }
  async executeRelease(eventId: string, injectId: string): Promise<void> {
    if (await isOperationalAutoReleaseHeld(this.db, eventId)) return;
    await releaseScenarioInject(this.db, eventId, injectId, 'AUTO');
  }
  async evaluateAllBlockedInjects(eventId?: string): Promise<number> {
    return reconcileScenario(this.db, eventId, (error, id) => {
      this.logger.error(`Scenario reconciliation failed for ${id}: ${(error as Error).message}`);
    });
  }
  async evaluateInject(injectId: string): Promise<boolean> {
    return (await reconcileScenarioInject(this.db, injectId)).isReady;
  }
}
