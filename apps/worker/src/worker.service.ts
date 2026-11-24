import { WorkerHeartbeat } from './worker-heartbeat.js';
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { loadConfig, type EnvConfig } from '@cyris/config';
import { getDbClient, checkDatabaseConnection, closeDatabaseConnection } from '@cyris/db';
import { Redis, type RedisOptions } from 'ioredis';
import { Worker, type Processor, type WorkerOptions } from 'bullmq';
import { OutboxProcessorService } from './outbox/outbox-processor.service.js';
import { ScenarioSchedulerWorkerService } from './scenario/scenario-scheduler.service.js';
import { ExerciseObserverWorkerService } from './scenario/exercise-observer.service.js';

@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('CYRIS-Worker');
  private readonly config: EnvConfig;
  private readonly redisOptions: RedisOptions;
  private redisClient: Redis | null = null;
  private readonly activeWorkers: Worker[] = [];
  private outboxTimer: NodeJS.Timeout | null = null;
  private scenarioTimer: NodeJS.Timeout | null = null;
  private observerTimer: NodeJS.Timeout | null = null;
  private isProcessingOutbox = false;
  private readonly heartbeat=new WorkerHeartbeat();
  private heartbeatTimer:NodeJS.Timeout|null=null;
  private scenarioInFlight=false;
  private stopping=false;

  constructor(
    private readonly outboxProcessor: OutboxProcessorService,
    private readonly scenarioScheduler: ScenarioSchedulerWorkerService,
    private readonly exerciseObserver: ExerciseObserverWorkerService
  ) {
    this.config = loadConfig();
    const url = new URL(this.config.REDIS_URL);
    this.redisOptions = {
      host: url.hostname,
      port: Number(url.port) || 6379,
      password: url.password || undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
  }

  get redisConfig(): RedisOptions {
    return this.redisOptions;
  }

  async onModuleInit(): Promise<void> {
    this.heartbeat.clear();
    this.logger.log('Initializing CYRIS Worker runtime...');

    // 1. Verify PostgreSQL connectivity
    try {
      const db = getDbClient({ url: this.config.DATABASE_URL });
      const dbHealth = await checkDatabaseConnection(db);
      this.logger.log(`PostgreSQL connected successfully (latency: ${dbHealth.latencyMs}ms).`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown DB error';
      this.logger.error(`Failed to connect to PostgreSQL: ${msg}`);
      throw err;
    }

    // 2. Verify Redis / BullMQ connectivity
    try {
      this.redisClient = new Redis(this.redisOptions);
      const ping = await this.redisClient.ping();
      this.logger.log(`Redis job broker connected successfully (ping response: ${ping}).`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown Redis error';
      this.logger.error(`Failed to connect to Redis broker: ${msg}`);
      throw err;
    }

    // 3. Ensure S3 audit bucket exists and run initial outbox check
    await this.outboxProcessor.ensureAuditBucket();
    await this.triggerOutboxProcessing();

    // 4. Start periodic outbox processor (every 3 seconds)
    this.outboxTimer = setInterval(() => {
      void this.triggerOutboxProcessing();
    }, 3000);

    // 5. Start periodic scenario scheduler tick (every 4 seconds)
    this.scenarioTimer = setInterval(() => {
      void this.runScenarioTick();
    }, 4000);

    this.heartbeat.start();
    this.heartbeatTimer=setInterval(()=>{try{this.heartbeat.publish();}catch{this.logger.warn('Worker heartbeat could not be written');}},5000);
    void this.runScenarioTick();
    void this.exerciseObserver.tick();
    this.observerTimer=setInterval(()=>void this.exerciseObserver.tick(),60000);
    this.logger.log('CYRIS Worker runtime initialized: Outbox archival, scenario scheduling and exercise observation active.');
  }

  private async runScenarioTick(){
    if(this.stopping||this.scenarioInFlight)return;
    this.scenarioInFlight=true;
    try{await this.scenarioScheduler.tick();}
    catch{this.logger.error('Scenario tick did not complete normally');}
    finally{this.scenarioInFlight=false;this.heartbeat.scenarioSettled();}
  }

  /**
   * Safe execution wrapper for outbox processing.
   */
  async triggerOutboxProcessing(): Promise<number> {
    if (this.isProcessingOutbox) {
      return 0;
    }
    this.isProcessingOutbox = true;
    try {
      return await this.outboxProcessor.processPendingOutbox();
    } catch (err) {
      this.logger.error(`Outbox archival processing error: ${(err as Error).message}`);
      return 0;
    } finally {
      this.isProcessingOutbox = false;
    }
  }

  /**
   * Helper factory to register background workers when job queues are implemented in later steps.
   */
  registerWorker<DataType = unknown, ResultType = unknown>(
    queueName: string,
    processor: Processor<DataType, ResultType>,
    options?: Partial<WorkerOptions>
  ): Worker<DataType, ResultType> {
    const worker = new Worker<DataType, ResultType>(queueName, processor, {
      connection: this.redisOptions,
      ...options,
    });
    this.activeWorkers.push(worker);
    return worker;
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping=true;
    if(this.heartbeatTimer){clearInterval(this.heartbeatTimer);this.heartbeatTimer=null;}
    this.heartbeat.clear();
    this.logger.log('Gracefully stopping worker job listeners...');
    if (this.outboxTimer) {
      clearInterval(this.outboxTimer);
      this.outboxTimer = null;
    }
    if (this.scenarioTimer) {
      clearInterval(this.scenarioTimer);
      this.scenarioTimer = null;
    }
    if(this.observerTimer){clearInterval(this.observerTimer);this.observerTimer=null;}
    await this.exerciseObserver.stop();
    await Promise.all(this.activeWorkers.map((w) => w.close()));
    if (this.redisClient) {
      await this.redisClient.quit();
    }
    await closeDatabaseConnection();
    this.logger.log('Worker shutdown complete.');
  }
}
