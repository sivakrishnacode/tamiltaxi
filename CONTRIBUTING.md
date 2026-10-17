# Contributing to Tamil Taxi

Thanks for helping. Tamil Taxi is a free ride-hailing and parcel app: drivers pay no commission and no subscription.
Every contribution that makes it better, or cheaper to run, helps drivers keep more of what they earn.

You don't need to know the whole stack. Flutter developers, TypeScript / NestJS developers, designers, testers,
people who know Indian mobility rules, and people who can fix OpenStreetMap roads in Coimbatore are all welcome.

## Ways to help

| You know | Good places to start |
|---|---|
| Flutter / Dart | Passenger and driver screens (`apps/*/lib/features`), the shared widgets (`packages/tamiltaxi_ui`), widget tests |
| TypeScript / NestJS | API modules (`apps/api/src/modules`): dispatch, fares, maps, notifications |
| React / Next.js | The admin panel (`apps/admin`) |
| DevOps | CI, backups, [self-hosted OSRM](docs/COST_AND_SCALING.md#6-change-2-self-hosted-osrm) |
| Maps / GIS | H3 zones, ETA models, OpenStreetMap data quality |
| Testing | Real-phone passes with two phones (a rider and a driver), bug reports with steps |
| Design / writing | UI polish, Tamil translations, docs |

Open work is listed in [using.tech.md §10 "Not done yet"](docs/tech-docs/using.tech.md#10-not-done-yet--next-steps)
and [docs/COST_AND_SCALING.md](docs/COST_AND_SCALING.md). Issues labelled `good first issue` are small and
self-contained.

**Before a big change,** open an issue first, so we can agree on the approach before you spend time on it.

## Set up

Prerequisites:

- Node 24 and npm 11
- Flutter stable (Dart 3.9 or newer), plus an Android device or emulator
- Docker, for Postgres and Redis

The Flutter SDK is found through `$FLUTTER`, your `PATH`, or `~/development/flutter`.

```bash
git clone https://github.com/<you>/tamiltaxi.git && cd tamiltaxi
npm install && npm run get      # JS deps, flutter pub get everywhere, prisma generate
npm run check                   # analyze + test everything: should pass before you change anything
```

### Pick how you run the apps

| Mode | Command | Needs |
|---|---|---|
| **Mock** (no backend, seed data, simulated trips) | `cd apps/passenger && sh ../../scripts/flutter.sh run --dart-define=TT_LIVE_API=false` | Nothing else |
| **Your own backend** | Start the backend (next section), then `flutter run --dart-define=TT_API_URL=http://10.0.2.2:3000/v1` (emulator) or your PC's LAN IP (phone) | Docker |

Without either flag the apps talk to the maintainer's staging server, which is for the maintainer's testing. Please
use mock mode or your own backend for development.

### Run the backend locally

```bash
cp .env.example .env
docker compose up -d                  # Postgres + Redis + API :3000 + admin :3001
curl localhost:3000/health/ready
```

- **Sign in:** OTP `123456` (`DEV_OTP_CODE` in `.env`). The admin phone is `9000000001`.
- **Trip OTPs:** ride `4829`, delivery `7153`.

For API work with hot reload:

```bash
docker compose up -d postgres redis
cp apps/api/.env.example apps/api/.env
npm run prisma:deploy -w @tamiltaxi/api && npm run prisma:seed -w @tamiltaxi/api
npm run start:dev -w @tamiltaxi/api        # any 6-digit OTP except 000000 signs in
npm run seed:test-drivers -w @tamiltaxi/api  # 11 approved drivers (cab, bike, auto, goods…) to sign in as
```

Google Maps keys are optional: without them the apps use CARTO tiles and the API uses seeded places and straight-line
distances. To use Google, see [docs/GOOGLE_MAPS_SETUP.md](docs/GOOGLE_MAPS_SETUP.md).

## Making a change

How issues, labels, milestones and releases work here: [docs/GITHUB.md](docs/GITHUB.md).

1. **Fork, then branch** from `main`: `feat/driver-demand-chip`, `fix/api-trip-cancel`.
2. **Keep it to one logical change per pull request.** Split unrelated fixes into separate PRs.
3. **Match the code around you:** naming, comment density, file layout.
   - Flutter screens live in `lib/features/<feature>/`, one file per screen, named after its design frame ID
     (`P10ChooseVehicleScreen`). Screenshots of every screen are in [docs/design/](docs/design/index.md) (`python3 scripts/export_design.py` refreshes them).
   - State lives in Riverpod controllers in `lib/state/`.
   - One NestJS module per domain in `apps/api/src/modules/`.
4. **Add or update tests** for what you change (see the table below).
5. **Update the docs in the same PR.** [docs/tech-docs/using.tech.md](docs/tech-docs/using.tech.md) is the technical
   source of truth: update it when you change the stack, env vars, endpoints, settings or infra. Update the README
   when setup changes.
6. **Run the checks** and open the PR. Fill in the template.

### Checks

| You changed | Run |
|---|---|
| Flutter (`apps/passenger`, `apps/driver`, `packages/*`) | `npm run analyze && npm test`, or `npx turbo run analyze test --filter=@tamiltaxi/driver` |
| API | `npm run analyze -w @tamiltaxi/api && npm test -w @tamiltaxi/api`; for flows or DB changes also `npm run test:e2e -w @tamiltaxi/api` |
| Admin | `npm run analyze -w @tamiltaxi/admin && npm test -w @tamiltaxi/admin` |
| Anything | `npm run check` must pass with **zero analyzer issues**. CI runs it on every PR |

### Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org): `<type>(<scope>): <summary>` (72 characters or
fewer, imperative).

| type | | scope | area |
|---|---|---|---|
| `feat` `fix` `refactor` `perf` `test` `docs` `chore` `revert` | | `api` `admin` `passenger` `driver` `ui` `data` `infra` `repo` | the folder you changed |

Examples:

- `feat(driver): show H3 demand hexes on home map`
- `fix(api): await Prisma write in trip cancel`

## Project rules worth knowing

- **Running cost matters.** The owner pays the servers and maps bills for a free app. Don't add paid API calls on a
  timer or per GPS update. Cache Google responses. Say in the PR if a change adds paid calls. See
  [docs/COST_AND_SCALING.md](docs/COST_AND_SCALING.md) and the cost rules in
  [using.tech.md §7](docs/tech-docs/using.tech.md#7-maps-and-location).
- **The fare engine exists twice,** in `packages/tamiltaxi_data` (apps) and `apps/api` (server). Both run the shared cases
  in `packages/tamiltaxi_data/test/fixtures/fare_cases.json`, so change both together.
- **Prisma queries are lazy.** `void prisma.x.create(...)` never runs: always `await` it or attach `.catch()`.
- **Admin runs on Next.js 16.** Read [apps/admin/AGENTS.md](apps/admin/AGENTS.md) before writing admin code; APIs
  differ from older Next.js versions.
- **`go_router` is pinned to 17.x.** Version 18 needs `material_ui`, which breaks theming.
- **Never commit secrets:** `.env`, `.dart-defines.json`, `google-services.json`, keystores, Firebase service
  accounts. They are git-ignored; keep it that way.
- **AI assistants are fine.** [CLAUDE.md](CLAUDE.md) holds the working rules for coding agents. You're responsible
  for what you submit either way.

## Licence

Tamil Taxi is licensed under the [GNU AGPL-3.0](LICENSE). By opening a pull request, you agree that your contribution is
released under the same licence. The vendored `packages/flutter_overlay_window` keeps its own MIT licence.

## Conduct

Be kind and assume good intent. This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
