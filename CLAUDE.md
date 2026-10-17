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
- **[docs/RELEASES.md](docs/RELEASES.md)** tracks every app version sent to Google Play and every staging deploy;
  GitHub mirrors it (releases, milestones) on each push. An app change (`apps/passenger`, `apps/driver`, or a package
  they use) goes under that app's "Next release" in the same commit; a new upload raises `version:` in `pubspec.yaml`
  and gets its own entry. App changes ship together in the next release. Upcoming work is GitHub issues by milestone
  (public: no security gaps or business plans).
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
- **Staging deploys are pre-approved:** the owner gave Claude standing, explicit permission (10 Oct 2026) to deploy
  the API and admin to the staging EC2 without asking, including the AWS steps a deploy needs (e.g. allowing the
  current IP for SSH in `rido-sg`). Follow `using.tech.md` §9b (database backup, rollback image, health checks) and
  record each deploy there and in [docs/RELEASES.md](docs/RELEASES.md) (Staging). Pushing to git still needs to be
  asked for (1.1).
- **Admin is on a new Next.js (16):** read [apps/admin/AGENTS.md](apps/admin/AGENTS.md) and the docs in
  `node_modules/next/dist/docs/` before writing admin code.
- **Prisma queries are lazy:** `void prisma.x.create(...)` never runs. Always `await` or attach `.catch()`.
- **No built-in city:** Tamil Taxi scales city by city. Never hard-code a city name, centre or bounds in runtime code:
  read the `City` rows (API `GeoService`, apps `serviceCitiesProvider` / `CityDefaults`, admin `cityView`). Seed and
  demo data may name Coimbatore.

### 1.5 Coding behaviour

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

#### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

#### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

#### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

#### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and
clarifying questions come before implementation rather than after mistakes.

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
  tamiltaxi_whatsapp_otp/        Android plugin: WhatsApp OTP autofill (zero-tap / one-tap login codes) in both apps
docs/tech-docs/using.tech.md     technical reference (source of truth)
docs/COST_AND_SCALING.md         running cost per trip, free tiers, P-10 ETA + OSRM plans, scaling stages
docs/tech-docs/system-design-notes.md  design learnings vs our system + optimization backlog (SD-n)
docs/private/                    owner-only business docs (git-ignored, never publish)
.github/                         CI workflow, issue + PR templates
docs/design/                     screenshots of every app screen + index (scripts/export_design.py)
docs/design/assets/              logos (masters), Play Store icons, vehicle art, pictures, colours: see its README
docs/RELEASES.md                 every app version and staging deploy + next release (synced to GitHub releases)
docs/play-store/                 Play Console answers (both apps), rider store graphics, pre-upload checklist
scripts/                         flutter.sh / dart.sh (SDK lookup), build_apks.sh, export_design.py, brand_icons.py, vehicle_icons/
docker-compose.yml               postgres + redis + api + admin (+ `tools` profile: Adminer, Redis Insight)
```

Flutter app layout: `lib/router` (go_router 17, **pinned**: 18 needs `material_ui`), `lib/state` (Riverpod 3 flow
controllers), `lib/features/<feature>/` (one file per screen, named after its frame ID, e.g. `P10ChooseVehicleScreen`),
`lib/features/design_gallery/` (frame registry + demo controls).

API modules: admin, app-config, auth, automations (reminder pushes and campaigns), drivers, fares, geo (H3), health, kyc (Didit identity checks), maps, notifications (FCM), places, promos (splash and Home banners), realtime, settings,
subscriptions, support, trips, users.

---

## 3. Common commands

```bash
npm install && npm run get            # deps + flutter pub get + prisma generate
npm run check                         # analyze + test everything (Turborepo, cached)
npm run passenger | npm run driver    # flutter run
./scripts/build_apks.sh [passenger|driver]   # one release APK per app → dist/ (debug-signed)
../../scripts/flutter.sh build appbundle     # in apps/<app>: Play bundle, signed with android/key.properties
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
  `000000`, which production refuses to start with. Admin phone: `9000000001`. Mock-mode ride OTP `4829`,
  delivery OTP `7153`. Live: **one ride OTP per rider** (`User.rideOtp`, Rapido style: speed over a code per ride);
  admins change it when overheard. Parcels and rides for someone else get a one-time code.
- **Fare engine** (same in the apps and the API): `max(minFare, (base + perKm·km + perMin·min) × multiplier)`,
  multiplier ≤ `maxMultiplier` (1.5) and never applied to the minimum-fare top-up,
  each line rounded down. No peak by default (`currentMultiplier` 1.0): demo quotes Bike ₹35, Scooty ₹39, Auto ₹66,
  Auto Priority ₹80, Mini ₹132, Sedan ₹158, SUV ₹210 (tiers: `using.tech.md` 6f; `CAB` is "Mini").
- **H3:** res 8 for service areas, zones, the driver index and heatmaps; res 7 for demand and surge; res 9/8/7 for
  learned ETA.
- **Android:** Impeller is forced to OpenGL ES (Vulkan lagged on MediaTek/Mali). Release APKs use the debug keys; Play bundles use the upload key in `android/key.properties` (git-ignored).
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
| 6 Oct 2026 | Key facts: one ride OTP per rider (live), mock codes labelled |
| 10 Oct 2026 | Rule 1.5: coding behaviour (think first, simplicity, surgical changes, verifiable goals) |
| 10 Oct 2026 | Rule 1.4: staging deploys (and the AWS steps they need) are pre-approved |
| 14 Oct 2026 | Repo map: `docs/design/assets/` (logo masters and other design assets) |
| 15 Oct 2026 | Repo map: `packages/tamiltaxi_whatsapp_otp` (WhatsApp OTP autofill plugin) |
| 15 Oct 2026 | API modules: `automations` (reminder pushes and campaigns) |
| 16 Oct 2026 | Repo map: `docs/play-store/` (Google Play submission answers and graphics) |
| 16 Oct 2026 | Commands + key facts: Play bundles signed with the upload key; APKs stay debug-signed |
| 17 Oct 2026 | Rule 1.2: app versions, staging deploys and the next release in `docs/RELEASES.md`, mirrored to GitHub releases and milestones |
