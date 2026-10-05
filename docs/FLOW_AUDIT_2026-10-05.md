# Flow audit — 5 October 2026

Reviewed the passenger app, driver app, shared data package, API, admin panel, and public website. This was an audit; application code was not changed.

**Status (5 Oct 2026):** findings 1–3 are fixed in the API (see each finding). Finding 4 is open.

## Findings

### 1. P1 — Deleted-account tokens become usable again when Redis state is lost

**Location:** `apps/api/src/core/auth/user-access.service.ts:62` and `apps/api/src/modules/users/account-deletion.service.ts`.

Deletion retains the user row with `deletedAt` set and disables sessions through `user:blocked:<id>` in Redis. The database fallback in `UserAccessService.load()` neither selects nor checks `deletedAt`. A retained row with `isBlocked=false` is therefore accepted after its Redis flag is removed.

**Reproduced against the running API:** sign in; `DELETE /v1/me` returned 204; the old token's `GET /v1/me` returned 403; remove only that test account's block/access keys in the isolated Redis database; the same token's `GET /v1/me` returned **200**.

**Impact:** account deletion does not durably revoke existing tokens. Redis reset, loss of persisted state, or an admin operation clearing that flag can restore access until the JWT expires.

**Suggested fix:** reject `deletedAt != null` from persistent account state, invalidate the access cache on deletion, and prevent admin updates from reactivating deleted accounts.

**Fixed (5 Oct 2026):** `UserAccessService.load()` rejects a row with `deletedAt` (401) and never caches it; deletion drops `user:access:<id>` before setting the block flag; admin user updates match only `deletedAt: null` (404 otherwise). Covered by a unit test and the deletion e2e test, which clears both Redis keys and expects 401.

### 2. P1 — Drivers cannot use their phone number to book as passengers

**Location:** `apps/api/src/modules/auth/auth.service.ts:27`, `apps/api/src/core/auth/user-access.service.ts:29`, and `apps/api/src/modules/trips/trips.controller.ts:29`.

The passenger client explicitly sends `app: 'passenger'`, but `loginRole()` returns DRIVER for ordinary registered drivers. `effectiveAccess()` also changes any passenger token back to the account's DRIVER role. Booking requires PASSENGER.

**Reproduced against the running API:** register a test driver (201), sign in with that phone and `app: 'passenger'`, inspect the issued token's role (DRIVER), then book a ride. Booking returned **403**, with “Not allowed for your account type”.

**Impact:** registering as a driver also prevents that account from booking rides or parcels in the passenger app. This contradicts the passenger repository's explicit same-phone support.

**Suggested fix:** represent the app's acting role separately from the account's administrative role and driver eligibility. Update both token issuance and per-request effective access; changing issuance alone will not resolve this.

**Fixed (5 Oct 2026):** tokens carry the sign-in `app`; `loginRole()` issues PASSENGER for every `app: 'passenger'` login and `effectiveAccess()` keeps such a token PASSENGER (no driver profile). Legacy tokens without `app` follow the account role until the next sign-in. Dispatch now also skips the booking passenger's own driver profile, so a driver who books is never offered their own trip. Covered by unit tests and two e2e tests.

### 3. P1 — Scheduled dispatch bypasses the one-active-trip constraint

**Location:** `apps/api/src/modules/trips/trips.service.ts:272`.

Immediate bookings check for an existing active trip under the passenger booking lock. `startScheduled()` moves a scheduled trip to SEARCHING without either that check or the lock.

**Reproduced against the running API:** book a rental for later, book an immediate ride with the same passenger, then make the rental's existing scheduled-dispatch job due in isolated Redis. The database contained **two SEARCHING trips for the same passenger**.

**Impact:** overlapping bookings can dispatch two drivers, while passenger recovery returns a single active trip. The passenger can lose a clear way to follow or manage the second booking.

**Suggested fix:** serialize scheduled activation with immediate booking, then apply an explicit overlap policy before dispatching (defer, notify, or cancel with an explanation).

**Fixed (5 Oct 2026):** `startScheduled()` takes the same `trips:booking:<passenger>` lock as `book()` and checks for a trip searching or under way; when either blocks it, the trip stays SCHEDULED and its job runs again a minute later (policy: defer, no notification yet). Covered by `trips-scheduled.spec.ts` and an e2e test with two overlapping scheduled rentals.

### 4. P2 — “Received on UPI” does not persist the payment method

**Location:** `apps/driver/lib/state/driver_session.dart:744`.

In live mode, `collectPayment(PaymentMode mode)` ignores `mode` and clears only local job state. It makes no payment-record update. The mobile booking service defaults to CASH, and the trip lifecycle controller exposes no collection endpoint to change that value.

**Evidence:** traced the collection button through the controller and API. This finding is code-confirmed; an actual UPI transaction was not performed.

**Impact:** a driver selecting “Received on UPI” still gets cash-labelled trip history. The passenger receipt (`apps/passenger/lib/features/activity/p22_trip_details_screen.dart:98`) and driver earnings detail (`apps/driver/lib/features/earnings/d23b_trip_detail_sheet.dart:55`) display that stored method.

**Suggested fix:** add an authenticated, idempotent payment-collection update for the assigned driver and persist the selected method before closing the collection screen.

## Verification performed

- `npm run check`: all 19 tasks passed. The existing suites reported 1,090 passing tests; 140 Flutter tests were skipped.
- API integration suite: all 82 tests passed against isolated Postgres 15 and Redis 7 containers. Postgres 17 is the project's declared deployment version; it was not used in this audit.
- Production builds: API, admin panel, and public website completed successfully.
- HTTP page checks: all 19 main admin pages plus the Coimbatore city editor returned 200 without the checked error-page markers. Sample driver, user, and trip detail pages also rendered successfully.
- Missing admin record pages and an invalid public tracking token rendered graceful fallback content.
- Public website: home, privacy, terms, account deletion, robots, and sitemap returned 200. Checked 171 local file/anchor references across seven exported HTML files; none were broken.
- Browser inspection: local admin sign-in, dashboard, and trip listing rendered.
- Additional focused probes reproduced the role mismatch, deleted-token acceptance, and scheduled-job retry behavior. The retry probe is not listed as a separate finding because the dispatch sweeper provides a recovery path.
- A delivery probe confirmed that `completeDelivery()` discards the returned fare. It is not listed as a confirmed user-facing pricing defect because the current parcel completion path was not shown to change that fare.

## Limits

This is broad automated and source-level coverage, not a guarantee that every runtime scenario is bug-free. Flutter flow tests use fakes; no physical Android device was exercised. Real SMS delivery, Didit, FCM delivery, background overlay behavior, real GPS, actual UPI payments, and deployed infrastructure were not verified. The temporary local test services were stopped after the audit.

No broken public or main admin page was found in the tested local configuration. The four findings above concern authentication, booking lifecycle, and payment records.
