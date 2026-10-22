import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { ResourcesModule } from '../resources/resources.module.js';
import { CourtService } from './court.service.js';
import { CourtController } from './court.controller.js';

@Module({
  imports: [DatabaseModule, AuditModule, ResourcesModule],
  controllers: [CourtController],
  providers: [CourtService],
  exports: [CourtService],
})
export class CourtModule {}
