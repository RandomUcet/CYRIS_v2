import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import type { ViewAsInfo } from '@cyris/contracts';
import { ViewAsService, PREVIEW_COOKIE } from '../view-as.service.js';
import { isPreviewReadAllowed } from '../view-as-policy.js';
import type { FastifyRequest } from 'fastify';
import { SessionService, type AuthenticatedUser } from '../session.service.js';

export interface CyrisRequest extends FastifyRequest {
  user?: AuthenticatedUser;
  sessionToken?: string;
  viewAs?: ViewAsInfo;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly sessionService: SessionService, private readonly viewAsService: ViewAsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<CyrisRequest>();

    // 1. Try reading cookie
    const cookieToken = req.cookies?.['cyris_session'];

    // 2. Try reading Authorization header (Bearer <token>)
    let bearerToken: string | undefined;
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      bearerToken = authHeader.substring(7).trim();
    }

    const token = cookieToken || bearerToken;
    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    const validated = await this.sessionService.validateSession(token);
    if (!validated) {
      throw new UnauthorizedException('Session expired or account disabled');
    }

    const preview = req.cookies?.[PREVIEW_COOKIE];
    if (preview) {
      const resolved = await this.viewAsService.resolve(validated.user, token, preview);
      const eventId = (req.params as {eventId?: string} | undefined)?.eventId;
      if (!isPreviewReadAllowed(req.method, req.routeOptions.url ?? '', eventId, resolved.info.eventId)) {
        throw new ForbiddenException('This operation is not available in read-only preview');
      }
      req.viewAs = resolved.info;
      req.user = resolved.user;
      req.sessionToken = token;
      return true;
    }
    if (req.headers['x-cyris-read-only-preview']) throw new ForbiddenException('Preview ended; reload the application');
    req.user = validated.user;
    req.sessionToken = token;
    return true;
  }
}
