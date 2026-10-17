# Releases

Every version of the two apps sent to Google Play, every staging deploy of the API and admin, and the changes waiting
for the next one. GitHub mirrors this file: each entry with a `Release:` line becomes a
[GitHub release](https://github.com/sivakrishnacode/tamiltaxi/releases) with that tag (`scripts/sync_github.py`, run
by `.github/workflows/github-sync.yml` on every push to `main` that changes it). Upcoming work is in
[ROADMAP.md](ROADMAP.md); how the two fit together: [GITHUB.md](GITHUB.md).

**Keep it current:**
- Commit an app change (`apps/passenger`, `apps/driver`, or `packages/*` when an app uses it): add it under that
  app's **Next release** in the same commit. App fixes and features ship together in the next release.
- Upload a bundle: raise `version:` in the app's `pubspec.yaml`, turn **Next release** into a version entry with its
  `Release:` line (tag `passenger-vX.Y.Z+N` / `driver-vX.Y.Z+N` at the commit the bundle was built from), start a new
  empty **Next release**, and add the next version's milestone in [ROADMAP.md](ROADMAP.md).
- Commit an API or admin change: add it under **Staging › Next deploy** in the same commit (or the docs commit right
  after, with the hash).
- Deploy to staging: turn **Next deploy** into an entry under **Staging** (tag `staging-YYYY-MM-DD`, `.2` for a second
  deploy that day) next to the full record in [using.tech.md](tech-docs/using.tech.md) §9b, and start a new empty
  **Next deploy**.
- The owner names the date of each Play release; until then changes keep collecting under **Next release**.
- A Play status changes (review passed, rolled out, production): update the entry's **Status**.

`version: X.Y.Z+N` in `pubspec.yaml`: `X.Y.Z` is the version name people see, `N` the version code. Play refuses a
version code it has seen before, so raise `N` for every upload. Versions below 1.0 and staging deploys show as
pre-releases on GitHub.

---

## Tamil Taxi (rider) · `com.tamiltaxi.passenger`

### Next release: 0.1.1 (code 2)

- `0907cbe` In-app privacy text: sign-in codes come on WhatsApp; ride reminders.
- `824a1c1` Sign-in screens ask for the WhatsApp number.
- `7a6adce` Parcels in town like Porter: **Scooty** added (up to 20 kg; a 5–20 kg parcel picks it), **Truck** removed
  from the in-town list (still in Packers & Movers and To another town).

### 0.1.0 (code 1) · 16 Oct 2026

Release: `passenger-v0.1.0+1` at `42008b6`

- **Track:** Closed testing – Alpha (India). **Status:** sent for review 16 Oct 2026.
- **Built from** `42008b6` plus the upload-key signing and HTTPS-only release builds (committed a minute later as
  `56e3442` and `8ebcea4`).
- **Release notes:** "First release of Tamil Taxi: bike, auto and cab rides, parcels and house shifting in
  Coimbatore, with 0% commission for drivers."

---

## Tamil Taxi Driver · `com.tamiltaxi.driver`

### Next release: 0.1.1 (code 2)

- `09f6669` D-06 Personal details shows the service city (it was empty for new sign-ups).
- `2b006a6` D-03c Permissions after the OTP and at start-up: precise location, notifications, display over other apps,
  full-screen alerts and no battery limits must all be allowed to continue. Adds the
  `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` permission (see [driver.md](play-store/driver.md), "Other permissions").
- `7a6adce` Scooter drivers get Scooty parcels (up to 20 kg): Services and the Rate card say so. Truck drivers: no
  parcels in town; Services shows "Big loads" (Packers & Movers and goods to another town).

### 0.1.0 (code 1) · 16 Oct 2026

Release: `driver-v0.1.0+1` at `824a1c1`

- **Track:** Closed testing – Alpha (India). **Status:** available to testers (installed from Play on the test phone
  16 Oct 2026).
- **Built from** `824a1c1`.
- **Release notes:** "First release of Tamil Taxi Driver: get ride, parcel and house-shifting requests in Coimbatore
  and keep 100% of every fare. 0% commission, no subscription."

---

## Staging · API and admin on the staging server

Each deploy's backups, checks and rollback images are in [using.tech.md](tech-docs/using.tech.md) §9b. The first
deploys (26–29 Sep 2026: first start, Didit and HTTPS, the first 28 Sep deploy, `DEV_OTP_CODE`, the move to
`/opt/tamiltaxi`) weren't recorded with a commit, so they have no release.

