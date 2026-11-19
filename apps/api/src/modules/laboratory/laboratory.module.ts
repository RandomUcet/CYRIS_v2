import { Module } from '@nestjs/common';
import { LaboratoryService } from './laboratory.service.js';
import { LaboratoryController } from './laboratory.controller.js';
import { SearchModule } from '../search/search.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';

@Module({
  imports: [SearchModule, NotificationsModule, AuthorizationModule],
  controllers: [LaboratoryController],
  providers: [LaboratoryService],
  exports: [LaboratoryService],
})
export class LaboratoryModule {}
