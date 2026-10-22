import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import {
  type NotificationListResponse,
  type NotificationItem,
  MarkNotificationReadSchema,
} from '@cyris/contracts';

@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async getNotifications(
    @CurrentUser() user: AuthenticatedUser,
    @Query('eventId') eventId?: string
  ): Promise<NotificationListResponse> {
    return this.notificationsService.getNotifications(user.id, eventId);
  }

  @Patch(':id/read')
  async markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown
  ): Promise<NotificationItem> {
    const parse = MarkNotificationReadSchema.safeParse(body ?? {});
    const read = parse.success ? parse.data.read : true;
    return this.notificationsService.markRead(id, user.id, read);
  }

  @Post('mark-all-read')
  @HttpCode(HttpStatus.OK)
  async markAllRead(
    @CurrentUser() user: AuthenticatedUser,
    @Query('eventId') eventId?: string
  ): Promise<{ updatedCount: number }> {
    return this.notificationsService.markAllRead(user.id, eventId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async dismiss(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string
  ): Promise<void> {
    await this.notificationsService.dismiss(id, user.id);
  }
}
