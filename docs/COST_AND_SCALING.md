# Running cost and scaling plan

What it costs to run Tamil Taxi, how long the free tiers last, and what to change as trips grow. Tamil Taxi is free for
drivers and riders (0% commission, no subscription), so running cost per trip is the number that matters.

Last updated: 29 Sep 2026. Prices are list prices at $1 = ₹88. Recheck them before acting on this.

---

## 1. Summary

- **Up to ~300 trips/day the app costs ₹2–6k a month**, whichever maps setup is used. It is mostly the server.
- **After that, Google Maps is the main cost.** At 1,000 trips/day, Google as used today costs ₹1.4 lakh a month.
  Self-hosted routing (OSRM) brings that down to about ₹19k.
- **The free tiers are about trips per day, not a date.** Google's free monthly calls reset every month. The first
  one to run out is the Route Matrix, at about 90 trips/day.
- Two changes keep costs low: the **P-10 ETA change** (small, §5) and **self-hosted OSRM** (§6).

---

## 2. What runs today

| Part | Service | Cost today |
|---|---|---|
| API, admin, Postgres, Redis, Caddy | One AWS EC2 t3.small (2 vCPU, 2 GB) in Mumbai, Docker Compose | About ₹1,950/month (EC2 + 20 GB disk + public IPv4), or ₹0 while AWS free-plan credits last |
| Maps, place search, addresses | Google Maps Platform | ₹0 (inside the free monthly calls) |
| Push notifications | Firebase Cloud Messaging | Free |
| Live tracking, trip events | Socket.IO on our API | Free (no Google calls during a trip) |
| Driver identity checks | Didit | 500 sessions/month free (about 250 new drivers) |
| OTP SMS | Not live yet (dev OTP) | From launch: about ₹0.15–0.25 per OTP (MSG91 or similar) |

