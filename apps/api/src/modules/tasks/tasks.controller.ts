import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  BadRequestException,
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
  MyWorkQuerySchema,
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
    const parse = TaskQueryFiltersSchema.safeParse(query || {});
    if (!parse.success) {
      throw new BadRequestException(parse.error.errors[0]?.message ?? 'Invalid query parameters');
    }
    return this.tasksService.listTasks(eventId, parse.data, user);
  }

  @Get('my-work')
  async listMyWork(
    @Param('eventId') eventId: string,
    @Query() query: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const parse = MyWorkQuerySchema.safeParse(query || {});
    if (!parse.success) {
      throw new BadRequestException(parse.error.errors[0]?.message ?? 'Invalid My Work query');
    }
    return this.tasksService.listMyWork(eventId, parse.data, user);
  }

  @Post()
  async createTask(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<OperationalTaskItem> {
    const parse = CreateOperationalTaskRequestSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException(parse.error.errors[0]?.message ?? 'Invalid task payload');
    }
    return this.tasksService.createTask(eventId, parse.data, user);
  }

  @Get(':taskId')
  async getTask(
    @Param('eventId') eventId: string,
    @Param('taskId') taskId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<OperationalTaskDetail> {
    return this.tasksService.getTaskDetail(taskId, user, eventId);
  }

  @Patch(':taskId')
  async updateTask(
    @Param('eventId') eventId: string,
    @Param('taskId') taskId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<OperationalTaskDetail> {
    const parse = UpdateOperationalTaskRequestSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException(parse.error.errors[0]?.message ?? 'Invalid task update payload');
    }
    return this.tasksService.updateTask(taskId, parse.data, user, eventId);
  }

  @Post(':taskId/assign')
  async assignTask(
    @Param('eventId') eventId: string,
    @Param('taskId') taskId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<OperationalTaskDetail> {
    const parse = AssignOperationalTaskRequestSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException(parse.error.errors[0]?.message ?? 'Invalid task assign payload');
    }
    return this.tasksService.assignTask(taskId, parse.data, user, eventId);
  }

  @Post(':taskId/acknowledge')
  async acknowledgeTask(
    @Param('eventId') eventId: string,
    @Param('taskId') taskId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<OperationalTaskDetail> {
    const parse = AcknowledgeOperationalTaskRequestSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException(parse.error.errors[0]?.message ?? 'Invalid task acknowledge payload');
    }
    return this.tasksService.acknowledgeTask(taskId, parse.data, user, eventId);
  }

  @Post(':taskId/start')
  async startTask(
    @Param('eventId') eventId: string,
    @Param('taskId') taskId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<OperationalTaskDetail> {
    const parse = StartOperationalTaskRequestSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException(parse.error.errors[0]?.message ?? 'Invalid task start payload');
    }
    return this.tasksService.startTask(taskId, parse.data, user, eventId);
  }

  @Post(':taskId/block')
  async blockTask(
    @Param('eventId') eventId: string,
    @Param('taskId') taskId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<OperationalTaskDetail> {
    const parse = BlockOperationalTaskRequestSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException(parse.error.errors[0]?.message ?? 'Invalid task block payload');
    }
    return this.tasksService.blockTask(taskId, parse.data, user, eventId);
  }

  @Post(':taskId/complete')
  async completeTask(
    @Param('eventId') eventId: string,
    @Param('taskId') taskId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<OperationalTaskDetail> {
    const parse = CompleteOperationalTaskRequestSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException(parse.error.errors[0]?.message ?? 'Invalid task complete payload');
    }
    return this.tasksService.completeTask(taskId, parse.data, user, eventId);
  }

  @Post(':taskId/cancel')
  async cancelTask(
    @Param('eventId') eventId: string,
    @Param('taskId') taskId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<OperationalTaskDetail> {
    const parse = CancelOperationalTaskRequestSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException(parse.error.errors[0]?.message ?? 'Invalid task cancel payload');
    }
    return this.tasksService.cancelTask(taskId, parse.data, user, eventId);
  }

  @Post(':taskId/reopen')
  async reopenTask(
    @Param('eventId') eventId: string,
    @Param('taskId') taskId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<OperationalTaskDetail> {
    const parse = ReopenOperationalTaskRequestSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException(parse.error.errors[0]?.message ?? 'Invalid task reopen payload');
    }
    return this.tasksService.reopenTask(taskId, parse.data, user, eventId);
  }
}
