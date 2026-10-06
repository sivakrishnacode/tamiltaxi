/** What every trip read includes: the driver with a few account fields, and the passenger's public details only. */
export const TRIP_INCLUDE = {
  driver: { include: { user: { select: { id: true, name: true, phone: true, gender: true } } } },
  passenger: { select: { id: true, name: true, phone: true, identityStatus: true } },
} as const;