Measured capacity of the t3.small: about 300–500 online drivers, 5 bookings/s at peak, 5,000–10,000 trips/day
(see [using.tech.md §9b](tech-docs/using.tech.md#9b-aws-deployment-single-ec2-low-cost)).

---

## 3. Google Maps calls per trip

How the code calls Google today, and what one trip costs.

| Step | Google call | SKU (India, per 1,000) | Calls |
|---|---|---|---|
| Search the drop | Place Details (ends the autocomplete session, so keystrokes are free) | Essentials, ~$1.50 | 1 per search |
| Move the pickup pin | Geocoding (cached 30 days on an ~11 m grid) | ~$1.50 | ~0.65 per search |
| Fare quote | Routes, `vehicleStopover` + `TRAFFIC_AWARE` (cached 6 h) | **Pro**, $3 | 1 per search |
| P-10 "3 min away" | Route Matrix per missing H3 cell (cached 10 min) | Essentials, $1.50 per element | ~5 elements per search |
| Dispatch ranking | Route Matrix (mostly cache hits after P-10) | Essentials, $1.50 per element | ~3 elements per booking |
| Offer card, trip ETA | Routes, no stopover | Essentials, $1.50 | ~2 per booking |

People search more often than they book. Namma Yatri's public numbers show **about 4.6 searches per completed trip**,
and every search pays for the quote and the P-10 ETAs. With that ratio:

- **Per completed trip: about ₹5–6 in Google calls** (about ₹1.5 if every search books).
- The Route Matrix is about 70% of it.

### Free monthly calls and when they run out

| Product | Free per month | Runs out at |
|---|---|---|
| Route Matrix (Essentials) | 70,000 elements | **~90 trips/day**, the first limit |
| Routes Pro | 35,000 calls | ~250 trips/day |
| Place Details (Essentials) | ~70,000* | ~500 trips/day |
| Geocoding | ~70,000* | ~780 trips/day |

\* The Routes figures come from [using.tech.md §7](tech-docs/using.tech.md#7-maps-and-location). The Places and
Geocoding prices and free caps are assumed at the India Essentials rate. Check them on Google's SKU page.

---

## 4. Monthly cost by setup

| Setup | What it means |
|---|---|
| **A** | Google for everything, as the code is today |
| **B** | A + the P-10 change (§5) |
| **C** | Self-hosted OSRM for routes, the matrix and ETAs; Google only for place search and addresses (§6) |
| **D** | Fully self-hosted: OSRM, plus Photon / Nominatim and our own places table for search |

### Monthly total

| Trips/day | A | B | C | D |
|---|---|---|---|---|
| **100** | ₹3k | **₹2k** | ₹3.3k | ₹6k |
| **300** | ₹25k | **₹4k** | ₹3.6k | ₹6.3k |
| **1,000** | ₹1.37 L | ₹53k | **₹19k** | ₹10k |
| **5,000** | ₹8.6 L | ₹4.5 L | ₹1.55 L | **₹31k** |

### Per trip

| Trips/day | A | B | C | D |
|---|---|---|---|---|
| 100 | ₹1.0 | ₹0.7 | ₹1.1 | ₹2.0 |
| 300 | ₹2.8 | ₹0.4 | ₹0.4 | ₹0.7 |
| 1,000 | ₹4.6 | ₹1.8 | ₹0.6 | ₹0.3 |
| 5,000 | ₹5.7 | ₹3.0 | ₹1.0 | ₹0.2 |

Self-hosting costs **more** at low volume: OSRM needs a bigger server, while Google is free up to its limits. It
pays off from about 500 trips/day.

### Breakdown at 1,000 trips/day

| Item | A | B | C | D |
|---|---|---|---|---|
| Route Matrix (driver ETAs) | ₹94k | ₹10.5k | 0 | 0 |
| Routes Pro (fare route) | ₹27k | ₹27k | 0 | 0 |
| Place Details (search) | ₹9k | ₹9k | ₹9k | 0 |
| Geocoding (pin → address) | ₹2.6k | ₹2.6k | ₹2.6k | 0 |
| Servers | ₹3.2k (t3.medium) | ₹3.2k | ₹5.9k (t3.large + OSRM) | ~₹9k (+ geocoder) |
| SMS OTP | ₹1.2k | ₹1.2k | ₹1.2k | ₹1.2k |
| **Total** | **₹1.37 L** | **₹53k** | **₹19k** | **₹10k** |

### Assumptions

- **Usage:** 4.6 searches per booked trip. A new app may see 2–3, which cuts columns A and B by up to half.
- **Google pricing:**
  - Routes prices and free caps are from the India list in [using.tech.md §7](tech-docs/using.tech.md#7-maps-and-location).
  - Google's volume discounts above 100k calls/month are left out, so A at 5,000 trips/day is 20–30% high.
- **AWS:** Mumbai on-demand prices.
- **SMS:** one OTP for about every five trips.
- **Not included:** Didit checks after the free 500, the domain, Play Store fees.

For comparison, Namma Yatri reports about ₹2 per ride on maps after moving to OpenStreetMap, against ₹12–15 for
other ride-hailing apps.

---

## 5. Change 1: P-10 ETAs without Google

**Status:** planned. **Size:** small, about an hour.

P-10 (the vehicle list) shows "3 min away" for each vehicle type. It measures the nearest 3 drivers per type with
`EtaService.minutesMany` ([fares.service.ts](../apps/api/src/modules/fares/fares.service.ts)), which is also
what dispatch uses ([dispatch.service.ts](../apps/api/src/modules/trips/dispatch.service.ts)). Both pass
`useRoad: s.useRoadEta`, so each search can make a Route Matrix call.

**The change**

- Add a setting `useRoadEtaQuotes`, default `false`, separate from `useRoadEta`, which stays on for dispatch.
- `withPickupEta` passes `useRoad: s.useRoadEtaQuotes`.
- P-10 then uses, in order:
  1. the learned hex-pair speed (`HexStatsService`), when there is enough trip data;
  2. otherwise the straight-line estimate (× 1.3 at 20 km/h).

  These are cached under `eta:est:*` and never call Google.
- Admin can switch it back on in Settings.

**Effect**

- Matrix elements per trip fall from ~20 to ~5.
- The matrix free tier then lasts to about 450 trips/day, instead of about 90.

**Trade-offs**

- P-10 ETAs get less accurate across rivers, railway lines and flyovers. Dispatch still ranks by road ETA, so the
  driver who gets the trip doesn't change.
- The shown ETA can jump between P-10 ("3 min") and the assigned driver's card ("6 min"). Two ways to soften it:
  - round P-10 up, or show "~3 min";
  - learn an hour-of-day fallback speed from real pickup legs (acceptance → arrival against distance).

**What comes next:** the fare route (Routes Pro, 35k free) becomes the limit at about 250 trips/day. Dropping
`vehicleStopover` and `TRAFFIC_AWARE` would move it to Essentials, but those were added on purpose. OSRM is the
better fix.

---

## 6. Change 2: self-hosted OSRM

**Status:** planned. **Size:** phase A about 1–2 days.

[OSRM](https://project-osrm.org) is an open-source routing engine (C++) that runs on
[OpenStreetMap](https://www.openstreetmap.org) data. It runs as one Docker container, and every call is free.

| OSRM endpoint | Replaces | Notes |
|---|---|---|
| `/table` | Route Matrix (P-10, dispatch) | Many-to-many and fast, so dispatch can rank 50 drivers instead of 10 |
| `/route` | Single ETAs and fare routes | `alternatives=true` covers "shortest of the alternatives"; returns an encoded polyline like Google's |
| `/nearest` + `approaches=curb` | `vehicleStopover` (partly) | Snaps a pin to a road; weaker than Google at telling a flyover from the service road under it |
| `/match` | Nothing yet | Snaps trip GPS breadcrumbs to roads, for a better actual distance and fare sanity check |

### Setup

1. **Data.** Download the [Geofabrik](https://download.geofabrik.de/asia/india.html) India southern-zone
   extract. Cut it to the service area with `osmium extract` (`COIMBATORE_BOUNDS` 10.75,76.69 → 11.29,77.24 plus a
   margin), which leaves a file of tens of MB.
2. **Preprocess.** `osrm-extract -p car.lua`, then `osrm-partition` and `osrm-customize` (MLD). Run this in a script
   on a laptop or in CI, and ship the output files.
3. **Run.** Add an `osrm` service to `docker-compose.yml` on the internal network (port 5000, not public).
   - A Coimbatore-only extract needs about 300–600 MB RAM.
   - That is tight on the t3.small next to Postgres, Redis, the API and admin. Fine on a t3.medium or its own
     small instance.
4. **Refresh.** A monthly `scripts/osrm_update.sh` (download, cut, preprocess, restart). OSM road fixes show up
   after the next refresh.

### Code

- **New client.** An `OsrmClient` in `apps/api/src/modules/maps/`, with `route`, `table` and `nearest`. It returns the
  same `RoadRoute` / `MatrixLeg` shapes as `GoogleMapsClient`, so nothing upstream changes.
- **Provider settings in `MapsService`:**
  - `etaProvider` (`osrm | google`): the matrix and single ETAs;
  - `fareRouteProvider` (`google | osrm`): fare routes.
- **Fallback chain:** OSRM → Google → straight-line estimate.
- **Cache keys:** separate prefixes (for example `eta:osrm:*`), so the two providers' results never mix.
- **Vehicle profiles:** start with `car.lua` for every vehicle, as today (all vehicles use Google's DRIVE mode). A
  custom two-wheeler profile for bike taxis can come later.

### What we lose and how to cover it

- **No live traffic.** OSRM gives free-flow times, so ETAs run short at peak hours.
  - Fix: scale OSRM minutes by a factor learned per hour and per H3 area (real pickup time ÷ OSRM time).
    `HexStatsService` already has the data.
  - **Fares are not affected:** duration uses the fixed 18 km/h model, and only distance comes from the router.
- **Distance can differ from Google by a few percent** (missing roads or one-ways in OSM), which shifts fares slightly.
  - Fix: run both in **shadow mode** first, while Google is still free. Log OSRM against Google distance and time
    for every quote for 1–2 weeks. Switch once the median difference is under about 5%, and fix the worst roads in
    OSM ourselves.
- **Stop snapping is weaker.** Keep Google for fare routes the longest.
- **Attribution.** Show "© OpenStreetMap contributors" where OSRM routes are drawn (ODbL). There is no caching
  limit, so routes can be stored forever.

### Rollout

| Phase | Work | Google calls removed |
|---|---|---|
| A | Docker service, data script, `OsrmClient`, shadow logging | None (measuring) |
| B | `etaProvider=osrm`: P-10 and dispatch ETAs | Route Matrix and single ETAs (~70% of routes usage) |
| C | `fareRouteProvider=osrm` once shadow data looks good | Routes Pro |
| D | `/match` for trip distance (optional) | None; better data |

After phase C, Google is left with place search and pin addresses, about **₹0.3–0.5 per trip**.

### Why not replace place search too (yet)

OpenStreetMap has few shops, hospitals and apartment names in Coimbatore, and riders search by those. Photon or
Pelias on OSM would be free, but search quality decides whether riders stay. Until then, save every place riders
pick into our own `places` table. Also consider Ola Maps or Mappls (MapmyIndia), which have better Indian place
data than OSM and cost less than Google.

---

## 7. Scaling plan

| Stage | Trips/day | Infra | Maps | Monthly |
|---|---|---|---|---|
| **0: pilot** | under 100 | t3.small as it is | Google, inside the free tier | ~₹2k |
| **1: launch** | 100–300 | Same server, plus a domain, nightly `pg_dump` to S3, an SMS provider | **B** (P-10 change); start OSRM shadow mode around 200/day | ₹2–4k |
| **2: growth** | 300–1,000 | t3.medium or t3.large (the Elastic IP moves over) with OSRM | **C** | ₹4–19k |
| **3: scale** | 1,000–5,000 | RDS Postgres, 2 API instances behind an ALB, Socket.IO Redis adapter (needed before a second API process), OSRM on its own instance | C, with our own places table growing | ₹19k–1.5 L |
| **4: more cities** | 5,000+ | ECS, a Postgres read replica, one OSRM dataset per state | **D**, or Ola Maps / Mappls for search | ~₹0.2–1 per trip |

The limits of the single server, in the order they are hit:

1. One Node process.
2. t3 CPU credits. The instance runs "unlimited", so sustained load bills extra, about $0.05 per vCPU-hour.
3. 2 GB RAM shared with Postgres and Redis.
4. No failover.

### Before a public launch

- [ ] Real domain; set `API_HOST` / `ADMIN_HOST`, rebuild the apps with `TT_API_URL`.
- [ ] SMS provider in `OtpService.deliver`, then `OTP_DEV_MODE=false`.
- [ ] Automated Postgres backups to S3.
- [ ] P-10 change (§5).

### How to track real cost

Each month, check the AWS, Google Cloud and SMS invoices. Compare the Google bill with §3 to see whether the searches-per-trip ratio holds.
