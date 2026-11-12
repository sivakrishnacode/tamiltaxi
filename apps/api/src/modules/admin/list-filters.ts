import type { Prisma } from '../../generated/prisma/client.js';

/** Sort keys of the admin lists (`?sort=`). The first of each list is its default. */
export const DRIVER_SORTS = ['newest', 'oldest', 'rating', 'trips', 'name'] as const;
export const PASSENGER_SORTS = ['newest', 'oldest', 'trips', 'name'] as const;
export const TRIP_SORTS = ['newest', 'oldest', 'fare'] as const;
export const LIST_SORTS = [...new Set([...DRIVER_SORTS, ...PASSENGER_SORTS, ...TRIP_SORTS])];

/**
 * Riders list `?signup=`: done (default) = named or has booked, not deleted; unfinished = verified their phone but
 * never entered a name nor booked (the account is made at OTP sign-in, before P-05; also driver-app sign-ins that never
 * registered); deleted.
 */
export const RIDER_SIGNUPS = ['done', 'unfinished', 'deleted'] as const;

/**
 * The digits of a search that looks like a phone number ("+91 98765 43210" → "9876543210", "98765" → "98765"), so it
 * matches the stored "+919876543210" whatever spaces or prefix the admin typed. Null below 4 digits or when the text
 * has letters (a name or a plate).
 */
export function phoneDigits(q: string | undefined): string | null {
  if (!q || /[a-z]/i.test(q)) return null;
  const digits = q.replace(/\D/g, '');
  if (digits.length < 4) return null;
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/**
 * A plate typed without spaces in the stored format ("tn38ab1234" → "tn 38 ab 1234", "TN38" → "TN 38"); null when
 * the text isn't a plate prefix. Plates are saved as "TN 38 AB 1234".
 */
export function spacedPlate(q: string): string | null {
  const m = /^([a-z]{2})(\d{1,2})([a-z]{0,3})(\d{0,4})$/i.exec(q.replace(/\s+/g, ''));
  return m ? m.slice(1).filter(Boolean).join(' ') : null;
}

/** "true" / "false" query flags. */
export function flag(value: string | undefined): boolean | undefined {
  return value === 'true' ? true : value === 'false' ? false : undefined;
}

/** Name / phone (spaces and +91 ignored) / plate search over drivers. */
export function driverSearch(q: string | undefined): Prisma.DriverWhereInput | undefined {
  if (!q) return undefined;
  const digits = phoneDigits(q);
  const plate = spacedPlate(q);
  return {
    OR: [
      { plate: { contains: q, mode: 'insensitive' } },
      ...(plate && plate !== q ? [{ plate: { contains: plate, mode: 'insensitive' as const } }] : []),
      { user: { name: { contains: q, mode: 'insensitive' } } },
      { user: { phone: { contains: digits ?? q } } },
    ],
  };
}

/** Name / phone / email search over users. */
export function userSearch(q: string | undefined, withEmail = false): Prisma.UserWhereInput | undefined {
  if (!q) return undefined;
  const digits = phoneDigits(q);
  return {
    OR: [
      { name: { contains: q, mode: 'insensitive' } },
      { phone: { contains: digits ?? q } },
      ...(withEmail ? [{ email: { contains: q, mode: 'insensitive' as const } }] : []),
    ],
  };
}

export function driverOrder(sort: string | undefined): Prisma.DriverOrderByWithRelationInput[] {
  switch (sort) {
    case 'oldest':
      return [{ createdAt: 'asc' }];
    case 'rating':
      return [{ rating: 'desc' }, { ratingCount: 'desc' }];
    case 'trips':
      return [{ ridesCount: 'desc' }, { createdAt: 'desc' }];
    case 'name':
      return [{ user: { name: 'asc' } }];
    default:
      return [{ createdAt: 'desc' }];
  }
}

export function riderSignup(value: string | undefined): Prisma.UserWhereInput {
  switch (value) {
    case 'unfinished':
      return { deletedAt: null, name: null, trips: { none: {} } };
    case 'deleted':
      return { deletedAt: { not: null } };
    default:
      return { deletedAt: null, OR: [{ name: { not: null } }, { trips: { some: {} } }] };
  }
}

export function passengerOrder(sort: string | undefined): Prisma.UserOrderByWithRelationInput[] {
  switch (sort) {
    case 'oldest':
      return [{ createdAt: 'asc' }];
    case 'trips':
      return [{ trips: { _count: 'desc' } }, { createdAt: 'desc' }];
    case 'name':
      return [{ name: 'asc' }];
    default:
      return [{ createdAt: 'desc' }];
  }
}

export function tripOrder(sort: string | undefined): Prisma.TripOrderByWithRelationInput[] {
  switch (sort) {
    case 'oldest':
      return [{ createdAt: 'asc' }];
    case 'fare':
      return [{ fareTotal: 'desc' }, { createdAt: 'desc' }];
    default:
      return [{ createdAt: 'desc' }];
  }
}
