import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { userPreferences, events } from '@cyris/db';
import {
  SupportedLocales,
  type SupportedLocale,
  type UserPreferences,
  type UpdateUserPreferences,
} from '@cyris/contracts';

@Injectable()
export class PreferencesService {
  private readonly logger = new Logger(PreferencesService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Retrieves user preferences, automatically seeding defaults if none exist yet.
   */
  async getUserPreferences(userId: string): Promise<UserPreferences> {
    const db = this.databaseService.client;
    const [existing] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);

    if (existing) {
      return {
        userId: existing.userId,
        locale: existing.locale as SupportedLocale,
        timezone: existing.timezone,
        dateFormat: existing.dateFormat,
        timeFormat: existing.timeFormat,
        notificationChannels: existing.notificationChannels as { inApp: boolean; email: boolean },
        notificationCategories: existing.notificationCategories as Record<string, boolean>,
        createdAt: existing.createdAt.toISOString(),
        updatedAt: existing.updatedAt.toISOString(),
      };
    }

    // Insert default preferences
    const [created] = await db
      .insert(userPreferences)
      .values({
        userId,
        locale: 'en',
        timezone: 'UTC',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: '24h',
        notificationChannels: { inApp: true, email: true },
        notificationCategories: {},
      })
      .returning();

    return {
      userId: created.userId,
      locale: created.locale as SupportedLocale,
      timezone: created.timezone,
      dateFormat: created.dateFormat,
      timeFormat: created.timeFormat,
      notificationChannels: created.notificationChannels as { inApp: boolean; email: boolean },
      notificationCategories: created.notificationCategories as Record<string, boolean>,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  /**
   * Updates user preferences with validation on locale and IANA timezone.
   */
  async updateUserPreferences(
    userId: string,
    input: UpdateUserPreferences
  ): Promise<UserPreferences> {
    // Validate locale if provided
    if (input.locale && !SupportedLocales.includes(input.locale as SupportedLocale)) {
      throw new BadRequestException(`Unsupported locale: ${input.locale}. Supported: ${SupportedLocales.join(', ')}`);
    }

    // Validate timezone if provided
    if (input.timezone) {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: input.timezone });
      } catch {
        throw new BadRequestException(`Invalid IANA timezone identifier: ${input.timezone}`);
      }
    }

    const current = await this.getUserPreferences(userId);
    const db = this.databaseService.client;

    const updatedChannels = input.notificationChannels
      ? { ...current.notificationChannels, ...input.notificationChannels }
      : current.notificationChannels;

    const updatedCategories = input.notificationCategories
      ? { ...current.notificationCategories, ...input.notificationCategories }
      : current.notificationCategories;

    const [updated] = await db
      .update(userPreferences)
      .set({
        locale: input.locale ?? current.locale,
        timezone: input.timezone ?? current.timezone,
        dateFormat: input.dateFormat !== undefined ? input.dateFormat : current.dateFormat,
        timeFormat: input.timeFormat !== undefined ? input.timeFormat : current.timeFormat,
        notificationChannels: updatedChannels,
        notificationCategories: updatedCategories,
        updatedAt: new Date(),
      })
      .where(eq(userPreferences.userId, userId))
      .returning();

    return {
      userId: updated.userId,
      locale: updated.locale as SupportedLocale,
      timezone: updated.timezone,
      dateFormat: updated.dateFormat,
      timeFormat: updated.timeFormat,
      notificationChannels: updated.notificationChannels as { inApp: boolean; email: boolean },
      notificationCategories: updated.notificationCategories as Record<string, boolean>,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /**
   * Resolves the effective locale for a user context:
   * 1. User configured locale
   * 2. Event default locale
   * 3. System fallback ('en')
   */
  async resolveEffectiveLocale(userId?: string, eventId?: string): Promise<string> {
    if (userId) {
      try {
        const prefs = await this.getUserPreferences(userId);
        if (prefs?.locale) return prefs.locale;
      } catch (err) {
        this.logger.warn(`Failed to resolve user locale for ${userId}: ${(err as Error).message}`);
      }
    }

    if (eventId) {
      const db = this.databaseService.client;
      const [ev] = await db
        .select({ defaultLocale: events.defaultLocale })
        .from(events)
        .where(eq(events.id, eventId))
        .limit(1);

      if (ev?.defaultLocale) return ev.defaultLocale;
    }

    return 'en';
  }

  /**
   * Resolves the effective timezone for a user context:
   * 1. User configured timezone
   * 2. Event default timezone
   * 3. UTC
   */
  async resolveEffectiveTimezone(userId?: string, eventId?: string): Promise<string> {
    if (userId) {
      try {
        const prefs = await this.getUserPreferences(userId);
        if (prefs?.timezone) return prefs.timezone;
      } catch (err) {
        this.logger.warn(`Failed to resolve user timezone for ${userId}: ${(err as Error).message}`);
      }
    }

    if (eventId) {
      const db = this.databaseService.client;
      const [ev] = await db
        .select({ defaultTimezone: events.defaultTimezone })
        .from(events)
        .where(eq(events.id, eventId))
        .limit(1);

      if (ev?.defaultTimezone) return ev.defaultTimezone;
    }

    return 'UTC';
  }
}
