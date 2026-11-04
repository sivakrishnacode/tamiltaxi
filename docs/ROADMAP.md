# Roadmap

Planned work, grouped by milestone. GitHub mirrors this file (`scripts/sync_github.py`, run by
`.github/workflows/github-sync.yml` on every push to `main` that changes it): each `##` section is a
[milestone](https://github.com/sivakrishnacode/tamiltaxi/milestones) (except **Backlog**), each `###` item an
[issue](https://github.com/sivakrishnacode/tamiltaxi/issues), shown on the "Tamil Taxi roadmap" project board. How to
use it: [GITHUB.md](GITHUB.md).

**Item format:** `### Title`, then one line `Issue: #N · Labels: a, b · Status: done` (`Issue` once it exists,
`Status: done` to close it), then the issue text. The text is written to GitHub only when the issue is created; after
that, tick checklists and discuss on GitHub. Title, milestone, labels and done follow this file. The repo is public:
no security gaps, keys or business plans here (see `SECURITY.md` and the git-ignored `docs/private/`).

---

## Rider 0.1.1

> The next Tamil Taxi (rider) upload to Google Play

### Ship Tamil Taxi (rider) 0.1.1 to Google Play

Issue: #1 · Labels: rider, release

The next rider upload. What goes in it is listed under **Tamil Taxi (rider) › Next release** in
[RELEASES.md](RELEASES.md).

- [x] Raise `version:` in `apps/passenger/pubspec.yaml` to `0.1.1+2`
- [x] Build the bundle: `cd apps/passenger && ../../scripts/flutter.sh build appbundle` (upload key)
- [x] Upload it to Production (India) with the release notes in RELEASES.md (in review 2 Nov 2026)
- [x] In RELEASES.md, turn "Next release" into the 0.1.1 entry with its `Release:` line

---

## Driver 0.1.1

> The next Tamil Taxi Driver upload to Google Play

### Ship Tamil Taxi Driver 0.1.1 to Google Play

Issue: #2 · Labels: driver, release

The next driver upload. What goes in it is listed under **Tamil Taxi Driver › Next release** in
[RELEASES.md](RELEASES.md).

- [x] Raise `version:` in `apps/driver/pubspec.yaml` to `0.1.1+2`
- [x] Build the bundle: `cd apps/driver && ../../scripts/flutter.sh build appbundle` (upload key)
- [x] Upload it to Production (India) with the release notes in RELEASES.md, in review 2 Nov 2026 (new
  `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` permission: our reason is in play-store/driver.md, "Other permissions")
- [ ] Try D-03c on a Play install: every row asks, ticks once allowed, Continue opens only when all five are
- [x] In RELEASES.md, turn "Next release" into the 0.1.1 entry with its `Release:` line

---

## Production launch

> Both apps on Google Play production in India, with launch-grade operations

### Google Play: 12 testers for 14 days, then apply for production

Issue: #3 · Labels: launch, release, rider, driver

A personal developer account can apply for production access only after a closed test with at least 12 testers
opted in for 14 days in a row.

- [x] Rider: 12+ testers opted in and kept for 14 days
- [x] Driver: 12+ testers opted in and kept for 14 days
- [x] Rider: production access granted (2 Nov 2026)
- [x] Driver: production access granted (by 2 Nov 2026)
- [x] Test data cleared from the server before launch: only admin accounts and config left (2 Nov 2026)
- [ ] Remove the cleared test drivers' uploaded files from storage
- [x] Production release, India only; record it in RELEASES.md (both apps live 3 Nov 2026)

### Domain tamiltaxi.co.in: website, app links and support email

Issue: #4 · Labels: launch, web, infra

- [ ] Website on the domain (the Play listings link to its privacy, terms and delete-account pages)
- [ ] Support email works
- [x] API and admin on the domain instead of sslip.io (4 Nov 2026: `api.` and `admin.tamiltaxi.co.in`)
- [ ] Update the Play listings and the apps' links
- [ ] Didit webhook on `api.tamiltaxi.co.in`
- [ ] Stop serving the sslip.io names once no one runs an app older than 0.1.2

### Launch-grade operations: backups, uptime alerts, logs (SD-16)

Issue: #5 · Labels: launch, infra, api

- [ ] Nightly `pg_dump` to S3
- [ ] An external uptime check with alerts (free tier)
- [ ] JSON logs shipped off the box (CloudWatch)
- [ ] A restore drill from a backup

### Check on real phones: camera, daily selfie, push, uploads

Issue: #6 · Labels: launch, rider, driver

- [ ] Camera: KYC document photos, delivery and ticket photos
- [ ] Daily selfie face match (`dailySelfieCheckEnabled`)
- [ ] Push notifications on both apps (open, in the background, closed)
- [ ] Photo uploads reach storage and open in the admin

### WhatsApp code autofill for installs from Google Play

Issue: #7 · Labels: launch, rider, driver, infra

The WATX templates need Play's signing hashes next to the debug ones (hashes in
[using.tech.md](tech-docs/using.tech.md), "Login codes on WhatsApp").

- [ ] Rider template: add the Play signing hashes
- [ ] Driver template: add the Play signing hashes
- [ ] Check on a Play install: the WhatsApp message shows "Autofill" and the code fills in

### Back up the Play upload keystore

Issue: #8 · Labels: launch, infra

Keep the upload keystore and its password in two safe places off the build laptop.

---

## Backlog

> Planned, no date yet

### City boundary on the admin maps: Map ID

Labels: admin, plan

The boundary layer shipped on 3 Nov 2026 and shows once the admin is built with a Map ID ("City boundary" in
`using.tech.md` 6b).

- [x] Owner: in Google Cloud (the admin browser key's project) paste `cloud-map-style.json` into a new map style (JSON
  tab), switch its Locality layer on, create a JavaScript vector Map ID with that style, and send the ID (3 Nov 2026:
  style `tamiltaxi-ui-map-layer`, Map ID `tamiltaxi-admin`)
- [x] Set `NEXT_PUBLIC_GOOGLE_MAP_ID` (local `.env.local`, root `.env` `GOOGLE_MAP_ID`), rebuild and deploy the admin,
  and check every city has a `placeId` and its outline (3 Nov 2026)
- [x] Owner: a second style (copy of `tamiltaxi-ui-map-layer`, JSON `cloud-map-style-no-places.json`, Locality on) and
  a second JavaScript vector Map ID with it, for the Places switch; then set `NEXT_PUBLIC_GOOGLE_MAP_ID_NO_PLACES`
  and deploy the admin (3 Nov 2026: style `tamiltaxi-ui-map-no-places`, Map ID `tamiltaxi-admin-no-places`)
- [ ] Neighbourhood names hidden below zoom 14 again, as with the built-in style: the cloud style editor refuses
  keyzooms on `visible`; try keyzooms on the label opacities (`textFillOpacity` / `textStrokeOpacity`)

### Website: Tamil version, the vision photo, download QR codes, admin logo

Labels: web, plan

Follow-ups to the 31 Oct 2026 home page redesign.

- [ ] Full Tamil version with an EN / தமிழ் switch; the Tamil copy checked by a native speaker before it ships
- [ ] Official photo of the Chief Minister in the Government's vision band: the owner supplies a photo we have the
  right to use (no State emblem, no AI likeness, no one else's watermark), then set `vision.photo` in
  `apps/web/src/lib/vision.ts`
- [ ] QR codes to the Play listings in "It's easier in the apps" once `site.onPlayStore` is true
- [ ] Admin panel on the Clean White logo too: it still has the one-line wordmark and the kolam favicon

### System-design backlog (SD-n)

Issue: #9 · Labels: plan, api

Each item, its trigger and the reasoning are in
[system-design-notes.md](https://github.com/sivakrishnacode/tamiltaxi/blob/main/docs/tech-docs/system-design-notes.md).
Tick an item here when its SD-n is marked Done there.

- [ ] SD-2 Faster `GET /drivers/nearby` (per-cell cache)
- [ ] SD-4 Order and dedupe pushes (`updatedAt` on trips and events)
- [ ] SD-6 Slower GPS while parked and free
- [ ] SD-7 One round trip per GPS fix
- [ ] SD-8 Second API process (Socket.IO Redis adapter)
- [ ] SD-9 Push nearby cars instead of polling
- [ ] SD-10 Kalman filter on positions
- [ ] SD-11 Server-side "Fireball" filter for location pushes
- [ ] SD-12 Edge or CDN servers
- [ ] SD-13 Price lock (quote id)
- [ ] SD-14 HTTP/2 and HTTP/3 for app calls
- [ ] SD-15 Location stream (Redis Stream)
- [ ] SD-17 Tell the driver who lost the race
- [ ] SD-18 Reminder opt-out in the app
- [ ] SD-19 Campaigns per city

### Sign-in codes by SMS when the phone has no WhatsApp

Issue: #10 · Labels: plan, api, rider, driver

Login codes go only through WhatsApp today. A fallback SMS for phones without WhatsApp, kept cheap (sent only when
the rider asks for it).

### Cost plan: self-hosted routing and the P-10 ETA change

Issue: #11 · Labels: plan, api, infra

The two planned cost changes in [COST_AND_SCALING.md](COST_AND_SCALING.md): the P-10 ETA change (§5) and self-hosted
OSRM routing (§6).

### Follow-ups to shipped features

Issue: #12 · Labels: plan, api, admin

- [ ] GPS path: admin settings for the thresholds, snap-to-road for a nicer path, a per-driver mock-GPS count
- [ ] Cancellations: decide the fee policy (then show it before riders cancel), a way to waive a due, per-city
  thresholds, a pause appeal flow
- [ ] Dispatch ranking: per-city weights, an actual-pickup-distance term, drivers see their own acceptance rate
- [ ] SOS: a realtime admin channel instead of polling
- [ ] Landmarks: a phone check of P-09 / D-16 with real landmarks
- [ ] CI: APK build artifacts
- [ ] Document expiry: let a driver upload the renewed RC or insurance before the old one expires (the app offers
  Re-upload only once it is rejected); read the licence expiry from Didit
- [ ] Zone rules in the apps: show a no-pickup-only zone as such (the Play builds treat every no-service zone as
  stopping both), a vehicle-only surge on the driver map, and a Surge now banner with its end time
- [ ] Pickup points: an entry or parking fee as its own fare line (the apps must show it, or the breakdown won't add
  up), the meeting spot on the rider's screens, and a first-come driver queue (drivers waiting inside get the next
  pickup there in turn, like airport queues)
- [ ] Decide whether zone surge may apply to autos at all (they charge the government fare; Surge now leaves them out
  by default, a surge zone with no vehicles picked still covers them)

### Cab and 3-wheeler fares next to the government auto fare

Labels: plan, api

Since 1 Nov 2026 autos charge the Tamil Nadu government fare (₹50 for 1.8 km, then ₹25 a km). Two tiers now look
odd beside it: beyond about 9 km an Auto costs more than a Mini (₹15 a km plus time), and beyond about 5.5 km a
Parcel on Auto (100 kg) costs more than the goods 3-wheeler (500 kg, ₹15 a km). Decide whether to raise Mini, Sedan,
SUV and the 3-wheeler, or leave them cheaper on long trips. Rates: `fare-rules.ts` and `seed.dart` (per city in
City › Fares).

### Truck drivers' work now that trucks carry no parcels in town

Labels: plan, driver, api

Since 18 Oct 2026 trucks get no parcels in town (like Porter): their work is Packers & Movers and goods to another
town. Packers & Movers is off by default for every goods vehicle (movers need helpers), so a new truck driver only
gets goods to another town until they switch it on in Services. Decide: Packers & Movers on by default for trucks,
or tell truck drivers at sign-up (D-04 / D-05) what they will get.

### Packers & Movers step 3 and review in the new style

Labels: plan, rider · Status: done

PH-01 and PH-02 were redesigned on 18 Oct 2026. PH-03 (Day & extras) still has rows that run off the screen edge
(the day cards and the vehicle cards scroll sideways, so "Wed 21" and "Pickup" are cut), and PH-04 says "Pickup"
where the new steps say "Pickup truck". Bring both in line with PH-01 / PH-02.

### Remove old Rido resources

Issue: #13 · Labels: plan, infra

- [ ] The `com.rido.*` entries on the Android Maps key
- [ ] The old Firebase project
- [ ] The old local `rido_*` Docker volumes
