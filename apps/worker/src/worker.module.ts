import { Module } from '@nestjs/common';
import { WorkerService } from './worker.service.js';
import { OutboxProcessorService } from './outbox/outbox-processor.service.js';
import { ScenarioSchedulerWorkerService } from './scenario/scenario-scheduler.service.js';
import { ExerciseObserverWorkerService } from './scenario/exercise-observer.service.js';

@Module({
  providers: [WorkerService, OutboxProcessorService, ScenarioSchedulerWorkerService, ExerciseObserverWorkerService],
  exports: [WorkerService, OutboxProcessorService, ScenarioSchedulerWorkerService, ExerciseObserverWorkerService],
})
export class WorkerModule {}
