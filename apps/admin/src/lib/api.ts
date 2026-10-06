import "server-only";

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { ApiError, apiBaseUrl, apiUrl, errorMessage, isBlockedAccount } from "./api-core";
import type { QueryInput } from "./paging";
import type { SosPage, SosRecord } from "./safety";
import { TOKEN_COOKIE, USER_COOKIE, getToken } from "./session";
import type {
  ActivityEntry,
  AdminNote,
  AdminStats,
  AdminUser,
  DriverProfileInput,
  MessageApp,
  ApprovalStage,
  ApprovalsPage,
  Announcement,
  AnnouncementAudience,
  AuditLog,
  City,
  CityDetail,
  CancellationDue,
  DriverBlock,
  CityFare,
  CityPricing,
  ModePricing,
  PricingSection,
  CityFareRule,
  CityListItem,
  DemandSnapshot,
  HexStatRes,
  HexStats,
  HexStatsSort,
  SettingsRecord,
  Heatmap,
  HeatmapQuery,
  KycQueueItem,
  LiveData,
  PaymentRow,
  Role,
  ServiceArea,
  UserDetail,
  VehicleKind,
  Zone,
  ZoneKind,
  Driver,
  DriverDetail,
  DriverListItem,
  DriverOfferStats,
  DriverStatus,
  KycDocType,
  KycDocument,
  LoginResult,
  Paged,
  Passenger,
  Plan,
  SupportTicket,
  TicketStatus,
  TripDetail,
  Trip,
} from "./types";

export { ApiError } from "./api-core";
export { docFileHref } from "./files";

interface RequestOptions {
  readonly method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  readonly query?: QueryInput;
  readonly body?: unknown;
  /** Send the admin JWT from the cookie (default true). Auth endpoints pass false. */
  readonly auth?: boolean;
}

/**
 * Session is gone or rejected: clear the cookies and go to /login. Cookies can only be changed in Server Actions
 * and Route Handlers, so while rendering a page we hand over to the /auth/signout route handler instead.
 * [reason] "blocked": the login page says the account is blocked instead of "session ended".
 */
async function signOutAndRedirect(reason: "expired" | "blocked" = "expired"): Promise<never> {
  let isCleared = false;
  try {
    const store = await cookies();
    store.delete(TOKEN_COOKIE);
    store.delete(USER_COOKIE);
    isCleared = true;
  } catch {
    // Rendering a Server Component: cookies are read-only here.
  }
  redirect(isCleared ? `/login?${reason}=1` : `/auth/signout?${reason}=1`);
}

