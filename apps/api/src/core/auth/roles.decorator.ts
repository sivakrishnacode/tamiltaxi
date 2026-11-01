import { SetMetadata } from '@nestjs/common';

import type { Role } from '../../generated/prisma/enums.js';

export const ROLES_KEY = 'roles';

/** Restricts a route to the given roles. */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator => SetMetadata(ROLES_KEY, roles);

export const OWNER_ONLY_KEY = 'ownerOnly';

/**
 * Only an OWNER admin (not SUPPORT): on a handler, that route; on a controller with `'writes'`, its POST / PUT /
 * PATCH / DELETE routes (reads stay open to support).
 */
export const OwnerOnly = (scope: 'all' | 'writes' = 'all'): MethodDecorator & ClassDecorator => SetMetadata(OWNER_ONLY_KEY, scope);
