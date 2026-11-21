import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  BadRequestException,
  Res,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { RegistryService } from './registry.service.js';
import {
  CreatePersonRequestSchema,
  UpdatePersonRequestSchema,
  CreateOrganisationRequestSchema,
  UpdateOrganisationRequestSchema,
  CreateLocationRequestSchema,
  UpdateLocationRequestSchema,
  CreateVehicleRequestSchema,
  UpdateVehicleRequestSchema,
  CreateDeviceRequestSchema,
  UpdateDeviceRequestSchema,
  CreateWeaponRequestSchema,
  UpdateWeaponRequestSchema,
} from '@cyris/contracts';

@Controller('events/:eventId/registry')
@UseGuards(AuthGuard)
export class RegistryController {
  constructor(private readonly registryService: RegistryService) {}

  // --- Persons ---

  @Get('persons')
  async listPersons(
    @Param('eventId') eventId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.registryService.listPersons(eventId, user);
  }

  @Post('persons')
  async createPerson(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const parsed = CreatePersonRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid person payload');
    }
    return this.registryService.createPerson(eventId, parsed.data, user);
  }

  @Get('persons/:personId')
  async getPerson(
    @Param('eventId') eventId: string,
    @Param('personId') personId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.registryService.getPerson(eventId, personId, user);
  }

  @Patch('persons/:personId')
  async updatePerson(
    @Param('eventId') eventId: string,
    @Param('personId') personId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const parsed = UpdatePersonRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid person update');
    }
    return this.registryService.updatePerson(eventId, personId, parsed.data, user);
  }

  // --- Organisations ---

  @Get('organisations')
  async listOrganisations(
    @Param('eventId') eventId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.registryService.listOrganisations(eventId, user);
  }

  @Post('organisations')
  async createOrganisation(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const parsed = CreateOrganisationRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid organisation payload');
    }
    return this.registryService.createOrganisation(eventId, parsed.data, user);
  }

  @Get('organisations/:orgId')
  async getOrganisation(
    @Param('eventId') eventId: string,
    @Param('orgId') orgId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.registryService.getOrganisation(eventId, orgId, user);
  }

  @Patch('organisations/:orgId')
  async updateOrganisation(
    @Param('eventId') eventId: string,
    @Param('orgId') orgId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const parsed = UpdateOrganisationRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid organisation update');
    }
    return this.registryService.updateOrganisation(eventId, orgId, parsed.data, user);
  }

  // --- Locations ---

  @Get('locations')
  async listLocations(
    @Param('eventId') eventId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.registryService.listLocations(eventId, user);
  }

  @Post('locations')
  async createLocation(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const parsed = CreateLocationRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid location payload');
    }
    return this.registryService.createLocation(eventId, parsed.data, user);
  }

  @Get('locations/:locId')
  async getLocation(
    @Param('eventId') eventId: string,
    @Param('locId') locId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.registryService.getLocation(eventId, locId, user);
  }

  @Patch('locations/:locId')
  async updateLocation(
    @Param('eventId') eventId: string,
    @Param('locId') locId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const parsed = UpdateLocationRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid location update');
    }
    return this.registryService.updateLocation(eventId, locId, parsed.data, user);
  }

  // --- Vehicles ---

  @Get('vehicles')
  async listVehicles(
    @Param('eventId') eventId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.registryService.listVehicles(eventId, user);
  }

  @Post('vehicles')
  async createVehicle(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const parsed = CreateVehicleRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid vehicle payload');
    }
    return this.registryService.createVehicle(eventId, parsed.data, user);
  }

  @Get('vehicles/:vehicleId')
  async getVehicle(
    @Param('eventId') eventId: string,
    @Param('vehicleId') vehicleId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.registryService.getVehicle(eventId, vehicleId, user);
  }

  @Patch('vehicles/:vehicleId')
  async updateVehicle(
    @Param('eventId') eventId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const parsed = UpdateVehicleRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid vehicle update');
    }
    return this.registryService.updateVehicle(eventId, vehicleId, parsed.data, user);
  }

  // --- Devices ---

  @Get('devices')
  async listDevices(
    @Param('eventId') eventId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.registryService.listDevices(eventId, user);
  }

  @Post('devices')
  async createDevice(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const parsed = CreateDeviceRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid device payload');
    }
    return this.registryService.createDevice(eventId, parsed.data, user);
  }

  @Get('devices/:deviceId')
  async getDevice(
    @Param('eventId') eventId: string,
    @Param('deviceId') deviceId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.registryService.getDevice(eventId, deviceId, user);
  }

  @Patch('devices/:deviceId')
  async updateDevice(
    @Param('eventId') eventId: string,
    @Param('deviceId') deviceId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const parsed = UpdateDeviceRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid device update');
    }
    return this.registryService.updateDevice(eventId, deviceId, parsed.data, user);
  }

  @Get('weapons')
  async listWeapons(@Param('eventId') eventId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.registryService.listWeapons(eventId, user);
  }

  @Post('weapons')
  async createWeapon(@Param('eventId') eventId: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = CreateWeaponRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid weapon payload');
    return this.registryService.createWeapon(eventId, parsed.data, user);
  }

  @Get('weapons/:weaponId')
  async getWeapon(@Param('eventId') eventId: string, @Param('weaponId') weaponId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.registryService.getWeapon(eventId, weaponId, user);
  }

  @Patch('weapons/:weaponId')
  async updateWeapon(@Param('eventId') eventId: string, @Param('weaponId') weaponId: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = UpdateWeaponRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid weapon update');
    return this.registryService.updateWeapon(eventId, weaponId, parsed.data, user);
  }

  @Post(':resourceId/primary-media')
  async uploadPrimaryMedia(@Param('eventId') eventId:string,@Param('resourceId') resourceId: string, @Body() body: { filename?: string; mimeType?: string; data?: string }, @CurrentUser() user: AuthenticatedUser) {
    return this.registryService.uploadPrimaryMedia(eventId,resourceId, body, user);
  }

  @Get(':resourceId/primary-media')
  async getPrimaryMedia(@Param('eventId') eventId:string,@Param('resourceId') resourceId: string, @CurrentUser() user: AuthenticatedUser, @Res() reply: FastifyReply) {
    const media = await this.registryService.getPrimaryMedia(eventId,resourceId,user);
    if (!media) return reply.code(204).send();
    reply.header('Content-Type', media.mimeType);
    reply.header('X-Content-Type-Options','nosniff');
    reply.header('Cache-Control','private, no-store');
    reply.header('Content-Disposition', `inline; filename="${media.filename.replace(/[^A-Za-z0-9._-]/g,'_')}"`);
    return reply.send(Buffer.from(media.body));
  }

  @Delete(':resourceId/primary-media')
  async removePrimaryMedia(@Param('eventId') eventId:string,@Param('resourceId') resourceId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.registryService.removePrimaryMedia(eventId,resourceId,user);
  }
}
