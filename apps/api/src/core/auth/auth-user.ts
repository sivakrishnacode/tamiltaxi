import type { Role } from '../../generated/prisma/enums.js';

/** The authenticated caller, decoded from the JWT. */
export interface AuthUser {
  readonly userId: string;
  readonly role: Role;
  readonly driverId?: string;
}

/** JWT payload shape. */
export interface JwtPayload {
  readonly sub: string;
  readonly role: Role;
  readonly driverId?: string;
  /** Explicit app context; absent on legacy tokens and registration tokens. */
  readonly app?: 'passenger' | 'driver' | 'admin';
}
