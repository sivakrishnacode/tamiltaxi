/** Trip cancel codes (API `CancelCode`) and who cancelled (API `CancelledBy`), with admin labels. */
export type CancelledBy = "PASSENGER" | "DRIVER" | "SYSTEM" | "ADMIN";

export const CANCEL_CODE_LABEL = {
  CHANGED_MIND: "Changed their plan",
  DRIVER_TOO_FAR: "Driver too far",
  DRIVER_ASKED_TO_CANCEL: "Driver asked them to cancel",
  WAIT_TOO_LONG: "Waited too long",
  BOOKED_BY_MISTAKE: "Booked by mistake",
  PASSENGER_NO_SHOW: "Passenger didn't come (after the wait)",
  PASSENGER_UNREACHABLE: "Passenger not reachable",
  PASSENGER_ASKED_TO_CANCEL: "Passenger asked the driver to cancel",
  VEHICLE_ISSUE: "Vehicle problem",
  TOO_FAR: "Pickup too far",
  BUTTERFLY_MISMATCH: "Pink Taxi rider is not a woman",
  NO_DRIVERS: "No drivers available",
  DRIVER_NOT_MOVING: "Driver was not moving",
  STUCK: "Trip ran far too long",
  OTHER: "Other",
} as const;

export type CancelCode = keyof typeof CANCEL_CODE_LABEL;

const BY_LABEL: Record<CancelledBy, string> = {
  PASSENGER: "Passenger",
  DRIVER: "Driver",
  SYSTEM: "Tamil Taxi (automatic)",
  ADMIN: "Admin",
};

/** Who was at fault for a cancellation (API `CancelFault`, trips/cancel-fault.ts). */
export type CancelFault = "DRIVER" | "PASSENGER" | "NONE" | "SHARED";

export const FAULT_LABEL: Record<CancelFault, string> = {
  DRIVER: "Driver's fault",
  PASSENGER: "Passenger's fault",
  NONE: "No fault",
  SHARED: "Shared / unclear",
};

/** "Passenger's fault · passenger after wait" (the rule that decided, in words). */
export function faultSummary(fault: CancelFault | null | undefined, rule?: string | null): string {
  const label = fault ? (FAULT_LABEL[fault] ?? fault) : "Not judged";
  return rule ? `${label} · ${rule.replaceAll("_", " ")}` : label;
}

/** "Driver · Vehicle problem" (unknown values are shown as they are). */
export function cancelSummary(by: CancelledBy | null | undefined, code: CancelCode | null | undefined): string {
  const who = by ? (BY_LABEL[by] ?? by) : "Unknown";
  return code ? `${who} · ${CANCEL_CODE_LABEL[code] ?? code}` : who;
}
