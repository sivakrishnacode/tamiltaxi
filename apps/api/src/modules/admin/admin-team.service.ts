import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import type { AuthUser } from '../../core/auth/auth-user.js';
import { isPermission } from '../../core/auth/permissions.js';
import { UserAccessService } from '../../core/auth/user-access.service.js';
import type { Env } from '../../core/config/env.js';
import { ENV } from '../../core/config/env.token.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { StaffRole } from '../../generated/prisma/client.js';
import { AdminLevel, Role } from '../../generated/prisma/enums.js';
import type { AddStaffDto, StaffRoleDto, UpdateStaffDto, UpdateStaffRoleDto } from './dto/team.dto.js';

/** One person on the team (Team › Staff). */
export interface StaffMember {
  readonly id: string;
  readonly name: string | null;
  readonly phone: string;
  readonly adminLevel: AdminLevel;
  readonly staffRole: { id: string; name: string; isCityScoped: boolean } | null;
  readonly adminCityIds: string[];
  readonly lastSignInAt: Date | null;
  readonly isBlocked: boolean;
  /** Listed in ADMIN_PHONES on the server: always signs in as an owner, can't be removed here. */
  readonly isServerOwner: boolean;
}

export type StaffRoleWithCount = StaffRole & { _count: { members: number } };

/** The signed-in admin as the panel needs it (sidebar, buttons). */
export interface AdminMe {
  readonly id: string;
  readonly name: string | null;
  readonly phone: string;
  readonly adminLevel: AdminLevel;
  readonly role: { id: string; name: string } | null;
  readonly permissions: readonly string[];
  readonly cityIds: readonly string[];
  readonly cityScoped: boolean;
}

const STAFF_SELECT = {
  id: true,
  name: true,
  phone: true,
  adminLevel: true,
  adminCityIds: true,
  lastSignInAt: true,
  isBlocked: true,
  staffRole: { select: { id: true, name: true, isCityScoped: true } },
} as const;

const normalise = (phone: string): string => `+91${phone.replace(/^\+91/, '')}`;

/**
 * Admin Team: the staff (every ADMIN account) and the roles they hold. Owners do everything; staff (SUPPORT) do what
 * their role allows. Only owners use this (controller @OwnerOnly). A change applies to the person's next request.
 */
