# Tamil Taxi: Technology & DevOps

Single technical reference for the Tamil Taxi monorepo. Keep it current: update this file whenever the stack, services,
environment variables, commands or infrastructure change.

Last updated: 3 Oct 2026 (driver app: no Refer a driver and no Delete account: drivers raise a "Delete my account" ticket and their records are kept 6 months for police enquiries, see the `DELETE /me` note in 2; the Design gallery row shows only with `--dart-define=TT_DESIGN_GALLERY=true`; number plates: white for bikes and scooters, yellow T-board for every other vehicle (`NumberPlate.vehicle`); avatar photos are round inside their ring (were square, covering it); Help & support: topic tiles in even rows (an odd last one takes the row), tickets shown by a short reference (`formatRef`, "#TOQDMWR9"); rider PP-03: the form is a movable sheet over the map, "Set on map" in the first drop search, "I'm receiving it myself" shows a Receiver card, see 6h; Parcel on Auto (`AUTO_PARCEL`, up to 100 kg inside the auto), driver Services with pauses and a Rate card, goods shown in kg only, see 6f and 7c8; rider parcels in 5–6 taps like Rapido: start from the drop, Switch, details optional, see 6h; Home lists the last 3 places under the search; the "0% commission / no subscription" message now appears only where it matters, see 6a; D-05 vehicle cards show passengers or load; completed the interrupted 2 Oct Claude audit; see the completion handoff below; passenger home footer: a new picture (`assets/illustrations/home_footer.png`, 256-colour PNG, 195 KB) replaces the generated SVG; `scripts/footer_art/` and flutter_svg removed; rider Home: the top pill shows the greeting over the pickup area ("Good morning, Priya" / "Mahaganapathi Nagar, Vellalore"; tap to move the pickup on P-09, green pickup pin there), no initials avatar, during a trip the greeting alone; maps: Android took the initial camera before `mapPadding`, so a route fitted above a sheet sat behind it (PP-06, P-10, the trip screens): the Google map places its camera again once it is created, fits keep the whole drop pin in view, P-22 fits its route, see 7a; rider parcels: PP-02 / PP-03 open on a map with a fixed pin (move the map to fine-tune the point), the drop is searched first, compact location rows, see 6h; "House shifting" is called **Packers & Movers** in every app (code keeps `shifting`); Activity: one card per trip under day headers (Today, Yesterday, 30 Sep); live mode uses the real date (`TtClock.useRealDate`); pickup and truck pictures, cut out of their painted checkerboard by `scripts/vehicle_icons/checker_cutout.py`; house shifting goes only to movers who switched it on with enough helpers, see 6h; prices per city: admin › City › Rentals & more sets rentals, outstation, goods to another town and house shifting prices, `CityModePricing`, `GET /fares/rates`, see 6i; driver app: house shifting request cards, D-21c move details and items, D-22c price lines; rider app: house shifting PH-01 … PH-05 with typed items, goods to another town on PP-01 / PP-06, "I'm receiving it myself" and Save as on PP-03, load beds on PP-06, see 6h; API: goods to another town (one way, by the km) and house shifting (`POST /fares/shifting-quote`, `Trip.shifting`, scheduled parcels), admin House shifting card, see 6h; driver app: rental / outstation request cards with the pickup time of trips booked ahead, voice line, rental clock on D-18c, fare lines on D-19c, see 6g; rider app: Rental (P-34) and Outstation (P-35 / P-35b) from Home, booking for later with P-36 "You're booked" and Upcoming on Home and Activity, mode fares mirrored in `ride_modes.dart` against the shared `ride_mode_cases.json`, see 6g; screen transitions: one slide-and-fade for every page in both apps, see 7e; API: cab rentals (hourly packages), outstation one way / round trip and trips booked for later (`SCHEDULED`), see 6g; nearby vehicles on rider maps (`GET /drivers/nearby`, no ids, ~55 m grid) and coloured top-down markers; ride tiers Scooty, Auto Priority, Sedan, SUV beside Bike, Auto and Mini (`CAB`), see 6f; driver sign-up: OTP → one D-07 Registration page (vehicle card + checklist, review and rejections on the same page) until approval, D-10 / S-09 removed, sign-up step bar aligned left; no built-in city: place search, area names, map starts and app messages come from the `City` rows (`serviceCitiesProvider`, `CityDefaults`, admin `cityView`); maps re-fit to `fitPoints` whenever they or the visible area change; rider splash intro: P-01 plays a 2 s animation from the native splash frame: the icon's kolam ring draws itself, the x's lane dashes glide, the tagline rises (`KolamRing`, `TtAppName.laneShift`, `SimTimings.intro`); passenger home: the Ride sheet ends in line art of Tamil Nadu under "#NammaOoru · Made in Coimbatore" (`HomeFooter`, SVG via flutter_svg, drawn by `scripts/footer_art/build.py`), `MapBottomSheet.footer` slot; maps: hexes only, no circles anywhere: mock demand map and S-08 service area as H3-sized hexes (`hex_grid.dart`), S-01 search area as hex cells, hex "location lost" marker (the search radar pulse stays round), `MapZone` circles removed from `TtMap`; app screen audit fixes: chips / labels cut off on P-08, P-10, P-25, D-03a, D-14, D-14b, attributions under the status bar, PP-07 pickup under the sheet, rider privacy text and chat header no longer claim masked numbers, old "r" mark on the driver UPI QR and `RD-` trip codes, D-26 document count; `docs/design` is now screenshots of the apps, refreshed with `scripts/export_design.py`; admin dashboard: Needs attention strip + Today / People & places sections; admin global search: Ctrl+K palette over `GET /admin/search`; admin driver + account pages: More menu (edit, push, take offline, block), Driver profile / Account tabs, Notes + History cards, Remind on Approvals; admin people API: notes, activity history, direct push, driver detail edits, take offline; admin list views: status tabs with counts, sort, more filters, 20 / 50 / 100 rows, phone search ignoring spaces and +91, lean list queries + indexes; sidebar regrouped into collections (Overview, Drivers, Riders, Trips, Money, Platform, System; collapsible), Settings section chips + find; driver approval switch `driverAutoApprove` + Drivers › Approvals queue with bulk approve, hold / reject reasons pushed to the driver; 30 Sep: public website `apps/web`: static Next.js export with home, privacy policy, terms and account deletion pages for Google Play; pink Butterfly band on driver request cards for women-preferred and women-only trips; back fixed on the driver OTP screens; driver request cards swipe right to accept / left to decline, rail icons for best ₹/km, closest pickup, parcel, Butterfly, Verified; Go To / Stay In bar on the driver request screen; driver Home: Go To / Stay In row and sheet with saved areas, Parcels too switch, mixed ride/parcel request stacks; rider adds extra (+₹10/20/30) to a search nobody took, shown to drivers as "₹50 + ₹20"; parcel on bike: bike drivers also get goods-bike parcels unless they switch it off; Stay In and saved areas in driver booking preferences; kolam app icons + matching native/Flutter splash, overlay notification icon fix; 29 Sep: renamed Rido → Tamil Taxi: packages, app IDs `com.tamiltaxi.*`, `Tt*` widgets, `TT_*` defines, database `tamiltaxi`; new logo in `TtWordmark`; open-source repo: AGPL-3.0, contributor docs, CI, COST_AND_SCALING.md; DEV_OTP_CODE for dev-mode sign-in; bike taxi and auto test drivers; stacked requests shown as a comparison list with a ring rail; stacked driver requests: up to 3 open at once, chips to switch, accepting one releases the rest; driver booking preferences: go home, farthest pickup, trip length, filtered in dispatch; driver requests: swipe to accept and read aloud in English / Tamil; D-07 per-document cards + Help button; nearest high-demand area on driver Home with area names and directions; test drivers seeder for cab, goods bike, truck, mini truck and pickup; driver ETAs for P-10 and dispatch in one Route Matrix call; place search restricted to the service area with each suggestion's distance from the pickup; "Near KG Hospital" pickup landmarks from Google address descriptors, stored as `Trip.pickupLandmark` for the driver; traffic-aware travel time on P-10 / PP-06 (`travelMin`, fare unchanged); fare routes use the shortest of Google's alternatives; routes snap pickup / drop to a road a vehicle can stop on (vehicleStopover), fare screen reloads when a stop changes; "Did you reach safely?" after night rides; route deviation + night checks on the quoted route; stop detection during rides with an "Is everything OK?" check; server SOS + admin SOS page; live trip share links + public /track page; dispatch ranks drivers by 7-day offer record and idle time; driver cancellation-rate nudge and temporary pause; cancellation fee, off by default; cancellation fault verdict from signals; waiting charge after the free minutes at the pickup; fare sanity flags at completion + admin "Mark reviewed" and GPS path map; trip GPS breadcrumbs and actual distance; driver state cached in Redis for the GPS path; rich driver GPS fixes + offline buffer with batch upload; trip timeout jobs: not moving, no-show wait, stuck trips; driver cancel finds another driver; OTP out of driver step responses; structured cancellations with codes; durable Redis job runner for dispatch timers; trip race / OTP / rating / GPS-trust fixes; no default peak markup, surge before the minimum fare, notifier never crashes the API)

---

### Renamed from Rido (29 Sep 2026)

The project was called **Rido** until 29 Sep 2026. In code the prefix is now `Tt` (`TtColors`, `TtButton`), packages are
`@tamiltaxi/*` and `tamiltaxi_ui` / `tamiltaxi_data`, dart-defines are `TT_*` (was `RIDO_*`), Android app IDs are
`com.tamiltaxi.passenger` / `com.tamiltaxi.driver`, and Postgres uses database, user and password `tamiltaxi`.
Existing external resources keep their old names because they can't be renamed: the SSH key `rido-key.pem`, the
security group `rido-sg`, the EC2 tag `rido-server`, the AWS CLI profile `rido`, IAM user `rido-deployer`, instance role
`rido-ec2-uploads`, S3 bucket `rido-uploads-786020471552`, the Google Cloud project
`rido-prod` (its API keys were renamed to `tamiltaxi-android-maps`, `tamiltaxi-server` and `tamiltaxi-app-services`).

After the rename, outside the repo:
- **Firebase: done 29 Sep 2026.** New project `tamiltaxi-85a28` with both new app IDs. Its `google-services.json`
  is in `apps/*/android/app/`, and staging's `FIREBASE_SERVICE_ACCOUNT_B64` holds its key (checked with a dry-run
  send). The old project `rido-93cd3` is unused and can be deleted once the new apps have received a push.
- **Maps key: done 29 Sep 2026.** `tamiltaxi-android-maps` allows `com.tamiltaxi.passenger` and `com.tamiltaxi.driver`
  (debug-keystore SHA-1); the old `com.rido.*` entries can be removed once no old build is in use.
- **Local Docker:** the compose project is now `tamiltaxi`, so `docker compose up -d` starts fresh `tamiltaxi_*`
  volumes (run `prisma:migrate` and the seeds). The old `rido_*` volumes can be deleted.

## Interrupted audit completion — 3 Oct 2026

The driver OTP blank-screen fix and the five-agent audit were recovered from Claude's saved history and worktrees.
The API/admin and website commits already on `main` were preserved; the 34 remaining driver/passenger/shared commits
were applied, and unfinished changes were completed. Detailed checks and task coverage are recorded in
[claude-completion-2026-10-03.md](claude-completion-2026-10-03.md).

- Auth verification sends `app: passenger|driver|admin`; maps/places/fare quotes require an authenticated caller; rate cards remain public.
  Admin place proxy/reverse calls forward the token, autocomplete starts at 4 trimmed characters, and changing an
  account's role/block state invalidates cached authorization for existing sessions immediately.
- Driver daily selfie: `POST /drivers/me/selfie-check` (`file`) matches the identity-check reference through Didit;
  `dailySelfieCheckEnabled` controls the gate, `/drivers/me` exposes `selfieCheckRequired` / `selfieCheckedAt`, and
  going online can return `SELFIE_CHECK_REQUIRED`. A number-plate change resets the RC review and approval.
- `DELETE /me` deletes the signed-in account (204; 409 for an unfinished trip); admin can delete from the user page.
  The driver app has no Delete account (owner, 3 Oct 2026): a driver's records are kept at least 6 months for police
  enquiries, so drivers raise a "Delete my account" ticket (Account › Help & support) and support deletes the account
  after that. The rider app keeps Account › Delete account. The legal text (website and both apps) says so.
  Scheduled trips are cancelled. Old tokens stay rejected even if Redis loses the block flag (the retained row has
  `deletedAt`, checked when the account is read from the database), and admin edits of a deleted user return 404.
  Account identifiers, saved places, contacts, devices and driver KYC/photos are removed;
  historical trip addresses/routes remain. S3 must permit `s3:DeleteObject` for the KYC prefix to remove stored files.
- Images: `POST|GET /trips/:id/parcel-photo`, `POST|GET /trips/:id/delivery-photo`, and
  `POST|GET /tickets/:id/attachment` use authenticated access and multipart field `file`. Apps pick compressed images
  (1600 px, quality 80, up to 8 MB); upload failures preserve the booked parcel or created ticket. Driver D-21 shows
  the sender's image, D-22 takes delivery evidence, both ticket forms accept a real screenshot with preview/remove.
- `GET /app-config` includes `scheduledDispatchLeadMin`; scheduling and explanations use it. Driver status pushes
  (`driver.status`) refresh application/profile data. Driver startup caches the last known application status per
  account; unknown/unapproved drivers stay on Registration offline. D-07 waits for real KYC/identity data and retries
  failed reads; a poll cannot navigate from beneath another onboarding screen. Unused DOB/sign-up selfie controls
  have been removed (identity checks still collect ID information).
- Live rides never use seeded pickups/drops or the public OSRM demo router. Selected pickups survive app resumes;
  scheduled dispatch updates restore unseen trips, completed-trip pushes open rating/details, in-progress notification
  taps preserve map/chat state, and `trip.no_drivers` ends a search even if the follow-up HTTP request fails.
- Driver lost accept/cancel responses and socket outages recover from the active trip. Withdrawn comparison offers
  never accept another offer; countdowns resume after a lock; overlay list updates preserve an in-flight accept;
  pauses during jobs apply when the job ends. Parcel/moving jobs have Help, Cancel, Chat and sender no-show before pickup.
- Account/support: loaded profiles replace live seed fallbacks, real WhatsApp/telephone/Play Store links, plain driver
  invitations, screenshot retry without a second ticket, ticket load errors/retry and real timestamps, saved-place notes,
  clearable email, scheduled parcel Activity, moving receipt lines, waiting-charge terms and moving-price Retry on all steps.
- The app's request queue supports the default server offer limit (3) with a small bounded queue. Raising
  `maxOpenOffers` beyond the app's capacity requires updating the app; the setting is not exposed in app-config yet.


## Owner recommendations

Notes from the owner. Each item gets a status and a plan once reviewed.

