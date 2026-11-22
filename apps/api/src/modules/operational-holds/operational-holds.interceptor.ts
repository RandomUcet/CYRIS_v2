import { BadRequestException, Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Observable } from 'rxjs';
import { resources } from '@cyris/db';
import { DatabaseService } from '../database/database.service.js';
import type { CyrisRequest } from '../auth/guards/auth.guard.js';
import { operationHoldModules } from './hold-policy.js';
import { OperationalHoldsService } from './operational-holds.service.js';

/** Server-side enforcement on mutating routes, including multipart uploads. */
@Injectable()
export class OperationalHoldsInterceptor implements NestInterceptor {
  constructor(private readonly database: DatabaseService, private readonly holds: OperationalHoldsService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<CyrisRequest>();
    if (!req.user) return next.handle();
    const scope = operationHoldModules(req.routeOptions.url ?? '', req.method);
    if (!scope) return next.handle();

    const params = req.params as Record<string, string | undefined>;
    let eventId = params?.eventId;
    if (!eventId && !scope.eventRoute) {
      const resourceId = params?.resourceId ?? params?.sourceResourceId ?? params?.caseId;
      if (resourceId) {
        const [row] = await this.database.client.select({ eventId: resources.eventId })
          .from(resources).where(eq(resources.id, resourceId)).limit(1);
        eventId = row?.eventId;
      }
    }
    if (eventId) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId))
        throw new BadRequestException('Invalid exercise identifier');
      await this.holds.assertWriteAllowed(eventId, req.user, scope.modules);
    }
    return next.handle();
  }
}