@Injectable()
export class AdminTeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: UserAccessService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async team(): Promise<{ staff: StaffMember[]; roles: StaffRoleWithCount[] }> {
    const [staff, roles] = await Promise.all([
      this.prisma.user.findMany({ where: { role: Role.ADMIN, deletedAt: null }, select: STAFF_SELECT, orderBy: [{ adminLevel: 'asc' }, { name: 'asc' }] }),
      this.roles(),
    ]);
    return { staff: staff.map((s) => ({ ...s, isServerOwner: this.env.adminPhones.includes(s.phone) })), roles };
  }

  roles(): Promise<StaffRoleWithCount[]> {
    return this.prisma.staffRole.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { members: true } } } });
  }

  async me(user: AuthUser): Promise<AdminMe> {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.userId }, select: { name: true, phone: true, staffRole: { select: { id: true, name: true } } } });
    const isOwner = user.adminLevel !== AdminLevel.SUPPORT;
    return {
      id: user.userId,
      name: u.name,
      phone: u.phone,
      adminLevel: user.adminLevel ?? AdminLevel.OWNER,
      role: isOwner ? null : u.staffRole,
      permissions: isOwner ? [] : (user.permissions ?? []),
      cityIds: user.adminCityIds ?? [],
      cityScoped: !isOwner && !!user.cityScoped,
    };
  }

  /** Someone joins the team: their account (made now if the phone has none) becomes an owner or staff with a role. */
  async addStaff(dto: AddStaffDto): Promise<StaffMember> {
    const phone = normalise(dto.phone);
    const existing = await this.prisma.user.findUnique({ where: { phone }, select: { id: true, role: true, deletedAt: true } });
    if (existing?.role === Role.ADMIN && !existing.deletedAt) throw new ConflictException('Already on the team');
    const access = await this.accessFields(dto.level, dto.roleId ?? null, dto.cityIds ?? []);
    const data = { role: Role.ADMIN, ...access, ...(dto.name ? { name: dto.name.trim() } : {}) };
    const user = existing
      ? await this.prisma.user.update({ where: { id: existing.id }, data, select: STAFF_SELECT })
      : await this.prisma.user.create({ data: { phone, ...data }, select: STAFF_SELECT });
    await this.access.invalidate(user.id);
    return { ...user, isServerOwner: this.env.adminPhones.includes(user.phone) };
  }

  async updateStaff(caller: AuthUser, userId: string, dto: UpdateStaffDto): Promise<StaffMember> {
    const current = await this.member(userId);
    const changesAccess = dto.level !== undefined || dto.roleId !== undefined || dto.cityIds !== undefined;
    if (changesAccess && userId === caller.userId) throw new BadRequestException("You can't change your own access");
    const level = dto.level ?? current.adminLevel;
    if (changesAccess && level === AdminLevel.SUPPORT && this.env.adminPhones.includes(current.phone)) {
      throw new BadRequestException('This number is in ADMIN_PHONES on the server: it always signs in as an owner');
    }
    const access = changesAccess
      ? await this.accessFields(level, dto.roleId !== undefined ? dto.roleId : (current.staffRole?.id ?? null), dto.cityIds ?? current.adminCityIds)
      : {};
    if (changesAccess && current.adminLevel === AdminLevel.OWNER && level !== AdminLevel.OWNER) await this.keepAnOwner(userId);
    const user = await this.prisma.user.update({ where: { id: userId }, data: { ...access, ...(dto.name ? { name: dto.name.trim() } : {}) }, select: STAFF_SELECT });
    await this.access.invalidate(userId);
    return { ...user, isServerOwner: this.env.adminPhones.includes(user.phone) };
  }

  /** Off the team: back to a rider (or driver, with a driver profile); their sessions lose the panel at once. */
  async removeStaff(caller: AuthUser, userId: string): Promise<void> {
    if (userId === caller.userId) throw new BadRequestException("You can't remove yourself");
    const current = await this.member(userId);
    if (this.env.adminPhones.includes(current.phone)) throw new BadRequestException('This number is in ADMIN_PHONES on the server: remove it there first');
    if (current.adminLevel === AdminLevel.OWNER) await this.keepAnOwner(userId);
    const driver = await this.prisma.driver.findUnique({ where: { userId }, select: { id: true } });
    await this.prisma.user.update({
      where: { id: userId },
      data: { role: driver ? Role.DRIVER : Role.PASSENGER, adminLevel: AdminLevel.OWNER, staffRoleId: null, adminCityIds: [] },
    });
    await this.access.invalidate(userId);
  }

  async createRole(dto: StaffRoleDto): Promise<StaffRole> {
    try {
      return await this.prisma.staffRole.create({
        data: { name: dto.name.trim(), description: dto.description?.trim() || null, permissions: checkedPermissions(dto.permissions), isCityScoped: dto.isCityScoped ?? false },
      });
    } catch (e) {
      throw sameName(e);
    }
  }

  /** A changed role applies to every member's next request. */
  async updateRole(id: string, dto: UpdateStaffRoleDto): Promise<StaffRole> {
    try {
      const role = await this.prisma.staffRole.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          description: dto.description === undefined ? undefined : dto.description?.trim() || null,
          permissions: dto.permissions ? checkedPermissions(dto.permissions) : undefined,
          isCityScoped: dto.isCityScoped,
        },
      });
      const members = await this.prisma.user.findMany({ where: { staffRoleId: id }, select: { id: true } });
      for (const m of members) await this.access.invalidate(m.id);
      return role;
    } catch (e) {
      throw sameName(e);
    }
  }

  async deleteRole(id: string): Promise<void> {
    const role = await this.prisma.staffRole.findUnique({ where: { id }, include: { _count: { select: { members: true } } } });
    if (!role) throw new NotFoundException('Role not found');
    if (role._count.members > 0) throw new ConflictException(`${role._count.members} staff still have this role: give them another one first`);
    await this.prisma.staffRole.delete({ where: { id } });
  }

  private async member(userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, role: Role.ADMIN, deletedAt: null }, select: STAFF_SELECT });
    if (!user) throw new NotFoundException('Not on the team');
    return user;
  }

  /** Never leaves the team without an owner. */
  private async keepAnOwner(leavingId: string): Promise<void> {
    const owners = await this.prisma.user.count({ where: { role: Role.ADMIN, adminLevel: AdminLevel.OWNER, deletedAt: null, id: { not: leavingId } } });
    if (owners === 0) throw new BadRequestException('The team needs at least one owner');
  }

  /** Level, role and cities that make sense together: staff need a role; a city-limited role needs known cities. */
  private async accessFields(level: AdminLevel, roleId: string | null, cityIds: readonly string[]) {
    if (level === AdminLevel.OWNER) return { adminLevel: AdminLevel.OWNER, staffRoleId: null, adminCityIds: [] as string[] };
    if (!roleId) throw new BadRequestException('Pick a role');
    const role = await this.prisma.staffRole.findUnique({ where: { id: roleId }, select: { isCityScoped: true } });
    if (!role) throw new BadRequestException('Unknown role');
    const cities = [...new Set(cityIds)];
    if (role.isCityScoped && cities.length === 0) throw new BadRequestException('Pick the cities this person sets up');
    if (cities.length && (await this.prisma.city.count({ where: { id: { in: cities } } })) !== cities.length) throw new BadRequestException('Unknown city');
    return { adminLevel: AdminLevel.SUPPORT, staffRoleId: roleId, adminCityIds: role.isCityScoped ? cities : [] };
  }
}

function checkedPermissions(list: readonly string[]): string[] {
  const unknown = list.filter((p) => !isPermission(p));
  if (unknown.length) throw new BadRequestException(`Unknown permission: ${unknown.join(', ')}`);
  return [...new Set(list)];
}

function sameName(e: unknown): Error {
  if ((e as { code?: string }).code === 'P2002') return new ConflictException('A role with this name exists');
  if ((e as { code?: string }).code === 'P2025') return new NotFoundException('Role not found');
  return e as Error;
}
