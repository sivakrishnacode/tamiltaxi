import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { DriverStateCache } from '../../core/driver-state/driver-state.cache.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { Driver, Prisma } from '../../generated/prisma/client.js';
import { AppKind, Role } from '../../generated/prisma/enums.js';
import { PushService } from '../notifications/push.service.js';
import { describeAudit } from './activity.js';
import { DriverStatusSync } from './driver-status-sync.service.js';
import type { AdminDriverProfileDto, MessageDto } from './dto/people.dto.js';

type Person = { id: string; name: string | null; phone: string } | null;

export interface AdminNoteView {
  readonly id: string;
  readonly body: string;
  readonly createdAt: Date;
  readonly author: Person;
}

export interface ActivityEntry {
  readonly id: string;
  readonly at: Date;
  readonly summary: string;
  readonly action: string;
  readonly actor: Person;
}

/** Looking after one person from the admin panel: notes, history, a direct push, fixes to a driver's details. */
@Injectable()
export class AdminPeopleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    private readonly driverState: DriverStateCache,
    private readonly statusSync: DriverStatusSync,
  ) {}

  notes(userId: string): Promise<AdminNoteView[]> {
    return this.prisma.adminNote.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, body: true, createdAt: true, author: { select: { id: true, name: true, phone: true } } },
    });
  }

  async addNote(userId: string, authorId: string, body: string): Promise<AdminNoteView> {
    await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true } });
    return this.prisma.adminNote.create({
      data: { userId, authorId, body: body.trim() },
      select: { id: true, body: true, createdAt: true, author: { select: { id: true, name: true, phone: true } } },
    });
  }

  async removeNote(id: string): Promise<void> {
    await this.prisma.adminNote.delete({ where: { id } });
  }

  /**
   * The person's admin history, newest first: changes to their account and, for a driver, to their driver profile
   * (status, documents, photo, pause, edits, bulk approvals: one row per approved driver), with who made each change.
   */
  async activity(userId: string, limit = 50): Promise<ActivityEntry[]> {
    const driver = await this.prisma.driver.findUnique({ where: { userId }, select: { id: true } });
    const or: Prisma.AuditLogWhereInput[] = [{ entity: 'users', entityId: userId }];
    if (driver) or.push({ entity: 'drivers', entityId: driver.id });
    const rows = await this.prisma.auditLog.findMany({ where: { OR: or }, orderBy: { createdAt: 'desc' }, take: Math.min(limit, 200) });
    const actorIds = [...new Set(rows.map((r) => r.actorId))];
    const actors = await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, phone: true } });
    return rows.map((r) => ({
      id: r.id,
      at: r.createdAt,
      action: r.action,
      summary: describeAudit(r.action, r.data),
      actor: actors.find((a) => a.id === r.actorId) ?? null,
    }));
  }

  /**
   * A push from the admins to one person (driver app for drivers, rider app otherwise, or both). Returns the phones
   * it went to: 0 means nobody has signed in on a phone with notifications, so nothing was sent.
   */
  async message(userId: string, dto: MessageDto): Promise<{ devices: number }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true, driver: { select: { id: true } } } });
    const target = dto.app ?? (user.role === Role.DRIVER || user.driver ? 'DRIVER' : 'PASSENGER');
    const apps = target === 'BOTH' ? [AppKind.DRIVER, AppKind.PASSENGER] : [target === 'DRIVER' ? AppKind.DRIVER : AppKind.PASSENGER];
    const devices = await this.prisma.deviceToken.count({ where: { userId, app: { in: apps } } });
    const msg = { title: dto.title.trim(), body: dto.body.trim(), channel: 'account' as const, data: { type: 'admin_message' } };
    for (const app of apps) this.push.toUser(userId, app, msg);
    return { devices };
  }

  /** Fixes a driver's vehicle / payout details. The vehicle kind changes only while they're offline. */
  async updateDriverProfile(driverId: string, dto: AdminDriverProfileDto): Promise<Driver> {
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId }, select: { isOnline: true, vehicleKind: true } });
    if (!driver) throw new NotFoundException('Not found');
    if (dto.vehicleKind && dto.vehicleKind !== driver.vehicleKind && driver.isOnline) {
      throw new ConflictException('Take the driver offline before changing the vehicle');
    }
    if (dto.cityId && !(await this.prisma.city.count({ where: { id: dto.cityId } }))) throw new BadRequestException('Unknown city');
    try {
      const updated = await this.prisma.driver.update({ where: { id: driverId }, data: { ...dto, plate: dto.plate?.toUpperCase().replace(/\s+/g, ' ').trim() } });
      await this.driverState.invalidate(driverId);
      return updated;
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') throw new ConflictException('Another driver already has this plate');
      throw e;
    }
  }

  /**
   * Takes an online driver offline now (out of dispatch, and the app hears `driver.status`); they can go online again
   * unless held or blocked.
   */
  async takeOffline(driverId: string): Promise<Driver> {
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId }, select: { isOnline: true } });
    if (!driver) throw new NotFoundException('Not found');
    if (!driver.isOnline) throw new ConflictException('The driver is already offline');
    return this.statusSync.changed(driverId, { offline: true });
  }
}
