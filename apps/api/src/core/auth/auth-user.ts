import type { AdminLevel, Role } from '../../generated/prisma/enums.js';

/** The authenticated caller, decoded from the JWT. */
export interface AuthUser {
  readonly userId: string;
  readonly role: Role;
  readonly driverId?: string;
  /** ADMIN only: what the admin may do (read from the account on every request, like the role). */
  readonly adminLevel?: AdminLevel;
  /** Staff: the cities assigned to them (a city-limited role sets up only these). */
  readonly adminCityIds?: readonly string[];
  /** Staff: their role's permissions (core/auth/permissions.ts) and whether it is limited to their cities. */
  readonly permissions?: readonly string[];
  readonly cityScoped?: boolean;
}

/** JWT payload shape. */
export interface JwtPayload {
  readonly sub: string;
  readonly role: Role;
  readonly driverId?: string;
  /** Explicit app context; absent on legacy tokens and registration tokens. */
  readonly app?: 'passenger' | 'driver' | 'admin';
}
