import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AdminLevel, type Role } from '../../generated/prisma/enums.js';
import type { AuthUser } from './auth-user.js';
import { grants, NEEDS_KEY, type NeedsMeta, type Permission } from './permissions.js';
import { OWNER_ONLY_KEY, ROLES_KEY } from './roles.decorator.js';

export const OWNER_ONLY_MESSAGE = 'Only an owner admin can do this';
export const NO_PERMISSION_MESSAGE = "Your role doesn't allow this";

/** The permissions that satisfy [meta] for an HTTP [method] (any one of them). */
export function neededFor(meta: NeedsMeta, method: string): readonly Permission[] {
  if ('any' in meta) return meta.any;
  return [`${meta.area}.${['GET', 'HEAD'].includes(method) ? 'view' : 'manage'}` as Permission];
}

/**
 * Global guard: enforces `@Roles(...)`, `@OwnerOnly()` and, for staff (SUPPORT admins), `@Needs` / `@NeedsArea`
 * against their role's permissions. Owners pass every permission check. Runs after [JwtAuthGuard].
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<{ user?: AuthUser; method: string }>();
    const ownerOnly = this.reflector.getAllAndOverride<'all' | 'writes' | undefined>(OWNER_ONLY_KEY, [ctx.getHandler(), ctx.getClass()]);
    const isStaff = req.user?.adminLevel === AdminLevel.SUPPORT;
    if (ownerOnly && isStaff && (ownerOnly === 'all' || !['GET', 'HEAD'].includes(req.method))) {
      throw new ForbiddenException(OWNER_ONLY_MESSAGE);
    }
    const needs = this.reflector.getAllAndOverride<NeedsMeta | undefined>(NEEDS_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (needs && isStaff && !neededFor(needs, req.method).some((p) => grants(req.user?.permissions ?? [], p))) {
      throw new ForbiddenException(NO_PERMISSION_MESSAGE);
    }
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!roles || roles.length === 0) return true;
    if (req.user && roles.includes(req.user.role)) return true;
    throw new ForbiddenException('Not allowed for your account type');
  }
}
