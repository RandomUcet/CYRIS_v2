import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { ResourcesModule } from '../resources/resources.module.js';
import { ForensicsService } from './forensics.service.js';
import { ForensicsController } from './forensics.controller.js';

@Module({
  imports: [DatabaseModule, AuditModule, ResourcesModule],
  controllers: [ForensicsController],
  providers: [ForensicsService],
  exports: [ForensicsService],
})
export class ForensicsModule {}
