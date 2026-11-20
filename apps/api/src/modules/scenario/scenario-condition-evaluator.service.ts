import { Injectable, Logger } from '@nestjs/common';
import { reconcileScenario, reconcileScenarioInject } from '@cyris/db';
import { DatabaseService } from '../database/database.service.js';
import { rethrowScenarioError } from './scenario-release.service.js';

@Injectable()
export class ScenarioConditionEvaluatorService {
  private readonly logger = new Logger(ScenarioConditionEvaluatorService.name);
  constructor(private readonly databaseService: DatabaseService) {}

  async evaluateInject(injectId: string): Promise<{ isReady: boolean; blockedReasons: string[] }> {
    try { return await reconcileScenarioInject(this.databaseService.client, injectId); }
    catch (error) { rethrowScenarioError(error); }
  }

  async evaluateAllBlockedInjects(eventId?: string): Promise<number> {
    return reconcileScenario(this.databaseService.client, eventId, (error, id) => {
      this.logger.error(`Scenario reconciliation failed for ${id}: ${(error as Error).message}`);
    });
  }
}
