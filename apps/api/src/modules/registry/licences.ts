import { Injectable, Controller, UseGuards, Get, Post, Patch, Param, Body, ParseUUIDPipe, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { and, eq, desc } from 'drizzle-orm';
import { licences, resources } from '@cyris/db';
import { CreateLicenceRequestSchema, UpdateLicenceRequestSchema, licenceDatesOrdered, type CreateLicenceRequest, type UpdateLicenceRequest } from '@cyris/contracts';
import { generateId, Permissions } from '@cyris/shared';
import { DatabaseService } from '../database/database.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { ResourceService } from '../resources/resource.service.js';
import { ResourceAccessService } from '../resources/resource-access.service.js';
import { IdentifierAllocatorService } from '../resources/identifier-allocator.service.js';
import { AuditService } from '../audit/audit.service.js';
import { SearchIndexerService } from '../search/search-indexer.service.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';

@Injectable()
export class LicencesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly authorization: AuthorizationService,
    private readonly access: ResourceAccessService,
    private readonly registry: ResourceService,
    private readonly identifiers: IdentifierAllocatorService,
    private readonly audit: AuditService,
    private readonly search: SearchIndexerService,
  ) {}
  private get db() { return this.database.client; }
  private response(item: typeof licences.$inferSelect, resource: {eventId:string; visibility:string}) {
    return {...item, eventId:resource.eventId, visibility:resource.visibility,
      createdAt:item.createdAt.toISOString(), updatedAt:item.updatedAt.toISOString()};
  }
  async list(eventId:string,user:AuthenticatedUser) {
    const rows = await this.db.select({item:licences,resource:resources}).from(licences)
      .innerJoin(resources,eq(licences.id,resources.id))
      .where(eq(resources.eventId,eventId)).orderBy(desc(licences.createdAt));
    const result = [];
    for (const row of rows) {
      if (await this.access.canAccessResource(user,row.item.id,Permissions.REGISTRY_READ))
        result.push(this.response(row.item,row.resource));
    }
    return result;
  }
  async get(eventId:string,id:string,user:AuthenticatedUser) {
    const [row] = await this.db.select({item:licences,resource:resources}).from(licences)
      .innerJoin(resources,eq(licences.id,resources.id))
      .where(and(eq(resources.eventId,eventId),eq(licences.id,id))).limit(1);
    if (!row) throw new NotFoundException('Licence not found in this exercise');
    await this.access.assertCanAccessResource(user,id,Permissions.REGISTRY_READ);
    return this.response(row.item,row.resource);
  }
  async create(eventId:string,data:CreateLicenceRequest,user:AuthenticatedUser) {
    const context = {eventId, resourceOwnerId:user.id};
    await this.authorization.assertAuthorized({user,permission:Permissions.REGISTRY_CREATE,context});
    await this.authorization.assertAuthorized({user,permission:Permissions.REGISTRY_RELATIONSHIP_MANAGE,context});
    if (data.visibility === 'SCENARIO') {
      await this.authorization.assertAuthorized({user,permission:Permissions.SCENARIO_READ,context});
    }
    if ((await this.access.getModuleImpacts(eventId,user)).get('registry') === 'UNAVAILABLE')
      throw new ForbiddenException('Registry is unavailable');
    const id = generateId();
    return this.db.transaction(async tx => {
      for (const [targetId,types] of [[data.holderId,['person','organisation']], [data.issuerId,['organisation']]] as const) {
        const target = await this.registry.getResource(targetId,tx);
        if (!target || target.eventId !== eventId || !(types as readonly string[]).includes(target.resourceType))
          throw new BadRequestException('Holder or issuer is not a valid registry entity in this exercise');
        await this.access.assertCanAccessResource(user,targetId,Permissions.REGISTRY_READ,tx);
        await this.access.assertCanAccessResource(user,targetId,Permissions.REGISTRY_RELATIONSHIP_MANAGE,tx);
      }
      const identifier = await this.identifiers.allocate(eventId,'licence','LIC',tx,6);
      await this.registry.registerResource(eventId,'licence',{id,visibility:data.visibility,ownerUserId:user.id,txClient:tx});
      const [created] = await tx.insert(licences).values({
        id,identifier,title:data.title,category:data.category,licenceNumber:data.licenceNumber,
        validFrom:data.validFrom,validUntil:data.validUntil,status:data.status,description:data.description,
      }).returning();
      await this.audit.record({action:'registry.licence.created',category:'registry',eventId,
        resourceType:'licence',resourceId:id,actorUserId:user.id,metadata:{category:data.category},txClient:tx});
      for (const [sourceResourceId,relationshipType] of [[data.holderId,'HOLDS_LICENCE'],[data.issuerId,'ISSUED_LICENCE']] as const) {
        await this.registry.createRelationship({eventId,sourceResourceId,targetResourceId:id,relationshipType,
          createdByUserId:user.id,txClient:tx});
      }
      await this.search.emitSearchUpsert('licence',id,tx);
      return this.response(created!,{eventId,visibility:data.visibility});
    });
  }
  async update(eventId:string,id:string,data:UpdateLicenceRequest,user:AuthenticatedUser) {
    await this.get(eventId,id,user);
    await this.access.assertCanAccessResource(user,id,Permissions.REGISTRY_UPDATE);
    return this.db.transaction(async tx => {
      const [current] = await tx.select().from(licences).where(eq(licences.id,id)).for('update').limit(1);
      if (!current) throw new NotFoundException('Licence not found');
      if (!licenceDatesOrdered(data.validFrom ?? current.validFrom,data.validUntil === undefined ? current.validUntil : data.validUntil))
        throw new BadRequestException('End date precedes start date');
      const [updated] = await tx.update(licences).set({...data,updatedAt:new Date()}).where(eq(licences.id,id)).returning();
      await this.audit.record({action:'registry.licence.updated',category:'registry',eventId,
        resourceType:'licence',resourceId:id,actorUserId:user.id,metadata:{fields:Object.keys(data)},txClient:tx});
      await this.search.emitSearchUpsert('licence',id,tx);
      const [resource] = await tx.select().from(resources).where(eq(resources.id,id)).limit(1);
      return this.response(updated!,resource!);
    });
  }
}

@Controller('events/:eventId/registry/licences')
@UseGuards(AuthGuard)
export class LicencesController {
  constructor(private readonly service:LicencesService) {}
  @Get()
  list(@Param('eventId',ParseUUIDPipe) eventId:string,@CurrentUser() user:AuthenticatedUser) {
    return this.service.list(eventId,user);
  }
  @Get(':id')
  get(@Param('eventId',ParseUUIDPipe) eventId:string,@Param('id',ParseUUIDPipe) id:string,@CurrentUser() user:AuthenticatedUser) {
    return this.service.get(eventId,id,user);
  }
  @Post()
  create(@Param('eventId',ParseUUIDPipe) eventId:string,@Body() body:unknown,@CurrentUser() user:AuthenticatedUser) {
    const parsed = CreateLicenceRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid licence');
    return this.service.create(eventId,parsed.data,user);
  }
  @Patch(':id')
  update(@Param('eventId',ParseUUIDPipe) eventId:string,@Param('id',ParseUUIDPipe) id:string,@Body() body:unknown,@CurrentUser() user:AuthenticatedUser) {
    const parsed = UpdateLicenceRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid licence update');
    return this.service.update(eventId,id,parsed.data,user);
  }
}
