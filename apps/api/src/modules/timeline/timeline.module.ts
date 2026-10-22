import { Module } from '@nestjs/common';
import { TimelineService } from './timeline.service.js';
import { TimelineController } from './timeline.controller.js';

@Module({
  controllers: [TimelineController],
  providers: [TimelineService],
  exports: [TimelineService],
})
export class TimelineModule {}
