import { Module } from '@nestjs/common';
import { LaboratoryService } from './laboratory.service.js';
import { LaboratoryController } from './laboratory.controller.js';
import { SearchModule } from '../search/search.module.js';

@Module({
  imports: [SearchModule],
  controllers: [LaboratoryController],
  providers: [LaboratoryService],
  exports: [LaboratoryService],
})
export class LaboratoryModule {}
