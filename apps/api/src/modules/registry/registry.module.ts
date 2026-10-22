import { Module } from '@nestjs/common';
import { RegistryController } from './registry.controller.js';
import { RegistryService } from './registry.service.js';

@Module({
  controllers: [RegistryController],
  providers: [RegistryService],
  exports: [RegistryService],
})
export class RegistryModule {}
