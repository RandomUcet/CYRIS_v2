import {Module} from '@nestjs/common';
import {JsocController} from './jsoc.controller.js';
import {JsocService} from './jsoc.service.js';
@Module({controllers:[JsocController],providers:[JsocService]})
export class JsocModule {}
