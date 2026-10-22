import { Injectable, Logger } from '@nestjs/common';
import { MailService } from '../../mail/mail.service.js';
import { ConfigService } from '../../config/config.service.js';
import type { NotificationItem } from '@cyris/contracts';
import type { INotificationProvider, NotificationContext } from './notification-provider.interface.js';

@Injectable()
export class EmailNotificationProvider implements INotificationProvider {
  readonly channel = 'EMAIL' as const;
  private readonly logger = new Logger(EmailNotificationProvider.name);

  // Domains that must NEVER leak detailed parameters into plaintext emails
  private readonly sensitiveTypes = new Set([
    'SCENARIO_INJECT_READY',
    'SCENARIO_BRIEFING',
    'MEDICAL_ASSIGNMENT',
    'MEDICAL_UPDATE',
    'EVALUATION_ATTENTION',
    'EVALUATION_SCORE',
    'RESTRICTED_EVIDENCE',
    'COURT_RESTRICTED',
  ]);

  constructor(
    private readonly mailService: MailService,
    private readonly configService: ConfigService
  ) {}

  async deliver(notification: NotificationItem, context?: NotificationContext): Promise<boolean> {
    if (!context?.userEmail) {
      return false;
    }

    try {
      const publicBaseUrl = this.configService.values.PUBLIC_WEB_URL || 'http://localhost:3000';
      const actionLink = notification.actionUrl
        ? `${publicBaseUrl}${notification.actionUrl.startsWith('/') ? '' : '/'}${notification.actionUrl}`
        : publicBaseUrl;

      const isSensitive = this.sensitiveTypes.has(notification.type);

      // Safe subject & text compilation
      let subject = `[CYRIS] Operational Alert: ${notification.type.replace(/_/g, ' ')}`;
      let textBody: string;

      if (isSensitive) {
        // Redacted generic operational summary - no medical vitals, scenario secrets, or evaluator scores
        subject = `[CYRIS] Confidential Operational Notice`;
        textBody = `A restricted operational item requires your attention in CYRIS.\n\n` +
          `Due to exercise operational security policy, confidential details are not transmitted over email.\n\n` +
          `Please sign in securely to review the item:\n${actionLink}\n\n` +
          `CYRIS Exercise Control Platform`;
      } else {
        const details = notification.templateParams?.title || notification.templateParams?.taskNumber || '';
        textBody = `CYRIS Operational Notification:\n\n` +
          `Type: ${notification.type}\n` +
          `Severity: ${notification.severity}\n` +
          (details ? `Summary: ${details}\n` : '') +
          `\nView in CYRIS:\n${actionLink}\n\n` +
          `CYRIS Exercise Control Platform`;
      }

      await this.mailService.sendMail({
        to: context.userEmail,
        subject,
        text: textBody,
      });

      this.logger.debug(`Email notification dispatched for user ${context.userEmail} (type: ${notification.type})`);
      return true;
    } catch (err) {
      // SMTP errors must never crash domain transactions
      this.logger.warn(`Failed to dispatch email notification: ${(err as Error).message}`);
      return false;
    }
  }
}
