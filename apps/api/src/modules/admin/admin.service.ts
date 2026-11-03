import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { DriverStateCache } from '../../core/driver-state/driver-state.cache.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { Driver, KycDocument, Plan, Prisma, SupportTicket, Trip, User } from '../../generated/prisma/client.js';
import { DriverStatus, KycDocType, Role, TicketStatus, TripStatus } from '../../generated/prisma/enums.js';
import type { Paged } from './admin.types.js';
import type { ListQueryDto } from './dto/list-query.dto.js';
import { NotifierService } from '../notifications/notifier.service.js';
import { DriverApprovalService } from '../kyc/driver-approval.service.js';
import { DiditClient } from '../kyc/didit.client.js';
import { approvalChecklist, type ApprovalChecklist, IDENTITY_DOCS, REQUIRED_DOCS } from '../kyc/driver-approval.js';
import { SHOWN_DOCS } from './admin-approvals.service.js';
import { istToday, parseDay } from '../kyc/document-expiry.js';
import { type CancelRateStats, DriverBlocksService } from '../trips/driver-blocks.service.js';
import { DriverStatusSync } from './driver-status-sync.service.js';
import { driverOrder, driverSearch, flag, passengerOrder, tripOrder, userSearch } from './list-filters.js';

/** What the drivers list shows (no UPI id, no booking prefs, latest plan only). */
const DRIVER_LIST_SELECT = {
  id: true,
  userId: true,
  workType: true,
  vehicleKind: true,
  vehicleModel: true,
  vehicleColor: true,
  plate: true,
  rating: true,
  ratingCount: true,
  ridesCount: true,
  status: true,
  cityId: true,
  isOnline: true,
  photoFile: true,
  pendingPhotoFile: true,
  blockedUntil: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, name: true, phone: true, gender: true, identityStatus: true, isBlocked: true } },
  documents: { where: { type: { in: [...REQUIRED_DOCS] } }, select: { id: true, type: true, status: true } },
  subscriptions: { orderBy: { endsAt: 'desc' }, take: 1, select: { id: true, status: true, endsAt: true, plan: { select: { period: true, vehicleKind: true, price: true } } } },
} satisfies Prisma.DriverSelect;
type DriverListItem = Prisma.DriverGetPayload<{ select: typeof DRIVER_LIST_SELECT }>;

