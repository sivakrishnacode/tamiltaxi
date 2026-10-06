# CLAUDE.md — Tamil Taxi monorepo

Tamil Taxi is a free ride-hailing and parcel delivery platform for Coimbatore: 0% commission and no subscription for
drivers. The owner pays the running costs. Paid driver plans still exist in the code but are switched off
(`driverPlansEnabled`). **The repo is public, AGPL-3.0**: nothing personal or secret goes into tracked files.

This file holds the working rules plus a quick map of the repo. **The full technical reference is
[docs/tech-docs/using.tech.md](docs/tech-docs/using.tech.md)** (stack versions, env vars, endpoints, H3, FCM, AWS).
The owner's recommendations live at the top of that doc.

The interrupted 2 Oct audit is complete: see
[the 3 Oct completion handoff](docs/tech-docs/claude-completion-2026-10-03.md) before resuming its old agents.

---

## 1. Working rules (always follow)

### 1.1 Commit every change

Commit **every** completed unit of work: a feature, bug fix, refactor, docs change, config change or dependency bump.
Don't leave finished work uncommitted at the end of a task.

- **One logical change per commit.** Split unrelated changes into separate commits.
- **Commit only once it works.** Run the relevant checks first (see 1.3). If a check fails, fix it or tell the user.
  Don't commit broken code without saying so.
- **Stage files explicitly** (`git add <paths>`), not `git add -A`, so stray files don't get in.
- **Never commit secrets:** `.env`, `.dart-defines.json`, `docs/tech-docs/credentials.local.md`,
  `google-services.json`, Firebase service-account JSON, keystores, anything in `docs/private/`. They are git-ignored; keep it that way.
- Work on `main` unless the user asks for a branch. **Don't push** unless asked. (Outside contributors: fork, branch
  and open a PR, see [CONTRIBUTING.md](CONTRIBUTING.md).)
- Never use `--no-verify`, `--amend` on pushed commits, or force-push without explicit approval.

