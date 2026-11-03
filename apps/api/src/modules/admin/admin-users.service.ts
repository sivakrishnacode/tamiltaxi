import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';

import { isOwner } from '../../core/auth/admin-access.js';
import type { AuthUser } from '../../core/auth/auth-user.js';
import { OWNER_ONLY_MESSAGE } from '../../core/auth/roles.guard.js';
import { UserAccessService } from '../../core/auth/user-access.service.js';
import { DriverStateCache } from '../../core/driver-state/driver-state.cache.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { RedisService } from '../../core/redis/redis.service.js';
import type { KycDocument, Prisma, User } from '../../generated/prisma/client.js';
import { AdminLevel, CancelFault, CancelledBy, KycStatus, Role } from '../../generated/prisma/enums.js';
import { type PassengerCancelRate, passengerCancelRate } from '../trips/cancel-rate.js';

/** Window of the passenger cancellation rate on the admin user page. */
const PASSENGER_RATE_DAYS = 30;
import type { Paged } from './admin.types.js';
import type { ListQueryDto } from './dto/list-query.dto.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';
import { UPLOAD_DOCS } from '../kyc/driver-approval.js';
import { EXPIRING_WITHIN_DAYS, istToday } from '../kyc/document-expiry.js';
import { driverSearch, flag, userSearch } from './list-filters.js';

/** All accounts (passengers, drivers, admins): search, roles, block/unblock; plus the KYC review queue. */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly driverState: DriverStateCache,
    private readonly access: UserAccessService,
  ) {}

  async users(q: ListQueryDto & { role?: string; blocked?: string }): Promise<Paged<User>> {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const role = Object.values(Role).includes(q.role as Role) ? (q.role as Role) : undefined;
    const where: Prisma.UserWhereInput = {
      role,
      isBlocked: flag(q.blocked),
      ...userSearch(q.q, true),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' },
        include: { driver: { select: { id: true, status: true, vehicleKind: true, plate: true } }, _count: { select: { trips: true, tickets: true } } },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  /** With the passenger's cancellation rate over the last 30 days (shown only; passengers are never blocked). */
  async user(id: string): Promise<User & { cancelRate: PassengerCancelRate }> {
    const since = new Date(Date.now() - PASSENGER_RATE_DAYS * 86_400_000);
    const [user, booked, cancelled, atFault] = await Promise.all([
      this.userRow(id),
      this.prisma.trip.count({ where: { passengerId: id, createdAt: { gte: since } } }),
      this.prisma.tripCancellation.count({ where: { passengerId: id, by: CancelledBy.PASSENGER, createdAt: { gte: since } } }),
      this.prisma.tripCancellation.count({ where: { passengerId: id, fault: CancelFault.PASSENGER, createdAt: { gte: since } } }),
    ]);
    return { ...user, cancelRate: passengerCancelRate({ since, booked, cancelled, atFault }) };
  }

  private userRow(id: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id },
      include: {
        driver: { include: { documents: true } },
        emergencyContacts: true,
        savedPlaces: true,
        trips: { orderBy: { createdAt: 'desc' }, take: 20 },
        tickets: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
  }

  /** Updates a user; blocking also takes effect immediately for existing tokens (Redis flag). */
  /**
   * Name, email, block and, for owner admins only (never on their own account), the role, admin level and assigned
   * cities. Someone made ADMIN here starts as SUPPORT unless a level is given; unknown city ids are refused.
   */
  async update(id: string, dto: UpdateUserDto, caller?: AuthUser): Promise<User> {
    const changesAccess = dto.role !== undefined || dto.adminLevel !== undefined || dto.adminCityIds !== undefined;
    if (changesAccess && caller) {
      if (!isOwner(caller)) throw new ForbiddenException(OWNER_ONLY_MESSAGE);
      if (caller.userId === id) throw new BadRequestException("You can't change your own access");
    }
    let access: Prisma.UserUpdateInput = {};
    if (changesAccess) {
      const current = await this.prisma.user.findUniqueOrThrow({ where: { id }, select: { role: true } });
      const cities = dto.adminCityIds ? [...new Set(dto.adminCityIds)] : undefined;
      if (cities?.length) {
        const known = await this.prisma.city.count({ where: { id: { in: cities } } });
        if (known !== cities.length) throw new BadRequestException('Unknown city');
      }
      const isNewAdmin = dto.role === Role.ADMIN && current.role !== Role.ADMIN;
      access = { adminLevel: dto.adminLevel ?? (isNewAdmin ? AdminLevel.SUPPORT : undefined), adminCityIds: cities };
    }
    const { adminLevel: _level, adminCityIds: _cities, ...rest } = dto;
    const user = await this.prisma.user.update({
      where: { id, deletedAt: null },
      data: { ...rest, ...access, blockedReason: dto.isBlocked === false ? null : dto.blockedReason },
    });
    if (user.isBlocked) await this.redis.set(`user:blocked:${id}`, '1');
    else await this.redis.del(`user:blocked:${id}`);
    // A blocked driver's GPS is ignored at once, not only after the cache expires; a new role applies to the
    // tokens they already hold.
    await this.driverState.invalidateUser(id);
    await this.access.invalidate(id);
    return user;
  }

  /** KYC documents waiting for review (or in another status), oldest first. */
  async kycQueue(q: ListQueryDto): Promise<Paged<KycDocument>> {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    // EXPIRING: verified documents valid for at most 30 more days, soonest first.
    const isExpiring = q.status === 'EXPIRING';
    const status = isExpiring ? KycStatus.VERIFIED : Object.values(KycStatus).includes(q.status as KycStatus) ? (q.status as KycStatus) : KycStatus.UNDER_REVIEW;
    const where: Prisma.KycDocumentWhereInput = {
      status,
      type: { in: [...UPLOAD_DOCS] },
      driver: driverSearch(q.q),
      expiresOn: isExpiring ? { lte: new Date(istToday(new Date()).getTime() + EXPIRING_WITHIN_DAYS * 86_400_000) } : undefined,
    };
    const [items, total] = await Promise.all([
      this.prisma.kycDocument.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy: isExpiring ? { expiresOn: 'asc' } : { updatedAt: 'asc' },
        include: { driver: { include: { user: { select: { id: true, name: true, phone: true, identityStatus: true } } } } },
      }),
      this.prisma.kycDocument.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
}
