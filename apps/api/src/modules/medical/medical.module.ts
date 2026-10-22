import { Module } from '@nestjs/common';
import { MedicalService } from './medical.service.js';
import { MedicalController } from './medical.controller.js';
import { DatabaseModule } from '../database/database.module.js';
import { ResourcesModule } from '../resources/resources.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { SearchModule } from '../search/search.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [
    DatabaseModule,
    ResourcesModule,
    AuditModule,
    SearchModule,
    AuthModule,
  ],
  controllers: [MedicalController],
  providers: [MedicalService],
  exports: [MedicalService],
})
export class MedicalModule {}
