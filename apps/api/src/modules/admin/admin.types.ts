/** A page of results. */
export interface Paged<T> {
  readonly items: T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

/** Dashboard numbers. */
export interface AdminStats {
  readonly drivers: { total: number; pending: number; approved: number; rejected: number; onHold: number; online: number };
  readonly passengers: number;
  readonly trips: {
    today: number;
    active: number;
    completedToday: number;
    cancelledToday: number;
    /** Booked today and got no driver (admin-missed.service.ts MISSED_SQL). */
    missedToday: number;
    faresToday: number;
  };
  readonly revenue: { paidThisMonth: number; activeSubscriptions: number; trialSubscriptions: number };
  readonly openTickets: number;
  /** Trips per day for the last 7 days (oldest first). */
  readonly tripsLast7Days: { date: string; count: number }[];
}
