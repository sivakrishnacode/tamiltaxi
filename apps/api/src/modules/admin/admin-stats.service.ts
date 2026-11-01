import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/prisma/prisma.service.js';
import { DriverStatus, Role, SubscriptionStatus, TicketStatus, TripStatus } from '../../generated/prisma/enums.js';
import { AdminMissedService } from './admin-missed.service.js';
import type { AdminStats } from './admin.types.js';

const ACTIVE_TRIP: TripStatus[] = [
  TripStatus.SEARCHING,
  TripStatus.DRIVER_ASSIGNED,
  TripStatus.DRIVER_ARRIVED,
  TripStatus.IN_PROGRESS,
  TripStatus.PICKED_UP,
];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Dashboard KPIs for the admin panel. */
@Injectable()
export class AdminStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly missed: AdminMissedService,
  ) {}

  async stats(): Promise<AdminStats> {
    const today = startOfDay(new Date());
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const byStatus = await this.prisma.driver.groupBy({ by: ['status'], _count: true });
    const count = (s: DriverStatus): number => byStatus.find((b) => b.status === s)?._count ?? 0;
    const [online, passengers, tripsToday, activeTrips, completedToday, cancelledToday, missedToday, fares, paid, activeSubs, trialSubs, openTickets] =
      await Promise.all([
        this.prisma.driver.count({ where: { isOnline: true } }),
        this.prisma.user.count({ where: { role: Role.PASSENGER } }),
        this.prisma.trip.count({ where: { createdAt: { gte: today } } }),
        this.prisma.trip.count({ where: { status: { in: ACTIVE_TRIP } } }),
        this.prisma.trip.count({ where: { createdAt: { gte: today }, status: { in: [TripStatus.COMPLETED, TripStatus.DELIVERED] } } }),
        this.prisma.trip.count({ where: { createdAt: { gte: today }, status: TripStatus.CANCELLED } }),
        this.missed.countSince(today),
        this.prisma.trip.aggregate({ _sum: { fareTotal: true }, where: { createdAt: { gte: today }, status: { in: [TripStatus.COMPLETED, TripStatus.DELIVERED] } } }),
        this.prisma.payment.aggregate({ _sum: { amount: true }, where: { status: 'PAID', createdAt: { gte: monthStart } } }),
        this.prisma.subscription.count({ where: { status: SubscriptionStatus.ACTIVE, endsAt: { gte: new Date() } } }),
        this.prisma.subscription.count({ where: { status: SubscriptionStatus.TRIAL, endsAt: { gte: new Date() } } }),
        this.prisma.supportTicket.count({ where: { status: { not: TicketStatus.RESOLVED } } }),
      ]);
    return {
      drivers: {
        total: byStatus.reduce((a, b) => a + b._count, 0),
        pending: count(DriverStatus.PENDING),
        approved: count(DriverStatus.APPROVED),
        rejected: count(DriverStatus.REJECTED),
        onHold: count(DriverStatus.ON_HOLD),
        online,
      },
      passengers,
      trips: { today: tripsToday, active: activeTrips, completedToday, cancelledToday, missedToday, faresToday: fares._sum.fareTotal ?? 0 },
      revenue: { paidThisMonth: paid._sum.amount ?? 0, activeSubscriptions: activeSubs, trialSubscriptions: trialSubs },
      openTickets,
      tripsLast7Days: await this.last7Days(today),
    };
  }

  private async last7Days(today: Date): Promise<{ date: string; count: number }[]> {
    const from = new Date(today.getTime() - 6 * 86_400_000);
    const trips = await this.prisma.trip.findMany({ where: { createdAt: { gte: from } }, select: { createdAt: true } });
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(from.getTime() + i * 86_400_000);
      const next = new Date(day.getTime() + 86_400_000);
      const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      return { date, count: trips.filter((t) => t.createdAt >= day && t.createdAt < next).length };
    });
  }
}