| # | Recommendation | Status | Plan |
|---|---|---|---|
| 1 | https://h3geo.org - opensource for geo data anlysing and driver - user match, ETA finding and more | **Done (25 Sep 2026):** service areas + zones, H3 dispatch (rings + ETA + batches), heatmaps, live demand/supply surge with k-ring smoothing, learned hex-to-hex ETA, compaction. Refs: Uber H3 blog, "How Uber finds your driver" | See [H3 plan](#h3-plan-owner-recommendation-1) |
| 2 | Make the app entirely free: 0% commission, no subscription; the owner pays the infra and drivers / riders can contribute | **Done (26 Sep 2026):** paid plans switched off (`driverPlansEnabled`, code kept), Contribute page in both apps (UPI button + QR, monthly running cost with breakdown) | See [Free app and contributions](#6a-free-app-and-contributions) |

---

## 1. Stack at a glance

| Layer | Technology | Version | Where |
|---|---|---|---|
| Monorepo | Turborepo + npm workspaces | turbo 2.11, npm 11, Node 24 | root `package.json`, `turbo.json` |
| Mobile apps | Flutter (Material 3), Android only | Flutter 3.47 / Dart 3.13 | `apps/passenger`, `apps/driver` |
| App state / routing | Riverpod 3, go_router 17 (pinned: 18 needs `material_ui`) | | `lib/state`, `lib/router` |
| Shared Flutter code | `tamiltaxi_ui` (theme, widgets), `tamiltaxi_data` (models, seed, fare engine, repositories, simulator) | | `packages/` |
| Backend | NestJS 12 (ESM), TypeScript 5.9 | | `apps/api` |
| ORM / DB | Prisma 7 (driver adapter `@prisma/adapter-pg`) + PostgreSQL 17 | | `apps/api/prisma` |
| Cache / realtime state | Redis 7 (ioredis 6) | | docker `redis` |
| Realtime | Socket.IO (`@nestjs/platform-socket.io`), namespace `/rt` | | `apps/api/src/modules/realtime` |
| Auth | Phone OTP (Redis) → JWT (`@nestjs/jwt`) | | `apps/api/src/modules/auth` |
| Maps (apps) | Google Maps SDK for Android when a key is set, else flutter_map + CARTO light tiles | | `packages/tamiltaxi_ui` TtMap |
| Maps (APIs) | Google Places API (New), Geocoding API, Routes API; live fallback to a local curved line; OSRM/seed data only in mock mode | | `apps/api/src/modules/maps`, `tamiltaxi_data` |
| Location | geolocator (Android fine/coarse location) | 14.x | passenger app |
| Text-to-speech | flutter_tts (phone's own TTS voice, English / Tamil) | 4.x | driver app: new requests read aloud |
| Admin panel | Next.js (App Router, Turbopack, `output: 'standalone'`), React, TypeScript | Next 16.3, React 19.3, TS 5.9 | `apps/admin` |
| Admin UI | shadcn/ui (radix-nova style, Radix UI), Tailwind CSS v4, lucide-react, sonner toasts, Recharts (shadcn chart) | shadcn 4.21, radix-ui 1.6, Tailwind 4.3, Recharts 3.8 | `apps/admin/src/components/ui` |
| Admin maps | Google Maps JavaScript API via `@vis.gl/react-google-maps` (JSON-styled roadmap + satellite), H3 hexagons on `google.maps.Data` layers with h3-js | react-google-maps 1.10, h3-js 4.5 | `apps/admin/src/components/map`, `src/lib/hex.ts` |
| Website | Next.js static export (`output: 'export'`, `trailingSlash`), Tailwind CSS v4, lucide-react | Next 16.3 | `apps/web` |
| Tests | Flutter test (widget + flow), Vitest 4 (API unit + e2e, admin unit, website) | | `apps/*/test`, `packages/*/test` |
| Lint | `flutter analyze` (flutter_lints), oxlint + `tsc --noEmit` (API), ESLint 9 (`eslint-config-next`) + `tsc --noEmit` (admin) | | per package |
| Containers | Docker, Docker Compose | Docker 29, Compose 5 | `docker-compose.yml`, `apps/api/Dockerfile`, `apps/admin/Dockerfile` |

---

## 2. Repository layout

```
apps/
  api/                @tamiltaxi/api        NestJS backend (Prisma, Redis, Socket.IO)
  admin/              @tamiltaxi/admin      Next.js admin panel (shadcn/ui, Google Maps + H3 editor, heatmap), port 3001
  web/                @tamiltaxi/web        public website, static Next.js export → out/ (home, privacy, terms, delete account), port 3002
  passenger/          @tamiltaxi/passenger  Flutter passenger app (com.tamiltaxi.passenger)
  driver/             @tamiltaxi/driver     Flutter driver app (com.tamiltaxi.driver)
packages/
  tamiltaxi_ui/            @tamiltaxi/ui         theme, widgets, illustrations, bundled fonts
  tamiltaxi_data/          @tamiltaxi/data       models, seed, fare engine, repositories, simulator, road router
  flutter_overlay_window/  vendored plugin (MIT) for the driver's floating bubble
docs/
  tech-docs/using.tech.md  this file
  COST_AND_SCALING.md      running cost per trip, free tiers, P-10 ETA and OSRM plans, scaling stages
  GOOGLE_MAPS_SETUP.md     Google Maps keys
  design/                  exported design frames + index
  private/                 owner-only docs (business plan, pitch, build prompts): git-ignored, not published
.github/              CI (analyze + test, API e2e), issue and PR templates
scripts/              flutter.sh, dart.sh (SDK lookup), build_apks.sh, export_design.py, vehicle_icons/
LICENSE               AGPL-3.0; CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md next to it
docker-compose.yml    postgres + redis + api + admin (+ tools profile)
turbo.json            task pipeline
```

---

## 3. Commands

| Command | What it does |
|---|---|
| `npm install` | Installs Turborepo, API and admin dependencies (one workspace lockfile) |
| `npm run get` | `flutter pub get` in Flutter packages, `prisma generate` in the API |
| `npm run analyze` | `flutter analyze` / `tsc --noEmit` + oxlint (API) / `next typegen` + `tsc --noEmit` + ESLint (admin) |
| `npm test` | Flutter tests, API unit tests, admin unit tests (Vitest) |
| `npm run check` | analyze + test (cached by Turborepo) |
| `npm run build:apk` | Release APKs → `dist/tamiltaxi-passenger.apk`, `dist/tamiltaxi-driver.apk` |
| `./scripts/build_apks.sh [passenger\|driver]` | Same without Node; one app or both; always **one APK per app** (`dist/tamiltaxi-passenger.apk`, `dist/tamiltaxi-driver.apk`, arm + arm64, old ones deleted); checks the map key is in the APK |
| `npm run passenger` / `npm run driver` | `flutter run` for that app |
| `python3 scripts/export_design.py` | Renders every screen of both apps (Design gallery frames + the screens added after the design, `test/tool/design_export_test.dart`) and rebuilds `docs/design/` + its index. Needs Pillow |
| `npm run start:dev -w @tamiltaxi/api` | API with watch mode (needs Postgres + Redis) |
| `npm run test:e2e -w @tamiltaxi/api` | API end-to-end tests on an isolated `tamiltaxi_test` database + Redis DB 1 (migrated and seeded each run; dev data untouched) |
| `npm run seed:demo-trips -w @tamiltaxi/api [-- --clear]` | Add (or remove) ~2,000 demo trips for heatmaps and dashboards |
| `npm run seed:demo-people -w @tamiltaxi/api [-- --clear]` | Add (or remove) 40 passengers, 32 drivers (KYC, subscriptions, payments) and 12 tickets; run after demo trips, which it spreads across them |
| `npm run seed:test-drivers -w @tamiltaxi/api [-- --photo <file>] [-- --clear]` | 11 approved, verified test drivers you can sign into (dev OTP): cab 9100000101/102 (102 is a woman, for Butterfly), goods bike 9100000201/202, truck 9100000301/302, mini truck 9100000401, pickup 9100000501, bike taxi 9100000601/602 (602 a woman), auto 9100000701. Each gets a 90-day trial so they can go online with paid plans on. `--photo` sets a stored profile photo (needed with Didit on). Idempotent; ids `test_drv_*` |
| `npm run prisma:migrate -w @tamiltaxi/api` | Create/apply a migration in development |
| `npm run prisma:deploy -w @tamiltaxi/api` | Apply migrations (CI / production) |
| `npm run prisma:seed -w @tamiltaxi/api` | Seed places and plan prices (idempotent) |
| `npm run dev -w @tamiltaxi/admin` | Admin panel on http://localhost:3001 (needs the API; `API_URL` defaults to `http://localhost:3000/v1`) |
| `npm run build -w @tamiltaxi/admin` / `npm run start -w @tamiltaxi/admin` | Production build / serve on :3001 |
| `npm run dev -w @tamiltaxi/web` | Website on http://localhost:3002 (no API needed) |
| `npm run build -w @tamiltaxi/web` | Static website → `apps/web/out/` (plain HTML/CSS/JS, serve from any static host) |
| `npm run test -w @tamiltaxi/admin` | Admin unit tests (formatters, paging URLs, API helpers, JWT check, fare preview, H3 helpers, settings validation) |
| `docker compose up -d` | Postgres + Redis + API + admin panel |
| `docker compose up -d --build admin` | Rebuild and restart only the admin panel |
| `docker compose --profile tools up -d` | Also Adminer and Redis Insight |

Flutter is found via `$FLUTTER`, `PATH`, or `~/development/flutter` (`scripts/flutter.sh`).

---

## 4. Services and ports (Docker Compose)

| Service | Image | Host port (default) | Notes |
|---|---|---|---|
| postgres | postgres:17-alpine | 5432 | volume `postgres-data`, healthcheck `pg_isready` |
| redis | redis:7-alpine | 6379 (this machine uses **6380**, set in `.env`) | AOF on, volume `redis-data` |
| api | built from `apps/api/Dockerfile` | 3000 | runs `prisma migrate deploy` + seed, then `node dist/main.js`; healthcheck `/health` |
| admin | built from `apps/admin/Dockerfile` (`tamiltaxi-admin:local`) | 3001 (`ADMIN_PORT`) | Next standalone `node apps/admin/server.js`; talks to `http://api:3000/v1`; starts after api is healthy; healthcheck `/login` |
| adminer | adminer:5 (profile `tools`) | 8080 | DB browser |
| redis-insight | redis/redisinsight (profile `tools`) | 5540 | Redis browser |

API and admin images: multi-stage Node 24 alpine builds from the repo root (every workspace `package.json` is copied
so `npm ci` matches the lockfile), run as non-root `tamiltaxi`, `tini` as PID 1. The admin image is ~300 MB.

---

## 5. Environment variables

All actual keys, passwords and fingerprints live in `docs/tech-docs/credentials.local.md` (git-ignored; template:
`credentials.example.md`). App compile-time keys live in `/.dart-defines.json` (git-ignored; template
`.dart-defines.example.json`), passed automatically by `scripts/flutter.sh` to every `flutter run` / `flutter build`.


Root `.env` (Compose) is copied from `.env.example`; API local dev uses `apps/api/.env` (from `apps/api/.env.example`).
Never commit real `.env` files.

| Variable | Used by | Default | Notes |
|---|---|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | compose | tamiltaxi / tamiltaxi / tamiltaxi | |
| `POSTGRES_PORT`, `REDIS_PORT`, `API_PORT` | compose | 5432, 6379, 3000 | host ports |
| `DATABASE_URL` | API, Prisma | set by compose | `postgresql://…?schema=public` |
| `REDIS_URL` | API | set by compose | |
| `JWT_SECRET` | API | dev placeholder | ≥ 32 chars in production (`openssl rand -hex 32`) |
| `JWT_EXPIRES_IN` | API | 30d | |
| `OTP_DEV_MODE` | API | true | true = no SMS: `DEV_OTP_CODE` signs in; without it any 6 digits except 000000 (not allowed in production) |
| `DEV_OTP_CODE` | API | empty (`.env.example`: 123456) | the only OTP that works in dev mode; **required** with `OTP_DEV_MODE` when `NODE_ENV=production`. Keep it secret on staging |
| `CORS_ORIGINS` | API | `*` | comma-separated list in production |
| `SEED_ON_START` | API container | true | re-runs the idempotent seed on boot |
| `GOOGLE_MAPS_API_KEY` | API | empty | key 2 `tamiltaxi-server` (IP-restricted): Places (New), Geocoding, Routes; empty = local fallback |
| `GOOGLE_MAPS_API_KEY` (dart-define) | Flutter apps | empty | key 3 `tamiltaxi-app-services` (API-restricted only): the apps' direct Places/Geocoding/Routes calls; also switches the map to Google |
| `/.dart-defines.json` | `scripts/flutter.sh` (run/build) | absent | holds `GOOGLE_MAPS_API_KEY` for the apps |
| `MAPS_API_KEY` (`/.dart-defines.json`, else `apps/*/android/local.properties` or env) | Android manifest | empty | key 1 `tamiltaxi-android-maps` (package + SHA-1 restricted): Maps SDK for Android |
| `CARTO_KEY` (dart-define) | Flutter apps | built-in | CARTO basemap key (`?key=`), used when Google Maps is off |
| `ADMIN_PHONES` | API | empty (`.env.example`: 9000000001) | comma-separated phones that always sign in as ADMIN (admin panel login); the API container reads it on start |
| `API_URL` | admin (server side only) | `http://localhost:3000/v1`; compose sets `http://api:3000/v1` | the browser never calls the API directly |
| `ADMIN_PORT` | compose | 3001 | admin host port |
| `API_HOST` / `ADMIN_HOST` | caddy (profile `https`) | `api.65-0-233-253.sslip.io` / `admin.65-0-233-253.sslip.io` | names Caddy serves with Let's Encrypt certificates; the real domain at launch |
| `ADMIN_COOKIE_SECURE` → `COOKIE_SECURE` | admin container | false | `true` once served over HTTPS (session cookie gets `Secure`); outside compose, `NODE_ENV=production` sets Secure unless `COOKIE_SECURE=false` |
| `DIDIT_API_KEY` | API | empty | Didit console › API & Webhooks › API Key. **Empty = identity checks off** (dev): drivers are approved on RC + insurance alone |
| `DIDIT_WEBHOOK_SECRET` | API | empty | the webhook destination's signing secret; empty = every webhook is refused (the apps' `/kyc/sync` still works) |
| `DIDIT_DRIVER_WORKFLOW_ID` / `DIDIT_RIDER_WORKFLOW_ID` | API | empty | published workflows "Tamil Taxi Driver KYC" (India, driving licence + Aadhaar) and "Tamil Taxi Rider KYC" (India, any ID) |
| `DIDIT_BASE_URL` | API | `https://verification.didit.me` | only for tests |
| `SHARE_BASE_URL` | API | `http://localhost:3001` | public origin of the admin app, where live trip links point (`<SHARE_BASE_URL>/track/<token>`); staging: `https://admin.65-0-233-253.sslip.io` |
| `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | admin (build time, client bundle) | empty | browser key for the **Maps JavaScript API** (must be enabled on the key). Local dev: `apps/admin/.env.local` (git-ignored, template `apps/admin/.env.example`). Docker: root `.env` `GOOGLE_MAPS_BROWSER_KEY` → build arg. Currently the `rido-app-services` key; restrict to HTTP referrers later (`tamiltaxi-admin-web`) |

---

## 6. Backend (apps/api)

- **Modules:** core (config, Prisma, Redis, durable jobs, JWT guard, roles guard, validation pipe, error filter), settings, geo (H3),
  health, auth, users, places, maps, fares, drivers, kyc (Didit identity checks, 6c), subscriptions, trips (dispatch),
  realtime, support, admin.
- **H3 service areas:** each `City` stores its service area as H3 cells (`serviceCells`, default resolution 8 ≈ 0.74 km²
  per hex). `Zone`s group cells as SURGE (multiplier 1.0–1.5), DEMAND, NO_SERVICE or PICKUP_POINT. `GeoService.locate`
  (cached 30 s, invalidated on admin edits) decides serviceability, city, zones and the fare multiplier for any point.
  Bookings with a pickup or drop outside the hexes (or in a NO_SERVICE zone) are refused. Seed: Coimbatore, 1,519 cells
  (18 km) + 3 DEMAND zones. With no cities configured, everything is serviceable.
- **Per-city fares:** `CityFareRule` overrides the built-in rates per vehicle; the surge zone or `currentMultiplier`
  setting sets the multiplier, capped by `maxMultiplier`. `currentMultiplier` defaults to **1.0** (no markup; it was 1.1
  until 28 Sep 2026, which put "Peak 1.1x" on every trip). A value saved in admin Settings is an `AppSetting` row and
  overrides the default, so after deploying check Settings › Current multiplier on staging and set it to 1.0. The apps
  hide the "Peak time" line when the multiplier is 1.0.
  Formula (`fare-engine.ts`, same in the Dart engine and the admin preview): `total = max(minFare, floor((base +
  perKm·km + perMin·min) × multiplier))`, each line floored; the multiplier never applies to the minimum-fare top-up
  (since 28 Sep 2026; before, a short surged ride paid minFare × multiplier). Quotes cap the multiplier at the
  `maxMultiplier` setting.
- **Waiting charge (28 Sep 2026, like Namma Yatri's `countWaitingCharge`):** after the driver marks Arrived, the first
  `freeWaitMin` (setting, default 3) minutes are free; every started minute after that until the ride starts costs the
  vehicle's `waitPerMin` (built-in `fare-rules.ts`: bike 1, auto 1, cab 2, goods bike 1, 3-wheeler 2, mini truck 3,
  pickup 3, truck 4; per city `CityFareRule.waitPerMin`, null = built-in), capped at `waitMaxCharge` (setting, default
  ₹30). Every quote carries the terms (`freeWaitMin`, `waitPerMin`, `waitMaxCharge`) and `waitingCharge: 0`; they are
  stored with the trip's fare, so a later settings change doesn't touch booked trips. On `/start` the server computes
  it from `arrivedAt` to `startedAt` (`waitingCharge` in `fare-engine.ts`: 3:00 → ₹0, 3:01 → one minute, 5:30 → three)
  and stores it in the same guarded update as its own line: `fare.waitingCharge`, `fare.total` and `fareTotal` grow by
  it; the multiplier never applies to it (`subtotal + peakCharge + waitingCharge = total`). A retried start doesn't
  charge twice. Rides **and parcels** (same `/start` path; the passenger parcel app has no arrived screen, so only the
  driver sees the timer there). Old fares without terms use today's settings and rate. Shared cases in
  `fare_cases.json` → `waitingCases` (TS + Dart). Apps: P-15 and D-17 / D-21 (at the pickup) show `WaitingTimerChip`
  (tamiltaxi_ui: "Free waiting · 2:45 left", then "Waiting charge ₹3"); the fare breakdowns (P-11 / P-19 sheet, P-22 and its
  receipt, D-23b) show "Waiting charge" only when it is above 0; driver earnings trips carry `waitingCharge`; the
  driver's job fare is refreshed from the start response (D-19 collects the right amount). Admin: trip Fare card line,
  "Waiting ₹/min" column in Cities › Fares, Settings › Waiting charge. Migration `20260928180000_waiting_charge`.
- **Extra from the rider (30 Sep 2026, like Rapido's "+₹10"):** while a trip is SEARCHING the passenger can raise
  the fare: `POST /trips/:id/extra {amount}` = the extra **in all** (more than before, whole rupees, up to
  `maxExtra` = half the quote rounded to ₹10, at least ₹100; `extra-fare.ts`, steps offered +₹10 / +₹20 / +₹30). It is
  its own line: `fare.extra`, `fare.total` and `fareTotal` grow by it (guarded on SEARCHING and the old `fareTotal`, so
  two taps can't both add on the old total; 409 when the search ended). A "Book any" vehicle gets it on top of its own
  quote (`asVehicle`, and the alternatives list shows fares with it). Then `DispatchService.boosted`: the declined set
  is cleared (drivers who said no are offered it again), the driver holding the offer gets `trip.offer` again with the
  new fare and the time left, and the search restarts with its full time ([widen]). Driver push title: "New ride
  request · ₹50 + ₹20". Admin trip page: "Extra from the rider" line.
  Apps: P-12 (rides) and PP-07 (parcels), live, after 20 s without a driver show `AddExtraCard`
  (`apps/passenger/lib/common/add_extra_card.dart`): "No driver yet? Add a little extra", chips +₹10 / +₹20 / +₹30
  (only steps within the cap, `FareEngine.maxExtra`), then "Add ₹20 · ₹70 in all" sends it (two taps, never one);
  afterwards "₹20 extra added · Drivers now see ₹50 + ₹20. Add more?". P-12's sheet is capped at 75 % of the screen
  and scrolls. The fare on screen follows the trip's fare (`addExtra` response and SEARCHING socket updates). Fare
  breakdowns show "Extra you added" (P-11 / P-19 via `FareBreakdown`, P-22 and its receipt); drivers see it on the
  request card (§7c9) and as "Extra from the rider" in D-23b (earnings trips carry `extra`).
- **Settings (`AppSetting`):** currentMultiplier, maxMultiplier, searchRadiusKm, maxSearchRadiusKm, searchExpandSeconds,
  offerSeconds, maxCandidates, maxReassigns, notMovingMinMin, notMovingEtaFactor, notMovingMinProgressM,
  notMovingRecheckMin, noShowWaitMin, freeWaitMin, waitMaxCharge, cancellationFeeEnabled, cancellationFee,
  cancelRateMinTrips, cancelRateNudge, cancelRateBlock, cancelBlockHours, cancelBlockRepeatHours, rankEnabled, rankWeightAccept, rankWeightCancel,
  rankMaxPenalty, rankIdleMaxBoost, rankIdleFullMin, rankMinOffers, stuckTripMinMin, stuckDurationFactor, pickupHardCapMin, trialDays,
  graceDays, batchWindowMs, useRoadEta, supportPhone, driverPlansEnabled, contributeUpiId, contributePayeeName,
  contributeNote, costServersInr, costMapsInr, costSmsInr, costOtherInr, sosAdminAlert, stopRadiusM, stopMinutes, stopDedupeMin, deviationM, nightStartHour, nightEndHour (defaults in `settings.defaults.ts`, cached
  15 s). Dispatch reads radius, offer time, candidates, batch window and ETA source from here. See 6a for the free-app
  and contribute keys.
- **Admin API (`/v1/admin`, ADMIN role; phones in `ADMIN_PHONES`):** stats, live (online drivers + active trips), drivers
  (+ per-document KYC review, status), kyc queue, users (role, block/unblock → Redis `user:blocked:<id>` checked by the
  JWT guard), trips, passengers, plans, tickets, payments, cities / service-cells / zones / fares, announcements,
  settings, audit log, CSV exports (trips, drivers, payments), SOS queue (`/admin/sos`, 6d). Every admin POST/PUT/PATCH/DELETE is written to `AuditLog`.
- **Heatmaps:** trips store `pickupCell` / `dropCell` (H3 res 8, indexed). `GET /v1/admin/heatmap?metric=pickups|drops|unmet|fares
  &from&to&kind&vehicleKind&hourFrom&hourTo&resolution` aggregates per cell in SQL (hour filter in IST; resolution < 8
  rolls up to parent hexes). Demo data: `npm run seed:demo-trips -w @tamiltaxi/api` (~2,000 trips, ids `demo_…`;
  `-- --clear` removes them).
- **Public geo:** `GET /v1/cities`, `GET /v1/cities/:id/service-area` (cells + zones for the apps), `GET /v1/geo/check`,
  `GET /v1/announcements?audience=&cityId=`.
- **API prefix:** `/v1` (health endpoints unprefixed). Endpoint list: see README "Backend".
- **App APIs added 26 Sep 2026 (mobile go-live):**
  - `GET /trips/active` (the caller's unfinished trip, to restore either app after a restart), `GET /trips/offer`
    (driver: the request currently offered, for when the socket missed `trip.offer`).
  - `GET|POST /trips/:id/messages` in-trip chat (Redis list `trip:chat:<id>`, 24 h, ≤ 200 messages; pushed as
    `trip.message` on the trip room).
  - **"Book any" (27 Sep 2026, like Namma Yatra):** `GET /trips/:id/alternatives` (passenger, while SEARCHING): other
    vehicles of the same kind (ride / goods) with free drivers within `maxSearchRadiusKm`, cheapest first:
    `{vehicleKind, quote, driversNearby, nearestKm}`, priced on the booked route. `POST /trips/:id/also {vehicleKind}`
    adds one (≤ 3; stored in `Trip.alsoKinds` + `alsoFares`), searches again at once without cutting an open offer and
    restarts the search time. A driver of an added vehicle sees and accepts the trip as their vehicle at its fare
    (`asVehicle`); accept rewrites `vehicleKind` / `fare` / `fareTotal`.
    Passenger app (P-12 Finding your driver): after 15 s of searching it asks for alternatives every 10 s and shows
    "Taking a while? Add another vehicle" (vehicle, drivers nearby, km, fare, Add); the title becomes "Finding a nearby
    bike or auto…". On assignment the ride takes the trip's vehicle and fare from the server. Rides only for now
    (parcels have the API but no UI yet).
  - Trips include `driver.user` and `passenger` (name, phone) for both sides; the **OTP is hidden from drivers** in
    offers, trip reads, history and every driver step response (accept / arrived / start / complete / cancel; before
    28 Sep 2026 the accept and arrived responses carried it, so a driver could start without the rider).
  - `trip.offer` payload: `{ trip, passenger: {name, phone}, pickupKm, pickupEtaMin, expiresInSeconds }`.
  - `PATCH /drivers/me` (name, gender, work type, vehicle model/colour, plate, UPI), `GET /drivers/me/earnings?period=today|week|month`
    (today in 2-hour buckets, 7 days, 4 weeks; commission saved = 30 % of fares; online hours from Redis
    `driver:online_since:<id>` / `driver:online_secs:<id>:<IST day>`, 40 days).
  - `GET` / `PUT /drivers/me/booking-preferences` (`{maxPickupKm 0.5–10, minTripKm 1–50, maxTripKm 1–100, goTo {lat,
    lng, name}, stayIn {lat, lng, name, radiusKm 1–20}, parcels, areas [{name, lat, lng}] ≤ 6}`, null clears one;
    stored in `Driver.bookingPrefs` JSON, see §7c8). The GET also returns `rentals`, `outstation` and `pauses`.
  - `PUT /drivers/me/services/:service` (`parcels | rentals | outstation | shifting`; `{on, pauseMinutes 5–1440 | null,
    reason ≤ 40, helpers}`): Services, see §7c8. 400 for a service the driver's vehicle doesn't have.
  - `GET /fares/rate-card?lat&lng` (public): every vehicle's in-town rates in that city (else built-in), waiting,
    peak cap, cancellation fee (null while off) and the up-front prices: the driver app's Rate card.
  - `POST /drivers/me/documents/:type` is **multipart** (`file`: JPG/PNG/WebP/PDF ≤ 8 MB) → **S3**
    `s3://rido-uploads-786020471552/kyc/<uuid>.<ext>` when `S3_BUCKET` is set (production), else local disk
    (`UPLOAD_DIR`, Docker volume `uploads`, dev) → `KycDocument.fileUrl` = file name. Admins read it via
    `GET /v1/admin/files/:name` (streams from S3; files saved on disk before the switch are still found), proxied by
    the admin panel at `/files/:name` (never public). `FileStorageService` in `core/storage`.
  - `GET /subscriptions/me/payments`, `POST /subscriptions/me/autopay {upiApp}` (Autopay during the trial).
  - **Arrival / drop check:** `POST /trips/:id/arrived` and `/complete` take `{lat, lng, farReason}`. **Position
    (28 Sep 2026):** the server's last GPS fix wins when it is under 30 s old (`SERVER_FIX_MAX_AGE_MS`,
    `positionForCheck`), so a faked body can't pass the check; the body's `lat/lng` is used only without a fresh
    server fix (stream down), then a stale server fix. Farther than `arrivalRadiusM` (250 m) from the pickup or `dropRadiusM` (400 m) from
    the drop without a reason → **422 `TOO_FAR`** `{message, details: {stop, distanceM, radiusM, reasons}}`; with a
    reason it proceeds and stores `arrivedDistanceM` / `arrivedFarReason` / `endDistanceM` / `endFarReason` on the trip
    (admin trip page shows them). Parcels: the delivery OTP is checked first. Unknown position → not enforced.
    Errors may carry `code` / `details` (global filter); apps read them as `ApiException.code` / `.tooFar`.
  - **Guarded status changes (28 Sep 2026):** arrived / start / complete / cancel update with
    `updateMany where {id, status: <checked status>}` (like accept), so a cancel can't overwrite a ride the driver
    started at the same moment (the loser gets 409, or cancel re-checks and 400s). Retrying a step that already went
    through (double tap, lost response) returns the trip (200). Complete counts `Driver.ridesCount` in the same
    transaction as the guarded update (a double tap counts once). Cancel / complete free the driver
    (`driver:busy`) only while it still points at that trip. Cancelling a cancelled trip returns it.
  - **Driver rating (28 Sep 2026):** `POST /trips/:id/rate` sets `Trip.rating` only while it is empty (guarded
    update; second rating → 409) and, in the same transaction, adds to `Driver.ratingSum` / `ratingCount`;
    `Driver.rating` = sum / count (2 decimals; 5 until the first rating). Before, it was averaged over `ridesCount`,
    which counts unrated rides. Migration `20260928120000_driver_rating_sum` backfills from rated trips.
  - **Trip OTP tries (28 Sep 2026):** the 4-digit ride OTP (`/start`) and parcel delivery OTP (`/complete`) allow
    5 tries a minute per trip (`TripOtpGuard`, counted before the compare; the right OTP resets it). Wrong →
    400 `WRONG_OTP` `{details: {triesLeft}}`; the 5th wrong try and any try while locked → **429 `OTP_LOCKED`**
    "Too many wrong OTPs. Ask the rider (receiver) to read it again in a minute" `{details: {retryInSeconds}}`.
    Driver app (D-17 / D-22a): shows the message and keeps the button off until then (`OtpLockout`).
  - **Structured cancellations (28 Sep 2026, like Namma Yatri's `CancellationReason`):** `POST /trips/:id/cancel`
    takes `{code, note?}`; `code` is a `CancelCode` the caller's side may use (`trips/cancel-codes.ts`), anything else
    becomes `OTHER`. Passenger: `CHANGED_MIND`, `DRIVER_TOO_FAR`, `DRIVER_ASKED_TO_CANCEL`, `WAIT_TOO_LONG`,
    `BOOKED_BY_MISTAKE`, `OTHER`. Driver: `PASSENGER_NO_SHOW`, `PASSENGER_UNREACHABLE`, `PASSENGER_ASKED_TO_CANCEL`,
    `VEHICLE_ISSUE`, `TOO_FAR`, `BUTTERFLY_MISMATCH` (was the reason text `Rider is not a woman`), `OTHER`. System:
    `NO_DRIVERS`, `DRIVER_NOT_MOVING`, `STUCK`. **Backward compatible:** an old app sending only `{reason}` gets its
    text mapped to the code (unknown text → `OTHER`) and kept as the note. The trip stores `cancelledBy`
    (`PASSENGER` / `DRIVER` / `SYSTEM` / `ADMIN`), `cancelCode`, `cancelledAt` and the note in `cancelReason`;
    `NO_DRIVERS` trips get `SYSTEM` / `NO_DRIVERS`. Every cancel also writes a `TripCancellation` row (trip,
    driver, passenger, by, code, note, `fromStatus`, `reassigned`, `isDriverFault`; indexed by driver and passenger
    + time) for cancellation rates: `isDriverFault` = the fault verdict is DRIVER (see "Cancellation fault verdict";
    before it, a driver's cancel except `PASSENGER_NO_SHOW` / `BUTTERFLY_MISMATCH`, or the system's
    `DRIVER_NOT_MOVING`). Migration `20260928140000_structured_cancellations`
    backfills `cancelledBy` / `cancelCode` / `cancelledAt` from the old reason texts and history rows for old cancels.
    `Trip.arrivedAt` is set on "Arrived". Apps: S-03 / D-16 / D-17 send codes (`CancelCode` in tamiltaxi_data, with the
    sheet labels and per-side lists); admin trip page shows who / why / when, the note, every cancellation and the
    arrival time; the trips CSV has the new columns. The Butterfly-for-others report count uses the code.
  - **Cancellation fault verdict (28 Sep 2026, like Namma Yatri's `CancellationFault` / `CancellationSignals`):**
    every `TripCancellation` row stores `fault` (`CancelFault`: `DRIVER` / `PASSENGER` / `NONE` / `SHARED`),
    `faultRule` (the name of the deciding rule) and `signals` (JSON: `by`, `code`, `fromStatus`, `hasDriver`,
    `isArrived`, `waitedSec`, `sinceAcceptSec`, `atAcceptM` / `nowM` = straight-line metres from the driver to the
    pickup at accept / at the cancel from their last fix, `isMovingAway` = ≥ 300 m farther than at accept,
    `noShowWaitMin`, `freeWaitMin`). One pure function (`trips/cancel-fault.ts` `faultVerdict`, first match wins):
    nobody accepted yet / `NO_DRIVERS` → NONE; system `DRIVER_NOT_MOVING` → DRIVER, `STUCK` → DRIVER before
    arrival, SHARED after, other system → NONE; admin → NONE; driver: `BUTTERFLY_MISMATCH` and `PASSENGER_NO_SHOW`
    → PASSENGER, after waiting the no-show time with `PASSENGER_UNREACHABLE` / `PASSENGER_ASKED_TO_CANCEL` → SHARED,
    anything else (before or after arrival) → DRIVER; passenger: driver moving away (not arrived) → DRIVER, within
    2 min of accept (`EARLY_CANCEL_SEC`) → NONE, after arrival with ≥ `freeWaitMin` waited → PASSENGER (sooner →
    SHARED), `DRIVER_ASKED_TO_CANCEL` → SHARED (word against word), `WAIT_TOO_LONG` / `DRIVER_TOO_FAR` → NONE, else
    (changed their mind while the driver drove) → PASSENGER. `isDriverFault` = fault DRIVER. Thresholds are code
    constants. Migration `20260928190000_cancellation_fault` backfills old rows from `isDriverFault` (DRIVER) and the
    no-show / Butterfly codes (PASSENGER), rule `backfill`, no signals. Admin: the trip page's Cancellations list shows
    the verdict, rule and signals; the trips list shows the fault under a cancelled trip's status.
  - **Cancellation fee (28 Sep 2026, like Namma Yatri's `CancellationDues`; OFF by default):** settings
    `cancellationFeeEnabled` (default **false**: the owner hasn't decided the policy, rides are cash and there is no
    settlement between drivers) and `cancellationFee` (default ₹10). While on, a cancellation whose verdict is
    PASSENGER after the driver had arrived and waited at least `freeWaitMin` (`trips/cancellation-dues.ts`
    `cancellationDueAmount`: e.g. rule `passenger_after_wait`, or a driver's `PASSENGER_NO_SHOW`) writes a
    `CancellationDue` (passenger, cancelled trip, `cancellationId`, `owedToDriverId` = the driver who waited,
    `amount`, `status` PENDING) in the same transaction as the cancellation row. The passenger's next **ride** that
    completes while the setting is on gets every PENDING due as one fare line `previousCancellationFee` (`fare.total`
    and `fareTotal` grow; not in the quote at booking) and the dues become APPLIED with `appliedTripId` in the same
    transaction as the guarded completion (a due taken meanwhile rolls it back → 409, the retry recounts). That
    ride's driver collects it in cash (the driver app refreshes the job fare from the complete response, so D-19 shows
    it). No settlement: `GET /v1/admin/cancellation-dues?status=PENDING|APPLIED&page` (passenger, owed-to driver,
    cancelled trip, the ride and driver that collected it, `totals.pending` / `totals.applied`) feeds admin Finance ›
    Cancellation fees. Apps show "Previous cancellation fee" on the fare breakdowns, P-22 / receipt and D-23b (driver
    earnings trips carry `previousCancellationFee`); admin trip page shows the line. Settings › Cancellation fee.
    Migration `20260928200000_cancellation_dues`.
  - **Driver cancellation rate: nudge and temporary pause (28 Sep 2026, like Namma Yatri's `nudgeOrBlockDriver` /
    `UnblockDriver` / `DriverBlockTransactions`; `trips/cancel-rate.ts`, `trips/driver-blocks.service.ts`):** after
    every cancellation judged DRIVER (the driver's own, or the system's not-moving reassign) the rate is recomputed:
    driver-fault `TripCancellation` rows ÷ assigned trips (trips they hold with `assignedAt` in the window + trips taken
    off them, `reassigned` rows) over a sliding **7 days**, starting no earlier than the end of their last pause (so
    counting restarts after one). Cached in Redis `driver:cancel-rate:<id>` (5 min, dropped on each cancel). Settings:
    `cancelRateMinTrips` 5 (fewer assigned trips → not judged), `cancelRateNudge` 0.3, `cancelRateBlock` 0.5,
    `cancelBlockHours` 24, `cancelBlockRepeatHours` 72 (when another pause started in the last 7 days).
    - **Nudge** (≥ 0.3): push "You've cancelled X of your last Y rides" (at most once a day,
      `driver:cancel-nudged:<id>`), and the driver app's Home banner from `GET /v1/drivers/me/cancel-rate`
      (`{since, cancelled, assigned, rate, level: OK | NUDGE | BLOCK, blockedUntil, minTrips, nudgeAt, blockAt,
      blockHours, message: {title, body}}`).
    - **Pause** (≥ 0.5, not already paused): a `DriverBlock` row (`reason` CANCELLATION_RATE, `fromAt`, `untilAt`,
      `details` {cancelled, assigned, rate, since}, `liftedBy` / `liftedAt`) and `Driver.blockedUntil`; the driver is
      set offline, removed from the H3 index, their online session ends, `driver:state` is invalidated, Redis
      `driver:tblock:<id>` (PX until the end) makes dispatch skip them, socket `driver.blocked {until, title, body}` +
      push. `POST /drivers/me/online` while paused → **403 `DRIVER_TEMP_BLOCKED`** "You cancelled too many rides, so
      you can't go online until 3:40 pm, 29 Sept" `{details: {until}}` (ISO time). A durable job `driver.unblock`
      (id = driver id, payload `{blockId}`) runs at `untilAt`: clears `blockedUntil` (only if it is still that
      pause), the Redis flags and `driver:state`, socket `driver.unblocked`, push "You can go online again".
    - **Admin:** the driver page shows the 7-day rate, a Pauses card (history) and **Lift pause** (`POST
      /v1/admin/drivers/:id/lift-block` → the block with `liftedBy` = the admin's user id, `liftedAt`; 409 when not
      paused; cancels the job; audit logged like every admin POST). `GET /admin/drivers/:id` adds `blocks` and
      `cancelRate`. Settings › Driver cancellations. The driver page also shows **Offers (7 days)** from `GET
      /v1/admin/drivers/:id/offer-stats` → `{days, offered, accepted, declined, ignored, cancelled, acceptRate,
      isRanked, minOffers}` (the ranking counters). Settings › Driver ranking.
    - **Passengers are never paused:** `GET /admin/users/:id` adds `cancelRate` (last 30 days: `booked` trips,
      `cancelled` by them, `atFault` = verdict PASSENGER, `rate`, `faultRate`), shown on the admin user page.
    - Driver app: D-13 banner (warning at NUDGE; "You're paused until …" with Details while paused), the 403 opens
      S-10b (S-10 with `pausedUntil`: "You're paused until 3:40 PM tomorrow", why, Contact support; route
      `/account-paused?until=`), `driver.blocked` while online takes the app offline with a notice. Migration
      `20260928210000_driver_blocks`.
  - **Reassign on driver cancel (28 Sep 2026, like Namma Yatri's `reAllocateBookingIfPossible`):** a driver cancel in
    `DRIVER_ASSIGNED` / `DRIVER_ARRIVED` no longer ends the trip (`TripsService.dropTrip`): a guarded update puts it
    back to `SEARCHING` (transitions allow both → SEARCHING), clears `driverId` / `assignedAt` / `arrivedAt` / the
    arrival check, increments `Trip.reassignCount`, records a `TripCancellation` (`reassigned: true`), frees the
    driver, adds them to `dispatch:<id>:declined` (never offered it again), restarts the search time
    (`dispatch:<id>:since`) and re-runs dispatch (`DispatchService.restart`). The update (`trip.updated`, SEARCHING)
    also goes to the driver's room; the driver's response is the trip (no OTP). Passenger push "Finding you another
    driver"; the app shows S-02 ("… had to cancel. We're finding you another driver", same fare) until someone
    accepts (PP-07 again for parcels, with a notice). After `maxReassigns` (setting, **default 2**) drops, the next
    driver cancel ends the trip: `CANCELLED`, `cancelledBy SYSTEM`, `cancelCode NO_DRIVERS` (the history keeps the
    driver's code); passenger push/notice "Your driver couldn't make it and no other driver is free". A
    `BUTTERFLY_MISMATCH` cancel still ends the trip (the booking itself was wrong). Not handled: a "Book any" trip
    taken by an added vehicle keeps that vehicle when it searches again (the booked kind was overwritten on accept).
  - **Trip timeouts (28 Sep 2026, durable jobs, `trips/trip-timeouts*.ts`, like Namma Yatri's allocator jobs):**
    scheduled by `TripsService`, run by `TripTimeoutsService`; each handler first checks the trip is still in that
    step with that driver (stale jobs do nothing), and every cancel / reassign / completion clears the trip's jobs.
    - `trip.pickup-progress` (on accept, at max(`notMovingMinMin` 3, `notMovingEtaFactor` 1.5 × pickup ETA) min):
      still DRIVER_ASSIGNED and not `notMovingMinProgressM` (150 m) closer to the pickup than at accept
      (`Trip.acceptDistanceM`, straight line; no fresh GPS = not moving) → socket `trip.nudge` `{tripId, kind:
      NOT_MOVING, title, message}` + push "Are you on the way?", re-checked after `notMovingRecheckMin` (2) min; the
      second failed check reassigns as `SYSTEM` / `DRIVER_NOT_MOVING` (counts against the driver) and tells the
      driver. A driver who made progress isn't checked again (the cap below still applies).
    - `trip.no-show` (on arrived, at `Trip.noShowAt` = arrivedAt + `noShowWaitMin` 5): nudge the driver
      (`NO_SHOW_ALLOWED`: they may cancel as "Passenger didn't come", no fault) and push the passenger "Your driver is
      waiting". A driver cancel with `PASSENGER_NO_SHOW` before `noShowAt` (or before arriving) → **400
      `NO_SHOW_TOO_EARLY`** `{details: {retryInSeconds}}`; after it the trip is CANCELLED (never reassigned).
    - `trip.stuck` (on start, at max(`stuckTripMinMin` 120, `stuckDurationFactor` 4 × estimated min)): still
      IN_PROGRESS / PICKED_UP → `Trip.needsReview = true` + `reviewNote`, driver nudged (`END_TRIP`). Never completed
      automatically. Admin: "Needs review" filter on Trips (`GET /admin/trips?review=true`), a note on the trip page and
      "Mark reviewed" (see "Fare sanity flags").
    - `trip.pickup-cap` (on accept, at `pickupHardCapMin` 60): still not started → CANCELLED by `SYSTEM` / `STUCK`,
      driver freed and told; passenger push "It didn't start in time".
    Driver app: `trip.nudge` shows as a notice (`LiveJobs.nudges`); a `trip.updated` SEARCHING for its job (taken
    off) or a system cancel ends the job with its own notice (`jobEndedNotice`); D-17 has "Passenger didn't come?"
    counting down to `noShowAt` (`NoShowButton`), then cancels with `PASSENGER_NO_SHOW`. All settings are in admin
    Settings › Trip timeouts. Migration `20260928160000_trip_timeouts` (`noShowAt`, `acceptDistanceM`,
    `needsReview`, `reviewNote`).
  - Global JWT/roles guards now skip non-HTTP contexts: sockets authenticate on connect. (Before this, `trip:join` and
    `driver:location` crashed in the guard, so live tracking never reached passengers.)
- **Durable jobs (28 Sep 2026, `core/jobs`, like Namma Yatri's `lib/scheduler`):** `JobsService.schedule(kind, id,
  runAt, payload?)` / `cancel(kind, id)` / `scheduledAt(kind, id)`; modules `register(kind, handler, {maxAttempts = 3,
  backoffMs = 5000})` in `onModuleInit`. Stored in Redis: sorted set `jobs:due` (member `kind|id`, score = run time in
  epoch ms) + hash `jobs:data` (payload, failed attempts). One entry per kind + id (scheduling again replaces it).
  Every instance polls once a second; a Lua script claims due jobs atomically and **leases** them (score moved 60 s
  ahead) so a process that dies mid-run lets the job run again instead of losing it; finish / retry only act while the
  lease is still theirs (a handler may schedule its own key again). A throwing handler is logged and retried with
  backoff `backoffMs × 2^(n-1)`, then dropped with an error log. No BullMQ / extra dependency. Kinds in use: the trip timeouts
  (`trip.pickup-progress`, `trip.no-show`, `trip.stuck`, `trip.pickup-cap`, see "Trip timeouts"), `offer.expire` (an offer's `offerSeconds` timeout, payload `{driverId}`) and `dispatch.research` (search again 4 s
  after the queue ran out); both are cancelled when the search stops. Before, these were in-memory `setTimeout`s and an
  API restart lost every open offer until the 15 s sweep. `runDue(now)` runs due jobs directly (tests).
- **Database (Prisma):** User, EmergencyContact, SavedPlace, Place, Driver, KycDocument, IdentityVerification, Trip, TripCancellation, CancellationDue, DriverBlock, Plan, Subscription,
  Payment, SupportTicket. Money in whole rupees (Int). Migrations in `apps/api/prisma/migrations`.
- **Redis keys:**

| Key | Purpose | TTL |
|---|---|---|
| `otp:code:<phone>`, `otp:attempts:<phone>`, `otp:sends:<phone>` | OTP + limits (5 sends / 15 min, 5 attempts) | 5–15 min |
| `h3:drv:<VEHICLE_KIND>:<cell>` | Online drivers per H3 cell (res 8) | – |
| `driver:cell:<driverId>` | The driver's current kind + cell (to move between sets) | – |
| `dispatch:pending`, `dispatch:lock` | Bookings waiting for the next batch; batch lock | – / batch window |
| `eta:<road\|est>:<cellA>:<cellB>` | ETA minutes between hex centres | 10 min |
| `driver:alive:<driverId>` | Heartbeat `lat,lng,epochMs`; stale drivers are skipped | 90 s |
| `driver:state:<driverId>` | `online\|vehicleKind\|blocked` (e.g. `1\|BIKE\|0`) for the GPS path, so no database read per fix (`core/driver-state`). Written on go online / offline; dropped when an admin changes the driver's status or blocks / unblocks the user, on KYC status changes and profile edits; a miss reads the database | 60 s |
| `driver:busy:<driverId>` | Active trip id; claimed with SET NX on accept (one trip per driver), freed by compare-and-delete | 6 h, refreshed by each GPS update; a stale one is cleared on go-online |
| `drv:stats:<driverId>:<yyyymmdd>` | Offer counters for ranking (`o` offered, `a` accepted, `d` declined, `i` ignored, `c` driver-fault cancel after accept), UTC day | 8 days |
| `drv:lastTripEnd:<driverId>`, `drv:onlineSince:<driverId>` | Epoch ms; the idle bonus in ranking waits from the later one | 1 day |
| `user:blocked:<userId>` | Blocked by an admin (checked on every request) | until unblocked |
| `driver:tblock:<driverId>` | Paused for too many cancellations (value = end, epoch ms); dispatch skips these drivers | until the pause ends; deleted when it is lifted |
| `driver:cancel-rate:<driverId>` | Cached `GET /drivers/me/cancel-rate` stats | 5 min; deleted on each of their cancellations |
| `driver:cancel-nudged:<driverId>` | A cancellation-rate nudge push was sent (one a day) | 24 h |
| `dispatch:<tripId>:queue`, `dispatch:<tripId>:offer`, `dispatch:driver:<driverId>:offer` | Nearest-driver queue, current 15 s offer (both directions). The driver key is claimed with SET NX (one open offer per driver) and deleted only while it still names that trip | 10 min / 15 s |
| `trip:phase:<tripId>` | Which part of the trip GPS is recorded for: `p` (to the pickup, set on accept) or `t` (ride / delivery, set on start) | 12 h; deleted when the trip ends, is cancelled or reassigned |
| `trip:pts:<tripId>` | Breadcrumbs: list of `ts,lat,lng,acc,mock,phase` (fixes with `acc` > 50 m left out; at most 6,000) | 12 h, same |
| `trip:ptmeta:<tripId>` | Hash: `mock` (mock-location fixes seen), `inaccurate` (fixes dropped for accuracy) | 12 h, same |
| `trip:chat:<tripId>` | In-trip chat messages | 24 h |
| `jobs:due`, `jobs:data` | Durable jobs: `kind\|id` → run time (sorted set) and payload (hash), see "Durable jobs" | until run / cancelled |
| `trip:otp-tries:<tripId>` | Ride / delivery OTP tries this minute (5 allowed) | 60 s from the first try |
| `driver:online_since:<id>`, `driver:online_secs:<id>:<day>` | Online session start; online seconds per IST day | – / 40 d |
| `kyc:event:<event_id>` | Didit webhook already handled (idempotency) | 2 d |
| `maps:rg3:*`, `maps:rt3:*`, `maps:tt:*`, `eta:road:<mode>:*` | Google response cache: reverse geocode with its `landmark` (~11 m grid), fare routes (`vehicleStopover` stops, shortest of `computeAlternativeRoutes`, `TRAFFIC_AWARE`, ~11 m grid; kept 6 h so a quote and its booking price the same route), the fare route's traffic-aware minutes (`maps:tt:<mode>:<from>:<to>`, **15 min**, then one Pro call refreshes the minutes only), ETAs (`maps:rt3:DRIVE:eta:*` from single lookups, and `eta:*` also filled by the Route Matrix, cell centres, no stopover, no path, `TRAFFIC_UNAWARE`). Autocomplete and Place Details are **not** cached (Places terms allow storing only place IDs; Place Details also ends the session so keystrokes aren't billed singly) | 30 d / 6 h / 15 min / 10 min |

- **Dispatch (Uber-style, see owner ref "How Uber finds your driver"):**
  1. Drivers are indexed by H3 cell (res 8) in Redis sets `h3:drv:<kind>:<cell>`; no distance scan over all drivers.
  2. A booking waits in a batch window (`batchWindowMs`, default 2 s; Redis lock so one instance runs each batch).
  3. Candidates = pickup hexagon, then ring 1 (the six neighbours), ring 2… up to the current radius, stopping once
     enough drivers are found; busy and stale drivers are skipped. **Widening radius (27 Sep 2026):** the radius
     starts at `searchRadiusKm` (5 km) and grows linearly to `maxSearchRadiusKm` (15 km) over `searchExpandSeconds`
     (45 s) while nobody accepts (`search-radius.ts`), for the booked vehicle and any added ones ("Book any").
     **Parcel on bike (30 Sep 2026, like Rapido):** a goods-bike parcel also searches the `BIKE` and `SCOOTY`
     indexes; two-wheeler drivers whose Parcels service is off or paused are left out. **Parcel on Auto** (3 Oct 2026,
     `AUTO_PARCEL`) searches `AUTO` (only autos that switched Parcels on: off by default) and `THREE_WHEELER`
     (`vehicle-match.ts`, `TripDriversService`, which the vehicle list's pickup ETAs and "Book any" use too). The
     bike driver takes it as a goods bike (`tripVehicleFor`, `asVehicle`) at the goods-bike fare; a goods-bike
     driver never gets passengers. Scooters also take Bike rides, and autos serve **Auto Priority** (see 6f).
  4. Candidates are ranked by **road ETA**, not straight-line distance (`EtaService`: Google Routes when
     `useRoadEta` and a key are set, else a 20 km/h × 1.3 estimate), cached per H3 cell pair for 10 min so all
     drivers in one hexagon share one lookup. All candidates go through `EtaService.minutesMany` together: learned
     speed → `eta:road:<mode>:<a>:<b>` cache → **one** `computeRouteMatrix` call for every missing cell (origins =
     the cells' centres, destination = the pickup cell's centre, ≤ 49 origins per call) → estimate for elements
     Google left out or marked `ROUTE_NOT_FOUND`. P-10's `withPickupEta` does the same for every vehicle's 3
     nearest drivers at once.
     **Reliability ranking (28 Sep 2026, like Namma Yatri's intelligent pool; `trips/driver-rank.ts`,
     `trips/driver-offer-stats.service.ts`):** still one driver at a time, but the queue order uses ranking minutes
     `eta × (1 + min(rankMaxPenalty, rankWeightAccept·(1 − acceptRatio) + rankWeightCancel·cancelRatio)) − eta × idleShare`.
     The penalty cap `rankMaxPenalty` (0.5) keeps a bad record to at most ETA × 1.5, so a rider never waits for a much
     farther driver (without it the defaults allowed ETA × 2.5).
     acceptRatio = accepted ÷ answered offers (accepted + declined + ignored), cancelRatio = driver-fault cancels ÷
     accepted, both over the last 7 days and only once the driver had `rankMinOffers` (10) offers (new drivers are
     neutral). idleShare = `rankIdleMaxBoost` (0.15) × min(1, idle minutes ÷ `rankIdleFullMin` (30)), idle since the
     later of the last trip end (`driver:busy` released) and going online (offline → online): a share of the driver's
     own ETA, so a long wait never beats a driver more than 15 % nearer. Defaults `rankWeightAccept` 0.5,
     `rankWeightCancel` 1.0; `rankEnabled` off = plain ETA. Counters: Redis hash `drv:stats:<id>:<yyyymmdd>` (UTC
     day; fields `o` offered at send, `a` accepted when the guarded write wins, `d` declined, `i` offer expired,
     `c` cancel after accept judged DRIVER), 8-day TTL, read for all candidates in one pipeline (7 HGETALL + 2 GET
     each). The Butterfly head start and `assignBatch` work on the ranking minutes. The trip is re-read (still
     SEARCHING) in `offerNext` right before each offer, after the slow ETA/ranking step, so no extra check was needed.
     **Butterfly (27 Sep 2026):** `Trip.womenDriver` (`NONE` / `PREFERRED` / `ONLY`, booking field `womenDriver`,
     women riders only: the passenger's `gender` must be `FEMALE`, rides only). `ONLY` keeps women drivers
     (driver `user.gender = FEMALE`) and never falls back; `PREFERRED` ranks men as if 8 min further
     (`PREFERRED_HEAD_START_MIN`, `drivers/women-drivers.ts`), so men still get it when no woman is near.
     Apps: P-10 Butterfly card (`ButterflyMark` in tamiltaxi_ui, pink `TtColors.butterfly*`) with Any driver /
     Preferred / Women only, shown only when the profile gender is female; Safety preferences "Prefer women
     driver" is its default. "Women only" re-quotes with `womenOnly`. The driver request card (30 Sep 2026) has a
     pink band on every Butterfly trip, PREFERRED and ONLY (`RideRequest.womenDriver`, `isButterfly`;
     `isWomenOnly` = ONLY): a pink border, a filled "Butterfly" badge with the `ButterflyMark` and "Women drivers
     only" / "Women drivers first", and the butterfly on a pink circle in the rail (the first `RequestPerk`). The
     overlay carries `womenDriver` too.
     **"Who's riding?" (28 Sep 2026):** booking field `rider: { name, phone, isWoman }` (rides only) stores
     `Trip.riderName / riderPhone / riderIsWoman`; Butterfly needs a woman *rider* (the account holder with gender
     FEMALE, or `rider.isWoman`). The driver's offer shows the rider's name and phone (`passenger.bookedBy` = the
     account holder). Abuse guard: a driver can cancel with the code `BUTTERFLY_MISMATCH` ("Rider is not a woman",
     no penalty: Tamil Taxi has no driver cancel penalties); after 2 such cancels on trips booked for someone else the
     account gets 403 for Butterfly-for-others (own Butterfly rides and normal rides still work). No SMS to the
     rider yet: the account holder shares the ride OTP. Apps: P-10 "Riding: Me ▾" chip → P-10b sheet (name, mobile,
     "She's a woman"); it resets to Me after a finished ride. Driver: request card shows the rider with "Booked by …",
     and D-16 / D-17 offer the cancel reason on any Butterfly ride (both choices are women riders only). Admin trip page shows the rider and Butterfly.
  5. The whole batch is assigned together (`assignBatch`: all trip–driver pairs by ranking minutes, each driver to one rider),
     then each driver gets `offerSeconds` to accept; decline/timeout → next in that trip's queue.
     **One offer, one trip (28 Sep 2026):** a driver who is busy or still deciding on another request is skipped
     (next candidate; they come back in a later search). Accept claims `driver:busy` atomically before the database
     write (409 "Finish your current trip first" if it holds another trip) and releases it if the write loses.
  6. **Out of candidates (26 Sep 2026):** search again every 4 s. A driver who let the offer **time out** can be
     offered it again (e.g. the only driver around); one who **declined** is excluded for that trip
     (`dispatch:<id>:declined`). `NO_DRIVERS` after 90 s if any driver was offered it, else after 30 s, but never
     before the radius has widened fully plus 15 s (60 s with the defaults), counted from the booking or the last
     added vehicle (`dispatch:<id>:since`); or at once when a fresh search at the maximum radius finds only drivers
     who declined. Offer timeouts and re-searches are durable jobs (`offer.expire`, `dispatch.research`, since 28 Sep
     2026), so they survive an API restart. A sweep every 15 s still re-queues or ends SEARCHING trips with no open
     offer, pending batch or scheduled re-search (safety net). The offer key outlives the offer timer by 5 s so the
     timeout handler still sees whose offer it was.
- **Trip breadcrumbs and actual distance (28 Sep 2026, like Namma Yatri's location-updates):** every accepted GPS
  fix of a driver with an active trip (live or from a buffered batch) is appended to `trip:pts:<tripId>` with the
  current phase (`realtime/trip-track.service.ts`); fixes with `acc` > 50 m are not recorded, mock ones are counted.
  At completion (before the guarded status move, so it is stored with it; one Redis read) `summarizePath`
  (`trips/trip-path.ts`) sorts the points, drops exact duplicates and jumps faster than 120 km/h from the last kept
  point (after 3 jumps in a row it re-anchors), then sums haversine steps of the ride part. Stored on Trip:
  `actualDistanceM` (null when `distanceCalcFailed`), `approachDistanceM` (drive to the pickup), `pathPolyline` (ride
  path, Douglas–Peucker 10 m, Google-encoded), `gpsPoints` (ride points kept), `gpsMockCount`,
  `distanceCalcFailed` (fewer than 2 ride points, or kept points more than 2 km apart). The Redis keys are deleted
  when the trip completes, is cancelled or goes back to searching. Fares stay the quote. Migration
  `20260928170000_trip_breadcrumbs`. Learned hex-to-hex speeds (`HexStatsService.rebuild`) use `actualDistanceM`
  when it was measured, else the quoted `distanceKm`.
- **Fare sanity flags (28 Sep 2026, `trips/fare-review.ts`):** no fare is ever recomputed; at completion the trip gets
  `needsReview = true` and a line in `reviewNote` (appended to a stuck-trip note) when (a) any mock-location fix was
  seen (`gpsMockCount > 0`), (b) `actualDistanceM` differs from the quoted `distanceKm` by more than
  max(1.2 km, 25 %) (`DISTANCE_DIFF_MIN_M`, `DISTANCE_DIFF_SHARE`, like Namma Yatri's
  `actualRideDistanceDiffThreshold`) **and** the driver marked Arrived outside `arrivalRadiusM` or ended outside
  `dropRadiusM` (the `arrivedFarReason` / `endFarReason` flow), or (c) `distanceCalcFailed`. Thresholds are code
  constants (not admin settings). `PATCH /v1/admin/trips/:id/review {needsReview, note?}` clears (or sets) the flag;
  the note is appended as "Reviewed: …" and the call is in the audit log. `GET /admin/trips` leaves out
  `pathPolyline`.
- **Pickup ETA on quotes (27 Sep 2026):** `POST /v1/fares/quote` adds `pickupEtaMin` to each quote: road ETA of the
  fastest of the 3 nearest free drivers of that vehicle within `maxSearchRadiusKm`, or `null` when nobody is near.
  Body `womenOnly: true` counts women drivers only (Butterfly "only"). P-10 shows "3 min away · Drop 9:24 PM" and a
  Fastest chip from it. Stored trip fares don't carry it.
- **Realtime (`/rt`):** connect with `auth: { token }`; rooms `user:<id>`, `driver:<id>`, `trip:<id>`. Events:
  `trip.offer`, `trip.updated`, `trip.location {tripId, lat, lng, at, hdg}`, `trip.message`, `trip.no_drivers`,
  `safety.check {tripId, kind, eventId, title, message}` (passenger's user room, 6d).
  Drivers stream `driver:location`; clients `trip:join {tripId}` (participants only).
- **Driver GPS uploads (28 Sep 2026):** every fix is `{lat, lng, ts, acc, spd, hdg, mock}`: `ts` = when the phone
  took it (epoch ms), `acc` accuracy m, `spd` m/s, `hdg` degrees, `mock` = Android's `Position.isMocked`. All but
  lat / lng are optional, so old apps sending `{lat, lng}` still work (their `ts` = server time). Four ways in, one
  path (`realtime/location-ingest.service.ts`): socket `driver:location <fix>`, socket `driver:locations {fixes}`
  (acked `{ok, accepted, isLive}`), `POST /v1/drivers/me/location <fix>` (heartbeat, 204) and
  `POST /v1/drivers/me/locations {fixes: [...]}` (≤ 500, 200 `{accepted, isLive}`). DTO `LocationDto` checks types;
  `sanitizeFix` (`drivers/location-fix.ts`) drops bad or (0, 0) coordinates and fixes older than 12 h, clamps `ts` to
  the server clock and ignores out-of-range extras. A batch is sorted by `ts`; only its newest fix may move the
  driver in the index, and only when it is newer than the stored `driver:alive` time (so a late flush never
  overwrites a live position). Live fixes are stamped with the server time; batch fixes with their own `ts`.
  Offline or blocked drivers' uploads are ignored (checked from the `driver:state` cache, not Postgres). The driver app keeps fixes (same 5 s / 20 m rule) in a `FixBuffer`
  (tamiltaxi_data, 500, oldest dropped) while the socket is down, uploads them over HTTP every 30 s instead of the plain
  heartbeat (plain heartbeat when the buffer is empty), and over the socket on reconnect; a failed upload puts them
  back. The buffer is cleared on going offline without a job.
- **Fares:** same engine as the apps. Distance: measured demo routes, then Google Routes distance (the shortest of the
  default and alternative routes, cached), then
  haversine × 1.3; duration uses 18 km/h so prices stay predictable. **Travel time for display:** fare routes are
  `TRAFFIC_AWARE` (no extra cost: the stopovers already bill Pro), and quotes carry `travelMin` (Google's minutes,
  `maps:tt:*` 15 min; null without Google or for the demo routes). `POST /fares/quote`, the trip's stored `fare` and
  `POST /maps/route` (cache only, never a refresh) return it; the apps show `travelMin ?? durationMin` on the route
  chip ("11.4 km · 24 min"), the P-10 "Drop 9:24 PM" and the in-trip ETAs, while the fare breakdown keeps
  "Time charge · 38 min at 18 km/h". Old app builds ignore the field.
- **Payments:** the app is free, so nothing is charged (6a). Plan payments, if plans are switched back on, are
  simulated (`Payment` rows with `providerRef sim_*`); plug Razorpay Subscriptions / UPI Autopay into
  `SubscriptionsService.purchase`.
- **SMS:** OTP delivery is a stub (`OtpService.deliver`); plug MSG91 / Twilio there.

---

## 6a. Free app and contributions

Tamil Taxi is free for drivers and riders: **0% commission and no subscription** (owner decision, 26 Sep 2026). The owner
pays the running costs; drivers and riders can contribute by UPI.

- **Plans are off, not deleted.** `driverPlansEnabled` (setting, default `false`):
  - API: `SubscriptionsService.canGoOnline` returns true, so going online never checks a plan. New drivers still get a
    trial row at sign-up (harmless; ready if plans come back).
  - Driver app: no Plan tab (`DriverShell` hides branch 2), D-07 goes straight to Home after approval (skips D-11 /
    D-12), Home has no plan strip / grace / expired / paused states, D-05 shows what each vehicle carries ("3 passengers",
    "Up to 1.5 tonnes", model hint, "+ Parcels" on bikes and scooties) instead of a price.
  - Switching it on in Admin › Settings brings every plan screen and the go-online check back.
- **Where the apps say it** (owner, 3 Oct 2026: not on every screen). The trip-end payment screens, to remind riders
  and drivers why to come back: P-19 ride completed and PP-10 parcel delivered ("Karthik keeps the full ₹66. Tamil
  Taxi takes 0%."), D-19 Collect payment ("You keep 100% of this fare"). Plus the places that explain the app:
  onboarding (P-02b, D-02), About, Contribute, the legal text, and the driver's Earnings total
  ("Commission saved"). Not on Home, parcel home, fare breakdowns (no "Tamil Taxi commission ₹0" line), trip
  details, the driver splash or the empty / UPI screens.
- **Public config:** `GET /v1/app-config` (no auth) →
  `{ driverPlansEnabled, supportPhone, contribute: { upiId, payeeName, note, monthlyCost: { totalInr, items: [{label, amountInr}] } | null } }`.
  `items` are the non-zero parts in a fixed order (Servers & database, Maps, SMS (OTP), Other); `monthlyCost` is null
  while all four are 0. Apps: `appConfigProvider` / `driverPlansEnabledProvider` in `tamiltaxi_data` (`src/api/app_config.dart`;
  mock mode uses `AppConfig.demo`, an unreachable API falls back to `AppConfig.fallback`, plans off).
- **Contribute page:** Account › Contribute in both apps (`/account/contribute`), body `ContributeView` in `tamiltaxi_ui`:
  message, "App running & infrastructure" monthly total with its breakdown, amount chips (₹20 / 50 / 100 / 200 /
  Other), "Contribute ₹X with UPI" (opens `upi://pay?pa=…&pn=…&am=…&cu=INR&tn=…` in the phone's UPI app), and a QR code
  without an amount. No UPI ID set → "Contributions open soon". Nothing is tracked: payments go straight to the UPI ID.
- **Admin:** Settings › Contribute (UPI ID, payee name, message, the four monthly costs) and Settings › Driver plans
  (the switch). Update the costs each month from the AWS, Google Cloud billing and SMS invoices.
- **UPI tip:** many UPI apps block or warn on `upi://pay` links with an amount to a personal UPI ID. A free merchant
  UPI ID (PhonePe Business, Google Pay for Business, Paytm Business) makes the button work reliably; the QR code works
  with either.

---

## 6c. Identity verification (Didit)

Free tier: **500 sessions a month** (ID scan + passive liveness + face match + device/IP), then $0.33. Sandbox
sessions are free. No credits are loaded, so session 501 is refused and the apps say "Verification is busy right now";
nothing is ever billed. Docs: https://docs.didit.me (API: `/v3/session/`, webhooks: HMAC `X-Signature-V2`).

- **Who:** drivers **must** pass (driving licence **and** Aadhaar + selfie in one session; replaces the licence,
  Aadhaar and police-verification uploads, and the simulated sign-up selfie). Two ID scans per driver, so the free
  tier covers ~250 drivers a month. A driver session approved without a driving licence is moved to IN_REVIEW
  ("Driving licence not scanned"). Riders may verify (any Indian ID) for a **Verified** badge; never required
  to book.
- **Flow (in the app, no browser):** app → `POST /v1/kyc/session` → API creates a Didit session (`vendor_data` = user
  id, `expected_details` = profile name, India, drivers `DL` + `ID`, riders `ID/DL/P`) → returns `{sessionId, sessionToken}` → the app runs
  Didit's native Flutter SDK (`didit_sdk`, `DiditSdk.startVerification(token)`) → on close the app calls
  `POST /v1/kyc/sync` (API reads `GET /v3/session/{id}/decision/`). Didit also posts to
  `POST /v1/kyc/didit/webhook` (public; `X-Timestamp` ≤ 5 min and `X-Signature-V2`, or `X-Signature` over the raw
  body; de-duplicated on `event_id`). `GET /v1/kyc/me` returns `{isEnabled, status, verifiedAt, fullName, documentType,
  documentLast4, documents, reasons}` (`documents` = every scanned ID as `{type, last4}`).
- **Statuses:** Didit → ours: Approved → APPROVED, Declined → DECLINED, In Review → IN_REVIEW (you decide in the Didit
  console; the result arrives by webhook), In Progress / Resubmitted → IN_PROGRESS, Not Started / Expired / Abandoned /
  Kyc Expired → NOT_STARTED (can start again). `User.identityStatus` mirrors the newest session (an approval always
  sticks unless a newer session overturns it).
- **Stored (`IdentityVerification`):** session id, status, document type, **last 4 characters** of each document
  number (`documentLast4` = the licence, `documents` = all; never a full Aadhaar number), name and date of birth as read from the ID, decline reasons. Photos stay with Didit
  (retention set in Didit console › App Settings › Data).
- **Decline reasons (`reasons`):** only Didit warnings with `log_type: error` (the ones that fail a step), per step and
  in plain words (`FIXES` in `kyc/didit.ts`), e.g. "Driving licence: this looks like a photo of a screen. Scan the real
  card…". The apps list every reason in full under the card. Non-blocking warnings (possible duplicate, low light) stay
  in `warnings` for the admin panel only. Declines stored before this are filled in from Didit the first time
  `/kyc/me` is read.
- **Limits:** at most 3 new sessions per user per 24 h (unfinished sessions are reused by Didit), to protect the quota.
- **Driver profile photo (riders see it, like Rapido):** Didit's liveness selfie is auto-captured (dark, unposed),
  so it is only kept as the private reference (`Driver.selfieFile`, saved from `liveness_checks[].reference_image`
  when the driver's identity is approved; `/kyc/me` refetches it if missing). The driver then takes a proper photo on
  D-07 › Profile photo (front camera, light tips) and sees a **"How riders will see you" preview card** with Retake /
  Use this photo; nothing is uploaded before they confirm. `POST /v1/drivers/me/photo` matches it to the selfie with
  Didit Face Match (`POST /v3/face-match/`, $0.05, 500 free a month): exactly one face and a score above 80 → live at
  once (`photoFile`); no face / several faces → 422 (retake); low score or Didit unreachable → `pendingPhotoFile`
  for an admin (driver page › Profile photo › Approve / Reject with a reason; pushes to the driver).
  `GET /v1/drivers/:id/photo` (and `/drivers/me/photo`) serves it only to the driver, admins and riders who had a
  trip with them (else 404); the apps load it with the session token (`driverPhotoProvider`, `DriverAvatar`), with
  `?v=<file>` as cache key. Passengers see it on every driver card (P-13/15/16, chat, rate, trip details, parcel
  screens, driver-cancelled). **Going online needs a photo** once Didit is on (`403 PHOTO_REQUIRED`).
- **Driver approval (`kyc/driver-approval.ts`):** APPROVED when VEHICLE_RC + INSURANCE are verified by an admin **and**
  identity is APPROVED (identity isn't required when `DIDIT_API_KEY` is empty). A rejected document or declined
  identity → REJECTED; a re-upload → PENDING. ON_HOLD is never changed automatically; drivers approved before this
  change stay approved. New drivers only get RC + insurance rows; the old document types stay in the enum and are
  hidden from the apps and the admin queue.
- **Looking after one person (1 Oct 2026, `admin/admin-people.service.ts`):** `AdminNote` (internal notes keyed by
  user, so a driver's driver and account pages share them; author kept, set null if their account goes; migration
  `20261001110000_admin_notes`): `GET|POST /v1/admin/users/:id/notes {body 2–1000}`, `DELETE /v1/admin/notes/:id`.
  `GET /v1/admin/users/:id/activity?limit=` = the person's audit rows (account, driver profile; a bulk approval writes
  one row per driver it approved, so skipped drivers get none) as readable lines (`admin/activity.ts`, e.g. "Put on hold: Insurance expired", "Vehicle RC verified")
  with the admin who did it. `POST /v1/admin/users/:id/message {title 3–65, body 3–240, app?: DRIVER|PASSENGER|BOTH}`
  pushes on the `account` channel (`type: admin_message`) and returns `{devices}` (0 = no phone registered, nothing
  sent). `PATCH /v1/admin/drivers/:id/profile` fixes vehicle kind (offline only, else 409), work type, model, colour,
  plate (unique, 409) and UPI ID; `POST /v1/admin/drivers/:id/offline` takes an online driver offline (409 when
  offline). `PATCH /v1/admin/users/:id` also takes `email` (null clears). The photo review route is audit logged too.
- **Manual approval (1 Oct 2026):** setting `driverAutoApprove` (default on). Off: a driver who passes every check
  stays PENDING ("Ready to approve") until an admin approves them; rejections still reject at once.
  `approvalChecklist()` in the same file gives each step's state (DONE / REVIEW / TODO / FAILED) for RC, insurance and
  (with Didit) IDENTITY. `GET /v1/admin/approvals?stage=ready|documents|identity|driver|photos&q=&page=` lists one
  bucket (pending drivers sit in exactly one of the first four; photos = any driver with `pendingPhotoFile`) with
  `counts` per stage, `autoApprove` and `identityRequired`. `POST /v1/admin/drivers/approve {ids}` (≤ 50) approves the
  pending, ready ones and returns `{approved, skipped: [{id, reason}]}`. `PATCH /v1/admin/drivers/:id` takes an
  optional `reason` (3–200 chars, kept in the audit log) and pushes the decision to the driver
  (`NotifierService.driverStatus`). `GET /v1/admin/drivers/:id` adds `checklist` and `identityRequired`.
- **Work type (D-04):** bikes and scooties are listed once, under Rides, tagged "+ Parcels" (they get goods-bike parcels
  too, "Parcels too"); Deliveries lists the goods vehicles (3-wheeler, mini truck, pickup, truck). D-05 follows.
- **Driver app, one registration page:** after the OTP a new or unapproved driver only ever sees **D-07
  Registration** (`applicationRoute`: approved → Home, anything else → D-07; the splash, the OTP and a KYC push all
  use it). It has a vehicle card (plate or "Your vehicle", name and phone, vehicle art, a pill: "n to do" / "Under
  review" / "1 error", and a navy band with the next thing to do) and the checklist:
  1. **Vehicle and personal details** → D-04 work type → D-05 vehicle → D-06 details ("Step n of 3"); D-06 creates
     the driver (`SignupController.commit`, `SignupDraft.detailsSaved`) and goes back to D-07. Live, the vehicle
     type is fixed after that, so Edit opens D-06 only. The steps below show locked until this is done (a new
     driver has no account to upload to, and nothing is loaded from the API before it).
  2. "Licence, Aadhaar + selfie" (`IdentityCheckCard`: Verify / Continue / Try again, the decline reasons, and a
     consent line linking Didit's privacy notice), then the profile photo once that is approved (live).
  3. RC and insurance uploads, each on its own card outlined by status (green verified, amber under review, red
     rejected, with the admin's reason and Re-upload).

  Once everything is in, D-07 shows "All done, under review" with **Check status** and checks quietly every 30 s
  (mock: after `SimTimings.applicationReview`); approval → Home (or D-11 with paid plans on). A **Help** button in
  the header opens `/help` (no approval needed), and **Log out** sits at the end. The old D-10 Under review and
  S-09 KYC rejected screens are gone (D-07 shows both states). The sign-up step bar now spans the full width from
  the left edge (it shrank to its coral part and sat centred). Shared code in `tamiltaxi_data` (`identity/identity.dart`: `IdentityCheck`,
  `IdentityRepository` API + mock, `identityProvider.verify()`, `identitySdkProvider`); mock mode approves at once
  (declines with Demo control "Reject KYC").
- **Passenger app:** Account › Verify identity (`/account/verify-identity`, shown only when the server has Didit set
  up): steps, Verify now / Try again, the consent line; a green verified tick next to the name on Account.
- **Badge for drivers:** ride offers carry `passenger.isVerified` and trips carry `passenger.identityStatus`; the D-15
  request card shows a verified tick next to the rider's name (`RideRequest.isCustomerVerified`).
- **Android:** `didit_sdk` 4.9 with `diditSdkAndroidVariant=autodetection` in `android/gradle.properties` (auto
  capture, no NFC, smaller APK). The SDK asks for the camera itself and runs in its own activity; there is no `ios/`
  folder yet (it would need the camera / microphone / photo-library usage strings and iOS 13+).
- **Admin panel:** driver page has an "Identity check (Didit)" card (status, name and date of birth on the ID, each
  document with its last 4 digits, the Didit session id and status, warnings); KYC progress counts RC + insurance +
  identity ("x of 3"); the KYC queue shows each driver's identity status; the user page shows "Identity (Didit)".
  Decide "In review" sessions in the Didit console; the webhook updates Tamil Taxi.
- **Didit console setup:** see "Didit console checklist" below.

**Live setup (27 Sep 2026, created through the Workflows / Webhooks API with the application key):**

| Item | Value |
|---|---|
| Tamil Taxi Driver KYC | `ab3accee-c90c-45ed-9672-999fa5a131c5`: ID step 1 India `DL` (all 43 state subtypes, strict expiry) → ID step 2 India `ID` subtype `ID_CARD_GENERIC` (Aadhaar) → passive liveness → face match → device & IP; $0.48 max (two ID scans), camera only (no uploads) |
| Tamil Taxi Rider KYC | `c9896ca8-93eb-44c4-9565-9c256d36b71a`: India `ID` (generic ID card, voter card, e-Shram, certificate of identity) + `DL` + `P` → passive liveness → face match → device & IP; $0.33 max |
| Both | min age 18 in India (decline), missing expiry date → no action (Aadhaar / PAN have none), duplicate user / possible duplicate face → review, 3 retries per 7 days |
| Webhook destination | `4b257c85-f81c-45b8-978f-70c01505df01` → `https://api.65-0-233-253.sslip.io/v1/kyc/didit/webhook`, v3, `status.updated` + `data.updated` |

Didit's India catalog has no Aadhaar- or PAN-specific subtype: both are read as `ID_CARD_GENERIC`. The API also
accepts unknown subtype names without error, so use only catalog names (read them from an existing workflow's
`documents_allowed.IND`).

**Didit console checklist** (business.didit.me):
1. Workflows › Create › **Advanced** (graph) from the KYC template → "Tamil Taxi Driver KYC": ID Verification #1 (India,
   Driving Licence only, decline expired) → ID Verification #2 (India, Aadhaar only) → Passive Liveness → Face Match →
   Device & IP Analysis → Approved; everything else off (AML, NFC, active liveness, phone, email, proof of address,
   database validation cost extra). Publish → `DIDIT_DRIVER_WORKFLOW_ID`.
2. Same for "Tamil Taxi Rider KYC" with India: Aadhaar, PAN, Voter ID, Driving Licence, Passport → `DIDIT_RIDER_WORKFLOW_ID`.
3. API & Webhooks: API key → `DIDIT_API_KEY`; add destination `https://<api host>/v1/kyc/didit/webhook`, events
   `status.updated` + `data.updated`, version v3; secret → `DIDIT_WEBHOOK_SECRET`. Test with "Try Webhook".
4. App Settings › Data: retention 24 months.

---

## 6d. Rider safety (apps/api/src/modules/safety)

Everything here is free: FCM pushes, sockets and the phone's own share / SMS / call apps. No paid SMS or IVR.

**Live trip share link (28 Sep 2026).** `POST /v1/trips/:id/share` (the trip's passenger) returns
`{url, token, expiresAt}`. The token is `<tripId>.<exp base36>.<sig>`: HMAC-SHA256 with a key derived from
`JWT_SECRET` (`share-token.ts`, no table). It works until 30 min after the trip ends (completed, delivered,
cancelled); a link made while the trip runs carries a 12 h cap, and the read also checks the trip's end, so it stops
30 min after the end either way. `GET /v1/share/:token` is public (no JWT) and rate limited in Redis
(`rl:share:ip:<ip>` 60/min, `rl:share:tok:<tripId>` 240/min; the IP is the first `X-Forwarded-For` entry). It returns
only: status, kind, driver first name, vehicle kind / model / colour, plate, the driver's last GPS fix (only while the
trip runs), pickup and drop (name + point), a straight-line ETA (free, no Google call) to the pickup or the drop, and
`expiresAt`. No phone numbers, no OTP. Bad token → 404, expired → 410.

The link opens the public page `/track/<token>` in the admin app (6b), outside the signed-in panel.

**SOS (28 Sep 2026, like Namma Yatri's Safety `Sos`).** `POST /v1/trips/:id/sos {lat?, lng?, note?}`, allowed for
the trip's passenger or driver while it runs and up to 6 h after it ended. It writes an `Sos` row (tripId, userId,
role PASSENGER|DRIVER, lat/lng = the phone's fix, else the driver's last GPS fix while the trip runs; status
OPEN → ACKNOWLEDGED → RESOLVED | FALSE_ALARM; source BUTTON | CHECK | ARRIVAL; note; acknowledged / resolved at + by)
and a `SafetyEvent` SOS_LINKED on the trip, pushes every ADMIN user's phones (urgent, channel `safety`; setting
`sosAdminAlert`, default on; the admin web panel has no realtime channel, so its SOS page polls every 10 s) and
answers `{sos, shareUrl, shareExpiresAt}` (the live link above, for the SMS to contacts). A repeat by the same person
within 2 min returns the same SOS (double taps).

Admin API: `GET /v1/admin/sos?status=OPEN|ACKNOWLEDGED|RESOLVED|FALSE_ALARM|active&page&pageSize` (open first, then
newest; `open` = open count), `POST /v1/admin/sos/:id/ack` (only while OPEN, else 409), `POST /v1/admin/sos/:id/resolve
{status: RESOLVED|FALSE_ALARM, note?}` (409 once closed). Both are written to `AuditLog` (entity `sos`). The admin trip
(`GET /v1/admin/trips/:id`) includes `sos` and `safetyEvents`.

Admin panel: **SOS** page (`/safety`, Operations; red badge = open count): open rows highlighted, who (and the other
side's phone), trip, a map link, Acknowledge / Resolve (note required) / False alarm, auto-refresh every 10 s. The trip
page has a Safety card (SOS + events) and a red banner while an SOS is open.

Apps: passenger P-17 raises the SOS on opening (during a trip) and shows whether the safety team was alerted; if the
call fails it says so (Try again) and the phone's own options stay: Call 112 and "Text my location" (the SMS carries
the live link, else a maps link). Driver D-18b (the SOS button on the in-trip screen) calls the same endpoint with the
GPS position; if it fails, or there is no job, it falls back to a "Safety concern" support ticket.

**Stop detection during a ride (28 Sep 2026, like Namma Yatri's StopDetection).** Runs on every driver GPS fix of a
trip that is IN_PROGRESS / PICKED_UP, without a database read: at start `SafetyMonitorService.rideStarted` writes
the Redis hash `trip:safety:<id>` (passenger, kind, pickup, drop; 12 h TTL, deleted with the trip's jobs) and
`LocationIngestService` passes each upload (socket, heartbeat, buffered batch) to `onFixes`. `stepStop`
(`stop-detector.ts`) keeps an anchor (`aLat`, `aLng`, `aT` in the hash): a fix more than `stopRadiusM` (30) away moves
it; staying within it for `stopMinutes` (4) with the anchor more than 300 m (constant) from both pickup and drop is a
stop. Deduped by `SET NX` on `trip:safety:stop:<id>` for `stopDedupeMin` (10) minutes. A stop writes a `SafetyEvent`
STOP `{lat, lng, since, minutes, pushed}` and, for rides, pushes the passenger "Is everything OK?" (`type: safety`,
`kind: STOP`, `eventId`) and emits `safety.check` to their socket room. Parcels get the event only.

The answer: `POST /v1/trips/:id/safety-check {answer: OK|HELP, eventId?, lat?, lng?}` (the trip's passenger). It is
stored on the event (`answer`, `answeredAt`); HELP raises an SOS (source CHECK) and returns it. Passenger app: the
socket event or a tapped push opens the I'm OK / Get help sheet (`SafetyCheckSheet`, once per check, over any
screen; a tapped push reopens the ride first); Get help then opens P-17.

**Route deviation and night checks (28 Sep 2026, like Namma Yatri's `checkForDeviation`).** At booking the trip
**Pickup landmark:** the passenger app sends the reverse-geocoded pickup's landmark as `pickupLandmark` (optional,
≤ 120 chars) with `POST /trips`; it is stored on `Trip.pickupLandmark` (migration `20260928233000_trip_pickup_landmark`)
and the driver app shows it on the request card ("Near KG Hospital · 0.8 km away · 3 min") and D-16's pickup card.
The app only sends it when the server returned one (the API rejects unknown fields, so deploy the API first).
P-09 shows it under the pinned address and P-08 next to the pickup.

stores `Trip.routePolyline`: the encoded road route the fare quote already fetched from Google Routes, read with
`MapsService.cachedRoute` (Redis only, **never an extra Google call**; the same cache also serves P-10's
`/maps/route`). It is null without a Google key, for the measured demo routes and on a cache miss; then the trip has
no deviation check (stop detection and the night checks still run). At start the route goes into the ride hash; each
fix is measured to the route's segments (`distanceToPathM`, flat projection) and 3 fixes in a row
(`DEVIATION_FIXES`) more than `deviationM` (150; NY uses 50 m with road snapping, Coimbatore roads and phone GPS
need more) off is a deviation: a `SafetyEvent` DEVIATION `{lat, lng, offM, night, pushed}`, at most once per 10 min
(`trip:safety:dev:<id>`). The night window is IST `nightStartHour`–`nightEndHour` (22–5, wraps past midnight;
`night-window.ts`). At night a deviation more than 1 km off (constant) also pushes the passenger "Your driver
changed route. Is everything OK?" (same sheet, `kind: DEVIATION`), at most once per 10 min
(`trip:safety:devpush:<id>`). A night ride start records NIGHT_CHECK `{check: NIGHT_START}` and pushes "Share your
trip with a friend?" (the app opens the share sheet) unless the passenger has Auto-share on (the app already offers
it). Admin trip page: the GPS path map draws the quoted route dashed under the recorded path.

**Post-ride check (28 Sep 2026, like Namma Yatri's PostRideSafetyNotification).** When a ride that started or ended
in the night window is completed, the durable job `safety.arrival-check` (JobsService, keyed by the trip) runs
`SAFE_ARRIVAL_DELAY_MIN` (5) minutes later: it records NIGHT_CHECK `{check: SAFE_ARRIVAL, pushed}` and pushes the
passenger "Did you reach safely?" (`kind: SAFE_ARRIVAL`). The app opens the same sheet ("Yes, I'm safe" / "No, I need
help"); "No" is `POST /trips/:id/safety-check {answer: HELP, eventId}` → an SOS with source ARRIVAL, so admins are
pushed and it tops the SOS page (SOS is allowed up to 6 h after the trip). Parcels and daytime rides get no check.

Passenger app: P-18 "Share trip" shares the API link (WhatsApp, SMS, copy, the system share sheet). Until it has
loaded, or if it can't be made, it falls back to a Google Maps link to the vehicle. With **Auto-share trips** on
(Account › Safety, `User.autoShareTrips`), P-16 opens the share sheet once when the ride starts.

## 6b. Admin panel (apps/admin)

- **Stack:** Next.js 16 App Router (`src/`), React 19 Server Components, shadcn/ui + Tailwind v4, Recharts, Google Maps
  JavaScript API (`@vis.gl/react-google-maps`) + h3-js. Brand tokens mapped onto the shadcn CSS variables in `src/app/globals.css` (primary coral-600 `#D84315`,
  foreground navy-900, muted navy-500, border `#E2E8F0`, background `#F8FAFC`, 12 px card radius); Poppins (headings)
  and Inter (body) via `next/font`. Light theme only.
- **Auth:** `/login` → phone (+91) → `POST /auth/otp` → 6-digit OTP (InputOTP) → `POST /auth/verify`; accepted only when
  `user.role === 'ADMIN'` (else "This number is not an admin"). The JWT is stored by a Server Action in the httpOnly,
  `SameSite=lax` cookie `tt_admin_token` (cookie life = JWT expiry) and is never readable from client JS.
  `src/proxy.ts` (Next 16 proxy, formerly middleware) redirects to `/login` when there is no unexpired ADMIN token;
  any API 401 clears the cookies (`/auth/signout`) and returns to `/login?expired=1`. Logout is in the user menu.
  Dev login: **9000000001**, any OTP except 000000.
- **Data access:** only from the server. `src/lib/api.ts` (server-only typed client, `API_URL` + Bearer token from the
  cookie, `cache: 'no-store'`), types in `src/lib/types.ts`. Mutations are Server Actions in
  `src/app/(panel)/actions.ts` (validate, call the API, `revalidatePath`, toast). Route handlers (all check the admin
  cookie): `/api/live` (live-map polling), `/api/heatmap` (heatmap filters), `/api/places` + `/api/places/[id]` (map
  search over the API's Places Autocomplete with the server key and Redis cache: no client Places billing),
  `/api/demand` (live demand snapshot, `?refresh=true` recomputes), `/export/{trips|drivers|payments}` (streams the CSV
  exports), `/auth/signout`.
- **Public live trip page (28 Sep 2026):** `/track/[token]` (outside the `(panel)` group; `proxy.ts` skips `track/`)
  shows a shared trip on the Google map (pickup green, drop navy, vehicle coral) with status, driver first name,
  vehicle, plate, ETA and how fresh the fix is. Server-rendered with the first read, then the browser polls the
  public route handler `/api/track/[token]` every 5 s while the trip runs (it forwards `X-Forwarded-For` so the API
  rate limits each viewer). Mapping in `src/lib/track.ts` (unit-tested). Ended / expired → "This trip has ended".
- **Sidebar (1 Oct 2026, `src/components/layout/nav.ts`):** collections Overview (Dashboard, Live map, Heatmap),
  Drivers (All drivers, Approvals, Documents = KYC), Riders (All riders = `/passengers`, All accounts = `/users`),
  Trips (All trips, SOS alerts, Support), Money (Cancellation fees, Driver plans, Plan payments; "Off" tag while
  `driverPlansEnabled` is off), Platform (Cities & zones, Announcements, Settings), System (Audit log, Travel speeds).
  Groups collapse (remembered per browser in `localStorage`, the open page's group always stays open); a collapsed
  group shows its count badges in the header. The active item is the longest matching href (`activeNav`).
- **Dashboard (1 Oct 2026):** "Needs attention" first: only the non-zero counts, each linking to its queue (SOS open,
  ready to approve, documents, photos, identity in Didit from `GET /admin/approvals` counts; trips to review; open
  tickets), else "All caught up". Then **Today** (trips, active, fares, online, surging) and **People & places**
  (drivers by status, riders, blocked accounts, cities; plan revenue only while plans are on, else "Driver plans
  Off"), the live map, hotspots, the 7-day chart and "Waiting for approval" (ready drivers, else uploads to review,
  with their checks). Every extra count is optional: a failing call hides it instead of breaking the page.
- **Global search (1 Oct 2026):** the top bar opens a palette (`src/components/layout/command-palette.tsx`; Ctrl+K /
  ⌘K or "/" anywhere): "Search <open list> for …" (All drivers when the page has no list), pages by name or group,
  then up to 5 drivers (name, phone ignoring spaces and +91, plate), accounts without a driver profile and trips (the
  `#E0TVH8TX` short id, a full id, pickup or drop) from `GET /v1/admin/search?q=` (≥ 2 chars) through the
  `/api/search` route handler. Arrow keys + Enter, results debounced 200 ms. Items built in `lib/palette.ts`.
- **One person, two pages (1 Oct 2026, `src/components/people/`):** a driver's `/drivers/[id]` and `/users/[id]`
  are linked by tabs (Driver profile / Account & rides as rider) and share the same **More** menu (Edit details: name,
  email and, for drivers, vehicle (offline only), work type, model, colour, plate, UPI ID; Send a push (driver app,
  rider app or both; "Not sent" when no phone is registered); Take offline (online drivers); Block / Unblock with a
  reason) and the same **Notes** + **History** cards at the bottom. Account pages go back to All riders for riders, All
  accounts otherwise. Approvals › Waiting on driver has **Remind** (a push prefilled with what is missing).
- **List views (1 Oct 2026):** All drivers: status tabs with counts (`counts` in `GET /admin/drivers`, the other
  filters applied), filters vehicle / online / gender (women drivers), sort newest / oldest / best rated / most trips /
  name, rating + trips column, Woman / Blocked / Paused tags, the Plan column only while plans are on. All riders:
  blocked / prefers women drivers / verified filters, sort by trips or name, Verified / Blocked tags. All trips: dates
  (today IST, 7 / 30 days → `from`), vehicle, sort by fare; rider and driver names link to their pages. Documents:
  search. Every list: 20 / 50 / 100 rows (`?pageSize`, kept in page links). API (`admin/list-filters.ts`,
  `ListQueryDto`): `sort`, `vehicle`, `online`, `gender`, `women`, `verified`, `from`, `to`; phone searches match the
  digits ("+91 98765 43210" finds +919876543210), plates typed without spaces match ("tn38ab" → "TN 38 AB");
  list rows select only what the tables show (drivers: no UPI id; trips: names and phones). Migration
  `20261001100000_admin_list_indexes`: Trip (createdAt), (status, createdAt) replacing (status); User (role,
  createdAt); Driver (status, createdAt), (createdAt); KycDocument (status, updatedAt).
- **Pages (older notes, same pages):** Overview: Dashboard (KPIs from `/admin/stats`, KYC queue, cities, blocked users, 7-day trips
  chart, pending KYC list, "Surging now" count → Live, Hotspots = top 5 pickup hexes named by reverse geocode (cached a
  day), mini live map), Live (online drivers by vehicle colour, busy = coral ring, names on hover, active trips,
  optional city hex overlay and demand heat; polls every 10 s; plus the **Demand vs supply** layer below), Heatmap
  (below). Operations: Trips (+ detail: route, fare breakdown, timeline, parcel,
  tickets; OTP hidden), Drivers (+ detail: profile, vehicle, UPI, KYC verify/reject with reason, approve (asks first
  when checks are missing) / hold (optional reason) / reject (reason) / reactivate, approval checklist card,
  subscriptions, payments, recent trips), Approvals (`/drivers/approvals`: tabs Ready to approve, Documents to review
  with inline Verify / Reject, Identity in review → Didit console, Waiting on driver with what is missing, Photos to
  review; select ready drivers → Approve N; Auto-approve switch; sidebar badge = ready + photos), KYC queue (tabs by status, badge count in the sidebar),
  Passengers, Users (role tabs, blocked filter; detail: role change, block with reason / unblock, contacts, saved places,
  trips, tickets), Support (status changes). Configuration: Zones (`/cities`: list, add city with map picker;
  `/cities/[id]`: service-area painter with paint / erase / circle fill / clear / undo-redo and faint viewport hexes,
  zones editor painted on the map with outside-area warning, per-city fares with preview calculator, city settings and
  delete), Plans (price + active per vehicle × period), Settings (pricing, dispatch, driver plans switch, contribute page,
  support phone),
  Announcements. Finance: Payments, Cancellation fees (report of fees owed and collected, 6). System: Audit log (expandable JSON). Every page has `loading.tsx` skeletons,
  `error.tsx` (retry) and empty states.
- **Maps (Google Maps JavaScript API):** `src/components/map/google/tamiltaxi-map.tsx` wraps `APIProvider` (`language=en`,
  `region=IN`) + `Map` with a light JSON style (land `#EEF0F3`, white roads, water `#D5E5F1`, parks `#DDEBD8`, POIs,
  transit and local-road labels off, navy-500 labels with a white halo; neighbourhood names only at zoom ≥ 14) and a
  Map / Satellite (hybrid) toggle. No Map ID (JSON styles can't be combined with one), so markers are `Data` points /
  symbols, not AdvancedMarker. Hexagons are GeoJSON features (from `cellToBoundary`, [lng, lat]) on one
  `google.maps.Data` layer per layer, diffed so painting touches only changed cells. If the key is missing or Google
  calls `gm_authFailure` (e.g. **Maps JavaScript API not enabled**), the map area shows "Enable the Maps JavaScript API
  for this key in Google Cloud → APIs & Services → Library". Google adds local-script (Tamil/Malayalam) names on India
  tiles for every language/region combination tried, so clutter is reduced in the style instead.
- **Zones editor (`/cities/[id]`, Service area and Zones tabs; `src/components/map/editor/`):**
  - Find: search box on the map (debounced 300 ms, ≥ 3 characters, one session token per search, then details) → flies
    to zoom 15 with a marker; "Add area around here" / "Remove" fills a circle of the chosen radius there.
  - Tools: Paint / Erase with a 1, 7, 19 or 37-hex brush (k-rings 0–3), click-drag painting with pointer events (mouse,
    touch, pen; map panning is off while painting, the wheel still zooms) and a hover preview outlining exactly the
    hexes that will change (coral = add, red = erase) with a +n / −n count. Draw area: click points, double-click or
    click the first point to close, then "Add to" / "Remove from" (h3 `polygonToCells` at the city resolution;
    estimated first and refused above 20,000 hexes). Circle: click a centre, pick a radius. Undo / redo for every stroke.
  - Layers: Service area / Zones / zone labels / hex grid (outlines only, zoom ≥ 13, viewport only) / demand heat
    (pickups, drops, unmet, fares; last 30 days, drawn under the other layers). Fit to service area (outlier-trimmed
    bounds, so a stray hex doesn't zoom out the map), fullscreen, map height = viewport minus header (min 600 px).
  - Zone labels: short pill (name, coloured dot, "1.2×" for surge) at the centre of each zone's largest cluster,
    shown from zoom 13 and skipped when they'd overlap a higher-priority label (active and larger zones first); full
    name, kind and multiplier on hover.
  - Zone cells outside the service area get an amber outline and a "remove outside hexagons" action.
  - Shortcuts (help popover on the map): **P** paint, **E** erase, **D** draw area, **C** circle, **H** or hold
    **Space** pan, **[** / **]** brush size, **Esc** cancel, **Ctrl+Z** / **Ctrl+Shift+Z** undo / redo.
- **Demand vs supply (Live page, on by default):** res-7 hexes from `GET /v1/admin/demand` (recomputed by the API every
  60 s; the page polls every 30 s, "Refresh" forces `?refresh=true`): busy = amber, high = coral / red, normal cells
  hidden; "1.2×" pills on surging cells with the same collision rule as zone labels; hover shows bookings, free drivers,
  ratio and multiplier. Side card "Surging now" lists cells by multiplier with fly-to.
- **Settings (`/settings`):** sticky bar with a "Find a setting" filter (label, hint or key; a matching section name
  keeps the whole section) and one chip per section (jumps there; shows the unsaved edits in it); the save bar sticks
  to the bottom while there are unsaved changes. Renders every key `GET /v1/admin/settings` returns: "Pricing & surge"
  (dynamicSurgeEnabled, surgeSensitivity, demandWindowMin, surgeMinRequests, maxMultiplier, currentMultiplier, with the
  formula and a live example: ratio 3 → 1 + 0.1 × 2 = 1.2×), "Dispatch & ETA" (batchWindowMs, useRoadEta,
  historicalEtaMinTrips, searchRadiusKm, maxSearchRadiusKm, searchExpandSeconds, offerSeconds, maxCandidates, maxReassigns), "Driver
  ranking" (rankEnabled, rankWeightAccept, rankWeightCancel, rankMaxPenalty, rankIdleMaxBoost, rankIdleFullMin, rankMinOffers), "Driver
  approval" (driverAutoApprove), Driver plans, Support, and any new key in
  "Other" (typed from the API value). Only changed keys are sent; values are validated client + server side.
- **Trip page GPS path (28 Sep 2026):** finished trips show driven vs quoted km, km to the pickup, GPS points and mock
  fixes, and draw `pathPolyline` (decoded in `lib/polyline.ts`) with the booked pickup / drop on the Google map. A
  flagged trip has "Mark reviewed" (optional note) → `PATCH /admin/trips/:id/review`.
- **Travel speeds (`/travel-speeds`, System):** `GET /v1/admin/hex-stats?res=9|8|7&hour=&sort=busiest|slowest|fastest&used=true`.
  Tabs for hex size (street res 9 / neighbourhood res 8, default / district res 7, with row counts); filters for IST hour,
  sort and "only pairs used for ETAs". KPIs: **ETA error** (recent 14 days of finished trips replayed through the learned
  speeds: MAPE, ± minutes, bias; in-sample, so an upper bound), **trips with a learned ETA** (coverage), **rush-hour
  slowdown** (8–10 am / 5–8 pm vs rest, time-weighted), rows at this size + "Rebuild now". Speed-by-hour chart over all
  rows at the size (rush hours darker, trips line, whole-day average), a "Where ETAs come from" table (street / neighbourhood /
  district pair, all-day average, fallback: share, ± min, % error), top 50 pairs (place names for every hex via cached reverse
  geocode; "rush", "used", **vs hour avg** %), and a map with two modes: selected pair, or **slow areas** (speed of trips
  leaving each hex on the heat ramp, hour filter applies).
- **Heatmap (`/heatmap`):** H3 choropleth of `GET /v1/admin/heatmap` (metric pickups / drops / unmet demand / fares ₹,
  date presets Today / 7 / 30 days / custom, hour-of-day range with Morning 7–10 and Evening 17–20 presets, ride/parcel,
  vehicle, resolution Street 8 / Area 7 / District 6), colour-blind-safe yellow → coral → deep red ramp at 0.65 opacity,
  legend, hover tooltip (value, share, rank), Top 10 list (fly to), totals and a 3-hour bucket chart. Select hexes (click
  / Shift-click / "Select top 10") → **Create zone** (SURGE or DEMAND, city detected from the cells, converted to the
  city's resolution) or **Add to service area**; unmet demand outside every service area has a dashed amber outline.
  Filter changes are debounced 300 ms.
- **Monorepo:** `apps/admin/turbo.json` extends the root pipeline with the admin's inputs (`src/**`, `test/**`);
  `analyze` = `next typegen && tsc --noEmit && eslint` (generated `src/components/ui/**` is not linted).

---

## 6f. Vehicle tiers (1 Oct 2026)

Ride tiers, in the order the vehicle list shows them (`FARE_RULES` key order = `VehicleKind` order):

| Tier | `VehicleKind` | Seats | base / km / min / min fare | Served by |
|---|---|---|---|---|
| Bike | `BIKE` | 1 | 12 / 5 / 0.15 / 25 | bikes and scooters |
| Scooty | `SCOOTY` | 1 | 14 / 5.5 / 0.2 / 28 | scooters |
| Auto | `AUTO` | 3 | 25 / 9 / 0.3 / 35 | autos |
| Auto Priority | `AUTO_PRIORITY` | 3 | 30 / 11 / 0.35 / 45 | autos, **offered first** |
| Parcel on Auto (goods list) | `AUTO_PARCEL` | 100 kg | 25 / 9 / 0.3 / 40 | autos with Parcels on, goods 3-wheelers |
| Mini | `CAB` | 4 | 48 / 15 / 1.5 / 90 | hatchbacks |
| Sedan | `SEDAN` | 4 | 58 / 18 / 1.8 / 110 | sedans |
| SUV | `SUV` | 6 | 80 / 24 / 2.2 / 150 | SUVs / MUVs |

Demo route (Gandhipuram → Brookefields, 4.2 km): ₹35 / 39 / 66 / 80 / 132 / 158 / 210. Admins can override every
tier per city (City › Fares).

- **`CAB` is "Mini"** (the hatchback); the enum value kept its name so older app builds and stored trips still work.
- **Auto Priority is a booking tier, not a vehicle:** no driver registers with it (`DRIVER_VEHICLE_KINDS`,
  `RegisterDriverDto`, the admin's driver edit). Auto drivers serve it at its higher fare (0% commission: all of it
  is theirs), and in each dispatch batch a priority trip is `PRIORITY_HEAD_START_MIN` (4) ranking minutes ahead, so it
  wins a contested auto over a normal Auto booking (`batch-assign.ts`).
- **Who serves what** (`vehicle-match.ts` `driverKindsFor`): Bike ← bikes + scooters; Goods bike ← goods bikes +
  bikes + scooters (Parcels on); Parcel on Auto ← autos (Parcels on) + goods 3-wheelers; Auto Priority ← autos;
  everything else only its own vehicle (no cab upgrades). An auto on a parcel takes it as `AUTO_PARCEL` (`tripVehicleFor`).
- **Parcel on Auto** (3 Oct 2026, like Rapido's "Parcel on 3-wheeler"): a booking tier in the goods list, up to 100 kg
  inside the auto, nothing on the roof; auto fare rates (per city in City › Fares). Migration
  `20261003140000_auto_parcel`. Not a driver vehicle (`DRIVER_VEHICLE_KINDS`, admin, `isDriverVehicle`).
- **Goods go by weight only** (owner, 3 Oct 2026): "Up to 750 kg" everywhere, no load-bed lengths ("5 ft bed") and
  the truck is just "Truck".
  `asVehicle` keeps the booked tier when the driver can serve it (an auto on Auto Priority, a scooter on a Bike
  ride) even if the rider also added that driver's own tier with "Book any".
- **Migration** `20261001200000_ride_tiers` adds the enum values (`ALTER TYPE … ADD VALUE … AFTER`). Plans exist for
  every kind (`PLAN_PRICES`, paid plans are off). Test drivers: `+919100000801` scooty, `…901` sedan, `…902` SUV.
- **Admin:** labels (Mini, Sedan, SUV, Scooty, Auto Priority), map colours, list filters; driver filters and edits use
  `DRIVER_VEHICLE_KINDS`.
- **Apps:** `VehicleKind` gains `scooty`, `autoPriority`, `sedan`, `suv` (ride tiers stay before `goodsBike`, so
  `isGoods` still works), with `isTwoWheeler` (bike, scooty, goods bike: two-wheeler routes, "Parcels too") and
  `isDriverVehicle`. `Seed.rideVehicles` lists the seven tiers (labels: Mini for `cab`). P-10 shows every tier, D-04
  shows all ride and goods vehicles three to a row, D-05 offers Bike, Scooty, Auto, Mini, Sedan and SUV (never Auto
  Priority); S-01 suggests the two nearest tiers.
- **Vehicle pictures:** `VehicleArt(kind)` (tamiltaxi_ui) draws the 3/4 render from `assets/vehicles/<kind>.webp`
  (`VehicleKindUi.artAsset`); a vehicle without one would show the coral symbol over a ground shadow. Used on P-10 (`VehicleOptionCard.art`), P-11, P-12, PP-01 / PP-06 / PP-07
  (`ParcelVehicleArt`), D-02, D-04, D-05, D-07, D-11 and the design board. Renders exist for every vehicle (pickup and truck since 2 Oct
  2026). The renders are the owner's (`docs/design/vechile/`, kept local: some show real makers' logos);
  `scripts/vehicle_icons/build.py` trims them, paints a plain badge over a real logo and writes 360 px WebPs (~20–35
  KB each). Renders delivered with the transparency checkerboard painted in (pickup, truck: RGB, no alpha) are cut out
  first by `scripts/vehicle_icons/checker_cutout.py` (both checker greys in a window + flood fill from the border;
  per-render `windows` panes are tinted like glass, `holes` are enclosed background such as inside the roll bar).
- **Nearby vehicles on the rider's maps (RedTaxi / Rapido style):** `GET /v1/drivers/nearby?lat&lng[&trip=PARCEL]`
  (signed-in users) → `{vehicles: [{kind, lat, lng, heading}]}`: up to 15 free drivers within 3 km, at most 4 of each
  vehicle so the map shows the mix, nearest first (`nearby-vehicles.ts`). **No driver ids**; positions snapped to a
  0.0005° (~55 m) grid, headings in 15° steps (stored with each GPS fix in `driver:alive` as `lat,lng,at,heading`).
  The passenger app polls it every 15 s while a map shows it (`nearbyVehiclesProvider`, keyed by the pickup rounded
  to ~110 m; the timer stops with the last listener); mock mode places a fixed mix. Home shows every kind; P-10 only
  the vehicles that could take the selected tier (`VehicleKind.servedBy`: bikes + scooters for Bike, autos for Auto
  Priority); P-12 those for the booked tier and any "Book any" additions.
- **Map markers** (`VehicleMarker`) are coloured like the pictures: a white taxi with amber side stripes, a yellow
  auto under a black canopy, a white-and-yellow bike with a yellow helmet, a white truck with a grey box; a thin
  outline keeps the white bodies visible on the light map style.

## 6g. Rentals, outstation and trips booked for later (1 Oct 2026)

`Trip.rideMode` (`LOCAL` default, `RENTAL`, `OUTSTATION`) and `Trip.modeTerms` (what the trip agreed to) for the
**cab tiers** (Mini, Sedan, SUV); `Trip.scheduledAt` + status `SCHEDULED` for trips booked for later; `Trip.searchFrom`
(when the search started) so dispatch widens its radius from the real start, not the booking time. Migration
`20261001210000_ride_modes_scheduled`. Built-in rates in `fares/ride-modes.ts`, no surge; each city can set its own (see 6i).

- **Rental** (a cab by the hour): packages 1 h / 10 km … 12 h / 120 km (`RENTAL_PACKAGES`, `GET /fares/rental-packages`
  with each tier's price). Mini 249 … 2,349, Sedan 289 … 2,699, SUV 379 … 3,499; past the package, extra km ₹12 / 14 /
  18 and extra minutes ₹2 / 2.5 / 3. No drop: the trip's drop is its pickup, and it ends wherever the rider gets off
  (no "near the drop" check). At the end the GPS km (`actualDistanceM`, nothing for km if the path failed) and the
  minutes since start settle `extraKmCharge` / `extraTimeCharge` onto the fare.
- **Outstation** (another town): the drop may be outside the service area (only the pickup must be in it), place
  search with `scope=outstation` drops the service-area restriction. One way: route km (at least 60) × ₹14 / 15 / 19
  + one day's driver allowance (₹300 / 300 / 400), fixed. Round trip (`roundTrip`, `returnAt` ≤ 7 days): 250 km a day
  included (or twice the route if more) × ₹11 / 12 / 16 + allowance per IST calendar day; extra km at the end. Tolls,
  parking and state permits are paid by the rider on the way. `GET /places/outstation-destinations?lat&lng`: where
  outstation trips from around there went most (last 180 days); empty until there are some (no towns built in).
- **Booked for later** (`scheduledAt`, rentals and outstation only, up to 7 days ahead): the trip waits as
  `SCHEDULED` (not "active"; `GET /trips/upcoming` lists them) and the job `trip.scheduled-dispatch` starts its search
  `scheduledDispatchLeadMin` (30) before the pickup time. A driver who accepts early only has to set off in time
  (`setOffAt`: the "not moving" checks and the not-started cap count from pickup time − ETA − 5 min); arriving early,
  the no-show wait and any waiting charge start at the pickup time. Cancelling a scheduled trip is free and drops
  its job.
- Quotes: `POST /fares/quote` with `rideMode` (+ `rentalPackageId`, or `drop`, `roundTrip`, `scheduledAt`,
  `returnAt`) returns the three cab tiers, each with `modeTerms`. Booking takes the same fields. No "Book any" for
  these trips. The driver's offer push says "rental" / "outstation" and the pickup time ("· Tue 6:00 am").
- Long trips: GPS breadcrumbs keep 20,000 points for up to 8 days; the stop / route-change safety checks run on local
  rides only (a rental stops on purpose).

**In the rider app** (`packages/tamiltaxi_data/lib/src/ride_modes.dart` mirrors `ride-modes.ts`; both test the shared
`packages/tamiltaxi_data/test/fixtures/ride_mode_cases.json`, so the apps' mock quotes match the API's):

- Home (P-07) has a "More ways to travel" row: **Rental** (P-34) and **Outstation** (P-35). Upcoming bookings show on
  Home and at the top of Activity (P-21, "UPCOMING", cancel for free); scheduled trips never count as the active ride.
- P-34 Rent a cab: pickup, package chips (with the Mini "from" price), When? (Now / Schedule: at least 30 min ahead,
  up to 7 days), then Mini / Sedan / SUV with the package price and the rates past it.
- P-35 Outstation: One way / Round trip, From → To (P-35b: search any town, `scope=outstation`; "Popular from here"
  from `GET /places/outstation-destinations`, nothing built in), leave and return times, cab list; the map fits the
  road to the town.
- Booking now goes to P-12 like a ride; booking for later goes to P-36 "You're booked" (what happens next, See my
  trips). Ride screens say "Rental · 4 hrs · 40 km" where a drop would be (`RideFlowState.dropTitle`), and the fare
  breakdown lists package / extra km / extra time or one way / round trip / driver's allowance.

**In the driver app:**

- Request cards (D-15c rental, D-15d outstation booked ahead; the background overlay too, `OverlayOffer` carries
  `rideMode`, `modeTerms`, `scheduledAtMs`): a band says "Rental · 4 hrs · 40 km package" or "Outstation · Round trip
  · 2 days" and, booked ahead, "Pickup Tomorrow, 6:00 AM"; the rate is ₹/hr for a rental and ₹/km on the charged /
  included km for outstation; a rental's drop line is "No fixed drop"; the rail shows a timer / route icon. Best ₹/km
  only compares local rides. The read-out says "New rental, 4 hours" / "New outstation trip to Ooty, round trip.
  Pickup tomorrow at 6:00 AM" (Tamil too).
- D-16 shows the pickup time of a trip booked ahead and the mode next to the fare. No waiting timer at the pickup for
  rentals and outstation (no waiting charge there).
- D-18c Rental in progress: time used of the package (from `Trip.startedAt`, `RideRequest.rideStartedAt`), the
  rates past it, no drop or route on the map; rentals and round trips end with "Swipe to end trip" (no drop check).
- D-19c: the collect screen lists the fare lines (package, extra km, extra time / km and allowance) from the
  completed trip's fare, with the trip's terms (`tripFromJson` adds `Trip.modeTerms` to the quote).

## 6h. Goods to another town and house shifting (1 Oct 2026)

In the apps and admin house shifting is called **Packers & Movers** (2 Oct 2026), the name the industry uses; the
code, API fields and enums keep `shifting`.

Built-in rates are in `fares/goods-modes.ts` (each city can set its own, see 6i), mirrored in `packages/tamiltaxi_data/lib/src/goods_modes.dart`; both test
the shared `packages/tamiltaxi_data/test/fixtures/goods_mode_cases.json`. No surge on either. Goods trucks only
(three-wheeler, mini truck, pickup, truck), never the goods bike.

- **Goods to another town**: `POST /fares/quote` with `kind: PARCEL, rideMode: OUTSTATION` returns the four goods
  trucks, one way: route km (at least 40) × ₹22 / 26 / 30 / 45, the driver drives back empty, no allowance
  (`modeTerms` in the outstation shape, `allowancePerDay: 0`). Booking takes the same fields, now or later
  (`scheduledAt`, up to 7 days); only the pickup has to be in the service area. No round trips.
- **House shifting**: `POST /fares/shifting-quote` (`pickup`, `drop`, `shifting`, optional `vehicleKind`, `at` = slot
  start, default tomorrow 9 am IST) → `lines`, `vehicleKind`, `vehicles` (every goods truck's total, the suggested one
  marked) and `days` (the next 7 days' totals, weekends flagged). `shifting`: `homeSize` (`FEW_ITEMS`, `ONE_RK`,
  `ONE_BHK`, `TWO_BHK`, `THREE_BHK`), `between` (to another town), floors and lifts at both ends, `packing`
  (`NONE` / `BASIC` / `FULL`), `dismantlePieces` (≤ 10), `unpack`, `extraHelpers` (≤ 4) and, to book, `items`
  (typed by the rider, no catalogue: name ≤ 60, qty 1–50, note ≤ 120, up to 60 items).
  - Lines: the vehicle (in town: the goods fare on the route at the city's rates, multiplier 1, no waiting charge;
    to another town: by the km as above) + helpers (included by size: 1 / 2 / 2 / 3 / 4, ₹450 each in town, ₹700 to
    another town, plus extras) + stairs (₹150 per floor above the ground at each end without a lift) + packing (basic
    199 / 399 / 699 / 999 / 1,499, full 399 / 799 / 1,299 / 1,899 / 2,699) + taking apart (₹199 a piece) + unpacking
    (149 / 299 / 499 / 699 / 999); Saturday and Sunday (IST) add 10 %. Suggested vehicle by size: three-wheeler,
    mini truck, pickup, truck, truck.
  - Booking: `POST /trips` with `kind: PARCEL`, a goods truck, `scheduledAt` (required, at least an hour ahead, up to
    7 days) and `shifting` with its items. The trip waits `SCHEDULED` (parcels may now be `SCHEDULED` too) and is
    stored with `Trip.shifting` = the details + `lines` (migration `20261001230000_house_shifting`); `rideMode` is
    `OUTSTATION` when `between`, else `LOCAL`. The fare JSON is the vehicle's quote with the shift's `total`. The
    driver's offer push says "Packers & Movers" / "outstation delivery".
- Admin: the trip page shows a Packers & Movers card (home size, floors and lifts, extras, the items as typed, the
  lines) and the mode and booked-for time in the header.

**In the rider app:**

- **Booking flow (3 Oct 2026, measured against Rapido: ~6 taps, ours was ~11):** PP-01 → "Where should it go?" →
  place search → PP-03 drop / receiver → **PP-06** choose vehicle and Book. PP-02 (pickup, sender) and PP-04
  (category, weight, photo) are optional editors that return where they were opened from; no "Step x of 3".
- PP-01 Parcel home: an "In town / To another town" switch (another town: goods trucks only, no goods bike; the drop
  search drops the service-area limit) and a **Packers & Movers** card. The pickup row shows the sender (the rider
  unless PP-02 says otherwise). **Switch** (⇅, in town only) swaps pickup and drop and the sender and receiver
  (`ParcelFlowController.swapStops`); with no drop yet it first asks where the parcel comes from. The vehicle tiles
  are shortcuts: they pre-select the vehicle and open the drop. With no drop yet, the drop row opens the place
  search first and then PP-03 (`openParcelDrop`); PP-03 never starts on a drop the sender didn't pick. That search
  offers **Set on map**: PP-03 opens (`Routes.parcelDropOnMap`) with the sheet pulled down and a new pin on the
  pickup, reverse geocoded at once, to be moved to the drop.
- PP-02 / PP-03 open on a map with a fixed pin (`ParcelPinMap`): moving the map moves the point, reverse
  geocoded when it rests ("Finding the address…" on the pin); a place picked with Change glides the camera there.
  PP-02: a 180 dp map that folds away while the keyboard is up, the form under it. PP-03: the form is a movable
  sheet over the map (`MapBottomSheet`: ~220 dp of map at rest, down to the location card for more map, all the
  way up while the keyboard is up). The map is as tall as the most the sheet ever shows and slides half as far as
  the sheet, so the pin (the map's middle) stays in the middle of the map that shows and pin and map move as one:
  dragging the sheet never changes the chosen point. Once the sheet rests, `ParcelPinMap.visibleHeight` pads the
  Google map equally above and below (the camera centre doesn't move) so its logo sits just above the sheet.
- PP-03: "I'm receiving it myself" (the receiver is the sender: a Receiver card with their name and number, no
  fields; the OTP stays in the app) and "Save this address" as Home / Work / Shop (Shop is an "other" saved place).
- PP-06: the goods bike is the default (live). "What are you sending?" (optional) opens PP-04; until it is saved
  (`detailsSet`) the parcel goes as Other · Under 5 kg. No prohibited-items checkbox: "By booking, you confirm no
  prohibited items · See list" sits above Book (PP-01 also links the list). Each goods vehicle shows its ETA and "Up to N kg"
  (no bed lengths); to another town each shows ₹/km and the
  km charged, with When? (now / schedule); a scheduled delivery goes to P-36 and Activity › Upcoming.
- Packers & Movers, three steps and a review (`lib/features/shifting/`, `state/shifting_flow.dart`):
  - PH-01 Moving details: in town / to another town, old and new home as compact cards: the floor on a strip of
    round lift-panel buttons (G, 1, 2 … 30, scrolling sideways) and, above the ground floor, a Lift | Stairs switch
    with what the stairs cost ("₹300 for 2 floors of stairs" / "No stairs charge"); home size tiles (the suggested vehicle and helpers show under them). Until
    the new home is chosen the price bar shows only "Choose the new home to see the price" (no placeholder).
  - PH-02 Items: no catalogue. Type an item, optional details and how many; or "Paste a list" (one per line,
    "2 chairs", "Cartons x10", "Fridge - single door"; `parseItemList`); tap an item to edit or remove it. Up to 60.
  - PH-03 Day & extras: the next 7 days with each day's price (weekends marked), two-hour slots (at least an hour
    ahead), the vehicle (every truck's total, the suggested one marked), packing (I'll pack / Basic / Full), take
    apart and put back (pieces), unpacking, extra helpers. The price bar opens the lines.
  - PH-04 Review: when, from → to with floors, vehicle and team, the items as typed, the price lines; each part has
    Change (the routes are nested, so Change goes back with the earlier steps in place). Book → P-36 (PH-05).

**Who gets a shift** (2 Oct 2026): only movers. A goods-truck driver (three-wheeler, mini truck, pickup, truck)
switches on **Packers & Movers** in Account › Services and sets **Helpers you bring** (0–8, 2 to start). Stored in
`Driver.bookingPrefs` as `shifting` / `helpers` (`PUT /drivers/me/services/shifting`; a driver of any other vehicle
gets 400); a paused Packers & Movers gets no shifts. Dispatch offers a shift only to drivers who switched it on and bring at least its
`lines.helperCount` (`takesShift`, `shiftHelpersOf` in `drivers/booking-prefs.ts`); a driver with no saved
preferences never gets one. Their other filters (pickup distance, trip length, Go To / Stay In) still apply. Admin
shows it on the driver page (Vehicle & payout › Packers & Movers). Ordinary parcels are unchanged.

**In the driver app:** a shift's request card (D-20c; the overlay carries `shifting` with its lines) has a band
"Packers & Movers · 1 BHK · 2 helpers" with the slot ("Pickup Tomorrow, 9–11 AM"), tags for the item count and
packing, and the floor and lift at each stop; no ₹/km. The read-out says "New packers and movers job, 1 BHK,
bring 2 helpers". D-21c shows the floor at this end, the home and team, and "See 5 items" (the typed list, extras, both
floors); no waiting timer. D-22c lists the shift's price lines. Goods to another town get the outstation band and
₹/km on the charged km.

## 6i. Prices per city (2 Oct 2026)

Every service's price can be set per city in admin › Cities › a city:

- **Fares** tab (existing): per vehicle `base`, `perKm`, `perMin`, `minFare`, waiting ₹/min (`CityFareRule`): every
  ride tier and goods vehicle in town, and the vehicle line of an in-town house shift.
- **Rentals & more** tab: four sections, each Save (the whole section) or Reset (back to the built-in rates), with a
  worked example under it:
  - Rentals: each package's price for Mini / Sedan / SUV (a longer package can't cost less) and ₹/km, ₹/min past it.
  - Outstation (cabs): per tier one way ₹/km, round trip ₹/km, driver allowance ₹/day, one-way minimum km, round-trip
    km a day.
  - Goods to another town: per goods truck ₹/km and minimum km.
  - House shifting: per home size the suggested vehicle, helpers included, basic / full packing and unpacking; helper
    rate in town / to another town, stairs per floor, taking apart per piece, weekend %.

Stored in `CityModePricing` (one row per city; a JSON column per section, null = built-in; migration
`20261002100000_city_mode_pricing`). `fares/pricing.ts` checks a section whole (every tier / vehicle / size, ranges,
whole rupees) and `effectivePricing` puts a city's sections over `DEFAULT_PRICING`; `GeoService` caches them with the
city (30 s, cleared on every admin change). Quotes, bookings and the shifting quote use the pickup's city.
Endpoints: `GET /admin/cities/:id/pricing` (each section with `isDefault`, plus the packages),
`PUT /admin/cities/:id/pricing/:section` (`rental`, `outstation`, `goodsOutstation`, `shifting`; 400 with what's wrong),
`DELETE …/:section` (reset); public `GET /fares/rates?lat&lng` (the city's `pricing` and the packages; built-in without a
point) and `GET /fares/rental-packages?lat&lng`.

The apps read `GET /fares/rates` for the prices they show before quoting (`ModePricing` in
`packages/tamiltaxi_data/lib/src/pricing.dart`, the rider app's `modePricingProvider` keyed on a ~2 km grid): P-07
"from ₹…", P-34 package chips, PH-01 … PH-04 helpers, packing, extras, stairs and weekend %. Mock mode and any failure
use the built-in rates; a booked price is always the server's.

## 6e. Website (apps/web)

- **What:** the public site for `tamiltaxi.co.in` (the domain the apps already use for trip share links). Pages: `/`
  (riders, drivers, why it's free, get the app), `/privacy/`, `/terms/`, `/delete-account/`, plus `sitemap.xml` and
  `robots.txt`. No API calls, no cookies, no analytics.
- **Stack:** Next.js 16 App Router with `output: 'export'`, so `npm run build -w @tamiltaxi/web` writes plain files to
  `apps/web/out/`. `trailingSlash: true` (`/privacy` → `out/privacy/index.html`) so static hosts need no rewrites;
  `images.unoptimized` (the default loader needs a server). Tailwind v4 with the `TtColors` palette in
  `src/app/globals.css`, Poppins + Inter via `next/font`, lucide icons (plus a drawn auto-rickshaw icon). Light only.
- **Content:** links and names in `src/lib/site.ts`; privacy policy, terms and deletion lists in `src/lib/legal.ts`.
  Every privacy claim must match the code (checked against `schema.prisma`, the Android manifests and
  `dispatch.service.ts` on 30 Sep 2026). Screenshots in `public/screens/` are design frames P-10, P-16, D-15 and D-23b
  resized to 560 px WebP with sharp; app icons in `public/brand/` come from `packages/tamiltaxi_ui/assets/brand`.
  Logo: the one-line wordmark (`src/components/logo-paths.ts`, a copy of the admin's generated paths). Favicon
  (`src/app/icon.png`, same in the admin) is the rider launcher icon. Never use the x from the wordmark on its own:
  alone it reads as the X (Twitter) logo.
- **Google Play:** the Play Console needs the privacy policy URL (`https://tamiltaxi.co.in/privacy/`) and an account
  deletion URL (`https://tamiltaxi.co.in/delete-account/`) for both apps. The download buttons say "Coming soon to
  Google Play" until `site.onPlayStore` is set to `true`; then they link to `com.tamiltaxi.passenger` /
  `com.tamiltaxi.driver` (a test checks these match each app's `applicationId`).
- **Hosting:** already hosted separately by the owner; repository pushes trigger automatic deployment.
  EC2 staging serves only the API and admin.

## 7. Maps and location

| Need | Service | Called from | When |
|---|---|---|---|
| Show the map | Maps SDK for Android (free) | apps | always, when key set |
| Admin maps | Maps JavaScript API (Dynamic Maps, billed per map load) | admin panel browser (`NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`) | each page with a map; search goes through the API, not the client Places library |
| Search places | Places Autocomplete (New) + Place Details. `locationRestriction.rectangle` = the active cities' service cells + ~1 km (`GeoService.serviceBounds`, recomputed with the 30 s city cache; while no city has cells there is no restriction and results lean 50 km around the pickup), so nothing outside the area is suggested. `/places/details` also returns `isInServiceArea`, which the app caches like the reverse geocode's answer. P-08 sends the pickup as `lat` / `lng` → Google `origin` → each suggestion's `distanceMeters` → `distanceKm` ("8.7 km" on the row; null without it). Same SKU | API (`/places/autocomplete?q&session[&lat&lng]`, `/places/details`) and app | per search session (session token), ≥ 3 chars, debounced |
| Pin → address | Geocoding API with `extra_computations=ADDRESS_DESCRIPTORS` (same Geocoding SKU): `address_descriptor.landmarks[]` (`display_name.text`, `spatial_relationship`, `straight_line_distance_meters`) → `landmark` = the nearest within 300 m as "Near / Opposite / Beside / Behind / Inside / Around the corner from X" (`DOWN_THE_ROAD` and unknown → Near; `areas[]` unused) | API (`/places/reverse` → `place.landmark`, nullable) and app | when the pin stops moving; cached (landmark included) on an ~11 m grid, `maps:rg3:*` 30 d (rg3: plus-code addresses skipped or trimmed) |
| Route line / distance | Routes API: fare routes ask for alternatives (`computeAlternativeRoutes`, field `routes.routeLabels`) and keep the **shortest** by `distanceMeters`, so the map, the cache and `Trip.routePolyline` show the route that is charged | API (`/maps/route`, fares) and app | once per trip leg; cached on a ~11 m grid |
| Live tracking | Driver GPS over Socket.IO | driver app → API → passenger | every few seconds, **no Google calls** |

**Google billing (India list, per 1,000; free monthly calls in brackets):** Routes Essentials $1.50 (70k), Routes Pro
$3 (35k); Route Matrix bills **per element** at the same tiers. Pro is triggered by `vehicleStopover` / `sideOfRoad` /
`heading` and by `TRAFFIC_AWARE`; Enterprise by `TWO_WHEELER`, tolls or traffic on polylines (none used). What Tamil Taxi sends:

| Call | Fields / options | SKU |
|---|---|---|
| Fare route (`/fares/quote`, booking, `/maps/route`) | `vehicleStopover`, `TRAFFIC_AWARE`, `computeAlternativeRoutes` (shortest kept), mask `routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.routeLabels` | Routes Pro (alternatives and traffic add nothing: Pro already) |
| Travel-minutes refresh (`maps:tt` older than 15 min, route still cached) | same request | Routes Pro, at most once per pair per 15 min |
| Single ETA (offer card, trip ETA) | no stopover, `TRAFFIC_UNAWARE`, mask `routes.distanceMeters,routes.duration` | Routes Essentials |
| Driver ETAs (P-10 vehicle list, dispatch ranking) | `computeRouteMatrix`, `TRAFFIC_UNAWARE`, DRIVE, mask `originIndex,destinationIndex,duration,distanceMeters,condition` | Route Matrix Essentials, per missing cell |
| Reverse geocode | `language=en&extra_computations=ADDRESS_DESCRIPTORS` | Geocoding (address descriptors are not a separate SKU on the SKU page) |
| Autocomplete / Place Details | `locationRestriction`, `origin`; details mask `id,formattedAddress,location` | Autocomplete session + Place Details Essentials |

**Cost rules (do not break):**
1. Never call Directions/Routes on a timer during a trip; ETA comes from the driver's GPS progress along the stored polyline.
2. Use autocomplete session tokens; end each session with one Place Details call.
3. Request only the fields needed (FieldMask) to stay on Essentials SKUs.
4. Cache geocodes and routes in Redis (API) and in memory (apps).
5. At scale (~1,000 rides/day), move to Google Mobility Services (per-trip pricing) or self-hosted OSRM/Valhalla.

Fallbacks: no key or offline → CARTO tiles (flutter_map), curved routes and haversine distances. The live apps never call the public OSRM demo server; mock mode may use it.

Three keys (details and restrictions in `docs/GOOGLE_MAPS_SETUP.md`): key 1 map SDK (Android-restricted), key 2
server (IP-restricted), key 3 app web services (API-restricted only; the apps' `dart:io` calls can't send Android
signature headers, so remove key 3 once the apps call the backend). Debug SHA-1 on the dev machine:
`B5:C9:F1:A3:D4:2E:20:F7:24:2A:F7:94:54:CC:26:36:3B:4D:52:99`.

App-side implementation: `packages/tamiltaxi_data/lib/src/maps/` (config, HTTP helper, Places client, polyline codec),
`RoadRouter` (live: API route → curved line; mock: OSRM → curved line), `packages/tamiltaxi_ui/lib/src/widgets/tt_map_google.dart` (GoogleMap engine,
markers rendered to bitmaps, light style in `tt_map_style.dart`). `TtMap` takes a `TtMapController` and reports
`TtCamera`. Place Details asks for Essentials fields only (`id,formattedAddress,location`); the app keeps the
suggestion's name.

---

## 7a0. Driver demand map (hex + nested hex)

- **API:** public `GET /v1/demand/hotspots` (`DriverMapService`, Redis-cached 60 s, key `drivermap:v3`): up to 30 res-7
  hexes (≈5 km²) ranked by live demand (distinct riders in the demand window ×3) + bookings in the last hour (×2) +
  the usual pickups at this IST hour ±1 over the last 4 weeks (weekly average). Level: `high` (surging, or ≥ 60 % of the
  busiest), `busy` (≥ 30 % or live busy), `some`. Each hotspot carries its outline and its busy res-8 children
  (`nested`, score 0–1 within the hotspot) like H3's hex-in-hex grid; plus `serviceArea` = each city's service cells
  merged into outer rings (`cellsToMultiPolygon`). No rider counts are exposed. Each hotspot also has a `name`: the
  commonest locality among its last 4 weeks of pickups (≤ 3,000 recent trips read; `areaName()` takes the part of the
  stored address before the city / state / PIN, e.g. "Gandhipuram"). No Google calls.
- **Driver app:** `demandMapProvider` (refresh every 2 min while Home shows it, live mode only) → `demand_layer.dart`:
  service-area edge at zoom ≤ 12.8, demand hexes from 10.5 (coral high / amber busy / yellow some), nested hexes from
  13.2 shaded by their share, "High demand" (· surge) labels on the top 4. Hidden during a job. Home's bottom panel (online or offline, no job, GPS OK) leads with the
  **nearest busy area** (`nearestHotspot()`: nearest `high`, else nearest `busy`; `NearestDemandChip`): "HIGH DEMAND
  · 1.2x", the area name, and a directions button with the distance that opens Google Maps ("You're here" within
  1.2 km of its centre).
- **tamiltaxi_ui:** `TtMap.polygons` (`MapPolygon` with fill, stroke, zIndex and a zoom range) on both engines.
- **Hexes only (1 Oct 2026):** no map draws a circle with a radius; areas are hexes, as the service works on H3.
  `TtMap` has no circle zones any more (`MapZone` removed). Live maps draw the API's real H3 outlines; mock mode and
  the Design gallery use look-alikes from `tamiltaxi_data/lib/src/geo/hex_grid.dart` (pointy-top cells with H3's
  average edge per resolution, res 8 children turned 19.1° as in aperture 7): `DemandMap.demo()` (seeded busy
  areas as res-7 hexes + nested res-8, service area as a hex outline) feeds the same `demand_layer.dart` as live.
  S-08 draws the service-area outline from `/demand/hotspots` (live) or the demo outline; S-01 draws the searched
  pickup hex + ring 1; the "location lost" marker is a dashed hexagon. The search radar (`PulseRing`: P-12,
  PP-07, S-02, driver Home online) stays round: it is an animation, not an area
  (`hexagonPath` / `drawDashedHexagon` in `map_markers.dart`). Distance rules (arrival within 250 m, etc.) stay
  GPS distances: they are not drawn.

## 6z. No built-in city

Tamil Taxi grows city by city, so **no code names or locates a city**: every city (name, state, centre, H3 service
cells, zones, fares) is a `City` row added in the admin panel.

- **API:** place search is limited to the active cities' service cells (no fallback rectangle); driver-map area names
  drop the cities' and states' own names (`areaName(address, notAreas)`) read from the database.
- **Apps:** `serviceCitiesProvider` (`GET /cities`, the demo city `Seed.demoCity` in mock mode) gives the names used
  in messages ("Choose a pickup in …", S-08 "We're live in …", via `serviceCitiesLabelProvider`) and the driver's
  sign-up city. `CityDefaults.center` (the first city's centre, all of India until the cities load) is where a map
  starts without a pickup or GPS fix, the search-suggestion placeholder and the client Places bias. A point is in the
  service area when the API said so (reverse geocode or place details); unknown points are checked again by the API
  at booking. S-08 shows the real pin that was outside (route `extra`) and the nearest service city.
- **Admin:** maps start on the first active city (`cityView`), or all of India (`NO_CITY_VIEW`) before any city exists.
- **What still says Coimbatore, on purpose:** seed and demo data (`prisma/seed*.ts`, `Seed`, the mock places and
  their demo route distances), the legal terms' jurisdiction line, and "Made in Coimbatore" (where the app is made,
  not where it runs).

## 7a. Device location in the apps

- **Maps follow position changes:** the Google engine now animates to a new `TtMap.center` (it only read the
  initial camera, so the driver map stayed on the first position); following pauses 15 s after the user pans or
  zooms (only camera moves while a finger is on the map count). Driver offline: last known fix (fused, then
  LocationManager) + a medium-accuracy preview stream (no service, nothing uploaded). Going online uses a position
  under 2 min old instead of waiting for a fresh precise fix (indoors that timed out).
- **Maps re-fit when the screen changes:** `TtMap.fitPoints` was only read on the first build, so a map kept its old
  view when the road route arrived (P-10, PP-06, D-16, D-18), the driver's first GPS fix came in (P-13), or the
  sheet changed the visible area. Both engines now re-fit (Google: animated) when the bounds of `fitPoints`, the
  fit padding, `mapPadding` or the map's size change. An equal list in a new rebuild doesn't move the camera, and
  re-fitting also pauses 15 s after the user pans or zooms.
- **Fits above a sheet (2 Oct 2026):** Android's Google map takes the initial camera before `mapPadding` and keeps
  the view when the padding comes, so a camera aimed at the area above the sheet showed the route in the middle of
  the whole map, behind the sheet (PP-06, P-10, P-12, P-13 and the other trip screens). `_onCreated` places the
  camera again once the map exists. The Google fit also keeps the whole drop pin (40 px, drawn above its point) in
  view when the drop is at the fitted box (`_Mercator.fit` `pin` / `pinHeight`). P-22 fits its route instead of
  guessing a zoom from the distance. `TtMapController.animateTo` glides the Google camera (PP-02 / PP-03 search).
- **Always the real position (live):** both apps read the last known fix at once, then a fresh one. Passenger: the
  pickup and map are the phone's location even outside the service area (banner "Tamil Taxi isn't in your area yet"; the API
  refuses bookings there). Driver: the car marker follows the phone while offline too (nothing uploaded); with no fix
  yet the map shows the city without a made-up car. The Gandhipuram / seed home points are for mock mode only.
- **Permission asked on every visit until given:** on opening Home and whenever the user comes back to the app
  (`AppLifecycleListener.onRestart`, so closing the dialog doesn't re-trigger it). `LocationAccess` (granted,
  serviceOff, denied, deniedForever) drives a banner on Home explaining why location is needed; its button asks again,
  opens location settings (GPS off) or the app's settings page (after "Don't allow" twice).
- **Driver GPS self-heal (S-16 "GPS signal lost"):** online, the banner shows after 30 s without a fix. From 20 s the
  10 s ticker asks for a one-shot fix (only a fresh one counts) and re-subscribes the position stream (at most every
  20 s, only with the app in the foreground: a location service started from the background gets no while-in-use
  access); stream errors / end also trigger it, as does coming back to the app. "Fix now" restarts GPS, or opens
  location settings when Location is off. Before this, going offline and online was the only cure.
- **Driver needs precise location:** with only "Approximate" allowed (Android 12+ toggle) Play services rewrites the
  5 s request to one fix per 10 min (`dumpsys location`: `(COARSE) Request[@10m …]`), so the driver went "GPS signal
  lost" right after going online. `LocationAccess.approximate` shows a Home banner; going online (always, even with a
  recent offline fix) asks again, which shows Android's "Change to precise location" dialog, else points to app settings.
- **Driver permission banner (Home):** besides location, `missingPermissionsProvider` (`lib/state/app_permissions.dart`)
  checks notifications, "Display over other apps" and Android 14+ full-screen notifications on opening Home and on
  every resume. The first missing one shows as a banner (online too) until allowed; "Allow" shows the system prompt
  or the matching settings page. None of these block going online (location does). Camera/photo-library permission is requested when taking KYC/daily-selfie/delivery evidence or choosing a parcel/ticket image.

## 7b. Apps ↔ API (packages/tamiltaxi_data/lib/src/api)

- **Base URL:** `kApiBaseUrl` = `--dart-define=TT_API_URL` (default `http://65.0.233.253:3000/v1`, the AWS staging
  server). `--dart-define=TT_LIVE_API=false` runs the apps on seed data + the trip simulator (widget tests and the
  design gallery always do: they don't apply the overrides).
- **Wiring:** each app's `main()` loads `ApiSession` (token + driver id in SharedPreferences), creates `ApiClient` and runs
  `ProviderScope(overrides: liveApiOverrides(api))`, which swaps every repository provider for its `Api*Repository` and
  sets `isLiveApiProvider`. Screens don't change; flow controllers branch on `isLiveApiProvider`.
- **HTTP:** `ApiClient` (package:http, 20 s timeout). Network errors → `OfflineException` (screens' offline state); API
  errors → `ApiException(status, message)` with the API's user-facing message; 401 clears the session and fires
  `onUnauthorized` (apps go to sign-in).
- **Realtime:** `RealtimeClient` (socket_io_client, websocket, auto-reconnect, re-joins trip rooms). `LiveTrips`
  (passenger: book, status, driver GPS, chat, cancel, rate, restore) and `LiveJobs` (driver: online/offline, offers,
  accept → arrived → start(OTP) → complete, GPS over the socket (`DriverFix`) with a buffered batch / HTTP heartbeat
  fallback, chat, restore).
- **Routes:** `RoadRouter.backend = backendRouter(api)` → `POST /v1/maps/route` (Google on the server, Redis-cached,
  every vehicle as DRIVE), then a local curved-line fallback in live mode. The apps no longer need the app-side Google web-services key
  (key 3) in live mode; places search also goes through the API.
- **Mapping:** `api_mappers.dart` (API enums `GOODS_BIKE` ↔ app `goodsBike`; NO_DRIVERS folds into cancelled; parcel
  details stored as JSON on the trip; the ride OTP doubles as the parcel delivery OTP). Tests: `test/api_mappers_test.dart`.
- **Android:** cleartext HTTP is allowed only for the staging IP (`res/xml/network_security_config.xml`); switch to
  HTTPS and remove it once there's a domain.

## 7c. Push notifications (FCM)

- **Firebase project `tamiltaxi-85a28`** (Spark, free; since 29 Sep 2026, was `rido-93cd3`). Android apps
  `com.tamiltaxi.passenger` and `com.tamiltaxi.driver` share one `google-services.json` (both clients); it is per
  machine and git-ignored (originals and the service-account key in `~/tamiltaxi-secrets/`). Without the file
  the apps build and run without push (the Google Services Gradle plugin is only applied when it exists).
- **API:** `NotificationsModule` (global). `PushService` = firebase-admin (HTTP v1) with the service account from
  `FIREBASE_SERVICE_ACCOUNT_B64` (base64 JSON in the server's `.env`, mode 600; empty = push off, logged). Device
  tokens in `DeviceToken` (token PK, userId, app PASSENGER|DRIVER); `POST /me/devices {token, app}`,
  `DELETE /me/devices/:token`; tokens FCM reports as dead are deleted. Pushes never fail the request: callers use
  `void this.notifier.x(...)` and every `NotifierService` method catches and logs its own errors (DB lookups included,
  28 Sep 2026). `main.ts` also logs any `unhandledRejection` instead of letting Node exit.
- **What is sent (`NotifierService`):**

| Event | To | Channel |
|---|---|---|
| Driver assigned (with OTP), arrived, ride started / parcel picked up, completed / delivered, no drivers | Passenger | `trip_updates` |
| Cancelled by the driver | Passenger | `trip_updates` |
| New request (high priority, TTL = offer seconds, so a late push never shows) | Driver | `ride_requests` |
| Cancelled by the passenger | Driver | `trip_updates` |
| Chat message | The other side | `chat` |
| KYC document rejected (with reason) / all verified ("You're approved!", "Go online to start earning"; mentions plans only when `driverPlansEnabled`) | Driver | `account` |
| Admin status change: approved ("You're approved!"), reactivated, on hold or rejected (with the admin's reason) | Driver | `account` |
| Admin announcement (active, already started) | Topic `all`, `passengers` or `drivers` | `announcements` |
| SOS (button, "Get help", "not reached safely"; urgent; setting `sosAdminAlert`) | Every ADMIN user's phones (both apps) | `safety` |
| "Is everything OK?" after a long stop mid-ride (urgent; also `safety.check` on the socket) | Passenger (rides only) | `safety` |
| "Your driver changed route. Is everything OK?" (night, more than 1 km off the quoted route) and "Share your trip with a friend?" (night ride start, auto-share off) | Passenger (rides only) | `safety` |
| "Did you reach safely?" 5 min after a night ride is completed (job `safety.arrival-check`) | Passenger | `safety` |

- **Apps (`TtPush` in tamiltaxi_data):** Firebase init in `main()` (live mode), Android channels with the same ids,
  notification permission (Android 13+) after sign-in, token registered whenever the session token changes (incl.
  driver sign-up) or FCM rotates it, topics subscribed; sign-out unsubscribes and deletes the token. In the
  background Android shows the notification itself; in the foreground it's shown locally unless the app already shows
  it (passenger: trip updates; driver: requests and trip updates). Taps: passenger trip/chat → reopen the active trip;
  driver request/trip/chat → recover the offer / job; KYC → start route.
- **Test:** install both APKs, sign in, then Admin → Announcements → create one for "All" → it arrives on both phones.

---

## 7c8. Driver booking preferences

- **What:** like Namma Yatri's Booking Preferences. Account › Booking preferences
  (`/account/booking-preferences`, `BookingPreferencesScreen`): read requests aloud + language (phone only, §7c9),
  **Go To / Stay In** (a row that opens the same sheet as Home, saved at once), a **Services** row (below),
  **farthest pickup** (Any, 1–10 km, straight line), **trip length** (longer than / shorter than, 2–50 km). Save → `PUT /drivers/me/booking-preferences` with the stored Go To / Stay In and areas kept. Until 30 Sep
  2026 the go-to place was a "Home" saved on the phone only (`goto_home_lat/lng` in shared_preferences, now unused).
- **Services** (3 Oct 2026, like Rapido's Service Manager, our own design; Account › Services, `ServicesScreen`, D-40):
  the vehicle's main service (rides; parcels for goods vehicles) shows **Always on**; the others switch on and off
  (`servicesFor` / `DriverService.availableFor`): **Parcels** for bikes, scooters (on by default) and autos (off by
  default: Parcel on Auto, up to 100 kg inside), **Rentals** and **Outstation** for cabs, **Goods to another town** and
  **Packers & Movers** (with helpers) for goods trucks. Switching one off opens a pause sheet (D-40b): 30 min, 2 hours,
  4 hours or "Until I switch it on", and an optional reason ("Too far", "Long waits", "Low pay"…).
  `PUT /drivers/me/services/:service` stores `pauses.<service> = {until | null, reason}`; a timed pause ends by itself
  (`readPrefs` drops it), "until" also sets the service off. Dispatch skips drivers whose service is off or paused:
  parcels in `TripDriversService` (`noParcelsAmong`), rentals / outstation by `trip.rideMode` and shifting in
  `fittingPrefs`. Older apps' `parcels` in `PUT /drivers/me/booking-preferences` counts only for two-wheelers.
- **Rate card** (Account › Rate card, `RateCardScreen`, D-41): a tab per service (an auto: Auto, Auto Priority,
  Parcels; a cab: its tier, Rentals, Outstation; a goods truck: Parcels, Another town; a 3-wheeler also Auto parcels):
  base fare, per km, per minute, minimum fare, then waiting at the pickup, peak cap, the rider's extra and the
  cancellation fee while it is on. From `GET /fares/rate-card` at the driver's GPS fix (`rateCardProvider`).
- **Dispatch:** `booking-prefs.ts` `fitsPrefs()` runs on each search's candidates after the declined / paused filter
  (one `driver.findMany` for those with prefs): pickup km ≤ max, trip km within min–max, and while `goTo.until` is in
  the future the drop must be within 3 km of the go-to or leave at most half of the driver's current distance to it.
  The server sets `until` = now + 2 h (resending the same place keeps the running timer). Filters never change fares.
- **Stay In (30 Sep 2026, like Rapido):** `stayIn {lat, lng, name, radiusKm}`: only trips whose pickup **and** drop are
  within `radiusKm` of the place, for 12 h (`STAY_IN_HOURS`; same place and radius resent = timer kept). One of Go To /
  Stay In at a time: both in one save → 400; saving a go-to turns a stored stay-in off.
- **Saved areas:** `areas` (≤ 6 `{name, lat, lng}`, e.g. Home, the stand) for switching Go To / Stay In on with one
  tap; stored on the server so they survive a new phone.
- **Parcels (bike drivers):** `parcels` (default on): goods-bike parcel requests too (see Dispatch in §6).
- **Older apps:** a save without `stayIn`, `parcels` or `areas` keeps the stored ones (the other filters are cleared
  as before when absent).
- **Home:** online with filters on, a "Filters on · pickup ≤ 2 km · trips over 5 km   Edit" row, so fewer requests
  don't look like a broken app. Account shows the same summary.
- **Go To / Stay In on Home (30 Sep 2026, own design; Rapido has the idea):** online, under "You're online",
  `DirectionRow` (`features/home/widgets/direction_panel.dart`) shows two pill buttons **Go To** / **Stay In**, or
  what is on as a tinted strip ("Going to Home · Only trips towards it · till 4:30 PM", green; "Staying in RS Puram ·
  Only trips within 5 km", navy) with **Change** and ✕ (off). The sheet ("Where do you want trips?") has a Go To /
  Stay In switch, the saved areas (distance from the driver, radio pick, bin to remove), **Add area** (search, "Set
  Home to where I am", "Use where I am" → reverse geocode) and for Stay In the radius chips 3 / 5 / 8 / 12 km; "Turn
  on" / "Update" / "Turn off" save at once (`BookingPrefsController.change`, `saveArea`, `removeArea`). Turning one on
  says the other turns off. The request screen (D-15 / D-20) has the same thing as a one-line bar under its title
  (`RequestDirectionBar`, 30 Sep 2026): "Towards Home · till 4:30 PM" (green) / "Inside RS Puram" (navy) with
  **Change**, or "Go To or Stay In" with **Set**; it opens the same sheet, so the driver can change it without leaving
  the requests. A change reaches the next requests; the open ones stay. The sheet closes with the request screen when
  the last request goes, and the bar is locked while an accept is in flight. (It replaced the per-card "Towards Home"
  tag, which repeated on every card.) The background overlay has no bar.
  A bike driver with parcels on sees "Looking for rides and parcels...".
- **Not yet:** a limit on Go To uses per day, and switching Go To off when the driver reaches the place.

## 7c9. Driver request screen (D-15 / D-20)

- **Swipe to accept:** the Accept button is a `SwipeToConfirm` ("Swipe to accept", green), so a stray touch or a
  phone in a pocket never takes a trip; screen readers accept with a double tap (its semantic tap). Decline stays a
  tap. The background bubble / notification path is unchanged.
- **Voice:** `state/request_voice.dart` reads each new request aloud with the phone's TTS (`flutter_tts`):
  "New ride. 250 rupees. Pickup 0.8 kilometres, Gandhipuram. Trip 6.2 kilometres." (or the Tamil sentence). On by
  default; the speaker button on the request header mutes it (`requestVoiceProvider`, saved in shared_preferences:
  `request_voice_enabled`, `request_voice_language`). No Tamil voice on the phone → "New request" in English. Speech
  stops when the card closes. Live mode only. The manifest declares the `TTS_SERVICE` query (Android 11+).
- **Stacked requests:** a driver can hold up to `maxOpenOffers` requests at once (setting, default 3, admin
  Settings › "Open requests per driver"; 1 = one at a time). Dispatch claims a slot atomically (Lua on the sorted set
  `dispatch:driver:<id>:offers`, score = expiry ms); each trip is still offered to one driver at a time. Accepting
  one sends the driver's other requests straight to their next drivers (no decline or timeout counted). Every closed
  offer emits `trip.offer_closed {tripId}` to that driver. `GET /v1/trips/offers` lists all open ones (oldest
  first); `GET /v1/trips/offer` still returns the oldest for older apps.
  App: `DriverSessionState.queued` (`QueuedOffer`) behind `incoming`. D-15 / D-20 always show `RequestStackView`
  (like Namma Yatri's; the coral single-request takeover is gone, 29 Sep 2026): with two or more a left rail of
  countdown rings with each fare (tap to jump); with one a single full-width card. Each ring shows what sets that
  request apart (`RequestPerk`, `requestPerks`, 30 Sep 2026), else its vehicle: a parcel among rides (box), **Best
  ₹/km** (trending-up, green) and **Closest pickup** (crosshair, navy), each given to one request only by the numbers
  the cards show (a tie gives neither), and Verified; a Butterfly trip shows the butterfly first. The card carries a tag with the same icon, so the
  rail reads at a glance. The whole card swipes too (`_SwipeableCard`): past 35 % of its width right accepts and left
  declines, with a green "Accept" / red "Decline" panel behind it that turns solid (haptic tick) once letting go
  counts; a short drag springs back; nothing swipes while an accept is in flight. The "Swipe to accept" slider stays. A card per request, soonest to close on top, with rating / vehicle / parcel tags (Go To / Stay In is the bar above the cards),
  fare and ₹/km (the rider's extra as "₹50 + ₹20" in green plus a "Rider added ₹20 extra" line; the rail shows
  "₹50" and "+₹20"; voice: "50 rupees plus 20 extra"), pickup distance · min and address, trip km · min and drop address, a ✕ inside its own ring with
  the seconds left under it (red for the last 5), and
  its own "Swipe to accept" (`acceptOffer` / `declineOffer`; the others lock while one is being accepted). Each new
  request is read aloud. A bike driver's stack can mix rides and parcels: the title says "2 requests" and accepting
  goes to D-16 or D-21 by the accepted request (`acceptedRoute`). A `trip.offer` for a trip already on screen (the
  rider added extra) updates that card's fare and keeps its countdown; the overlay re-sends when a fare changes. Decline, timeout, a failed accept or `trip.offer_closed` drop that card; none left → Home. Home pushes the card only when a request appears from none. In the background the
  overlay shows the same list: the app sends `{cmd: offer, offer, others}` whenever the stack changes, and the
  overlay answers `accept | decline | timeout` with the trip id (`acceptOffer` / `declineOffer`). Overlay cards hide
  the voice toggle (the overlay isolate has no ProviderScope; the toggle drew a grey error screen there). Every open
  request's notification (the FCM handler posts one per offer) is cleared once the app is in front, and a closed one
  in the background too (`BackgroundOffers`, which also re-syncs when only the stack changes). Offer time is the
  admin "Offer time" setting (5–120 s, default 15); the apps follow it.

## 7d. Driver app in the background (apps/driver/lib/overlay)

- **Floating bubble:** while online and the app is in the background, a draggable Tamil Taxi bubble is drawn over other
  apps (`flutter_overlay_window`, SYSTEM_ALERT_WINDOW, asked once with an explanation when going online; the app
  works without it). Tap → back to Tamil Taxi. Hidden in the foreground, offline or after sign-out.
  The bubble is a foreground service, so Android requires a notification: `MainActivity` pre-creates the plugin's
  channel (`"Overlay Channel"`) at IMPORTANCE_MIN so it stays silent and collapsed (a channel keeps its first
  importance; phones that already had the plugin's default channel need a reinstall). `drawable/notification_icon`
  overrides the plugin's icon with the Tamil Taxi mark.
- **Patched plugin:** `packages/flutter_overlay_window` is a vendored copy of 0.5.0 (`dependency_overrides` in the driver
  pubspec) with fixes listed in its `TT_PATCHES.md`: no sticky restarts (orphan bubbles), no self-stop after
  re-showing, native tap-to-open with a drag slop (drags opened the app; taps went through the app's engine),
  `closeOverlay` always stops and always answers (a missing answer froze the bubble queue), broadcast listener.
  `BackgroundOffers` asks the plugin whether the window is really up, shows the bubble 0.6 s after going to the
  background, re-checks 0.8 s / 2.5 s after coming back, and bounds every platform call (tests:
  `test/background_offers_test.dart` with an async fake of the native side).
- **Engine outlives the screen:** `MainActivity.provideFlutterEngine` returns one engine cached for the process
  (`FlutterEngineCache`, id `tt_main`) and `shouldDestroyEngineWithHost` is false. Android may destroy a background
  app's Activity while the process lives on (the online GPS service keeps it); the default FlutterActivity destroyed
  its engine too, so the bubble / reopening started the app from scratch and the "start offline" rule took the
  driver offline. `AppLifecycleState.detached` counts as background for the bubble.
- **One app instance:** `MainActivity` is `singleTask` with the default task affinity, and "open app" (bubble tap,
  after Accept) moves the existing task to the front (`ActivityManager.appTasks`). With the template's
  `taskAffinity=""` every such launch started a second copy (splash again, two engines, overlay messages to the wrong
  one: Accept spinning forever).
- **Verified on a Nothing Phone (1), Android 16, 26 Sep 2026** (adb): online → Home → bubble; tap → same app, still
  online; Home → bubble again; launcher → no restart; request while minimised → full-screen card; Accept → job screen
  in front (DRIVER_ASSIGNED); Decline → bubble + NO_DRIVERS; timeout → bubble, re-offer → card again.
- **Bugs found on the device and fixed:** bubble parked off screen (x = -186 px) because a minimised app reported a
  1×1 screen (overlay measures itself, plugin clamps on screen); the FCM background engine took over the overlay's
  message channel so Accept went nowhere (plugin: only the Activity engine owns it); the card height used a guessed
  844 dp (now MATCH_PARENT); FLAG_INSISTENT rang non-stop (now one ring per request, `onlyAlertOnce`).
- **Request card safety:** Decline / timeout close the card at once; Accept gives up after 12 s ("Tamil Taxi didn't
  respond", opens the app); an error closes the card after 2.5 s; a ✕ always returns to the bubble and opens Tamil Taxi.
- **Never online by itself:** the app always starts offline; if the API still has the driver online (app killed while
  online) it is set offline. Only an unfinished job restores the online state. A trip that timed out on the phone
  can be offered again by dispatch (only accepted / declined trips are ignored afterwards).
- **Full-screen request:** a `trip.offer` arriving in the background (the socket stays up thanks to the GPS
  foreground service) expands the overlay into a full-screen card (fare, pickup → drop, distance / ETA, customer,
  server countdown, Accept / Decline) with a ringing high-priority notification. The overlay runs in its own engine
  (`overlayMain`) and only exchanges messages (`overlay_protocol.dart`); API calls stay in the main isolate. Accept →
  job screen and the app comes to the front; Decline / timeout → back to the bubble.
- **Fallback:** without the overlay permission, or if the process was killed, the `ride_requests` notification uses a
  full-screen intent (USE_FULL_SCREEN_INTENT; Android 14+ checks `canUseFullScreenIntent` via `MainActivity` and
  links to the settings page once). Opening it shows the request card (`currentOffer`).
- **Location check UI:** `too_far_sheet.dart` (`runWithFarCheck`) wraps Arrived / End ride / Reached pickup /
  Complete delivery: on `TOO_FAR` it shows the distance, reason chips + "Other", Navigate, and "Continue anyway".
- **Uploads:** KYC photos are resized to ≤1600 px at quality 80 before upload.

---

## 7e. Screen transitions (apps)

Both apps share `TtPageTransitionsBuilder` (`packages/tamiltaxi_ui/lib/src/theme/tt_transitions.dart`), set as
`pageTransitionsTheme` in `TtTheme.light`, so every go_router / Navigator page uses it: the new page slides in 8 % from
the right and fades in (320 ms in, 260 ms back, ease-out cubic), the page under it drifts 5 % left; full-screen
dialogs rise from the bottom. iOS and macOS keep the Cupertino swipe-back transition.

## 8. Testing and quality

| Package | Checks |
|---|---|
| tamiltaxi_data | fare engine unit tests (₹35/66/132 with no peak; design ₹38/72/145, ₹49/180/420 at 1.1x; lines add up) + shared cases `test/fixtures/fare_cases.json` (also run by the API spec, so the engines can't drift) |
| tamiltaxi_ui | formatter tests |
| passenger / driver | every Design gallery frame at 360 and 430 px, main-path flow tests (fast mode, fake time); `test/tool/design_export_test.dart` (skipped unless `OUT_DIR` is set) renders every screen for `docs/design` |
| tamiltaxi_data (geo) | `hex_grid_test.dart`: disk sizes, regular hexagons of H3 edge length, neighbours share an edge, outline ring, demo demand map |
| api | unit (fare engine incl. the shared `fare_cases.json`, transitions, subscriptions, maps service, polyline) + e2e (full ride lifecycle, fallbacks) |
| web | Vitest: Play Store links match each app's `applicationId`, every sitemap page exists, legal docs are dated with a contact, privacy links to account deletion |
| admin | Vitest unit: ₹ Indian formatting, IST dates, paging/URL builder, API URL + error helpers, safe post-login redirect, JWT role/expiry check, fare preview = API engine (₹38 demo trip at 1.1x), H3 circle fill/undo, settings validation |

`npm run check` must pass with zero analyzer issues before merging.

---

## 9. Android build notes

- Impeller runs on **OpenGL ES** (`io.flutter.embedding.android.ImpellerBackend=opengles` in both manifests): the
  Vulkan backend lagged frames on MediaTek/Mali devices (bottom sheet looked stuck).
- Permissions: INTERNET, ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION (passenger).
- Launcher icons and native splash (30 Sep 2026, "kolam" set, the winner of a judged 8-concept round): "தமிழ்"
  (Anek Tamil 800) over "Taxi" (Anek Latin 635 on the rider, 622 on the driver; road x, pulli-shaped i dot) inside
  a pulli-kolam ring. Rider: coral disc on navy; driver: navy disc with a yellow DRIVER band. Adaptive icons use an
  image background layer (`mipmap-*/ic_launcher_bg.png`: ring, colours, band) under `ic_launcher_foreground` (the
  name, plus DRIVER on the driver) and `ic_launcher_monochrome` (Android 13 themed); legacy `ic_launcher.png` sizes
  up to 96 px use a bolder dotted ring. Splash, same name everywhere: Android ≤ 11 `drawable-nodpi/splash_logo.png`
  (130×113 dp in `launch_background.xml`); Android 12+ `drawable-xxxhdpi/splash_icon.png` (288 dp at 4x) on
  `@color/ic_launcher_background`, set in `values-v31` and `values-night-v31` (night outranks the API level, so
  dark mode needs its own copy); then the Flutter splash (P-01 / D-01) draws the same name with `TtAppName`
  (vector, `TtLogoPaths.appName`) at the window centre, so the hand-off doesn't jump.
  **Rider intro (1 Oct 2026):** P-01 then plays a 2 s animation (`SimTimings.intro`, a third in fast mode) and
  routes on when it ends: 0.2–0.9 s the rider icon's pulli-kolam ring draws itself clockwise from the road at the
  bottom and its yellow pulli pop in (`KolamRing`, geometry ported from the icon build so it matches the icon);
  0.5–1.2 s the lane dashes glide along the x's over-road (`TtAppName.laneShift`: `AppNameRoad.nameAt` fills the
  dashes in and cuts moved ones out of the road band only, with path operations at ×1000 because Skia drops cuts
  at unit scale; two periods end where they started) while the name bounces to 1.05; 1.2–1.6 s the ring widens
  and fades; 1.6–2.0 s the tagline rises in. The first frame is the native splash (name only), the last is the
  old static P-01. "Remove animations" (`MediaQuery.disableAnimations`) shows the last frame for 1.5 s instead;
  the Design gallery shows the last frame and replays on tap. Preview frames: `test/tool/intro_frames_test.dart`
  (1080 × 1920, 30 fps; ffmpeg command in the file). `ic_notification` is the
  name alone as a white silhouette (from the rider `ic_launcher_foreground`; also the overlay's foreground-service
  notification, flutter_overlay_window patch 10) and the driver bubble (`assets/brand/tt_icon.png`) is the driver
  launcher icon (30 Sep 2026: the road x alone read as the X / Twitter logo, so it is used nowhere on its own).
  The in-app logo elsewhere stays the English `TtWordmark`. Rendered from the separate `tamiltaxi-logo` kit (`round9-creative/final-kolam`, installed with
  `tools/install_kolam_icons.py`), not drawn by hand.
- Release signing is not configured yet (uses debug keys). Add `android/key.properties` (git-ignored) before store release.

---

## 9b. AWS deployment (single EC2, low cost)

Everything (Postgres, Redis, API, admin) runs with Docker Compose on one EC2 instance. No domain yet: **HTTPS via
Caddy on sslip.io names** (27 Sep 2026): `https://api.65-0-233-253.sslip.io` and `https://admin.65-0-233-253.sslip.io`
(sslip.io resolves a name to the IP inside it; Caddy gets free Let's Encrypt certificates and renews them). The apps
default to the HTTPS API. At launch: point the real domain's A records at the Elastic IP, set `API_HOST` /
`ADMIN_HOST` in `/opt/tamiltaxi/.env`, rebuild the apps with `TT_API_URL=https://<api domain>/v1`, and update the Didit
webhook URL. Plain `http://65.0.233.253:3000` / `:3001` still work until those ports are closed.

| Item | Value |
|---|---|
| Account / region | `786020471552` / ap-south-1 (Mumbai), AWS CLI profile `rido` (IAM user `rido-deployer`, `AmazonEC2FullAccess` only) |
| Instance | `i-0f90806819ce574cd` (`rido-server`), t3.small (free-tier eligible), Ubuntu 24.04, 20 GB gp3, 2 GB swap |
| Public IP | Elastic IP **65.0.233.253**: API `http://65.0.233.253:3000/v1`, admin `http://65.0.233.253:3001` |
| Security group | `sg-0f4edf3e881efde00` (`rido-sg`): 22 from the owner's IP only, 80 + 443 public (Caddy), 3000–3001 public (old plain-HTTP URLs; close once every app build uses HTTPS); Postgres/Redis not published |
| SSH | `ssh -i ~/.ssh/rido-key.pem ubuntu@65.0.233.253` |
| On server | `/opt/tamiltaxi`: `docker-compose.yml`, `docker-compose.prod.yml` (removes DB/Redis host ports), `.env` (generated JWT secret + DB password, `S3_BUCKET`, mode 600) |
| Uploads (S3) | Bucket `rido-uploads-786020471552` (ap-south-1): all public access blocked, SSE-S3 default encryption, ACLs off. The instance role `rido-ec2-uploads` may only Put/Get `kyc/*` and List with prefix `kyc/` (no keys on the server). IMDSv2 required, hop limit 2 (so the API container can reach instance credentials) |

**Seed prod** (the image has no TS sources, so seeders run locally through an SSH tunnel; ids `demo_…`, removable with `--clear`):

```bash
PGIP=$(ssh -i ~/.ssh/rido-key.pem ubuntu@65.0.233.253 "docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' tamiltaxi-postgres-1")
ssh -i ~/.ssh/rido-key.pem -f -N -L 15432:$PGIP:5432 ubuntu@65.0.233.253
DATABASE_URL="postgresql://tamiltaxi:<POSTGRES_PASSWORD from /opt/tamiltaxi/.env>@127.0.0.1:15432/tamiltaxi" npm run seed:demo-people -w @tamiltaxi/api
```

**Test drivers on staging** (28 Sep 2026): the image has the Prisma sources and `tsx`, so the seeder runs inside the
API container with its own `DATABASE_URL`. Their shared placeholder photo is `kyc/test-driver-avatar.png` in the bucket.

```bash
scp -i ~/.ssh/rido-key.pem apps/api/prisma/seed-test-drivers.ts ubuntu@65.0.233.253:/tmp/
ssh -i ~/.ssh/rido-key.pem ubuntu@65.0.233.253 'docker cp /tmp/seed-test-drivers.ts tamiltaxi-api-1:/repo/apps/api/prisma/ && docker exec -w /repo/apps/api tamiltaxi-api-1 npx tsx prisma/seed-test-drivers.ts --photo test-driver-avatar.png'
```

**Test trips on staging** (`scripts/book_test_trip.py`): test riders book up to 4 rides or parcels around a driver so
the requests arrive and stack in the driver app; `--mix` (bike: rides and parcels), `--extra 20` (rider's extra),
`--women [preferred|only]` (Butterfly, from women test riders whose profile it sets to FEMALE; rides only; sign in as
a woman test driver: 9100000102 Priya (cab), 9100000602 Divya (bike)); `cancel` cancels what they booked. It reads
the sign-in code and the driver over SSH, which fails in 10 s with a hint when port 22 doesn't allow your IP.

```bash
python3 scripts/book_test_trip.py book --driver 9100000102 --women preferred --count 3   # at Priya's live GPS
python3 scripts/book_test_trip.py cancel
```

Seeded 26 Sep 2026: 2,000 demo trips + demo people.

**Deployed 27 Sep 2026:** Didit identity checks (migrations `identity_verification`, `identity_documents`), Caddy on
the sslip.io names (Let's Encrypt certificates issued on first start), `ADMIN_COOKIE_SECURE=true` (sign in to the admin
at `https://admin.65-0-233-253.sslip.io`; the old `:3001` URL can no longer keep a session). Server backups of the
previous files: `/opt/tamiltaxi/.env.bak-202609271304`, `docker-compose.yml.bak-*`.

**Deployed 28 Sep 2026:** Butterfly + pickup ETA (migration `butterfly`), "Who's riding?" (`trip_rider`), driver
cancel fix, driver gender at sign-up. All people and trips were cleared first (dev data; admins and config kept).

**Deployed 28 Sep 2026 (second):** the Namma Yatri comparison work (`e6da5f1..3cc68cf`): guarded trip transitions, one
offer and one trip per driver, OTP tries, rating sums, server-trusted GPS, peak 1.0 default, Redis job runner,
cancel codes and reassign, timeout jobs, GPS breadcrumbs and review flags, waiting charge, fault verdict,
cancellation fee (off), driver pauses, dispatch ranking, share link, server SOS and safety checks. 11 migrations
applied on start. No `currentMultiplier` row was stored, so the new 1.0 default applies. **Pending:** add
`SHARE_BASE_URL=https://admin.65-0-233-253.sslip.io` to `/opt/tamiltaxi/.env` and restart the API (share links point at
localhost until then). Install the new APKs: older driver builds send no trip GPS, so their trips land in Needs review.

**Deployed 29 Sep 2026:** driver Home demand chip with area names, D-07 cards + Help, swipe to accept + voice,
booking preferences (migration `driver_booking_prefs` applied on start), stacked requests (`maxOpenOffers` 3 by
default, no row stored) (`fdb7f15..619b77e`). Checked live: `/health` 200, hotspots carry `name`,
`GET/PUT /drivers/me/booking-preferences` and `GET /trips/offers` work for a test driver (prefs cleared after).
`SHARE_BASE_URL` is set on the server. Drivers need the new APK for voice, swipe, preferences and stacked cards.

**Deployed 29 Sep 2026:** `DEV_OTP_CODE` (secret 6 digits in `/opt/tamiltaxi/.env`, value in the git-ignored
`credentials.local.md`): staging no longer accepts any OTP. Checked live: a wrong code gets 401, the secret code 200.

**Deployed 29 Sep 2026 (rename):** staging moved from `/opt/rido` (compose project `rido`) to `/opt/tamiltaxi`
(project `tamiltaxi`, images `tamiltaxi-api:local` / `tamiltaxi-admin:local`). The database was dumped
(`~/rido-20260929.dump` on the server), restored into the new `tamiltaxi` database and user with the same password,
and the Caddy and uploads volumes were copied, so data and HTTPS certificates carried over (19 users, 44 trips).
Checked live: `/health` 200, admin sign-in page, app-config. Rollback: the old `rido_*` volumes, `/opt/rido` and the
dump are kept; delete them once the new stack has run for a week (`docker volume rm rido_postgres-data rido_redis-data
rido_uploads rido_caddy_data rido_caddy_config`).

**Deployed 30 Sep 2026:** parcel on bike, Go To / Stay In with saved areas, the rider's extra (`94ad380..e6a91bf`,
no migrations). Checked live: `/health` 200, admin login 200, `POST /trips/:id/extra` exists (401 without a token), and
for the bike test driver `+919100000601` Stay In saves with a 12 h timer, `parcels: false` saves, Go To + Stay In
together is refused (400) and Go To turns Stay In off (prefs restored after). The previous images are kept as
`tamiltaxi-api:prev` / `tamiltaxi-admin:prev` (rollback: tag them back to `:local` and `up -d --no-build`). Apps need
new APKs for the features.

**Deployed 1 Oct 2026:** admin manual approval + Approvals queue, regrouped sidebar, faster list views, admin people
API (`ccbe555..b343de1`; the website `apps/web` isn't deployed). Migrations `admin_list_indexes` and `admin_notes`
applied on start; DB dump first at `~/tamiltaxi-20261001.dump` on the server. Slim upload (3.3 MB): only
`package-lock.json` had changed, for the website's packages. Rollback images: `tamiltaxi-api:prev` /
`tamiltaxi-admin:prev` (the 30 Sep build); the older ones are `:prev-0930a`. Checked live: `/health` 200, admin
login 200, signed-in `GET /admin/approvals` (counts, `autoApprove` true), drivers with status counts and no UPI IDs in
the list, rider / trip filters, activity and notes 200. `rido-sg` also allows `110.226.112.45` (SSH, 1 Oct).

**Deployed 1 Oct 2026 (second):** the admin screens for people (More menu, notes, history, Remind), the Ctrl+K
search and the new dashboard (`59d5155..fb74b51`, no migrations, slim upload). Rollback: `:prev` is the morning build,
`:prev-0930b` the 30 Sep one. Checked live: `/health` 200, `GET /admin/search` 200, signed-in admin dashboard shows
"Needs attention", `/drivers/approvals` and `/api/search` 200.

**Deployed 2 Oct 2026:** ride tiers (Scooty, Auto Priority, Sedan, SUV), nearby vehicles, cab rentals, outstation
and trips booked for later, goods to another town, house shifting (only to movers who switched it on), per-city prices
for those services (admin › City › Rentals & more), the admin audit-row fix (`fb74b51..c0cf159`). Migrations
`ride_tiers`, `ride_modes_scheduled`, `house_shifting` and `city_mode_pricing` applied on start; DB dump first at
`~/tamiltaxi-20261002.dump`. Slim upload (3.4 MB): no package files or Dockerfiles had changed; besides the build
outputs it carried `apps/api/prisma` (the new migrations) and `src/modules/subscriptions/plan-prices.ts` (the seed
reads it; it had new tiers). Rollback: `:prev` is the 1 Oct (second) build, `:prev-1001a` the 1 Oct morning one.
Checked live: `/health` 200, `GET /fares/rates` (four sections, 8 packages), signed-in
`GET /admin/cities/coimbatore/pricing` (all built-in), an unknown section 400, the admin "Rentals & more" tab, a
shifting quote and rental quotes, and for test drivers the shifting opt-in (pickup `+919100000501` on with 3 helpers,
then off again; bike `+919100000601` refused with 400). `rido-sg` also allows `110.226.112.99` (SSH, 2 Oct). Apps need
new APKs for the new screens.

**Deployed 3 Oct 2026:** interrupted Claude audit completion, API/admin image source `e108838`, API/admin staging deployment. The four migrations `daily_selfie_check`, `trip_photos`, `ticket_attachment` and
`account_deletion` applied successfully. API/admin containers passed health checks. Public HTTPS checks returned 200
for API health, app-config, admin login and website home/privacy/terms/delete-account. Signed-in admin dashboard,
approvals, users, support, settings and search returned 200, as did the corresponding API reads. Unauthenticated
fare quotes/shifting quotes and place autocomplete returned 401; public rate cards still returned 200. The temporary website preview was then disabled at the owner's request; website publishing uses the existing external hosting integration.
The deployment used a 4.6 MB artifact archive layered over the previous images (package/Dockerfile dependencies
were unchanged). Database/config backup: `/opt/tamiltaxi/backups/20261003-e108838`; rollback images:
`tamiltaxi-api:rollback-20261003-e108838` / `tamiltaxi-admin:rollback-20261003-e108838`.

**Remaining infrastructure permission:** a harmless DeleteObject request for a unique nonexistent key confirmed
`AccessDenied`. Account records can be anonymised, but remote KYC file cleanup requires the role permission in
[staging-kyc-delete-policy.json](staging-kyc-delete-policy.json). The `rido` AWS profile cannot administer IAM.
An authorised IAM administrator can add this scoped policy to `rido-ec2-uploads` (policy name `tamiltaxi-kyc-delete`);
then repeat the harmless permission check. No real account was deleted during deployment smoke tests.

- **Slow upload (mobile data, ~100 KB/s):** when no `package.json`, `package-lock.json`, Dockerfile or migration changed
  since the deployed build, ship only the build outputs (~3 MB instead of ~450 MB): copy `apps/api/dist`,
  `apps/api/prisma` and `apps/api/src/generated` out of the new API image and `/app/apps/admin` out of the new admin
  image, then on the server build `FROM tamiltaxi-api:prev` / `FROM tamiltaxi-admin:prev` with those folders
  replaced, tag the result `:local` and `up -d --no-build`. Used on 30 Sep 2026.
- **SSH from a mobile network:** carrier NAT can show one IP to `checkip.amazonaws.com` and use another towards AWS,
  so a rule for the first still times out. Find the one the server sees in `$SSH_CLIENT` (open 22 briefly, connect,
  allow that /32, close the wide rule again). `rido-sg` now allows `122.178.167.96` (home), `157.51.64.100`
  (mobile, may change) and `110.226.112.45` (1 Oct 2026).

**Capacity (measured 26 Sep 2026, t3.small):** cached fare quotes at 50 concurrent connections: ~890 req/s average
(peak 1,340), p50 43 ms, p99 ~200 ms, no errors; the API process used both vCPUs while Postgres/Redis stayed idle.
Planning figures with headroom: ~300–400 req/s sustained, ~1,500–2,500 concurrent app users, ~300–500 online
drivers (GPS every 5 s over the socket), ~5 bookings/s at peak, ~5,000–10,000 trips/day. Limits, in order: one Node
process; t3 CPU credits (baseline 20 %/vCPU: sustained load either drains credits or bills "unlimited" surplus);
2 GB RAM shared with Postgres/Redis; single server (no failover). Next steps: c7i-flex.large or t3.medium; then
RDS + 2 API instances behind an ALB with the Socket.IO Redis adapter (events are per process today).

HTTP keep-alive is 65 s (`main.ts`); with Node's 5 s default the apps sometimes reused a closed connection and showed
"You're offline". The apps also retry idempotent requests once after a dropped connection (`ApiClient`).

**Website hosting:** the owner hosts `apps/web` separately; pushing the repository triggers that hosting provider's
automatic deployment. The EC2 staging stack serves API/admin only. The temporary website host added during the
3 Oct deployment was removed at the owner's request; do not add website hosting to EC2 redeploys.

**Redeploy** (images are built locally so the small instance never runs `next build`):

```bash
set -a; . ./.env; set +a
docker build -f apps/api/Dockerfile -t tamiltaxi-api:local .
docker build -f apps/admin/Dockerfile --build-arg NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY="$GOOGLE_MAPS_BROWSER_KEY" -t tamiltaxi-admin:local .
docker save tamiltaxi-api:local tamiltaxi-admin:local | gzip -1 | ssh -i ~/.ssh/rido-key.pem ubuntu@65.0.233.253 'gunzip | docker load'
scp -i ~/.ssh/rido-key.pem docker-compose.yml ubuntu@65.0.233.253:/opt/tamiltaxi/ && scp -i ~/.ssh/rido-key.pem -r caddy ubuntu@65.0.233.253:/opt/tamiltaxi/
ssh -i ~/.ssh/rido-key.pem ubuntu@65.0.233.253 'cd /opt/tamiltaxi && docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile https up -d --no-build'
```

**HTTPS one-time setup:** open 80 and 443 in `rido-sg`
(`aws ec2 authorize-security-group-ingress --profile rido --group-id sg-0f4edf3e881efde00 --ip-permissions
'IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0}]' 'IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0}]'`),
add `DIDIT_*` and `ADMIN_COOKIE_SECURE=true` (admin login then needs the HTTPS URL) to `/opt/tamiltaxi/.env`, and run the
redeploy with `--profile https`. Caddy's certificates live in the `caddy_data` volume.

If your IP changes, SSH times out: re-authorize port 22 in `rido-sg` for the new IP. An Elastic IP costs money while it isn't attached to a running instance, so release it if the server is terminated.

---

## 10. Not done yet / next steps

| Item | Notes |
|---|---|
| Apps → API | **Done (26 Sep 2026)**: both apps run on the API by default (see 7b); mock mode via `--dart-define=TT_LIVE_API=false`. Needs a real-phone pass (two phones: passenger + approved online driver) |
| Push (FCM) | **Done (26 Sep 2026)**, see 7c. Verify on phones; rotate the service-account key that was pasted in chat (`e73622ac…`) and update `FIREBASE_SERVICE_ACCOUNT_B64` on the server |
| Driver re-search | **Done (28 Sep 2026)**: a driver cancel before pickup sends the trip back to searching (≤ `maxReassigns`), see 6 "Reassign on driver cancel" |
| GPS path follow-ups | Breadcrumbs, actual distance and fare flags **Done (28 Sep 2026)**. Later: admin settings for the thresholds (50 m, 120 km/h, 2 km gap, max(1.2 km, 25 %)), snap-to-road for a nicer path, a per-driver mock-GPS count across trips |
| Cancellations follow-ups | Waiting charge, fault verdict, cancellation fee (off) and driver pauses **Done (28 Sep 2026)**. Later: decide the fee policy (then tell passengers before they cancel: the cancel sheet should say "₹10 fee"), a way to waive a due, a "moving away" signal from the pickup-progress job and ETA growth (today: straight-line distance vs accept), per-city thresholds, a pause appeal flow |
| Driver ranking | **Done (28 Sep 2026)**: 7-day offer record + idle bonus, see 6 Dispatch step 4. Later: per-city weights, an actual-pickup-distance term (Namma Yatri has one), show drivers their own acceptance rate in the app, backfill the counters from `TripCancellation` after a Redis flush |
| Trip `updatedAt` | Add to Trip JSON so apps can order pushed updates reliably (apps guard with a status order today) |
| SOS / tracking link | **Done (28 Sep 2026)**: tracking link, server SOS and the admin SOS page, see 6d. Later: a realtime admin channel (the page polls), SMS to contacts from the server (paid, so the phone's SMS app is used) |
| Women-driver preference | **Done (27 Sep 2026)** as Butterfly: booking sends `womenDriver`, dispatch filters (ONLY) or ranks (PREFERRED) by driver gender, see 7 Dispatch step 4 |
| Selfie / DOB | **Sign-up selfie: Done (27 Sep 2026)**, by Didit's liveness check (date of birth is read from the ID). **Daily selfie: Done (3 Oct 2026)**: camera + server match against the identity-check selfie; admin setting controls it; mock mode remains simulated |
| CI | **Done (29 Sep 2026)**: `.github/workflows/ci.yml` runs `npm ci`, `npm run check` and the API e2e suite (Postgres + Redis service containers) on every push and PR. Later: APK build artifacts |
| Open source | **Done (29 Sep 2026)**: AGPL-3.0, CONTRIBUTING / CODE_OF_CONDUCT / SECURITY, issue and PR templates, real package READMEs; business docs moved to git-ignored `docs/private/`; debug builds allow cleartext HTTP to a local API (`src/debug/res/xml/network_security_config.xml`) |
| Cost plan | See [COST_AND_SCALING.md](../COST_AND_SCALING.md): the P-10 ETA change (§5) and self-hosted OSRM (§6) are planned, not built |
| Hosting | **Staging live (26 Sep 2026)**: see "9b. AWS deployment". **HTTPS: Done (27 Sep 2026)** via Caddy on sslip.io names. Later: real domain at launch, RDS/ElastiCache when load needs it |
| Secrets | AWS Secrets Manager / SSM for `JWT_SECRET`, Google keys, DB password |
| Observability | Structured logs → CloudWatch; health checks already exposed |
| Payments | Not needed while the app is free (6a). If plans return: Razorpay Subscriptions (UPI Autopay mandates) |
| Contributions | Totals aren't tracked (UPI goes straight to the owner). Optional later: Razorpay payment page for receipts and a "raised this month" figure |
| SMS | MSG91 / Twilio for OTP |
| Admin panel | **Done (25 Sep 2026)**: `apps/admin`, all modules above. KYC files open via `/files/:name` (S3). Follow-up: no 2FA/IP allow-list for admins yet |
| Google Maps on device | Verify the Google engine on a real phone with keys (never run with a key yet) |
| Google logo padding | **Done**: `TtMap.mapPadding` (→ `GoogleMap.padding`) on map screens with sheets; the Google fit works inside the padded area and, since 2 Oct 2026, places the camera again once the map exists (Android applied the padding after the initial camera, hiding fitted routes behind sheets). The flutter_map fallback ignores it (passenger: `sheetMapInsets`) |
| Two-wheeler routing | **Changed (28 Sep 2026)**: the backend routes every vehicle as DRIVE. TWO_WHEELER is beta (Google requires an in-app warning) and bills at Routes Enterprise (3× Essentials, 7k free); bike fares are priced on the car route so the booked fare matches P-10. Google Routes billing: `vehicleStopover` (fare routes) bills at Pro; ETAs stay Essentials |
| Google search in pickers | **Done**: saved-place editor and parcel picker search through the API |
| Google Maps improvements | **Done (28 Sep 2026)**: shortest-route fares (`computeAlternativeRoutes`), traffic-aware travel time for display (`travelMin`, fare unchanged), "Near X" pickup landmarks (address descriptors → `Trip.pickupLandmark`), service-area-restricted search with distances, and one Route Matrix call for driver ETAs. Billing table in 7. Later: a phone check of P-09 / D-16 with real landmarks. Plus-code addresses not typed `plus_code` ("X2JR+9H, ELGI Nagar") are skipped or trimmed: **Done (28 Sep 2026)** |
| Website | **Built (30 Sep 2026), externally hosted by the owner**, see 6e and 9b. Before Play submission: confirm the production domain and create the `support@tamiltaxi.co.in` mailbox (the site and driver app publish it), set `site.onPlayStore` once live. In-app privacy text: **Done (1 Oct 2026)**: it now says drivers see the rider's phone number (as the website does) and the chat header no longer says "Number hidden"; masking would need a paid telephony service. **Self-serve account deletion: Done (3 Oct 2026)** in both apps and admin; trip addresses/routes remain in historical records |
| Support WhatsApp | **Done (3 Oct 2026)**: both apps open `wa.me/<number>` and telephone links for the configured support number; no fake default number, buttons hide while unconfigured |
| H3 | See plan below |

---

## H3 plan (owner recommendation #1)

[H3](https://h3geo.org) (Uber's hexagonal grid). **Implemented (25 Sep 2026)**; references: https://www.uber.com/in/en/blog/h3/ and "How Uber finds your driver in seconds".

| Use | How | Replaces |
|---|---|---|
| Driver–passenger matching | **Done (25 Sep 2026):** drivers indexed at res 8; pickup hex then rings outward; ranked by road ETA per hex pair; batched assignment | Redis GEOSEARCH radius (removed) |
| Demand zones and surge | **Done:** bookings counted per res-7 hex per minute as **distinct passengers** (Redis set `h3:riders:<min>:<cell>`, 26 Sep 2026; one person retrying can't create surge; cells in `h3:req:<min>`); every 60 s `DemandService` compares requests (last `demandWindowMin`) with free drivers in the hex → `surgeFor` (1 + sensitivity × (ratio − 1), ≤ maxMultiplier, floor 0.05) → **k-ring smoothing** (own × 0.6 + ring-1 mean × 0.4, avoids price cliffs at hex edges) → `h3:surge:<cell>` (3 min TTL). Fares use max(zone surge / default, live surge). Public `GET /v1/demand` for the driver app's "High demand" areas | Hard-coded demand circles |
| ETA | **Done (multi-resolution 26 Sep 2026):** `HexStatsService` aggregates completed trips (60 days, 3–80 km/h) into `HexStat` at **res 9, 8 and 7** (`res` column; from → to, IST hour, trips, speed = total km / total time, avg minutes); rebuilt daily (Redis lock) or `POST /v1/admin/hex-stats/rebuild`; kept in memory. Lookup backs off: exact hour at res 9 → 8 → 7, then the all-day average at res 9 → 8 → 7, first with ≥ `historicalEtaMinTrips`. `EtaService` order: learned speed from the exact points (in memory, free) → Google Routes → 20 km/h estimate (`geo/eta-model.ts`); road/estimate cached per res-8 cell pair 10 min | 18 km/h constant; res-7 only |

Resolutions used: res 8 (≈0.74 km²) for service areas, zones, the driver index, trip cells and heatmaps; res 7
(≈5 km², parent of 7 res-8 cells) for demand/supply and surge; learned speeds at res 9 (≈0.1 km²), 8 and 7 with
back-off, so busy streets get street-level speeds while quiet areas still get a stable district average.
Compaction: `GET /v1/cities/:id/service-area?compact=true` returns `compactCells` output (mixed resolutions) for
small app payloads. The apps draw the API's hex outlines (`/demand/hotspots`), so they need no H3 library; mock mode uses look-alike hexes (7a0).

Status (25 Sep 2026): **all parts live** (service areas, zones, dispatch, heatmaps, live surge, learned ETA). New settings:
dynamicSurgeEnabled, surgeSensitivity, demandWindowMin, surgeMinRequests, historicalEtaMinTrips.

Fixed 25 Sep 2026: `/admin/users?role=&blocked=` (added to `ListQueryDto`) and the API image seed crash (`h3.util.ts`
copied into the runtime image).

Gotcha learned: Prisma queries are lazy; `void prisma.x.create(...)` never runs. Always `await` or attach `.catch()`.
