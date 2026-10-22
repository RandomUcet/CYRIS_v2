import { Module, Global } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { NotificationsController } from './notifications.controller.js';
import { InAppNotificationProvider } from './providers/in-app-notification.provider.js';
import { EmailNotificationProvider } from './providers/email-notification.provider.js';
import { DatabaseModule } from '../database/database.module.js';
import { MailModule } from '../mail/mail.module.js';
import { ConfigModule } from '../config/config.module.js';
import { PreferencesModule } from '../preferences/preferences.module.js';

@Global()
@Module({
  imports: [DatabaseModule, MailModule, ConfigModule, PreferencesModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    InAppNotificationProvider,
    EmailNotificationProvider,
  ],
  exports: [NotificationsService, EmailNotificationProvider],
})
export class NotificationsModule {}
