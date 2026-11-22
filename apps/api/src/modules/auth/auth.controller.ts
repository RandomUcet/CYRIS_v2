import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { AuthService } from './auth.service.js';
import { AuthGuard, type CyrisRequest } from './guards/auth.guard.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { SessionService, type AuthenticatedUser } from './session.service.js';
import { ConfigService } from '../config/config.service.js';
import { AuditService } from '../audit/audit.service.js';
import { IdentityService } from '../integrations/identity.service.js';
import {
  LoginRequestSchema,
  LdapAuthRequestSchema,
  type CurrentUserResponse,
} from '@cyris/contracts';

const COOKIE_NAME = 'cyris_session';
const COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly identityService: IdentityService,
    private readonly sessionService: SessionService,
  ) {}

  private isRequestSecure(req: CyrisRequest): boolean {
    return this.configService.isProduction;
  }

  @Get('providers')
  async getPublicProviders() {
    return this.identityService.listPublicProviders();
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: unknown,
    @Req() req: CyrisRequest,
    @Res({ passthrough: true }) res: FastifyReply
  ) {
    const parse = LoginRequestSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException(parse.error.errors[0]?.message ?? 'Invalid login payload');
    }

    // Fastify's connection IP is authoritative here. An untrusted X-Forwarded-For header
    // must never choose login-rate-limit or audit identity without a strict proxy trust policy.
    const clientIp = req.ip || 'unknown';
    const userAgent = (req.headers['user-agent'] as string) || null;
    const requestId = (req.headers['x-request-id'] as string) || req.id || null;
    const existingCookie = req.cookies?.[COOKIE_NAME];

    try {
      const { user, sessionToken } = await this.authService.login(
        parse.data.identifier,
        parse.data.password,
        existingCookie,
        clientIp
      );

      // Audit login success
      await this.auditService.record({
        action: 'auth.login.success',
        category: 'auth',
        actorUserId: user.id,
        actorType: 'USER',
        outcome: 'SUCCESS',
        ipAddress: clientIp,
        userAgent,
        requestId,
        metadata: {
          identifier: parse.data.identifier,
          displayName: user.displayName,
        },
      });

      // Set secure HttpOnly session cookie
      if (req.cookies?.cyris_preview) res.clearCookie('cyris_preview', { path: '/' });
      res.setCookie(COOKIE_NAME, sessionToken, {
        path: '/',
        httpOnly: true,
        secure: this.isRequestSecure(req),
        sameSite: 'lax',
        maxAge: COOKIE_MAX_AGE_SECONDS,
      });

      return { user };
    } catch (err) {
      // Audit login failure (password is never recorded; sensitive fields are auto-redacted)
      await this.auditService.record({
        action: 'auth.login.failure',
        category: 'auth',
        actorType: 'USER',
        outcome: 'FAILURE',
        ipAddress: clientIp,
        userAgent,
        requestId,
        metadata: {
          identifier: parse.data.identifier,
          reason: (err as Error).message || 'Invalid credentials',
        },
      });
      throw err;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: CyrisRequest,
    @Res({ passthrough: true }) res: FastifyReply
  ) {
    const sessionToken = req.cookies?.[COOKIE_NAME] ||
      (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : undefined);
    // Fastify's connection IP is authoritative here. An untrusted X-Forwarded-For header
    // must never choose login-rate-limit or audit identity without a strict proxy trust policy.
    const clientIp = req.ip || 'unknown';
    const userAgent = (req.headers['user-agent'] as string) || null;
    const requestId = (req.headers['x-request-id'] as string) || req.id || null;

    const validated = await this.sessionService.validateSession(sessionToken);
    // Revoke before auditing; an audit failure cannot leave a live session.
    await this.authService.logout(sessionToken);
    if (req.cookies?.cyris_preview) res.clearCookie('cyris_preview', { path: '/' });
    res.clearCookie(COOKIE_NAME, {
      path: '/', httpOnly: true, secure: this.isRequestSecure(req), sameSite: 'lax',
    });
    if (validated) {
      await this.auditService.record({
        action: 'auth.logout',
        category: 'auth',
        actorUserId: validated.user.id,
        actorType: 'USER',
        outcome: 'SUCCESS',
        ipAddress: clientIp,
        userAgent,
        requestId,
      });
    }

    return { success: true };
  }

  @Post('ldap/login')
  @HttpCode(HttpStatus.OK)
  async loginLdap(
    @Body() body: unknown,
    @Req() req: CyrisRequest,
    @Res({ passthrough: true }) res: FastifyReply
  ) {
    const parse = LdapAuthRequestSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException(parse.error.errors[0]?.message ?? 'Invalid LDAP credentials payload');
    }

    // Fastify's connection IP is authoritative here. An untrusted X-Forwarded-For header
    // must never choose login-rate-limit or audit identity without a strict proxy trust policy.
    const clientIp = req.ip || 'unknown';
    const existingCookie = req.cookies?.[COOKIE_NAME];

    const { user, sessionToken } = await this.authService.loginLdap(
      parse.data.username,
      parse.data.password,
      parse.data.providerId,
      existingCookie,
      clientIp
    );

    if (req.cookies?.cyris_preview) res.clearCookie('cyris_preview', { path: '/' });
    res.setCookie(COOKIE_NAME, sessionToken, {
      path: '/',
      httpOnly: true,
      secure: this.isRequestSecure(req),
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE_SECONDS,
    });

    return { user };
  }

  @Get('oidc/:providerId/authorize')
  async oidcAuthorize(@Param('providerId') providerId: string) {
    return this.authService.getOidcAuthorizeUrl(providerId);
  }

  @Get('oidc/:providerId/callback')
  async oidcCallback(
    @Param('providerId') providerId: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: CyrisRequest,
    @Res() res: FastifyReply
  ) {
    if (!code || !state) {
      throw new BadRequestException('Missing authorization code or state parameter');
    }

    const existingCookie = req.cookies?.[COOKIE_NAME];
    const { sessionToken } = await this.authService.loginOidc(providerId, code, state, existingCookie);

    if (req.cookies?.cyris_preview) res.clearCookie('cyris_preview', { path: '/' });
    res.setCookie(COOKIE_NAME, sessionToken, {
      path: '/',
      httpOnly: true,
      secure: this.isRequestSecure(req),
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE_SECONDS,
    });

    // Redirect to public web UI root
    const publicBaseUrl = this.configService.values.PUBLIC_WEB_URL || 'http://localhost:3000';
    res.redirect(302, `${publicBaseUrl}/`);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async getMe(@CurrentUser() user: AuthenticatedUser, @Req() req: CyrisRequest): Promise<CurrentUserResponse> {
    const profile = await this.authService.getCurrentUserProfile(user.id);
    if (req.viewAs) {
      profile.memberships = profile.memberships.filter((membership) => membership.eventId === req.viewAs!.eventId);
      profile.viewAs = req.viewAs;
    }
    return profile;
  }
}
