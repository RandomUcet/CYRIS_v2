import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { eq, and, isNull, desc, or, inArray, lte } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { PreferencesService } from '../preferences/preferences.service.js';
import { InAppNotificationProvider } from './providers/in-app-notification.provider.js';
import { EmailNotificationProvider } from './providers/email-notification.provider.js';
import { notifications, users, labAnalyses, forensicAnalyses, resources } from '@cyris/db';
import { generateId, Permissions } from '@cyris/shared';
import { ResourceAccessService } from '../resources/resource-access.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { readModuleImpacts } from '../disruptions/read-module-impacts.js';
import { serviceModuleForAction } from '../disruptions/module-resources.js';
import type {
  CreateNotificationInput,
  NotificationItem,
  NotificationListResponse,
  NotificationSeverityValue,
  ServiceModule, RestrictedServiceMode,
} from '@cyris/contracts';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly preferencesService: PreferencesService,
    private readonly inAppProvider: InAppNotificationProvider,
    private readonly emailProvider: EmailNotificationProvider,
    private readonly authorization: AuthorizationService
  ) {}

  /**
   * Emits an operational notification with deduplication, preferences evaluation,
   * and multi-provider dispatch (in-app, email).
   */
  async emit(input: CreateNotificationInput): Promise<NotificationItem | null> {
    const db = this.databaseService.client;

    // 1. Deduplication check if sourceEventId provided
    if (input.sourceEventId) {
      const [existing] = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.sourceEventId, input.sourceEventId),
            eq(notifications.userId, input.userId),
            eq(notifications.type, input.type)
          )
        )
        .limit(1);

      if (existing) {
        this.logger.debug(
          `Duplicate notification suppressed: sourceEventId=${input.sourceEventId}, user=${input.userId}, type=${input.type}`
        );
        return this.mapToItem(existing);
      }
    }

    // 2. Fetch recipient user details & preferences
    const [recipient] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1);

    if (!recipient) {
      this.logger.warn(`Notification emission skipped: recipient user ${input.userId} not found`);
      return null;
    }

    const preferences = await this.preferencesService.getUserPreferences(input.userId);

    // 3. Evaluate channels and category filters
    const isMandatory = input.isMandatory ?? false;
    const canDeliverInApp = isMandatory || preferences.notificationChannels.inApp !== false;
    const canDeliverEmail = preferences.notificationChannels.email !== false;

    const notificationItem: NotificationItem = {
      id: generateId(),
      userId: input.userId,
      eventId: input.eventId ?? null,
      type: input.type,
      severity: (input.severity ?? 'INFO') as NotificationSeverityValue,
      templateKey: input.templateKey,
      templateParams: input.templateParams ?? {},
      resourceId: input.resourceId ?? null,
      actionUrl: input.actionUrl ?? null,
      sourceEventId: input.sourceEventId ?? null,
      readAt: null,
      dismissedAt: null,
      createdAt: new Date().toISOString(),
    };

    // 4. In-App delivery
    if (canDeliverInApp) {
      await this.inAppProvider.deliver(notificationItem, {
        userEmail: recipient.email,
        userLocale: preferences.locale,
        isMandatory,
      });
    }

    // Save the in-app row so it reappears after restoration. Do not mail details
    // to a recipient while the originating module is unavailable to them.
    if (canDeliverEmail && await this.canShowModule(input.eventId, input.templateKey, input.userId,input.resourceId)) {
      this.emailProvider
        .deliver(notificationItem, {
          userEmail: recipient.email,
          userLocale: preferences.locale,
          isMandatory,
        })
        .catch((err) => {
          this.logger.warn(`Email provider background delivery failed: ${err.message}`);
        });
    }

    return notificationItem;
  }

  /**
   * Retrieves active notifications for user, grouped into new and earlier items.
   */
  async getNotifications(userId: string, eventId?: string): Promise<NotificationListResponse> {
    const db = this.databaseService.client;

    const conditions = [
      eq(notifications.userId, userId),
      isNull(notifications.dismissedAt),
    ];

    if (eventId) {
      conditions.push(or(eq(notifications.eventId,eventId),and(isNull(notifications.eventId),eq(notifications.templateKey,'platform.health.degraded')))!)
    }

    const rows = await db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(100);

    const newItems: NotificationItem[] = [];
    const earlierItems: NotificationItem[] = [];

    const canShow=this.moduleVisibility(userId);
    for(const row of rows){
      if(!await canShow(row.eventId,row.templateKey,row.resourceId))continue;
      const item = this.mapToItem(row);
      if (!row.readAt) {
        newItems.push(item);
      } else {
        earlierItems.push(item);
      }
    }

    return {
      unreadCount: newItems.length,
      newItems,
      earlierItems,
    };
  }

  /**
   * Marks a notification as read or unread.
   * CRITICAL: Modifying notification read status MUST NEVER mutate domain entities.
   */
  async markRead(notificationId: string, userId: string, read: boolean = true): Promise<NotificationItem> {
    const db = this.databaseService.client;
    const [existing] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, notificationId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException('Notification not found');
    }

    if (existing.userId !== userId) {
      throw new ForbiddenException('Cannot modify notifications of other users');
    }

    if (!await this.canShowModule(existing.eventId, existing.templateKey, userId,existing.resourceId)) {
      throw new NotFoundException('Notification not found');
    }

    const [updated] = await db
      .update(notifications)
      .set({
        readAt: read ? new Date() : null,
      })
      .where(eq(notifications.id, notificationId))
      .returning();

    return this.mapToItem(updated);
  }

  /**
   * Marks all unread notifications for a user as read.
   */
  async markAllRead(userId: string, eventId?: string): Promise<{ updatedCount: number }> {
    const db = this.databaseService.client;
    const conditions = [
      eq(notifications.userId, userId),
      isNull(notifications.readAt),
      isNull(notifications.dismissedAt),
    ];

    if (eventId) {
      conditions.push(or(eq(notifications.eventId,eventId),and(isNull(notifications.eventId),eq(notifications.templateKey,'platform.health.degraded')))!)
    }

    // Only acknowledge groups that the recipient could actually see. Grouping
    // in SQL avoids transferring unread notification bodies and UUID lists.
    const readAt=new Date();
    conditions.push(lte(notifications.createdAt,readAt));
    const groups=await db.selectDistinct({eventId:notifications.eventId,templateKey:notifications.templateKey,resourceId:notifications.resourceId})
      .from(notifications).where(and(...conditions));
    const canShow=this.moduleVisibility(userId);
    const allowed=new Map<string|null,Set<string>>();
    const labGroups:NonNullable<ReturnType<typeof and>>[]=[];
    for(const group of groups){
      if(!await canShow(group.eventId,group.templateKey,group.resourceId))continue;
      if(['lab.request.status','forensics.request.status'].includes(group.templateKey)&&group.resourceId&&group.eventId){
        labGroups.push(and(eq(notifications.eventId,group.eventId),eq(notifications.templateKey,group.templateKey),eq(notifications.resourceId,group.resourceId))!);continue;
      }
      const keys=allowed.get(group.eventId)??new Set<string>();
      keys.add(group.templateKey);allowed.set(group.eventId,keys);
    }
    if(!allowed.size&&!labGroups.length)return {updatedCount:0};
    const visible=or(...[...allowed].map(([id,keys])=>and(
      id===null?isNull(notifications.eventId):eq(notifications.eventId,id),
      inArray(notifications.templateKey,[...keys]),
    )),...labGroups);
    const res=await db.update(notifications).set({readAt})
      .where(and(...conditions,visible)).returning({id:notifications.id});

    return { updatedCount: res.length };
  }

  /**
   * Dismisses a notification from the user's notification center.
   */
  async dismiss(notificationId: string, userId: string): Promise<void> {
    const db = this.databaseService.client;
    const [existing] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, notificationId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException('Notification not found');
    }

    if (existing.userId !== userId) {
      throw new ForbiddenException('Cannot dismiss notifications of other users');
    }

    if(!await this.canShowModule(existing.eventId,existing.templateKey,userId,existing.resourceId)){
      throw new NotFoundException('Notification not found');
    }
    await db
      .update(notifications)
      .set({
        dismissedAt: new Date(),
      })
      .where(eq(notifications.id, notificationId));
  }

  /** One request-local lookup per event, and at most one admin check.
   * Never retain authorization across calls; restrictions can change at any time. */
  private moduleVisibility(userId:string){
    const db=this.databaseService.client;
    const impacts=new Map<string,Promise<ReadonlyMap<ServiceModule,RestrictedServiceMode>>>();
    let admin:Promise<boolean>|undefined;
    const isAdmin=()=>admin??=(async()=>{
      const [user]=await db.select({id:users.id,email:users.email,displayName:users.displayName,status:users.status})
        .from(users).where(eq(users.id,userId)).limit(1);
      return Boolean(user&&await this.authorization.authorize({user,permission:Permissions.PLATFORM_MANAGE}));
    })();
    const access=new ResourceAccessService(this.databaseService,this.authorization);
    const labVisibility=new Map<string,Promise<boolean>>();
    return async(eventId:string|null|undefined,templateKey:string,resourceId?:string|null):Promise<boolean>=>{
      if(templateKey==='lab.request.status'||templateKey==='forensics.request.status'){
        if(!eventId||!resourceId)return false;
        const key=templateKey+':'+eventId+':'+resourceId;let visible=labVisibility.get(key);
        if(!visible){visible=(async()=>{
          const [record]=templateKey==='forensics.request.status'?await db.select({requester:forensicAnalyses.requestedByUserId}).from(forensicAnalyses).innerJoin(resources,eq(resources.id,forensicAnalyses.id)).where(and(eq(forensicAnalyses.id,resourceId),eq(resources.eventId,eventId),eq(forensicAnalyses.eventId,eventId))).limit(1):await db.select({requester:labAnalyses.requestedByUserId}).from(labAnalyses).innerJoin(resources,eq(resources.id,labAnalyses.id)).where(and(eq(labAnalyses.id,resourceId),eq(resources.eventId,eventId))).limit(1);
          if(record?.requester!==userId)return false;
          const [user]=await db.select({id:users.id,email:users.email,displayName:users.displayName,status:users.status}).from(users).where(eq(users.id,userId)).limit(1);
          return Boolean(user&&await access.canAccessResource(user,resourceId,templateKey==='forensics.request.status'?Permissions.FORENSICS_READ:Permissions.LAB_READ));
        })();labVisibility.set(key,visible);}
        return visible;
      }
      if(templateKey==='platform.health.degraded')return isAdmin();
      const module=serviceModuleForAction(templateKey);
      if(!eventId||!module)return true;
      let pending=impacts.get(eventId);
      if(!pending){pending=readModuleImpacts(db,eventId,userId);impacts.set(eventId,pending);}
      return (await pending).get(module)!=='UNAVAILABLE'||await isAdmin();
    };
  }

  private canShowModule(eventId:string|null|undefined,templateKey:string,userId:string,resourceId?:string|null):Promise<boolean>{
    return this.moduleVisibility(userId)(eventId,templateKey,resourceId);
  }

  private mapToItem(row: typeof notifications.$inferSelect): NotificationItem {
    return {
      id: row.id,
      userId: row.userId,
      eventId: row.eventId,
      type: row.type,
      severity: row.severity as NotificationSeverityValue,
      templateKey: row.templateKey,
      templateParams: (row.templateParams as Record<string, any>) ?? {},
      resourceId: row.resourceId,
      actionUrl: row.actionUrl,
      sourceEventId: row.sourceEventId,
      readAt: row.readAt ? row.readAt.toISOString() : null,
      dismissedAt: row.dismissedAt ? row.dismissedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
