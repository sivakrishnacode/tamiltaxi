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

- [ ] Raise `version:` in `apps/passenger/pubspec.yaml` to `0.1.1+2`
- [ ] Build the bundle: `cd apps/passenger && ../../scripts/flutter.sh build appbundle` (upload key)
- [ ] Upload it to Closed testing – Alpha with release notes
- [ ] In RELEASES.md, turn "Next release" into the 0.1.1 entry with its `Release:` line

---

## Driver 0.1.1

> The next Tamil Taxi Driver upload to Google Play

### Ship Tamil Taxi Driver 0.1.1 to Google Play

Issue: #2 · Labels: driver, release

The next driver upload. What goes in it is listed under **Tamil Taxi Driver › Next release** in
[RELEASES.md](RELEASES.md).

- [ ] Raise `version:` in `apps/driver/pubspec.yaml` to `0.1.1+2`
- [ ] Build the bundle: `cd apps/driver && ../../scripts/flutter.sh build appbundle` (upload key)
- [ ] Upload it to Closed testing – Alpha with release notes (new `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` permission:
  our reason is in play-store/driver.md, "Other permissions")
- [ ] Try D-03c on a Play install: every row asks, ticks once allowed, Continue opens only when all five are
- [ ] In RELEASES.md, turn "Next release" into the 0.1.1 entry with its `Release:` line

---

## Production launch

> Both apps on Google Play production in India, with launch-grade operations

### Google Play: 12 testers for 14 days, then apply for production

Issue: #3 · Labels: launch, release, rider, driver

A personal developer account can apply for production access only after a closed test with at least 12 testers
opted in for 14 days in a row.

- [ ] Rider: 12+ testers opted in and kept for 14 days
- [ ] Driver: 12+ testers opted in and kept for 14 days
- [ ] Apply for production access (Play Console › Dashboard) for each app
- [ ] Production release, India only; record it in RELEASES.md

### Domain tamiltaxi.co.in: website, app links and support email

Issue: #4 · Labels: launch, web, infra

- [ ] Website on the domain (the Play listings link to its privacy, terms and delete-account pages)
- [ ] Support email works
- [ ] API and admin on the domain instead of sslip.io
- [ ] Update the Play listings and the apps' links

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

### Remove old Rido resources

Issue: #13 · Labels: plan, infra

- [ ] The `com.rido.*` entries on the Android Maps key
- [ ] The old Firebase project
- [ ] The old local `rido_*` Docker volumes
