import {Module} from '@nestjs/common';
import {SupportController} from './support.controller.js';
import {SupportService} from './support.service.js';
import {AIModule} from '../ai/ai.module.js';
import {SupportAssistCache} from './support-assist-cache.service.js';
import {SupportAssistContextService} from './support-assist-context.service.js';
import {SupportAssistService} from './support-assist.service.js';
@Module({
  imports:[AIModule],controllers:[SupportController],
  providers:[SupportService,SupportAssistContextService,SupportAssistCache,SupportAssistService],
})
export class SupportModule {}
