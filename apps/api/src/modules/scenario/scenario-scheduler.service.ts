import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ScenarioConditionEvaluatorService } from './scenario-condition-evaluator.service.js';

@Injectable()
export class ScenarioSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScenarioSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  constructor(private readonly conditionEvaluator: ScenarioConditionEvaluatorService) {}

  onModuleInit(): void {
    if (process.env.ENABLE_API_SCENARIO_SCHEDULER === 'true') this.timer = setInterval(() => { void this.tick(); }, 4000);
  }
  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }
  async tick(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;
    try { await this.conditionEvaluator.evaluateAllBlockedInjects(); }
    catch (error) { this.logger.error(`Scenario scheduler failed: ${(error as Error).message}`); }
    finally { this.isProcessing = false; }
  }
}
