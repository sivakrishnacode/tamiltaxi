import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AdminLevel, type Role } from '../../generated/prisma/enums.js';
import type { AuthUser } from './auth-user.js';
import { OWNER_ONLY_KEY, ROLES_KEY } from './roles.decorator.js';

export const OWNER_ONLY_MESSAGE = 'Only an owner admin can do this';

/** Global guard: enforces `@Roles(...)` and `@OwnerOnly()` (support admins). Runs after [JwtAuthGuard]. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<{ user?: AuthUser; method: string }>();
    const ownerOnly = this.reflector.getAllAndOverride<'all' | 'writes' | undefined>(OWNER_ONLY_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (ownerOnly && req.user?.adminLevel === AdminLevel.SUPPORT && (ownerOnly === 'all' || !['GET', 'HEAD'].includes(req.method))) {
      throw new ForbiddenException(OWNER_ONLY_MESSAGE);
    }
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!roles || roles.length === 0) return true;
    if (req.user && roles.includes(req.user.role)) return true;
    throw new ForbiddenException('Not allowed for your account type');
  }
}