function paging(q: ListQueryDto): { skip: number; take: number; page: number; pageSize: number } {
  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 20;
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

function isOneOf<T extends string>(value: string | undefined, values: readonly T[]): value is T {
  return !!value && (values as readonly string[]).includes(value);
}

/** Admin lists and actions: drivers + KYC, trips, passengers, plans, tickets. */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: NotifierService,
    private readonly approval: DriverApprovalService,
    private readonly driverState: DriverStateCache,
    private readonly blocks: DriverBlocksService,
    private readonly didit: DiditClient,
    private readonly statusSync: DriverStatusSync,
  ) {}

  /** Filters (status, vehicle, online, gender, search) + sort, with the count per status for the tabs. */
  async drivers(q: ListQueryDto): Promise<Paged<DriverListItem> & { counts: Record<DriverStatus, number> }> {
    const { skip, take, page, pageSize } = paging(q);
    const base: Prisma.DriverWhereInput = {
      vehicleKind: q.vehicle,
      cityId: q.city === 'none' ? null : q.city,
      isOnline: flag(q.online),
      user: q.gender ? { gender: q.gender } : undefined,
      ...driverSearch(q.q),
    };
    const where: Prisma.DriverWhereInput = { ...base, status: isOneOf(q.status, Object.values(DriverStatus)) ? q.status : undefined };
    const [items, total, byStatus] = await Promise.all([
      this.prisma.driver.findMany({ where, skip, take, orderBy: driverOrder(q.sort), select: DRIVER_LIST_SELECT }),
      this.prisma.driver.count({ where }),
      this.prisma.driver.groupBy({ by: ['status'], where: base, _count: true }),
    ]);
    const counts = Object.fromEntries(Object.values(DriverStatus).map((s) => [s, byStatus.find((b) => b.status === s)?._count ?? 0])) as Record<DriverStatus, number>;
    return { items, total, page, pageSize, counts };
  }

  /**
   * With the pause history, the cancellation rate now (7 days, trips/driver-blocks.service.ts) and the approval
   * checklist (documents + identity, as the Approvals queue shows it).
   */
  async driver(id: string): Promise<Driver & { cancelRate: CancelRateStats; checklist: ApprovalChecklist; identityRequired: boolean }> {
    const driver = await this.prisma.driver.findUniqueOrThrow({
      where: { id },
      include: {
        blocks: { orderBy: { fromAt: 'desc' }, take: 20 },
        // Identity checks (Didit): newest first; the admin page shows the latest result and its reasons.
        user: { include: { identityChecks: { orderBy: { createdAt: 'desc' }, take: 5 } } },
        documents: { where: SHOWN_DOCS, orderBy: { type: 'asc' } },
        subscriptions: { orderBy: { endsAt: 'desc' }, include: { plan: true, payments: true } },
        trips: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    const identityRequired = await this.approval.isIdentityRequired(driver);
    const checklist = approvalChecklist({ docs: driver.documents, identity: driver.user.identityStatus, isIdentityRequired: identityRequired });
    return { ...driver, cancelRate: await this.blocks.stats(id), checklist, identityRequired };
  }

  /**
   * An admin decision (approve, hold, reject, back to pending). The driver gets a push, with the reason when given;
   * anything but APPROVED takes them out of dispatch at once, and the app hears `driver.status` (DriverStatusSync).
   */
  async setDriverStatus(id: string, status: DriverStatus, reason?: string): Promise<Driver> {
    const before = await this.prisma.driver.findUniqueOrThrow({ where: { id }, select: { status: true } });
    await this.prisma.driver.update({ where: { id }, data: { status, isOnline: status === DriverStatus.APPROVED ? undefined : false } });
    await this.driverState.invalidate(id);
    const driver = await this.statusSync.changed(id);
    if (before.status !== status) void this.notifier.driverStatus({ driverId: id, from: before.status, to: status, reason });
    return driver;
  }

  /** Verify or reject one document; RC + insurance verified and identity approved → APPROVED, any rejected → REJECTED. */
  /**
   * Verify (with the valid-until date, if any) or reject an uploaded document. Verifying a verified document again
   * just changes its date; a new date restarts the expiry reminders.
   */
  async reviewDocument(params: { driverId: string; type: KycDocType; status: 'VERIFIED' | 'REJECTED'; reason?: string; expiresOn?: string }): Promise<KycDocument[]> {
    const doc = await this.prisma.kycDocument.findUnique({ where: { driverId_type: { driverId: params.driverId, type: params.type } } });
    if (!doc) throw new NotFoundException('Document not found');
    // A row exists from registration on; there is nothing to verify (or reject) until a file is uploaded.
    if (doc.status === 'NOT_UPLOADED' || !doc.fileUrl) throw new BadRequestException('The driver has not uploaded this document yet');
    const expiresOn = params.status === 'VERIFIED' && params.expiresOn ? parseDay(params.expiresOn) : null;
    if (expiresOn && expiresOn < istToday(new Date())) throw new BadRequestException('That date has passed: reject the document instead');
    const isSameDate = (expiresOn?.getTime() ?? null) === (doc.expiresOn?.getTime() ?? null);
    await this.prisma.kycDocument.update({
      where: { driverId_type: { driverId: params.driverId, type: params.type } },
      data: {
        status: params.status,
        rejectReason: params.status === 'REJECTED' ? (params.reason ?? 'Please upload a clearer image') : null,
        ...(params.status === 'VERIFIED' ? { expiresOn, expiryNotifiedDays: isSameDate ? doc.expiryNotifiedDays : null } : {}),
      },
    });
    // The identity check by hand: the licence and Aadhaar (with the approved profile photo) decide the identity status.
    if (IDENTITY_DOCS.includes(params.type)) await this.approval.syncManualIdentity(params.driverId);
    // Approval (and its push) happens in recompute once the identity check has passed too.
    await this.approval.recompute(params.driverId);
    if (params.status === 'REJECTED') void this.notifier.kycReviewed({ driverId: params.driverId, type: params.type, status: 'REJECTED', reason: params.reason });
    return this.prisma.kycDocument.findMany({ where: { driverId: params.driverId }, orderBy: { type: 'asc' } });
  }

  async trips(q: ListQueryDto): Promise<Paged<Omit<Trip, 'pathPolyline' | 'routePolyline'>>> {
    const { skip, take, page, pageSize } = paging(q);
    const where: Prisma.TripWhereInput = {
      // An unknown status (an edited URL) lists everything rather than failing the Prisma query.
      status: isOneOf(q.status, Object.values(TripStatus)) ? q.status : undefined,
      kind: q.kind === 'RIDE' || q.kind === 'PARCEL' ? q.kind : undefined,
      vehicleKind: q.vehicle,
      needsReview: q.review === 'true' ? true : undefined,
      createdAt: q.from || q.to ? { gte: q.from ? new Date(q.from) : undefined, lt: q.to ? new Date(q.to) : undefined } : undefined,
      OR: q.q ? [{ id: { contains: q.q } }, { pickupName: { contains: q.q, mode: 'insensitive' } }, { dropName: { contains: q.q, mode: 'insensitive' } }] : undefined,
    };
    const [items, total] = await Promise.all([
      // The recorded path and the quoted route are only needed on the trip page; people as names and phones only.
      // The last cancellation's verdict, for the fault column of cancelled trips.
      this.prisma.trip.findMany({
        where,
        skip,
        take,
        orderBy: tripOrder(q.sort),
        omit: { pathPolyline: true, routePolyline: true },
        include: {
          passenger: { select: { id: true, name: true, phone: true } },
          driver: { select: { id: true, plate: true, vehicleKind: true, user: { select: { id: true, name: true, phone: true } } } },
          cancellations: { orderBy: { createdAt: 'desc' }, take: 1, select: { fault: true, faultRule: true, reassigned: true } },
        },
      }),
      this.prisma.trip.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  /** Admin decision on a flagged trip. The note is kept after the flag's reason ("Reviewed: …"). */
  async reviewTrip(id: string, body: { needsReview: boolean; note?: string }): Promise<Trip> {
    const trip = await this.prisma.trip.findUniqueOrThrow({ where: { id }, select: { reviewNote: true } });
    const note = body.note?.trim();
    const label = body.needsReview ? 'Flagged' : 'Reviewed';
    return this.prisma.trip.update({
      where: { id },
      data: { needsReview: body.needsReview, reviewNote: note ? [trip.reviewNote, `${label}: ${note}`].filter(Boolean).join('; ') : undefined },
    });
  }

  trip(id: string): Promise<Trip> {
    return this.prisma.trip.findUniqueOrThrow({
      where: { id },
      include: {
        passenger: true,
        driver: { include: { user: true } },
        tickets: true,
        // Every cancel, including drivers who dropped the trip before another took it.
        cancellations: { orderBy: { createdAt: 'asc' }, include: { driver: { select: { id: true, plate: true, user: { select: { name: true } } } } } },
        // Safety: SOS alerts and signals (long stops, deviations, check-ins), newest first.
        sos: { orderBy: { createdAt: 'desc' } },
        safetyEvents: { orderBy: { at: 'desc' }, take: 50 },
      },
    });
  }

  /** Riders: search (name, phone), blocked / women-driver preference / verified filters, sort. */
  async passengers(q: ListQueryDto): Promise<Paged<User>> {
    const { skip, take, page, pageSize } = paging(q);
    const where: Prisma.UserWhereInput = {
      role: Role.PASSENGER,
      isBlocked: flag(q.blocked),
      preferWomenDriver: q.women === 'true' ? true : undefined,
      identityStatus: q.verified === 'true' ? 'APPROVED' : undefined,
      ...userSearch(q.q),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({ where, skip, take, orderBy: passengerOrder(q.sort), include: { _count: { select: { trips: true } } } }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  plans(): Promise<Plan[]> {
    return this.prisma.plan.findMany({ orderBy: [{ vehicleKind: 'asc' }, { price: 'asc' }] });
  }

  updatePlan(id: string, data: { price?: number; isActive?: boolean }): Promise<Plan> {
    return this.prisma.plan.update({ where: { id }, data });
  }

  async tickets(q: ListQueryDto): Promise<Paged<SupportTicket>> {
    const { skip, take, page, pageSize } = paging(q);
    const where: Prisma.SupportTicketWhereInput = { status: isOneOf(q.status, Object.values(TicketStatus)) ? q.status : undefined };
    const [items, total] = await Promise.all([
      this.prisma.supportTicket.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: { user: true, trip: true } }),
      this.prisma.supportTicket.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  setTicketStatus(id: string, status: TicketStatus): Promise<SupportTicket> {
    return this.prisma.supportTicket.update({ where: { id }, data: { status } });
  }
}
