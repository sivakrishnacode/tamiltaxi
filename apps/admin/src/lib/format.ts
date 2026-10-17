import { KYC_DOC_TYPES, type IdentityStatus, type KycDocType, type KycDocument, type VehicleKind } from "./types";

/** Every date is shown in IST (Tamil Taxi runs in India) regardless of where the server runs. */
export const TIME_ZONE = "Asia/Kolkata";

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** Whole rupees with Indian digit grouping: 1420 → "₹1,420", 123456 → "₹1,23,456". */
export function formatInr(rupees: number | null | undefined): string {
  const value = Number.isFinite(rupees) ? Math.round(rupees as number) : 0;
  const sign = value < 0 ? "-" : "";
  return `${sign}₹${inr.format(Math.abs(value))}`;
}

/** Plain count with Indian grouping: 12345 → "12,345". */
export function formatCount(n: number): string {
  return inr.format(n);
}

// Numeric parts only, then fixed English month names: ICU data differs between Node and browsers ("Sep" vs "Sept"),
// which would otherwise cause hydration mismatches.
const dateParts = new Intl.DateTimeFormat("en-IN", { timeZone: TIME_ZONE, day: "numeric", month: "numeric", year: "numeric" });
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dateFmt = {
  format(d: Date): string {
    const parts = Object.fromEntries(dateParts.formatToParts(d).map((p) => [p.type, p.value]));
    return `${Number(parts.day)} ${MONTHS[Number(parts.month) - 1]} ${parts.year}`;
  },
};
const timeFmt = new Intl.DateTimeFormat("en-IN", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit", hour12: true });
const dayFmt = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", weekday: "short", day: "numeric" });

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/** "25 Sep 2026". */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "–";
  return dateFmt.format(toDate(value));
}

/** "25 Sep 2026, 8:42 pm". */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "–";
  const d = toDate(value);
  return `${dateFmt.format(d)}, ${timeFmt.format(d).toLowerCase()}`;
}

/** "8:42 pm". */
export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return "–";
  return timeFmt.format(toDate(value)).toLowerCase();
}

/** "just now", "12 min", "5 h", "3 days": how long ago, for "waiting since" columns. */
export function formatAgo(value: string | Date | null | undefined, now: Date = new Date()): string {
  if (!value) return "–";
  const min = Math.floor((now.getTime() - toDate(value).getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

/** Chart label for a "YYYY-MM-DD" day: "Fri 25". */
export function formatDayLabel(isoDay: string): string {
  return dayFmt.format(new Date(`${isoDay}T00:00:00Z`));
}

/** "+919000000001" → "+91 90000 00001". */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "–";
  // A deleted account keeps "deleted:<id>" instead of the number.
  if (phone.startsWith("deleted:")) return "Deleted account";
  const m = /^\+91(\d{5})(\d{5})$/.exec(phone);
  return m ? `+91 ${m[1]} ${m[2]}` : phone;
}

/** Last 8 characters of a cuid, upper-cased: good enough to tell trips apart in a table. */
export function shortId(id: string): string {
  return id.slice(-8).toUpperCase();
}

/** "IN_PROGRESS" → "In progress". */
export function humanize(value: string | null | undefined): string {
  if (!value) return "–";
  const text = value.toLowerCase().replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const VEHICLE_LABELS: Record<VehicleKind, string> = {
  BIKE: "Bike",
  SCOOTY: "Scooty",
  AUTO: "Auto",
  AUTO_PRIORITY: "Auto Priority",
  CAB: "Mini",
  SEDAN: "Sedan",
  SUV: "SUV",
  GOODS_BIKE: "Goods bike",
  SCOOTY_PARCEL: "Parcel on Scooty",
  AUTO_PARCEL: "Parcel on Auto",
  THREE_WHEELER: "3-wheeler",
  MINI_TRUCK: "Mini truck",
  PICKUP: "Pickup",
  TRUCK: "Truck",
};

export function vehicleLabel(kind: VehicleKind): string {
  return VEHICLE_LABELS[kind] ?? humanize(kind);
}

const DOC_LABELS: Record<KycDocType, string> = {
  DRIVING_LICENCE: "Driving licence",
  AADHAAR: "Aadhaar",
  VEHICLE_RC: "Vehicle RC",
  INSURANCE: "Insurance",
  POLICE_VERIFICATION: "Police verification",
};

export function docLabel(type: KycDocType): string {
  return DOC_LABELS[type] ?? humanize(type);
}

/** KYC progress: verified RC + insurance, plus the identity check when [identity] is given. */
export function kycProgress(docs: readonly Pick<KycDocument, "type" | "status">[], identity?: IdentityStatus): { verified: number; total: number } {
  const verified = docs.filter((d) => KYC_DOC_TYPES.includes(d.type) && d.status === "VERIFIED").length;
  if (identity === undefined) return { verified, total: KYC_DOC_TYPES.length };
  return { verified: verified + (identity === "APPROVED" ? 1 : 0), total: KYC_DOC_TYPES.length + 1 };
}

/** Name or a phone fallback, for tables. */
export function displayName(user: { name: string | null; phone: string } | null | undefined): string {
  if (!user) return "–";
  return user.name?.trim() || formatPhone(user.phone);
}

/** Initials for avatars: "Karthik S" → "KS". */
export function initials(name: string | null | undefined): string {
  if (!name?.trim()) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}
