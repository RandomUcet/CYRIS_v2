import { BadRequestException, Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { eq } from 'drizzle-orm';
import { resources } from '@cyris/db';
import type { CyrisRequest } from '../auth/guards/auth.guard.js';
import { DatabaseService } from '../database/database.service.js';
import { DisruptionsService } from './disruptions.service.js';
import { serviceRouteChecks } from './service-routes.js';
import { privateControlTypes, serviceModuleForResourceType } from './module-resources.js';

@Injectable()
export class ServiceAvailabilityInterceptor implements NestInterceptor {
  constructor(private readonly database: DatabaseService, private readonly availability: DisruptionsService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<CyrisRequest>();
    // Guards have already authenticated and applied any read-only view-as identity.
    if (!request.user) return next.handle();
    const route = request.routeOptions.url ?? '';
    const checks = serviceRouteChecks(route, request.method);
    if (route === '/events/:eventId/resources' && request.method === 'POST') {
      const type = (request.body as { resourceType?: unknown } | null)?.resourceType;
      if (typeof type === 'string') {
        if (privateControlTypes.includes(type)) throw new BadRequestException('Unsupported resource type');
        const module = serviceModuleForResourceType(type);
        if (module) checks.push({ module, operation: 'write' });
      }
    }
    if (checks.length) {
      const params = request.params as Record<string, string | undefined>;
      let eventId = params.eventId;
      if (!eventId) {
        const resourceId = params.resourceId ?? params.sourceResourceId ?? params.caseId;
        if (resourceId) {
          const [resource] = await this.database.client.select({ eventId: resources.eventId })
            .from(resources).where(eq(resources.id, resourceId)).limit(1);
          eventId = resource?.eventId;
        }
      }
      if (eventId) {
        for (const check of checks) {
          await this.availability.assertModuleAccess(eventId, request.user, check.module, check.operation);
        }
      }
    }
    return next.handle();
  }
}
