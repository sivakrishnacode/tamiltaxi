/** Platform settings editable in the admin panel, with their defaults. */
export const SETTING_DEFAULTS = {
  /** Platform-wide demand multiplier ("Peak time"), 1.0–1.5. 1.0 = no markup; surge zones and live demand still apply. */
  currentMultiplier: 1.0,
  /** Hard cap for any multiplier (surge zones included). */
  maxMultiplier: 1.5,
  /** Driver search radius around the pickup when a booking starts searching. */
  searchRadiusKm: 5,
  /** The radius widens while nobody accepts, up to this (few drivers early on: look farther rather than fail). */
  maxSearchRadiusKm: 15,
  /** Seconds to widen from [searchRadiusKm] to [maxSearchRadiusKm] (0 = the maximum at once). */
  searchExpandSeconds: 45,
  /** Seconds each driver has to accept an offer. */
  offerSeconds: 15,
  /** Requests one driver can have open at once (stacked on the request screen; accepting one releases the rest). 1 = one at a time. */
  maxOpenOffers: 3,
  /** Drivers offered per booking before "No drivers". */
  maxCandidates: 5,
  /** A driver cancel before pickup sends the trip back to searching this many times; the next one cancels it. */
  maxReassigns: 2,
  /** "Driver not moving": first check max(this, notMovingEtaFactor × pickup ETA) minutes after accept. */
  notMovingMinMin: 3,
  notMovingEtaFactor: 1.5,
  /** The driver must have got at least this much closer to the pickup (straight line) since accepting. */
  notMovingMinProgressM: 150,
  /** After a nudge, check again this many minutes later; the second failed check gives the ride to another driver. */
  notMovingRecheckMin: 2,
  /** Minutes the driver waits at the pickup before they may cancel as "Passenger didn't come" (no fault). */
  noShowWaitMin: 5,
  /** Waiting charge: minutes at the pickup (after "Arrived") that are free; then each started minute costs the vehicle's `waitPerMin`. */
  freeWaitMin: 3,
  /** Waiting charge cap per trip, in rupees. */
  waitMaxCharge: 30,
  /**
   * Cancellation fee. Off until the owner decides the policy (rides are cash, there is no settlement between drivers).
   * On: a passenger who cancels after the driver arrived and waited the free minutes (verdict PASSENGER) owes
   * [cancellationFee] to that driver, added to their next completed ride as "Previous cancellation fee".
   */
  cancellationFeeEnabled: false,
  cancellationFee: 10,
  /**
   * Driver cancellation rate over a sliding 7 days: driver-fault cancellations ÷ assigned trips. Judged only from
   * [cancelRateMinTrips] assigned trips; from [cancelRateNudge] the driver is warned, from [cancelRateBlock] paused
   * for [cancelBlockHours] ([cancelBlockRepeatHours] if they were paused in the last 7 days).
   */
  cancelRateMinTrips: 5,
  cancelRateNudge: 0.3,
  cancelRateBlock: 0.5,
  cancelBlockHours: 24,
  cancelBlockRepeatHours: 72,
  /**
   * Dispatch ranking (trips/driver-rank.ts): eta × (1 + rankWeightAccept·(1 − accept ratio) + rankWeightCancel·cancel
   * ratio) − an idle bonus of up to [rankIdleMaxBoost] of the ETA at [rankIdleFullMin] minutes without a trip. Ratios
   * over 7 days, counted from [rankMinOffers] offers (new drivers are neutral). [rankEnabled] off = plain road ETA.
   */
  rankEnabled: true,
  rankWeightAccept: 0.5,
  rankWeightCancel: 1.0,
  /** Most the record can add, as a share of the ETA: 0.5 → a driver is ranked at most ETA × 1.5, so riders never wait much longer for it. */
  rankMaxPenalty: 0.5,
  rankIdleMaxBoost: 0.15,
  rankIdleFullMin: 30,
  rankMinOffers: 10,
  /** A started trip still running after max(this, stuckDurationFactor × estimated minutes) is flagged for admins. */
  stuckTripMinMin: 120,
  stuckDurationFactor: 4,
  /** Safety net: a trip still not started this many minutes after accept is cancelled by the system. */
  pickupHardCapMin: 60,
  /** A trip booked for later (rental, outstation) starts looking for a driver this many minutes before its pickup time. */
  scheduledDispatchLeadMin: 30,
  /**
   * Driver approval. On: a driver is approved the moment RC + insurance are verified and (with Didit) the identity
   * check passes. Off: they wait as "Ready to approve" in Drivers › Approvals until an admin approves them.
   */
  driverAutoApprove: true,
  /**
   * Daily selfie check: before going online each day (IST), a driver takes a live selfie that must match the face of
   * their approved identity check (Didit face match). Drivers without that reference face (approved before Didit, or
   * Didit off) are never asked.
   */
  dailySelfieCheckEnabled: true,
  /** Free-trial length for new drivers. */
  trialDays: 30,
  /** Days a lapsed plan can still go online. */
  graceDays: 2,
  /** Collect bookings for this long, then assign drivers across the whole batch. */
  batchWindowMs: 2000,
  /** Rank candidates by road ETA (Google Routes, cached per hex pair) instead of straight-line estimate. */
  useRoadEta: true,
  /** Automatic surge from live demand vs free drivers per H3 cell (res 7). */
  dynamicSurgeEnabled: true,
  /** Extra multiplier per unit of (requests ÷ free drivers) above 1, e.g. 0.1 → ratio 3 = 1.2x. */
  surgeSensitivity: 0.1,
  /** Minutes of bookings counted as current demand. */
  demandWindowMin: 15,
  /** Minimum bookings in a cell before it can surge or be shown as high demand. */
  surgeMinRequests: 3,
  /** Use learned hex-to-hex speeds for ETAs when a pair has at least this many trips (0 = off). */
  historicalEtaMinTrips: 5,
  /** Driver must be within this distance of the pickup to mark "Arrived" without giving a reason. */
  arrivalRadiusM: 250,
  /** …and within this distance of the drop to end the ride / complete the delivery without a reason. */
  dropRadiusM: 400,
  /** Safety (safety module): push every admin's phone when someone presses SOS (the admin SOS page lists them either way). */
  sosAdminAlert: true,
  /**
   * Stop during a ride: the driver stays within [stopRadiusM] for [stopMinutes] more than 300 m from pickup and drop →
   * the passenger is asked "Is everything OK?" (at most once per [stopDedupeMin]).
   */
  stopRadiusM: 30,
  stopMinutes: 4,
  stopDedupeMin: 10,
  /**
   * Route deviation: 3 fixes in a row more than [deviationM] off the quoted route (Trip.routePolyline) is recorded;
   * at night (IST, [nightStartHour]:00 to [nightEndHour]:00) one more than 1 km off asks the passenger "Is everything
   * OK?". Night rides also get "Share your trip" at the start (unless auto-share is on) and "Did you reach safely?"
   * after the end.
   */
  deviationM: 150,
  nightStartHour: 22,
  nightEndHour: 5,
  /** Support phone shown in the apps. */
  supportPhone: '+91 422 000 0000',
  /** Paid driver plans. Off = the app is free: no plan screens, no plan check when going online. */
  driverPlansEnabled: false,
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;
export type Settings = {
  -readonly [K in SettingKey]: (typeof SETTING_DEFAULTS)[K] extends number ? number : (typeof SETTING_DEFAULTS)[K] extends boolean ? boolean : string;
};
