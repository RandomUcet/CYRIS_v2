import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module.js';

async function bootstrap(): Promise<void> {
  const logger = new Logger('CYRIS-Worker');
  logger.log('Starting CYRIS v2 background worker process...');

  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();

  logger.log('CYRIS v2 Worker process is running in standalone daemon mode.');
}

void bootstrap();