### Next deploy

API and admin changes committed since the last deploy (staging runs `824a1c1` / admin `74cc68b`):

- `7a6adce` Parcels in town like Porter: `SCOOTY_PARCEL` (Parcel on Scooty, up to 20 kg, scooters with Parcels on;
  migration `20261018060000_scooty_parcel`), no `TRUCK` in parcel quotes, "Book any" or the parcel map, and a truck
  parcel in town is refused. Admin: "Parcel on Scooty" label and map colour. The Play rider 0.1.0 hides the new
  Scooty quote (unknown tier) and stops showing Truck once this is deployed.

### 16 Oct 2026 · API at `824a1c1`

Release: `staging-2026-10-16` at `824a1c1`

Store-review numbers sign in with a fixed code and get no WhatsApp message. Admin unchanged at `74cc68b`.

### 15 Oct 2026 (3) · API and admin at `74cc68b`

Release: `staging-2026-10-15.3` at `74cc68b`

Automations: reminder pushes and festival campaigns for riders (migration `automations`). Admin sidebar in tabs,
Settings in two panes.

### 15 Oct 2026 (2) · API and admin at `a1c3b05`

Release: `staging-2026-10-15.2` at `a1c3b05`

Splash picture and Home banners set from the admin (migration `promos`).

### 15 Oct 2026 · API at `6aad7ba`

Release: `staging-2026-10-15` at `6aad7ba`

Login codes on WhatsApp through WATX. Admin unchanged at `21ed3a6`.

### 10 Oct 2026 · API and admin at `21ed3a6`

Release: `staging-2026-10-10` at `21ed3a6`

Requests go to several drivers at once, one ride OTP per rider (migration `ride_otp`), nearby-car marker ids and the
driver's position in trip reads, no Contribute block, the delivery OTP on PP-09.

### 5 Oct 2026 · API at `c893959`

Release: `staging-2026-10-05` at `c893959`

The 5 Oct flow-audit fixes: account deletion, drivers can book rides as riders (never offered their own trip), a
scheduled trip waits while the rider has one under way, "Received on UPI" is stored on the trip. No migrations.

### 3 Oct 2026 · API and admin at `e108838`

Release: `staging-2026-10-03` at `e108838`

The completed full-repo audit. Migrations `daily_selfie_check`, `trip_photos`, `ticket_attachment` and
`account_deletion`.

### 2 Oct 2026 · API and admin at `c0cf159`

Release: `staging-2026-10-02` at `c0cf159`

Ride tiers (Scooty, Auto Priority, Sedan, SUV), nearby vehicles, cab rentals, outstation and trips booked for later,
goods to another town, house shifting, per-city prices for those services. Migrations `ride_tiers`,
`ride_modes_scheduled`, `house_shifting` and `city_mode_pricing`.

### 1 Oct 2026 (2) · API and admin at `fb74b51`

Release: `staging-2026-10-01.2` at `fb74b51`

Admin screens for people (More menu, notes, history, Remind), Ctrl+K search and the new dashboard. No migrations.

### 1 Oct 2026 · API and admin at `b343de1`

Release: `staging-2026-10-01` at `b343de1`

Admin manual approval and the Approvals queue, regrouped sidebar, faster list views, the admin people API. Migrations
`admin_list_indexes` and `admin_notes`.

### 30 Sep 2026 · API and admin at `e6a91bf`

Release: `staging-2026-09-30` at `e6a91bf`

Parcels on bikes, Go To / Stay In with saved areas, the rider's extra while no driver has taken the trip. No
migrations.

### 29 Sep 2026 · API and admin at `619b77e`

Release: `staging-2026-09-29` at `619b77e`

Driver Home demand chip with area names, D-07 cards and Help, swipe to accept with voice, booking preferences
(migration `driver_booking_prefs`), stacked ride requests.

### 28 Sep 2026 (2) · API and admin at `3cc68cf`

Release: `staging-2026-09-28.2` at `3cc68cf`

The Namma Yatri comparison work: guarded trip transitions, one offer and one trip per driver, server-trusted GPS,
cancel codes and reassign, GPS breadcrumbs, waiting charge, dispatch ranking, share link, server SOS. 11 migrations.