**Message format** ([Conventional Commits](https://www.conventionalcommits.org)):

```
<type>(<scope>): <short imperative summary, ≤ 72 chars>

<optional body: what changed and why; list user-visible effects or gotchas>

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
```

| type | use for | | scope | area |
|---|---|---|---|---|
| `feat` | new feature | | `api` | `apps/api` |
| `fix` | bug fix | | `admin` | `apps/admin` |
| `refactor` | no behaviour change | | `passenger` | `apps/passenger` |
| `perf` | performance | | `driver` | `apps/driver` |
| | | | `web` | `apps/web` |
| `test` | tests only | | `ui` | `packages/tamiltaxi_ui` |
| `docs` | docs / CLAUDE.md | | `data` | `packages/tamiltaxi_data` |
| `chore` | deps, config, tooling | | `infra` | docker, scripts, AWS |
| `revert` | reverting a commit | | `repo` | root / cross-cutting |

Examples: `feat(driver): show H3 demand hexes on home map`, `fix(api): await Prisma write in trip cancel`.

### 1.2 Keep docs current, in the same commit

- **[docs/tech-docs/using.tech.md](docs/tech-docs/using.tech.md)** is the source of truth. Update it whenever the
  stack, services, env vars, commands, endpoints or infra change. Bump its "Last updated" date too, and mark items in
  "10. Not done yet" as **Done (date)** when they ship.
- **This file:** update it when a working rule, a key command or the repo layout changes. Keep it short: details go in
  `using.tech.md`.
- `README.md` is the user-facing intro. Update it for changes that affect setup or how to run things.
- **[docs/tech-docs/system-design-notes.md](docs/tech-docs/system-design-notes.md)** holds system-design learnings
  (talks, posts, competitor apps, load tests, incidents) compared with our system, plus the optimization backlog
  (`SD-n` items with triggers). Each time we learn something about how the system should scale or behave, add a dated
  entry and backlog items there; when an `SD-n` item ships, mark it **Done (date)**.

### 1.3 Checks before committing

| Changed | Run |
|---|---|
| Flutter (`apps/passenger`, `apps/driver`, `packages/*`) | `npm run analyze` and `npm test` (or `npx turbo run analyze test --filter=@tamiltaxi/driver`) |
| API | `npm run analyze -w @tamiltaxi/api && npm test -w @tamiltaxi/api`; flows/DB: `npm run test:e2e -w @tamiltaxi/api` |
| Admin | `npm run analyze -w @tamiltaxi/admin && npm test -w @tamiltaxi/admin` |
| Website | `npm run analyze -w @tamiltaxi/web && npm test -w @tamiltaxi/web && npm run build -w @tamiltaxi/web` |
| Everything | `npm run check`. It must pass with **zero analyzer issues** before merging |

### 1.4 Preferences

- **Keep costs low:** free tiers and the smallest infra that works (currently one t3.small EC2 running everything).
- **Admin is on a new Next.js (16):** read [apps/admin/AGENTS.md](apps/admin/AGENTS.md) and the docs in
  `node_modules/next/dist/docs/` before writing admin code.
- **Prisma queries are lazy:** `void prisma.x.create(...)` never runs. Always `await` or attach `.catch()`.
- **No built-in city:** Tamil Taxi scales city by city. Never hard-code a city name, centre or bounds in runtime code:
  read the `City` rows (API `GeoService`, apps `serviceCitiesProvider` / `CityDefaults`, admin `cityView`). Seed and
  demo data may name Coimbatore.

---

## 2. Repo map

```
apps/
  api/          @tamiltaxi/api        NestJS 12 (ESM) + Prisma 7 (Postgres 17) + Redis 7 + Socket.IO (/rt)
                                 src/core (auth, config, prisma, redis, storage), src/modules/* (one per domain)
  admin/        @tamiltaxi/admin      Next.js 16 App Router + shadcn/ui + Tailwind v4, port 3001, server-side API calls only
  web/          @tamiltaxi/web        public website: Next.js 16 static export (out/), home + privacy/terms/delete-account, port 3002
  passenger/    @tamiltaxi/passenger  Flutter app "Tamil Taxi"         (com.tamiltaxi.passenger)
  driver/       @tamiltaxi/driver     Flutter app "Tamil Taxi Driver"  (com.tamiltaxi.driver); lib/overlay = background bubble
packages/
  tamiltaxi_ui/      @tamiltaxi/ui         theme, widgets (TtMap, TtButton…), illustrations, fonts
  tamiltaxi_data/    @tamiltaxi/data       models, seed, fare engine, repositories (mock + api), simulator
  flutter_overlay_window/        vendored plugin for the driver floating bubble
docs/tech-docs/using.tech.md     technical reference (source of truth)
docs/COST_AND_SCALING.md         running cost per trip, free tiers, P-10 ETA + OSRM plans, scaling stages
docs/tech-docs/system-design-notes.md  design learnings vs our system + optimization backlog (SD-n)
docs/private/                    owner-only business docs (git-ignored, never publish)
.github/                         CI workflow, issue + PR templates
docs/design/                     screenshots of every app screen + index (scripts/export_design.py)
scripts/                         flutter.sh / dart.sh (SDK lookup), build_apks.sh, export_design.py, vehicle_icons/
docker-compose.yml               postgres + redis + api + admin (+ `tools` profile: Adminer, Redis Insight)
```

Flutter app layout: `lib/router` (go_router 17, **pinned**: 18 needs `material_ui`), `lib/state` (Riverpod 3 flow
controllers), `lib/features/<feature>/` (one file per screen, named after its frame ID, e.g. `P10ChooseVehicleScreen`),
`lib/features/design_gallery/` (frame registry + demo controls).

API modules: admin, app-config, auth, drivers, fares, geo (H3), health, kyc (Didit identity checks), maps, notifications (FCM), places, realtime, settings,
subscriptions, support, trips, users.

---

## 3. Common commands

```bash
npm install && npm run get            # deps + flutter pub get + prisma generate
npm run check                         # analyze + test everything (Turborepo, cached)
npm run passenger | npm run driver    # flutter run
./scripts/build_apks.sh [passenger|driver]   # one release APK per app → dist/
python3 scripts/export_design.py      # screenshot every app screen → docs/design/ (+ index)

docker compose up -d                  # full backend stack: API :3000, admin :3001
docker compose up -d postgres redis   # DBs only, then:
npm run start:dev -w @tamiltaxi/api
npm run dev -w @tamiltaxi/admin
npm run dev -w @tamiltaxi/web          # website on :3002; build → apps/web/out/ (static)

npm run prisma:migrate -w @tamiltaxi/api   # new migration (dev)
npm run prisma:seed -w @tamiltaxi/api      # idempotent seed
npm run seed:demo-trips -w @tamiltaxi/api  # ~2,000 demo trips (then seed:demo-people)
npm run seed:test-drivers -w @tamiltaxi/api # 11 approved test drivers to sign into (cab, bike, auto, goods bike, truck, …)
```

Flutter SDK comes from `$FLUTTER`, `PATH` or `~/development/flutter`. `scripts/flutter.sh` passes
`/.dart-defines.json` (map keys) to every run/build.

---

## 4. Key facts

- **Apps use the live API by default.** Mock mode: `--dart-define=TT_LIVE_API=false`.
- **Dev login:** `OTP_DEV_MODE=true` (no SMS). `DEV_OTP_CODE` is the only code when set (Docker `.env.example`: `123456`;
  staging: a secret in `/opt/tamiltaxi/.env` and `credentials.local.md`); without it (`start:dev`) any 6 digits except
  `000000`, which production refuses to start with. Admin phone: `9000000001`. Ride OTP `4829`,
  delivery OTP `7153`.
- **Fare engine** (same in the apps and the API): `max(minFare, (base + perKm·km + perMin·min) × multiplier)`,
  multiplier ≤ `maxMultiplier` (1.5) and never applied to the minimum-fare top-up,
  each line rounded down. No peak by default (`currentMultiplier` 1.0): demo quotes Bike ₹35, Scooty ₹39, Auto ₹66,
  Auto Priority ₹80, Mini ₹132, Sedan ₹158, SUV ₹210 (tiers: `using.tech.md` 6f; `CAB` is "Mini").
- **H3:** res 8 for service areas, zones, the driver index and heatmaps; res 7 for demand and surge; res 9/8/7 for
  learned ETA.
- **Android:** Impeller is forced to OpenGL ES (Vulkan lagged on MediaTek/Mali). Release signing uses debug keys for now.
- **Local Redis runs on port 6380** on this machine (set in `.env`).
- **Staging:** single EC2 at `65.0.233.253`: `https://api.65-0-233-253.sslip.io/v1`, `https://admin.65-0-233-253.sslip.io` (Caddy, compose profile `https`; old `:3000` / `:3001` still open). Images are built locally and loaded over
  SSH. For redeploy steps see `using.tech.md` §9b.

---

## 5. Changelog of this file

| Date | Change |
|---|---|
| 26 Sep 2026 | Created: working rules (commit every change, docs, checks), repo map, commands, key facts |
| 26 Sep 2026 | Free app: intro updated (no subscription, contributions), `app-config` module added to the map |
| 29 Sep 2026 | Open source (AGPL-3.0): contributor note, `DEV_OTP_CODE`, new docs and folders in the map |
| 30 Sep 2026 | Website `apps/web` (static Next.js): `web` scope, checks row, repo map, dev command |
| 1 Oct 2026 | Repo map: `scripts/footer_art` (passenger home footer line art) |
| 29 Sep 2026 | Renamed Rido → Tamil Taxi: `@tamiltaxi/*`, `tamiltaxi_ui` / `tamiltaxi_data`, `Tt*` classes, `com.tamiltaxi.*`, DB `tamiltaxi` |
| 1 Oct 2026 | `docs/design` is now screenshots of the apps: `scripts/export_design.py` command, repo map line |
| 1 Oct 2026 | Rule: no built-in city (cities come from the database) |
| 2 Oct 2026 | Repo map: `scripts/footer_art` removed (the home footer is a picture now) |
| 6 Oct 2026 | Intro: the Contribute page is gone (the owner pays the running costs) |
| 6 Oct 2026 | Rule 1.2 and repo map: `system-design-notes.md` (design learnings + optimization backlog) |
