import type { AdminLevel, Role } from '../../generated/prisma/enums.js';

/** The authenticated caller, decoded from the JWT. */
export interface AuthUser {
  readonly userId: string;
  readonly role: Role;
  readonly driverId?: string;
  /** ADMIN only: what the admin may do (read from the account on every request, like the role). */
  readonly adminLevel?: AdminLevel;
  /** SUPPORT admins: the cities they may set up (empty = none). */
  readonly adminCityIds?: readonly string[];
}

/** JWT payload shape. */
export interface JwtPayload {
  readonly sub: string;
  readonly role: Role;
  readonly driverId?: string;
  /** Explicit app context; absent on legacy tokens and registration tokens. */
  readonly app?: 'passenger' | 'driver' | 'admin';
}
