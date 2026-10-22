import type { IdentityProviderType } from '@cyris/db';

export interface AuthenticatedIdentity {
  userId: string;
  identityId: string;
  providerType: IdentityProviderType;
  providerSubject: string;
}

export interface IIdentityProvider {
  readonly type: IdentityProviderType;
  authenticate(credentials: unknown): Promise<AuthenticatedIdentity | null>;
}
