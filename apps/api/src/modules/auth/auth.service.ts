import {
  Injectable,
  UnauthorizedException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { eq, and, isNull, ne } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { QueueService } from '../queue/queue.service.js';
import { LocalIdentityProvider } from './providers/local-identity.provider.js';
import { LdapIdentityProvider } from './providers/ldap-identity.provider.js';
import { OidcIdentityProvider } from './providers/oidc-identity.provider.js';
import { SessionService, type AuthenticatedUser } from './session.service.js';
import { RateLimitService } from './rate-limit.service.js';
import {
  users,
  roles,
  rolePermissions,
  roleAssignments,
  events,
  eventMemberships,
  membershipUnitAssignments,
} from '@cyris/db';
import type { CurrentUserResponse } from '@cyris/contracts';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly localProvider: LocalIdentityProvider,
    private readonly ldapProvider: LdapIdentityProvider,
    private readonly oidcProvider: OidcIdentityProvider,
    private readonly sessionService: SessionService,
    private readonly rateLimitService: RateLimitService
  ) {}

  /**
   * Authenticates local credentials, applies Redis rate limiting, and establishes a session.
   */
  async login(
    identifier: string,
    secret: string,
    existingSessionToken?: string,
    clientIp: string = '127.0.0.1'
  ): Promise<{ user: AuthenticatedUser; sessionToken: string }> {
    await this.rateLimitService.checkLoginRateLimit(identifier, clientIp);

    const authIdentity = await this.localProvider.authenticate({
      identifier,
      secret,
    });

    if (!authIdentity) {
      // Generic invalid login response to prevent user enumeration
      throw new UnauthorizedException('Invalid credentials or account disabled');
    }

    await this.rateLimitService.resetLoginRateLimit(identifier);

    // Fetch user details
    const db = this.databaseService.client;
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        status: users.status,
      })
      .from(users)
      .where(eq(users.id, authIdentity.userId))
      .limit(1);

    if (!user) {
      throw new UnauthorizedException('User account not found');
    }

    // Rotate session token
    const sessionToken = await this.sessionService.rotateSession(existingSessionToken, user.id);

    return { user, sessionToken };
  }

  /**
   * Authenticates LDAP credentials against configured LDAP / AD integration.
   */
  async loginLdap(
    username: string,
    secret: string,
    providerId?: string,
    existingSessionToken?: string,
    clientIp: string = '127.0.0.1'
  ): Promise<{ user: AuthenticatedUser; sessionToken: string }> {
    await this.rateLimitService.checkLoginRateLimit(`ldap:${username}`, clientIp);

    const authIdentity = await this.ldapProvider.authenticate({
      username,
      password: secret,
      providerId,
    });

    if (!authIdentity) {
      throw new UnauthorizedException('Invalid LDAP credentials or account disabled');
    }

    await this.rateLimitService.resetLoginRateLimit(`ldap:${username}`);

    const db = this.databaseService.client;
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        status: users.status,
      })
      .from(users)
      .where(eq(users.id, authIdentity.userId))
      .limit(1);

    if (!user) {
      throw new UnauthorizedException('User account not found');
    }

    const sessionToken = await this.sessionService.rotateSession(existingSessionToken, user.id);
    return { user, sessionToken };
  }

  /**
   * Authenticates user via OIDC state and authorization code.
   */
  async loginOidc(
    providerId: string,
    code: string,
    state: string,
    existingSessionToken?: string
  ): Promise<{ user: AuthenticatedUser; sessionToken: string }> {
    const authIdentity = await this.oidcProvider.authenticate({
      providerId,
      code,
      state,
    });

    if (!authIdentity) {
      throw new UnauthorizedException('Invalid OIDC authentication or provider rejected token');
    }

    const db = this.databaseService.client;
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        status: users.status,
      })
      .from(users)
      .where(eq(users.id, authIdentity.userId))
      .limit(1);

    if (!user) {
      throw new UnauthorizedException('User account not found');
    }

    const sessionToken = await this.sessionService.rotateSession(existingSessionToken, user.id);
    return { user, sessionToken };
  }

  /**
   * Generates OIDC authorization URL for client login redirection.
   */
  async getOidcAuthorizeUrl(providerId: string) {
    return this.oidcProvider.generateAuthorizationUrl(providerId);
  }

  /**
   * Terminates active session.
   */
  async logout(sessionToken?: string): Promise<void> {
    if (sessionToken) {
      await this.sessionService.revokeSession(sessionToken);
    }
  }

  /**
   * Compiles the full profile, platform roles, and event memberships for the current user.
   */
  async getCurrentUserProfile(userId: string): Promise<CurrentUserResponse> {
    const db = this.databaseService.client;

    // 1. User Profile
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        status: users.status,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // 2. Platform Roles
    const platformRoleAssignments = await db
      .select({
        roleSlug: roles.slug,
      })
      .from(roleAssignments)
      .innerJoin(roles, eq(roleAssignments.roleId, roles.id))
      .where(and(eq(roleAssignments.userId, userId), isNull(roleAssignments.membershipId), isNull(roleAssignments.unitId), isNull(roles.eventId)));

    const platformRoles = platformRoleAssignments.map((r) => r.roleSlug);
    const platformPermissionRows = await db
      .select({
        permissionKey: rolePermissions.permissionKey,
      })
      .from(roleAssignments)
      .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
      .innerJoin(rolePermissions, eq(roleAssignments.roleId, rolePermissions.roleId))
      .where(and(eq(roleAssignments.userId, userId), isNull(roleAssignments.membershipId), isNull(roleAssignments.unitId), isNull(roles.eventId), eq(rolePermissions.scope, 'PLATFORM')));
    const platformPermissions = [...new Set(platformPermissionRows.map((p) => p.permissionKey))];

    // 3. Event Memberships
    const membershipRows = await db
      .select({
        membershipId: eventMemberships.id,
        status: eventMemberships.status,
        eventId: events.id,
        eventSlug: events.slug,
        eventName: events.name,
      })
      .from(eventMemberships)
      .innerJoin(events, eq(eventMemberships.eventId, events.id))
      .where(eq(eventMemberships.userId, userId));

    const memberships = await Promise.all(
      membershipRows.map(async (m) => {
        // Event-scoped role assignments
        const eventRoleRows = await db
          .select({
            roleSlug: roles.slug,
          })
          .from(roleAssignments)
          .innerJoin(roles, eq(roleAssignments.roleId, roles.id))
          .where(and(eq(roleAssignments.membershipId, m.membershipId), eq(roles.eventId, m.eventId), isNull(roleAssignments.userId)));

        const eventPermissionRows = await db
          .select({
            permissionKey: rolePermissions.permissionKey,
          })
          .from(roleAssignments)
          .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
          .innerJoin(rolePermissions, eq(roleAssignments.roleId, rolePermissions.roleId))
          .where(and(eq(roleAssignments.membershipId, m.membershipId), eq(roles.eventId, m.eventId), isNull(roleAssignments.userId), ne(rolePermissions.scope, 'PLATFORM'), ne(rolePermissions.permissionKey, 'platform.manage')));

        // Assigned units
        const unitRows = await db
          .select({
            unitId: membershipUnitAssignments.unitId,
          })
          .from(membershipUnitAssignments)
          .where(eq(membershipUnitAssignments.membershipId, m.membershipId));

        return {
          id: m.membershipId,
          eventId: m.eventId,
          eventSlug: m.eventSlug,
          eventName: m.eventName,
          status: m.status,
          roles: eventRoleRows.map((r) => r.roleSlug),
          permissions: [...new Set(eventPermissionRows.map((p) => p.permissionKey))],
          unitIds: unitRows.map((u) => u.unitId),
        };
      })
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        status: user.status as 'ACTIVE' | 'DISABLED',
        lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
        createdAt: user.createdAt.toISOString(),
      },
      platformRoles,
      platformPermissions,
      memberships,
    };
  }
}
