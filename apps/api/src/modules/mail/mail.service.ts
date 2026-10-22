import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '../config/config.service.js';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    const { SMTP_HOST, SMTP_PORT } = this.configService.values;

    this.transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: false, // Mailpit runs plaintext SMTP
      ignoreTLS: true,
    });
  }

  get transport(): nodemailer.Transporter {
    return this.transporter;
  }

  /**
   * Verifies the SMTP transport connection against the Mailpit server.
   */
  async verifyConnection(): Promise<{ ok: boolean; latencyMs: number }> {
    const start = Date.now();
    await this.transporter.verify();
    const latencyMs = Date.now() - start;
    return { ok: true, latencyMs };
  }

  /**
   * Infrastructure-only mail dispatcher.
   * Product templates (invitations, password resets, incident alerts) belong to later steps.
   */
  async sendMail(options: nodemailer.SendMailOptions): Promise<nodemailer.SentMessageInfo> {
    return this.transporter.sendMail({
      from: '"CYRIS System" <no-reply@cyris.local>',
      ...options,
    });
  }

  /**
   * Healthcheck helper for readiness endpoints.
   */
  async checkHealth(): Promise<{ status: 'up' | 'down'; latencyMs?: number; error?: string }> {
    try {
      const result = await this.verifyConnection();
      return { status: 'up', latencyMs: result.latencyMs };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'SMTP verify failed';
      this.logger.error(`SMTP health check failed: ${message}`);
      return { status: 'down', error: 'Mail transport unavailable' };
    }
  }
}
