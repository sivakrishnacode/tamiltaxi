/**
 * Domain events (NestJS EventEmitter, https://docs.nestjs.com/application/events): the module where something happens
 * emits one, and other modules react in `@OnEvent(<name>, { async: true })` listeners instead of being called
 * directly. Emitting never waits for or fails with a listener (errors are logged by the event emitter).
 */
export const DomainEvents = {
  /** A rider finished sign-up: a passenger saved a name for the first time (P-05). */
  RiderSignedUp: 'rider.signed-up',
  /** Someone registered as a driver (POST /drivers, a new driver only). */
  DriverRegistered: 'driver.registered',
  /** A driver was approved: by an admin (one or in bulk) or automatically. Reactivating from On hold is not one. */
  DriverApproved: 'driver.approved',
} as const;

export class RiderSignedUpEvent {
  constructor(readonly userId: string) {}
}

export class DriverRegisteredEvent {
  constructor(
    readonly userId: string,
    readonly driverId: string,
  ) {}
}

export class DriverApprovedEvent {
  constructor(readonly driverId: string) {}
}
