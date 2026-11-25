import { Module } from '@nestjs/common';
import { RegistryController } from './registry.controller.js';
import { LicencesController, LicencesService } from './licences.js';
import { RegistryService } from './registry.service.js';

@Module({
  controllers: [RegistryController, LicencesController],
  providers: [RegistryService, LicencesService],
  exports: [RegistryService],
})
export class RegistryModule {}
