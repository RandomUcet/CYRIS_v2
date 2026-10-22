import { Module } from '@nestjs/common';
import { WorkerService } from './worker.service.js';
import { OutboxProcessorService } from './outbox/outbox-processor.service.js';
import { ScenarioSchedulerWorkerService } from './scenario/scenario-scheduler.service.js';

@Module({
  providers: [WorkerService, OutboxProcessorService, ScenarioSchedulerWorkerService],
  exports: [WorkerService, OutboxProcessorService, ScenarioSchedulerWorkerService],
})
export class WorkerModule {}
