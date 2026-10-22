import { Module, Global } from '@nestjs/common';
import { PreferencesService } from './preferences.service.js';
import { PreferencesController } from './preferences.controller.js';
import { DatabaseModule } from '../database/database.module.js';

@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [PreferencesController],
  providers: [PreferencesService],
  exports: [PreferencesService],
})
export class PreferencesModule {}
