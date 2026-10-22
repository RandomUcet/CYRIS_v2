import { z } from 'zod';

export const SupportedLocales = ['en', 'cs', 'de', 'pl'] as const;
export type SupportedLocale = (typeof SupportedLocales)[number];

export const SupportedLocaleSchema = z.enum(SupportedLocales);

export const NotificationChannelsSchema = z.object({
  inApp: z.boolean().default(true),
  email: z.boolean().default(true),
});

export type NotificationChannels = z.infer<typeof NotificationChannelsSchema>;

export const UserPreferencesSchema = z.object({
  userId: z.string().uuid(),
  locale: SupportedLocaleSchema.default('en'),
  timezone: z.string().default('UTC'),
  dateFormat: z.string().nullable().optional(),
  timeFormat: z.string().nullable().optional(),
  notificationChannels: NotificationChannelsSchema.default({ inApp: true, email: true }),
  notificationCategories: z.record(z.boolean()).default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

export const UpdateUserPreferencesSchema = z.object({
  locale: SupportedLocaleSchema.optional(),
  timezone: z.string().min(1).max(64).optional(),
  dateFormat: z.string().max(32).nullable().optional(),
  timeFormat: z.string().max(32).nullable().optional(),
  notificationChannels: NotificationChannelsSchema.partial().optional(),
  notificationCategories: z.record(z.boolean()).optional(),
});

export type UpdateUserPreferences = z.infer<typeof UpdateUserPreferencesSchema>;
