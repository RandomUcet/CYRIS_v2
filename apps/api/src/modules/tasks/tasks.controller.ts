import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { TasksService } from './tasks.service.js';
import {
  CreateOperationalTaskRequestSchema,
  UpdateOperationalTaskRequestSchema,
  AssignOperationalTaskRequestSchema,
  AcknowledgeOperationalTaskRequestSchema,
  StartOperationalTaskRequestSchema,
  BlockOperationalTaskRequestSchema,
  CompleteOperationalTaskRequestSchema,
  CancelOperationalTaskRequestSchema,
  ReopenOperationalTaskRequestSchema,
  TaskQueryFiltersSchema,
  type OperationalTaskItem,
  type OperationalTaskDetail,
} from '@cyris/contracts';

@Controller('events/:eventId/tasks')
@UseGuards(AuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  async listTasks(
    @Param('eventId') eventId: string,
    @Query() query: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<OperationalTaskItem[]> {
    const filters = TaskQueryFiltersSchema.parse(query || {});
    return this.tasksService.listTasks(eventId, filters, user);
  }

  @Post()
  async createTask(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<OperationalTaskItem> {
    const dto = CreateOperationalTaskRequestSchema.parse(body);
    return this.tasksService.createTask(eventId, dto, user);
  }

  @Get(':taskId')
  async getTask(
    @Param('eventId') _eventId: string,
    @Param('taskId') taskId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<OperationalTaskDetail> {
    return this.tasksService.getTaskDetail(taskId, user);
  }

  @Patch(':taskId')
  async updateTask(
    @Param('eventId') _eventId: string,
    @Param('taskId') taskId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<OperationalTaskDetail> {
    const dto = UpdateOperationalTaskRequestSchema.parse(body);
    return this.tasksService.updateTask(taskId, dto, user);
  }

  @Post(':taskId/assign')
  async assignTask(
    @Param('eventId') _eventId: string,
    @Param('taskId') taskId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<OperationalTaskDetail> {
    const dto = AssignOperationalTaskRequestSchema.parse(body);
    return this.tasksService.assignTask(taskId, dto, user);
  }

  @Post(':taskId/acknowledge')
  async acknowledgeTask(
    @Param('eventId') _eventId: string,
    @Param('taskId') taskId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<OperationalTaskDetail> {
    const dto = AcknowledgeOperationalTaskRequestSchema.parse(body);
    return this.tasksService.acknowledgeTask(taskId, dto, user);
  }

  @Post(':taskId/start')
  async startTask(
    @Param('eventId') _eventId: string,
    @Param('taskId') taskId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<OperationalTaskDetail> {
    const dto = StartOperationalTaskRequestSchema.parse(body);
    return this.tasksService.startTask(taskId, dto, user);
  }

  @Post(':taskId/block')
  async blockTask(
    @Param('eventId') _eventId: string,
    @Param('taskId') taskId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<OperationalTaskDetail> {
    const dto = BlockOperationalTaskRequestSchema.parse(body);
    return this.tasksService.blockTask(taskId, dto, user);
  }

  @Post(':taskId/complete')
  async completeTask(
    @Param('eventId') _eventId: string,
    @Param('taskId') taskId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<OperationalTaskDetail> {
    const dto = CompleteOperationalTaskRequestSchema.parse(body);
    return this.tasksService.completeTask(taskId, dto, user);
  }

  @Post(':taskId/cancel')
  async cancelTask(
    @Param('eventId') _eventId: string,
    @Param('taskId') taskId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<OperationalTaskDetail> {
    const dto = CancelOperationalTaskRequestSchema.parse(body);
    return this.tasksService.cancelTask(taskId, dto, user);
  }

  @Post(':taskId/reopen')
  async reopenTask(
    @Param('eventId') _eventId: string,
    @Param('taskId') taskId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<OperationalTaskDetail> {
    const dto = ReopenOperationalTaskRequestSchema.parse(body);
    return this.tasksService.reopenTask(taskId, dto, user);
  }
}
