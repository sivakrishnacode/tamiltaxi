# System design notes

What we learn about how real-time ride-hailing systems are built, compared with what Tamil Taxi does, and the
optimizations that follow. [using.tech.md](using.tech.md) says what the system **is**; this file says what we
**learned** and what we might **change**, and when.

**How to keep it:** each time we find something (a talk, a blog post, a competitor's app, a load test, a production
problem), add a dated entry to section 3 and put any optimization it suggests in the backlog (section 4) with a trigger.
When a backlog item ships, mark it **Done (date)** and describe the change in `using.tech.md`.

Last updated: 6 Oct 2026 (created from two talks: Uber's real-time map, and the "design Uber" interview answer; ride OTP: decided one code per rider; SD-1, SD-3 and SD-5 done)

---

## 1. Principles

1. **Push, don't poll.** The server sends changes when they happen. Polling is only a fallback while the socket is
   down, plus one catch-up poll after each reconnect.
2. **H3 for anything "near".** Search hexagon rings around a point; never measure distance to every driver.
3. **Catch-up instead of guaranteed delivery.** Socket.IO delivers at most once. After a reconnect the apps re-read
   state over HTTP (trip, open offers, chat), so a missed push costs a few seconds, not a stuck screen.
4. **An honest map.** Live mode shows only real free drivers. No phantom cars, ever. Positions are rounded to about
   55 m and headings to 15°, and a car's marker id changes every hour, so riders can't follow a driver home. Gliding
   only fills the seconds between real fixes; it never invents cars or stretches far past the last fix (40 m).
5. **Cheapest thing that works.** One t3.small runs everything. An optimization waits for a measured need or a
   scaling stage ([COST_AND_SCALING.md](../COST_AND_SCALING.md) §7).

## 2. Real-time channels today

| Data | Path | Rate | Fallback |
|---|---|---|---|
| Driver GPS → server | Socket.IO `driver:location` | every 5 s, or after 20 m moved (at most every 2 s) | HTTP heartbeat every 30 s; up to 500 fixes buffered on the phone and sent in one batch |
| Driver index | Redis set `h3:drv:<kind>:<res-8 cell>` + `driver:alive:<id>` (90 s TTL) | each fix | stale members pruned during searches |
| Driver position → rider (on a trip) | `trip.location` to room `trip:<id>`; the app glides the car between fixes (`VehicleGlide`) | each accepted fix (~5 s) | `driverLocation` in `GET /trips/:id` / `/trips/active` (restore, every poll) |
| Trip status | `trip.updated` / `trip.no_drivers` pushes | on change | rider polls `GET /trips/:id` every 8 s **only while the socket is down**, once after reconnect |
| Offers → driver | `trip.offer` push + FCM (app in background or killed) | on dispatch | `currentOffers` poll every 15 s while the socket is down |
| Free vehicles near a pickup (P-07, P-10, P-12) | `GET /drivers/nearby`, **polled**; hourly marker ids, cars glide ~1.8 s to each new place | every 15 s while shown | keeps the last list |
| Driver demand map | `GET /demand/hotspots`, polled; server cache 60 s | every 2 min | — |
| Surge | `DemandService` every 60 s, res-7 cells, k-ring smoothed | 60 s | — |

Transport facts: the apps use the websocket transport only (no long-polling), so a load balancer needs no sticky
sessions. There is one API process and no Socket.IO Redis adapter yet. One region (ap-south-1, Mumbai).

## 3. Learnings log

### 6 Oct 2026: Uber's real-time map

Source: "The Genius System Behind the Uber App's Real-Time Map" (YouTube, `gHIs0Mdow8M`); background: Uber's RAMEN and
H3 engineering posts.

What Uber does:

- **Polling hurt them.** At one point 80 % of the app's requests were polls. Polls that find nothing are wasted load,
  drain battery, carry header overhead, and slowed cold start because several polls competed before the UI could draw.
- **Push pipeline (RAMEN):** *Fireball* decides **when** to push (listens to events and drops location changes too
  small to matter); the API gateway decides **what** (adds locale, OS and so on to the payload); RAMEN servers decide
  **how** (first SSE, now gRPC both ways, with at-least-once delivery).
- **H3 instead of distance checks:** a point maps to a hexagon; "nearby" is the k-ring (k = 1 → 7 cells). Cost goes
  from O(all drivers) to O(k² + drivers found). Hexagons avoid the corner bias of squares. The same grid serves surge,
  ETA and demand forecasting.
- **Edge servers** near users cut ~100 ms per request on 4G compared with a server 10,000 km away.
- **Smooth markers:** dead reckoning (keep the last speed and direction to predict where the car is now) blended with
  measured fixes by a Kalman filter, so cars glide instead of jumping when fixes are late or sparse.
- **Phantom cars:** people claim Uber shows cars that don't exist to avoid an empty map. Uber denies it.

How Tamil Taxi compares:

| Uber idea | Tamil Taxi | Verdict |
|---|---|---|
| Push instead of polling | Trip status, offers, driver GPS and chat are pushed over Socket.IO; offers also go by FCM. Polling only while the socket is down | **Matches** |
| Polling waste | Two polls remain on purpose: nearby vehicles (15 s) and the demand map (2 min, server-cached) | Fine at this size; nearby needs the cache in SD-2 before launch |
| Fireball (when to push) | The driver app filters (5 s / 20 m); the server forwards every accepted fix to the trip room. `DispatchService` and `NotifierService` decide event pushes | Enough while only the trip's rider watches a driver; see SD-11 |
| Gateway enrichment (what to push) | Pushes carry the full trip JSON; the app needs no follow-up read | Fine |
| At-least-once delivery | Socket.IO is at most once; we catch up over HTTP after reconnects. Trip JSON has no `updatedAt`, so apps order updates by status rank | Gap: SD-4 |
| H3 k-ring search | `DriverLocationService.nearby`: pickup res-8 cell, then ring 1, ring 2 … up to the radius; **stops after the first ring with enough drivers**. Res 7 for surge and demand, res 9/8/7 for learned ETA | **Matches**, including the O(k² + m) cost |
| Edge servers | One EC2 in Mumbai, ~1,000 km from Coimbatore | Not needed: the round trip is small next to 4G latency. Revisit only for far-away cities |
| Dead reckoning + Kalman filter | The rider's driver marker **jumps** to each fix (~5 s apart). Heading comes from the last two points (3 m threshold); the GPS heading the server sends is ignored. Nearby markers jump every 15 s and have no ids | **Biggest gap** then; fixed the same day (SD-1, SD-3, SD-5) |
| Phantom cars | None in live mode. Mock mode (`TT_LIVE_API=false`) shows a fixed demo mix | Keep it so (principle 4) |

Numbers worth keeping:

- Driver GPS costs about 7 Redis round trips per fix on the server. 1,000 online drivers at one fix per 5 s is
  200 fixes/s, about 1,400 Redis ops/s: easy for one Redis. Ingest is not a bottleneck before stage 3.
- `GET /drivers/nearby` runs `nearby()` for 6 vehicle kinds (3 km → up to 5 rings, 61 cells), then 2 Redis calls per
  driver found, one after another, then `lastFix` again for each returned car. Not cached. Every rider on Home calls it
  every 15 s. This is the hottest read path today.

### 6 Oct 2026: the "design Uber" interview answer

Source: "Uber - System Design Interview Question (Ride Sharing Service)" (YouTube, Tech Prep). It is a textbook
design for 100 M daily users, so it shows the shape of the system rather than Uber's real setup.

What it proposes:

- **Scope:** ride request (pickup, drop, nearby drivers, fare estimates), matching, live tracking with ETA, push
  notifications. Needs: scale with regional spikes, 24/7 availability (switching apps costs riders nothing), low
  latency on poor mobile networks.
- **Data:** riders, drivers, vehicles, fares (base + surge multiplier, each estimate stored with an id), rides
  (status requested → accepted → completed / cancelled), payments.
- **REST:** `POST /fares/estimate` → `POST /rides/request {fareId}` → `PUT /rides/:id/accept`, with the user's id from
  the JWT, never from the body.
- **Transport:** long polling (simple, heavy), SSE (server → client only), WebSocket (both ways, the usual choice),
  QUIC / HTTP/3 (faster setup, no head-of-line blocking, copes with packet loss; Uber uses it in production).
- **Driver location flow:** driver WebSocket servers → a location queue → location service → geohash → Redis with
  expiry for inactive drivers. Updates every 10–15 s.
- **Indexing options:** geohash (simple, cells change size with latitude), quadtree (adapts to density, complex),
  H3 (even neighbours, best for k-nearest). The talk picks geohash for simplicity.
- **Ride flow:** the rider's socket server subscribes to a per-rider Kafka topic; the booking goes to a driver
  assignment queue (decouples booking from matching); matching searches the pickup cell, then neighbours; drivers are
  scored; a Redis lock offers the ride to one driver at a time with a 15 s timeout; FCM / APNs for pushes; accept is
  an atomic status change; the rider is told through their topic.
- **Scaling and operations:** Redis Cluster + Sentinel, Postgres read replicas then sharding, socket servers behind
  sticky sessions or TCP load balancing with heartbeats, JWT + role checks, TLS, encryption at rest, Prometheus +
  Grafana, central JSON logs with alerts.

How Tamil Taxi compares:

| Interview design | Tamil Taxi | Verdict |
|---|---|---|
| Fare estimate → book by fare id | `POST /fares/quote` → `POST /trips`. Booking **re-prices on the server** (no quote id): the client can't tamper with the price, but if surge moves between P-10 and booking the rider pays the new price | Fine while surge is off by default; SD-13 when live surge is on |
| Duplicate bookings | Redis `NX` booking lock per passenger + "you already have a trip in progress" (409 `TRIP_IN_PROGRESS`) | **Matches** |
| Assignment queue | Bookings wait in a Redis pending set; a batch runs every `batchWindowMs` (2 s); offer timeouts and re-searches are durable Redis jobs; a Redis lock lets one API instance run a batch | **Matches**, plus batch assignment so two riders never get one driver |
| One driver at a time, 15 s timeout | One offer per trip at a time, `offerSeconds` = 15; a driver may hold up to `maxOpenOffers` (3) requests; accept is a guarded `updateMany` (only one driver's write wins) and `claimBusy` keeps one active trip per driver | **Matches** |
| Driver scoring | Road ETA (cached per hex pair, one Route Matrix call), 7-day offer record, idle time, women-driver preference, booking preferences | Ahead of the textbook |
| Geohash / quadtree / H3 | H3 res 8 sets in Redis (Redis `GEOSEARCH` was used first and removed on 25 Sep 2026) | Already on the better option |
| Location queue + location service | The gateway calls `LocationIngestService` directly (no queue) | Fine at this size; SD-15 when a second consumer or bursts appear |
| GPS every 10–15 s | Every 5 s (20 m moved, at most every 2 s) | Smoother tracking for more uploads; SD-6 slows parked drivers |
| Per-rider Kafka topic | Socket.IO rooms `user:<id>`, `driver:<id>`, `trip:<id>` in one process | Same idea. The Redis adapter (SD-8) is our version of the shared broker |
| WebSocket vs QUIC | Socket.IO, websocket only. Caddy publishes UDP 443, so it can serve HTTP/3, but the apps use `package:http` (`dart:io`, HTTP/1.1 only). Whether the AWS security group lets UDP 443 in is not checked | SD-14 if riders on weak networks see slow calls |
| Sticky sessions, heartbeats | Not needed (websocket-only clients); Socket.IO pings by default; the apps reconnect after 1 s and catch up | **Matches** |
| 24/7 availability | One EC2 runs everything; Redis has AOF on; no Postgres replica, no failover, no automated off-box backup yet | **Gap**, accepted for the pilot; SD-16 before public launch |
| Monitoring and logs | `/health`, `/health/ready`; plain Nest logs on the box; no metrics or alerts | **Gap**: SD-16 |
| JWT + roles, TLS | JWT with `@Roles` guards, sockets checked on connect, Caddy TLS, S3 with SSE | **Matches** |

### 6 Oct 2026: a new ride OTP every trip, or the same one?

Source: a social post claiming Uber makes a new OTP for every ride while Rapido reuses one per rider (Rapido's current
behaviour not checked by us). Its argument: an OTP read out in a crowd can be overheard, and a fixed code can be
replayed later, while a per-ride code dies with the ride.

What the ride OTP really protects: the **right rider gets into the right car** (two people waiting at a mall gate),
the **driver can't start the meter before the rider is in** (fare fraud, fake trips), and the start is **proof the
rider was there** (disputes, safety). Against those, a fixed code's weak point is less the stranger in the crowd (they
would need to be at your next pickup when your car comes) and more that **every driver who ever drove you knows it
for good**. A fixed code is quicker for regulars (no need to open the app with a helmet on), which is the trade-off.

| Question | Tamil Taxi | Verdict |
|---|---|---|
| New code per trip? | Was yes (`randomInt(1000, 10000)` per booking). **Since 6 Oct 2026: one code per rider** (see the decision below) | Owner's choice: speed |
| Can the driver see it? | No: stripped from every driver response and from `trip.updated` to the trip room (`hideOtp`); the public tracking link doesn't carry it | **Good** |
| Guessing | 5 tries a minute per trip, then locked (`TripOtpGuard`, 429 `OTP_LOCKED`); only the assigned driver can try. Guessing ~9,000 codes at that rate takes hours, far longer than any pickup wait | **Good** |
| Valid how long? | Only while the trip waits to start (ride) or to be delivered (parcel, the receiver's code) | **Good** |
| Fixed codes in the repo | `4829` (ride) and `7153` (delivery) exist only in mock mode and tests | Fine |
| Lock screen | The rider's push says "Share OTP 1234 to start"; on a locked phone Android shows it unless the user hides sensitive content. Uber and Ola do the same | No change |

**Decision (6 Oct 2026, owner): one ride OTP per rider, Rapido style.** Speed over security in the trip-start flow:
riders remember their code and needn't look at the phone at the car; overhearing is rare, and when it happens an admin
changes the code (`POST /admin/users/:id/ride-otp`, user page › Ride OTP › Change), which also moves the rider's rides
that haven't started. What we kept from the safer model: drivers still never receive the code from the API, guessing
is still limited to 5 tries a minute, and parcels (the receiver's code) and rides booked for someone else still get a
one-time code, so a rider's own code is never handed to another person. Known cost: every driver who has driven a
rider knows that rider's code. If abuse shows up (trips started without the rider), revisit: a new code per ride, or
a rider-side "new code" button.

## 4. Optimization backlog

Status: **Open** unless marked. Effort: S (hours), M (a day or two), L (a week or more).

| ID | Change | Why | Trigger | Effort |
|---|---|---|---|---|
| SD-1 | **Done (6 Oct 2026):** `VehicleGlide` (tamiltaxi_data). ~~Glide the rider's driver marker~~ (P-13, P-16, PP-08, PP-09): animate from the old to the new position over about one fix interval, **along the route polyline** (`trackOnPath` already gives progress on the leg). If no fix comes, keep going at the last speed for at most one interval, then hold (dead reckoning without overshoot). Use the GPS `hdg` from `trip.location` when the car moves, the last heading when it stands | The most visible quality gap against Uber, Ola and Rapido. Apps only, no server change, no extra cost | Next UI polish pass | M |
| SD-2 | **Faster `GET /drivers/nearby`:** cache the answer per (pickup res-8 cell, rides or parcels) for ~5 s so riders in one hexagon share one computation; read each ring's drivers with one pipelined `MGET driver:alive:*` + busy check instead of 2 serial calls per driver; return the heading from the fix `nearby()` already read instead of calling `lastFix` again | Hottest read path; cost grows with riders × drivers | Before public launch, or when Home traffic shows in latency | S |
| SD-3 | **Done (6 Oct 2026):** hourly HMAC marker ids, `TtMap` glides cars ~1.8 s. ~~Nearby markers that move instead of blink:~~ give each car a short-lived id (hash of driver id + a daily secret) so the app can glide it between polls; key Google markers by that id, not by list index (`vehicle-$i` can hand one marker to a different car between polls) | Smooth map at no extra request cost; still no real ids exposed | With SD-1 | S |
| SD-4 | **Order and dedupe pushes:** add `updatedAt` (or a version number) to the trip JSON and every trip event; apps drop anything older than what they hold | Our cheap answer to RAMEN's ordered, at-least-once delivery. Already in using.tech.md §10 "Trip `updatedAt`" | Next API change to trips | S |
| SD-5 | **Done (6 Oct 2026):** `driverLocation` in `GET /trips/:id` and `/trips/active`. ~~Driver position in the catch-up read:~~ include the driver's last fix in `GET /trips/:id` for the trip's rider while a driver is assigned | After reconnecting or reopening the app, the car shows at once instead of after the next fix | With SD-1 | S |
| SD-6 | **Slower GPS while parked and free:** with no trip, speed under 1 m/s and under 10 m moved, send every 15 s instead of 5 s (alive TTL is 90 s; arrival checks trust fixes up to 30 s). Keep 5 s during a trip | Most online drivers are waiting: about a third of the uploads, writes and battery for them | When driver battery complaints or ingest load show up | S |
| SD-7 | **One round trip per fix:** fold the ingest's Redis reads and writes (`driver:cell`, alive, busy, session, trip phase) into one Lua script or pipeline | ~7 round trips → 1–2 | Stage 3 (thousands of online drivers) | M |
| SD-8 | **Second API process:** Socket.IO Redis adapter (`@socket.io/redis-adapter`) so room emits reach sockets on any process. No sticky sessions needed (websocket-only clients) | One Node process is the first limit (COST_AND_SCALING §7) | Stage 3 | M |
| SD-9 | **Push nearby cars instead of polling:** riders on Home join rooms for their pickup cell's k-ring (`hex:<cell>`); free drivers' moves go to those rooms, filtered as in SD-11 | Uber-style live map without polls | Only if SD-2's polling becomes too heavy; probably stage 4 | L |
| SD-10 | **Kalman filter** on positions (app display, or the server's breadcrumbs for distance) | Removes GPS jitter beyond what route snapping does | Only if breadcrumbs or markers still look jumpy after SD-1 | M |
| SD-11 | **Server-side "Fireball" filter** for location pushes: emit only when the car moved ≥ 25 m, turned ≥ 30°, or 15 s passed | Matters once many riders watch the same drivers (SD-9) | With SD-9 | S |
| SD-12 | **Edge or CDN servers** | Latency from Mumbai is already low for Tamil Nadu | A city far from Mumbai, or measured slow responses | — |
| SD-13 | **Price lock:** `POST /fares/quote` returns a short-lived quote id (Redis, ~5 min) holding the priced lines; `POST /trips` books at that price when the id is valid and re-prices otherwise | The rider pays what P-10 showed even if surge moves meanwhile | When live surge is switched on in a city | S |
| SD-14 | **HTTP/2 and HTTP/3 for app calls:** `cronet_http` on Android behind the same `http.Client`; open UDP 443 in the security group | Faster setup and less head-of-line blocking on lossy 4G; the socket stays as it is | Riders or drivers on weak networks report slow screens | S–M |
| SD-15 | **Location stream:** the gateway appends fixes to a Redis Stream; consumers (dispatch index, trip room, breadcrumbs, safety) read it. Not Kafka (cost) | Absorbs bursts and lets new consumers (analytics, ETA learning) read GPS without slowing ingest | A second heavy consumer, or ingest latency under load | M |
| SD-16 | **Launch-grade operations:** nightly `pg_dump` to S3 (already in the launch checklist), an external uptime check with alerts (free tier), JSON logs shipped off the box, and a restore drill | One box and no off-box backup means one disk failure loses everything | Before public launch | S–M |
