import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { SessionService, type AuthenticatedUser } from '../session.service.js';
import type { ViewAsContext } from '@cyris/contracts';
import { ViewAsService } from '../view-as.service.js';

export interface CyrisRequest extends FastifyRequest {
  user?: AuthenticatedUser;
  sessionToken?: string;
  viewAs?: ViewAsContext;
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

    req.user = validated.user;
    req.sessionToken = token;
    await this.viewAsService.apply(req, validated.user, token);
    return true;
  }
}