/** Typed fetch against the Tamil Taxi API. Server-side only: the JWT never reaches the browser. */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", query, body, auth = true } = options;
  const headers: Record<string, string> = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (auth) {
    const token = await getToken();
    if (!token) return signOutAndRedirect();
    headers.authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(apiUrl(apiBaseUrl(), path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ApiError(503, "Cannot reach the Tamil Taxi API. Is it running?");
  }

  const text = await res.text();
  const data: unknown = text ? safeJson(text) : null;
  if (res.status === 401 && auth) return signOutAndRedirect();
  // An admin blocked meanwhile gets 403 on every call: sign them out rather than show broken pages.
  if (auth && isBlockedAccount(res.status, data)) return signOutAndRedirect("blocked");
  if (!res.ok) throw new ApiError(res.status, errorMessage(data, res.status));
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

/** Page loaders: a 404 from the API renders the nearest not-found page. */
async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
}

export interface ListQuery {
  readonly page?: number;
  readonly pageSize?: number;
  readonly q?: string;
  readonly status?: string;
  readonly kind?: string;
  readonly role?: string;
  readonly blocked?: string;
  /** Trips: "true" = flagged for review only. */
  readonly review?: string;
  /** Drivers: newest | oldest | rating | trips | name; riders: newest | oldest | trips | name; trips: newest | oldest | fare. */
  readonly sort?: string;
  /** Drivers and trips: one vehicle kind. */
  readonly vehicle?: string;
  /** Drivers: "true" | "false". */
  readonly online?: string;
  /** Drivers: FEMALE = women drivers. */
  readonly gender?: string;
  /** Riders: "true" = prefers women drivers / identity verified. */
  readonly women?: string;
  readonly verified?: string;
  /** Trips booked from / before (ISO). */
  readonly from?: string;
  readonly to?: string;
}

function listQuery(q: ListQuery): QueryInput {
  return {
    page: q.page,
    pageSize: q.pageSize,
    q: q.q,
    status: q.status,
    kind: q.kind,
    role: q.role,
    blocked: q.blocked,
    review: q.review,
    sort: q.sort,
    vehicle: q.vehicle,
    online: q.online,
    gender: q.gender,
    women: q.women,
    verified: q.verified,
    from: q.from,
    to: q.to,
  };
}

const enc = encodeURIComponent;

export interface CityInput {
  readonly id: string;
  readonly name: string;
  readonly state: string;
  readonly centerLat: number;
  readonly centerLng: number;
  readonly h3Resolution?: number;
  readonly radiusKm?: number;
}

export interface ZoneInput {
  readonly name: string;
  readonly kind: ZoneKind;
  readonly cells: string[];
  readonly surgeMultiplier?: number;
  readonly color?: string;
  readonly isActive?: boolean;
}

export interface FareInput {
  readonly base: number;
  readonly perKm: number;
  readonly perMin: number;
  readonly minFare: number;
  readonly waitPerMin?: number;
  readonly isActive?: boolean;
}

export interface AnnouncementInput {
  readonly audience: AnnouncementAudience;
  readonly title: string;
  readonly body: string;
  readonly cityId?: string;
  readonly endsAt?: string;
}

/** Typed endpoints of the admin API (apps/api/src/modules/admin/admin.controller.ts). */
export const adminApi = {
  stats: () => apiFetch<AdminStats>("/admin/stats"),

  /** With `counts` per status (older APIs: absent). */
  drivers: (q: ListQuery = {}) =>
    apiFetch<Paged<DriverListItem> & { counts?: Record<DriverStatus, number> }>("/admin/drivers", { query: listQuery(q) }),
  driver: (id: string) => orNotFound(apiFetch<DriverDetail>(`/admin/drivers/${encodeURIComponent(id)}`)),
  driverOfferStats: (id: string) => apiFetch<DriverOfferStats>(`/admin/drivers/${encodeURIComponent(id)}/offer-stats`),
  liftDriverBlock: (id: string) => apiFetch<DriverBlock>(`/admin/drivers/${encodeURIComponent(id)}/lift-block`, { method: "POST" }),
  /** The reason (hold, reject) is pushed to the driver and kept in the audit log. */
  setDriverStatus: (id: string, status: DriverStatus, reason?: string) =>
    apiFetch<Driver>(`/admin/drivers/${encodeURIComponent(id)}`, { method: "PATCH", body: { status, reason } }),
  /** Approvals queue with counts per stage (GET /admin/approvals). */
  approvals: (q: ListQuery & { stage?: ApprovalStage } = {}) =>
    apiFetch<ApprovalsPage>("/admin/approvals", { query: { ...listQuery(q), stage: q.stage } }),
  /** Approves the ready ones (pending, every check done); the rest come back in `skipped`. */
  approveDrivers: (ids: string[]) =>
    apiFetch<{ approved: string[]; skipped: { id: string; reason: string }[] }>("/admin/drivers/approve", { method: "POST", body: { ids } }),
  reviewDocument: (id: string, type: KycDocType, status: "VERIFIED" | "REJECTED", reason?: string) =>
    apiFetch<KycDocument[]>(`/admin/drivers/${encodeURIComponent(id)}/documents/${type}`, {
      method: "POST",
      body: { status, reason },
    }),

  reviewPhoto: (id: string, isApproved: boolean, reason?: string) =>
    apiFetch<Driver>(`/admin/drivers/${encodeURIComponent(id)}/photo`, { method: "POST", body: { isApproved, reason } }),

  trips: (q: ListQuery = {}) => apiFetch<Paged<Trip>>("/admin/trips", { query: listQuery(q) }),
  trip: (id: string) => orNotFound(apiFetch<TripDetail>(`/admin/trips/${encodeURIComponent(id)}`)),
  reviewTrip: (id: string, needsReview: boolean, note?: string) =>
    apiFetch<Trip>(`/admin/trips/${encodeURIComponent(id)}/review`, { method: "PATCH", body: { needsReview, note } }),

  passengers: (q: ListQuery = {}) => apiFetch<Paged<Passenger>>("/admin/passengers", { query: listQuery(q) }),

  plans: () => apiFetch<Plan[]>("/admin/plans"),
  updatePlan: (id: string, data: { price?: number; isActive?: boolean }) =>
    apiFetch<Plan>(`/admin/plans/${encodeURIComponent(id)}`, { method: "PATCH", body: data }),

  tickets: (q: ListQuery = {}) => apiFetch<Paged<SupportTicket>>("/admin/tickets", { query: listQuery(q) }),

  /** SOS queue (open first); ?status=OPEN|ACKNOWLEDGED|RESOLVED|FALSE_ALARM|active. */
  sos: (q: ListQuery = {}) => apiFetch<SosPage>("/admin/sos", { query: listQuery(q) }),
  acknowledgeSos: (id: string) => apiFetch<SosRecord>(`/admin/sos/${encodeURIComponent(id)}/ack`, { method: "POST" }),
  resolveSos: (id: string, status: "RESOLVED" | "FALSE_ALARM", note?: string) =>
    apiFetch<SosRecord>(`/admin/sos/${encodeURIComponent(id)}/resolve`, { method: "POST", body: { status, note } }),
  setTicketStatus: (id: string, status: TicketStatus) =>
    apiFetch<SupportTicket>(`/admin/tickets/${encodeURIComponent(id)}`, { method: "PATCH", body: { status } }),

  // Cities, H3 service areas, zones, per-city fares
  cities: () => apiFetch<CityListItem[]>("/admin/cities"),
  city: (id: string) => orNotFound(apiFetch<CityDetail>(`/admin/cities/${enc(id)}`)),
  createCity: (data: CityInput) => apiFetch<City>("/admin/cities", { method: "POST", body: data }),
  updateCity: (id: string, data: Partial<Pick<City, "name" | "state" | "centerLat" | "centerLng" | "isActive">>) =>
    apiFetch<City>(`/admin/cities/${enc(id)}`, { method: "PATCH", body: data }),
  deleteCity: (id: string) => apiFetch<null>(`/admin/cities/${enc(id)}`, { method: "DELETE" }),
  setServiceCells: (id: string, cells: string[]) =>
    apiFetch<{ count: number; rejected: string[] }>(`/admin/cities/${enc(id)}/service-cells`, { method: "PUT", body: { cells } }),
  createZone: (cityId: string, data: ZoneInput) => apiFetch<Zone>(`/admin/cities/${enc(cityId)}/zones`, { method: "POST", body: data }),
  updateZone: (id: string, data: Partial<ZoneInput>) => apiFetch<Zone>(`/admin/zones/${enc(id)}`, { method: "PATCH", body: data }),
  deleteZone: (id: string) => apiFetch<null>(`/admin/zones/${enc(id)}`, { method: "DELETE" }),
  fares: (cityId: string) => apiFetch<CityFare[]>(`/admin/cities/${enc(cityId)}/fares`),
  setFare: (cityId: string, kind: VehicleKind, data: FareInput) =>
    apiFetch<CityFareRule>(`/admin/cities/${enc(cityId)}/fares/${kind}`, { method: "PUT", body: data }),
  resetFare: (cityId: string, kind: VehicleKind) => apiFetch<null>(`/admin/cities/${enc(cityId)}/fares/${kind}`, { method: "DELETE" }),
  pricing: (cityId: string) => apiFetch<CityPricing>(`/admin/cities/${enc(cityId)}/pricing`),
  setPricing: <S extends PricingSection>(cityId: string, section: S, data: ModePricing[S]) =>
    apiFetch<CityPricing>(`/admin/cities/${enc(cityId)}/pricing/${section}`, { method: "PUT", body: data }),
  resetPricing: (cityId: string, section: PricingSection) =>
    apiFetch<null>(`/admin/cities/${enc(cityId)}/pricing/${section}`, { method: "DELETE" }),

  // Users and the KYC queue
  users: (q: ListQuery = {}) => apiFetch<Paged<AdminUser>>("/admin/users", { query: listQuery(q) }),
  user: (id: string) => orNotFound(apiFetch<UserDetail>(`/admin/users/${enc(id)}`)),
  updateUser: (id: string, data: { name?: string; email?: string | null; role?: Role; isBlocked?: boolean; blockedReason?: string }) =>
    apiFetch<UserDetail>(`/admin/users/${enc(id)}`, { method: "PATCH", body: data }),
  /** A new ride OTP ([otp], or a random one); their rides that haven't started move to it. */
  setRideOtp: (id: string, otp?: string) =>
    apiFetch<{ rideOtp: string }>(`/admin/users/${enc(id)}/ride-otp`, { method: "POST", body: otp ? { otp } : {} }),
  /** Deletes the account (personal details wiped, trips kept); 409 while they have an unfinished trip. */
  deleteUser: (id: string) => apiFetch<null>(`/admin/users/${enc(id)}`, { method: "DELETE" }),

  // One person: notes (shared by their driver and account pages), history, a direct push, driver fixes
  notes: (userId: string) => apiFetch<AdminNote[]>(`/admin/users/${enc(userId)}/notes`),
  addNote: (userId: string, body: string) => apiFetch<AdminNote>(`/admin/users/${enc(userId)}/notes`, { method: "POST", body: { body } }),
  deleteNote: (id: string) => apiFetch<null>(`/admin/notes/${enc(id)}`, { method: "DELETE" }),
  activity: (userId: string, limit = 30) => apiFetch<ActivityEntry[]>(`/admin/users/${enc(userId)}/activity`, { query: { limit } }),
  /** `devices` = phones the push went to (0 = none registered, nothing sent). */
  message: (userId: string, data: { title: string; body: string; app?: MessageApp }) =>
    apiFetch<{ devices: number }>(`/admin/users/${enc(userId)}/message`, { method: "POST", body: data }),
  updateDriverProfile: (driverId: string, data: DriverProfileInput) =>
    apiFetch<Driver>(`/admin/drivers/${enc(driverId)}/profile`, { method: "PATCH", body: data }),
  takeDriverOffline: (driverId: string) => apiFetch<Driver>(`/admin/drivers/${enc(driverId)}/offline`, { method: "POST" }),
  kyc: (q: ListQuery = {}) => apiFetch<Paged<KycQueueItem>>("/admin/kyc", { query: listQuery(q) }),

  // Operations
  live: () => apiFetch<LiveData>("/admin/live"),
  payments: (q: ListQuery = {}) => apiFetch<Paged<PaymentRow>>("/admin/payments", { query: listQuery(q) }),
  cancellationDues: (q: ListQuery = {}) =>
    apiFetch<Paged<CancellationDue> & { totals: { pending: number; applied: number } }>("/admin/cancellation-dues", { query: listQuery(q) }),
  announcements: () => apiFetch<Announcement[]>("/admin/announcements"),
  createAnnouncement: (data: AnnouncementInput) => apiFetch<Announcement>("/admin/announcements", { method: "POST", body: data }),
  setAnnouncementActive: (id: string, isActive: boolean) =>
    apiFetch<Announcement>(`/admin/announcements/${enc(id)}`, { method: "PATCH", body: { isActive } }),
  deleteAnnouncement: (id: string) => apiFetch<null>(`/admin/announcements/${enc(id)}`, { method: "DELETE" }),
  settings: () => apiFetch<SettingsRecord>("/admin/settings"),
  updateSettings: (data: Record<string, number | boolean | string | undefined>) =>
    apiFetch<SettingsRecord>("/admin/settings", { method: "PUT", body: data }),
  audit: (q: ListQuery = {}) => apiFetch<Paged<AuditLog>>("/admin/audit", { query: listQuery(q) }),
  demand: (refresh = false) => apiFetch<DemandSnapshot>("/admin/demand", { query: { refresh: refresh ? "true" : undefined } }),
  hexStats: (q: { res: HexStatRes; hour?: number; sort?: HexStatsSort; used?: boolean; limit?: number }) => apiFetch<HexStats>("/admin/hex-stats", { query: q }),
  rebuildHexStats: () => apiFetch<{ pairs: number; trips: number }>("/admin/hex-stats/rebuild", { method: "POST" }),
  heatmap: (q: HeatmapQuery = {}) => apiFetch<Heatmap>("/admin/heatmap", { query: { ...q } }),
};

/**
 * Place name at a point (GET /v1/places/reverse, Google Geocoding on the API side). Cached for a day by Next's fetch
 * cache, so the dashboard's hotspot names cost one geocode per hexagon per day at most. Null on any failure.
 */
export async function placeNameAt(lat: number, lng: number): Promise<string | null> {
  // The API needs a signed-in caller for place lookups.
  const token = await getToken();
  if (!token) return null;
  try {
    const res = await fetch(apiUrl(apiBaseUrl(), "/places/reverse", { lat: lat.toFixed(4), lng: lng.toFixed(4) }), {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 86_400 },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { place?: { name?: string } | null };
    return body.place?.name ?? null;
  } catch {
    return null;
  }
}

/** Public geo endpoints (apps/api/src/modules/geo). */
export const geoApi = {
  cities: () => apiFetch<Pick<City, "id" | "name" | "state" | "centerLat" | "centerLng" | "h3Resolution">[]>("/cities", { auth: false }),
  serviceArea: (id: string) => apiFetch<ServiceArea>(`/cities/${enc(id)}/service-area`, { auth: false }),
};

/** Unauthenticated auth endpoints (apps/api/src/modules/auth). */
export const authApi = {
  sendOtp: (phone: string) =>
    apiFetch<{ expiresInSeconds: number }>("/auth/otp", { method: "POST", body: { phone }, auth: false }),
  /** `app: "admin"`: the API gives the ADMIN role only to admin-panel sign-ins. */
  verify: (phone: string, code: string) =>
    apiFetch<LoginResult>("/auth/verify", { method: "POST", body: { phone, code, app: "admin" }, auth: false }),
};

