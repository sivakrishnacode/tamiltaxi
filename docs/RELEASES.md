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

### Next release: 0.1.3 (code 4)

- After signing in, the app asks for location on Home again. The notification prompt that appears at sign-in used to
  cancel it, so location was only asked when the locate button was tapped. Now the location prompt follows right after.
- Maps: the ETA bubble on "Driver on the way" and the labels on "Not in your area yet" stay on their place while the
  map is dragged, instead of trailing behind it and catching up after.
- Outstation round trips start "straight back": the return is leaving plus the drive there and back (Pollachi and
  back: about 1 h 50 min), not the next evening, so the first price is for a same-day trip. Tap the return to stay
  longer; the earliest return is the drive both ways. The fare shows the waiting there as its own line, and the notes
  say what waiting costs an hour and that coming back later than chosen is added at the end, the first 30 min free.

### 0.1.2 (code 3) · 4 Nov 2026

Release: `passenger-v0.1.2+3` at `104ae0d`

- **Track:** Production (India). **Status:** live on Google Play 4 Nov 2026 (public listing updated that day).
  Bundle `dist/tamiltaxi-passenger-0.1.2-3.aab` (upload key, 64.9 MB, down from 103.1 MB without the Didit SDK).
  The Closed testing (Alpha) track was paused the same day, so former testers get production (their phones showed
  "(Beta)" and couldn't install). Before sending it for
  review, take "Optional identity check for a Verified badge" out of the store description and update the
  **Data safety** form (Other info: gender only; Photos: parcel photo and support screenshot; no microphone; see
  play-store/passenger.md).
- **Built from** `104ae0d`.
- **Release notes:** "A lighter app: a smaller download and no identity check to do. Clearer maps: towns no longer
  show as dark patches at mid zoom. Tamil Taxi now connects to its own address, tamiltaxi.co.in."

- Maps: towns no longer show as dark grey patches at mid zoom (built-up areas are left out of the map style).
- Talks to the server at `api.tamiltaxi.co.in` instead of the sslip.io address.
- No identity check for riders: Account › Verify identity and the Verified badge are gone, and the Didit SDK is
  out of the app (a smaller APK, no microphone permission).

### 0.1.1 (code 2) · 2 Nov 2026

Release: `passenger-v0.1.1+2` at `edacaa4`

- **Track:** Production (India), the first production release. **Status:** live on Google Play: sent for review
  2 Nov 2026 with managed publishing on, published by the owner, public listing seen 3 Nov 2026
  ([play.google.com](https://play.google.com/store/apps/details?id=com.tamiltaxi.passenger)). Bundle
  `dist/tamiltaxi-passenger-0.1.1-2.aab` (upload key, all checks passed).
- **Built from** `edacaa4`.
- **Release notes:** "Tamil Taxi is live in Coimbatore: book bike, auto and cab rides, send parcels, and book house
  shifting. Autos charge the Tamil Nadu government fare. Drivers keep 100% of every fare: 0% commission."
- `0907cbe` In-app privacy text: sign-in codes come on WhatsApp; ride reminders.
- `824a1c1` Sign-in screens ask for the WhatsApp number.
- `7a6adce` Parcels in town like Porter: **Scooty** added (up to 20 kg; a 5–20 kg parcel picks it), **Truck** removed
  from the in-town list (still in Packers & Movers and To another town).
- `336f5bd` Packers & Movers redesigned like Porter (riders found step 1 hard to use): step 1 asks only where, with
  Ground floor · Lift · No lift and a floor sheet; how big the home is moves to step 2 with the items, each size
  showing the vehicle and helpers; items go in one line ("2 chairs", "Fridge - single door").
- `33d87de` Packers & Movers step 3 cleaned up: the 7 days in one row (weekends +10%), vehicle and packing as simple
  lists, no rows running off the screen; "Pickup truck" instead of "Pickup" in the move's text and price lines.
- `bad701e` Autos at the Tamil Nadu government fare (₹50 for 1.8 km, then ₹25 a km; Auto Priority 1.2× that;
  Parcel on Auto ₹55 minimum): the in-app rates, so P-11 shows "× ₹25"; no "Time charge ₹0" line on P-11 / P-22.
- `1840740` Autos' night fare (10 pm–5 am, 1.5×) is labelled "Night fare" on P-11, P-22 and the receipt (0.1.0 shows
  it as "Peak time 1.5x").
- `8944b2a` P-11 "Things to know" mentions the 18 km/h time charge only for fares that have one (not autos).

### 0.1.0 (code 1) · 16 Oct 2026

Release: `passenger-v0.1.0+1` at `42008b6`

- **Track:** Closed testing – Alpha (India). **Status:** sent for review 16 Oct 2026.
- **Built from** `42008b6` plus the upload-key signing and HTTPS-only release builds (committed a minute later as
  `56e3442` and `8ebcea4`).
- **Release notes:** "First release of Tamil Taxi: bike, auto and cab rides, parcels and house shifting in
  Coimbatore, with 0% commission for drivers."

---

## Tamil Taxi Driver · `com.tamiltaxi.driver`

### Next release: 0.1.3 (code 5)

- Meter: a new **Meter** tab next to Home (and a Meter button on the Home map) for a passenger picked up off the app.
  Start meter takes the driver offline and counts the distance by GPS, with no internet needed; the fare is the app's
  own for that distance at the driver's rates (autos: the government fare, and the night fare at night). It keeps
  counting with the screen off and carries on if the app is closed; End trip shows the fare, its lines and the UPI QR
  with the amount. The running meter shows where the trip started (a small map with the way driven, and the address)
  so the passenger can check it. Meter trips count in Earnings (marked "Meter"); with no internet they are kept on
  the phone and sent once online.
- Before approval: after the OTP and the vehicle and details steps, new drivers land on Home and can use the app
  (Meter, Earnings, Rate card, Account). A banner that can't be closed says what is left ("Verify your documents to
  go online · 3 left" → Verify now; "Documents under review"; "1 document needs a new upload") and Go online stays
  locked until an admin approves them. The approval says "You're approved! Go online to get requests."
- Account: Documents and Vehicle details are one item, **Vehicle & documents** (the vehicle with Edit on top of the
  documents).
- Sign-up step 3: **City** is a dropdown of our cities with the one nearest the phone picked to start with; the driver
  can choose another, and it is saved as their city. (It always said Virudhunagar: the first city on the server.)
  Needs the API from Staging › 10 Nov (second), deployed.
- Maps: zone and demand labels on Home, the pins on Surge / High demand areas and the "location lost" mark stay on
  their place while the map is dragged, instead of trailing behind it and catching up after. A tap on a pin still
  shows its area.
- Home map: zones look cleaner. A thin 1 px hexagon edge (was 3 px) with a light tint; busy areas are coral like the
  demand hexes (were brown), pickup points a lighter blue. Zone names show when zoomed out to the city too (short:
  "Airport", "Singanallur"), and sit on the zone's top edge instead of covering it or the car. The zone the driver
  is in always gets its label: zones off screen no longer use up the 5 places.
- Home map, zoomed out: labels are smaller and never cover a zone (a label over the zone next to its own is left
  out), the "High demand" label sits on its area's top edge instead of in the middle, and a phone set to large text
  makes them only a little bigger. Zones in view get their labels: ones off screen no longer take the places.
- Surge and High demand: two chips over the Home map show how many areas each has now. Each opens a map of those
  areas with a list, nearest first: the fare ("1.3x fare · ends in 1 h 54 min"), the distance and directions. With
  no surge it says so and offers the busy areas.
- Home map: a zone whose top edge is out of view (under the Today card) has its label as high as is still in view,
  inside the zone, instead of hidden under the card.
- Go offline asks first ("Go offline?" with Stay online), so a tap while putting the phone in a pocket doesn't end
  the shift.
- Outstation round trips: the request card says how long the trip is away ("Round trip · 9 h 40 min", days past 24
  hours) instead of "same day", and the fare shows the waiting there and a late return as their own lines. Rate card:
  round trip per km there and back, waiting per hour, allowance per 24 hours (no "km a day").

### 0.1.2 (code 4) · 4 Nov 2026

Release: `driver-v0.1.2+4` at `d4d3a5f`

- **Track:** Production (India). **Status:** live on Google Play, released 4 Nov 2026 1:28 PM; 19,543 supported
  devices. Bundle `dist/tamiltaxi-driver-0.1.2-4.aab` (upload key, about 64 MB, down from 102.6 MB without the Didit
  SDK). The Closed testing (Alpha) track was paused the same day. The first upload, code 3
  (`d84e246`), lost 426 devices on Play's review screen: without the SDK the camera permission made a back camera
  required. Code 4 declares the camera optional again; code 3 is never released. Before sending it for review, update the driver's **Data safety** form (no
  ID-check scans or selfie, no microphone; see play-store/driver.md).
- **Built from** `d4d3a5f`.
- **Release notes:** "Simpler sign-up: upload your driving licence and Aadhaar, and our team checks them with your
  profile photo. No selfie before going online. The Home map now shows surge, busy areas, no-pickup zones and
  pickup points: tap one to see the fare, the hours and directions. A slimmer Home panel leaves more room for the
  map."

- Registration: the identity check is by hand only (Didit is gone). The driver uploads the driving licence and
  Aadhaar, and the profile photo is the face an admin matches to them. The Didit SDK is out of the app (a smaller
  APK, no microphone permission).
- The app sends its version (`x-app-version`, `kDriverAppVersion`), so the server knows it can upload them.
- Account › Documents counts what it shows (it said "5 of 4 verified" for a driver checked by hand).
- Maps: towns no longer show as dark grey patches at mid zoom (built-up areas are left out of the map style).
- Talks to the server at `api.tamiltaxi.co.in` instead of the sslip.io address.
- No daily selfie before going online (S-13 and D-09 removed), and no Verified badge on request cards.
- Home map: the admin **zones** live now, outlined and labelled (surge in violet with its multiplier, busy areas, no
  pickups / drops in red, pickup points in blue); a surge for other vehicles isn't shown. **Tap** a zone or a demand
  hex for what it means, when it runs and Directions.
- Home panel is slimmer while online ("You're online" and a small Go offline on one row, then Go To / Stay In), so
  the map has more room.
- A new profile photo shows "being checked" until an admin approves it, and it can be taken any time (it used to wait
  for the identity check, so a driver approved without one could never add the photo needed to go online).

### 0.1.1 (code 2) · 2 Nov 2026

Release: `driver-v0.1.1+2` at `edacaa4`

- **Track:** Production (India), the first production release (production access granted by 2 Nov 2026).
  **Status:** live on Google Play: sent for review 2 Nov 2026 with managed publishing on, published with the rider
  app, public listing seen 3 Nov 2026
  ([play.google.com](https://play.google.com/store/apps/details?id=com.tamiltaxi.driver)). Bundle
  `dist/tamiltaxi-driver-0.1.1-2.aab` (upload key, all checks passed).
- **Built from** `edacaa4`.
- **Release notes:** "Tamil Taxi Driver is live in Coimbatore: take ride, parcel and house-shifting requests and keep
  100% of every fare. 0% commission, no subscription. New: a permissions check so requests always reach you, Scooty
  parcels up to 20 kg, and auto rates at the Tamil Nadu government fare."
- `09f6669` D-06 Personal details shows the service city (it was empty for new sign-ups).
- `2b006a6` D-03c Permissions after the OTP and at start-up: precise location, notifications, display over other apps,
  full-screen alerts and no battery limits must all be allowed to continue. Adds the
  `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` permission (see [driver.md](play-store/driver.md), "Other permissions").
- `7a6adce` Scooter drivers get Scooty parcels (up to 20 kg): Services and the Rate card say so. Truck drivers: no
  parcels in town; Services shows "Big loads" (Packers & Movers and goods to another town).
- `bad701e` Auto rates at the Tamil Nadu government fare in the app; the Rate card and D-23b trip details show no ₹0
  time charge.
- `1840740` Rate card: auto tabs show the government night fare (booked 10 pm to 5 am, 1.5×); D-23b says
  "Night fare" for it.

### 0.1.0 (code 1) · 16 Oct 2026

Release: `driver-v0.1.0+1` at `824a1c1`

- **Track:** Closed testing – Alpha (India). **Status:** available to testers (installed from Play on the test phone
  16 Oct 2026).
- **Built from** `824a1c1`.
- **Release notes:** "First release of Tamil Taxi Driver: get ride, parcel and house-shifting requests in Coimbatore
  and keep 100% of every fare. 0% commission, no subscription."

---

## Website · `apps/web`

The owner's host publishes the website on every push to `main` (see [using.tech.md](tech-docs/using.tech.md) §6e),
so it has no versions: changes wait here until the next push.

### Next push

- `338de20` Home page redesigned after uber.com/in and cumta.tn.gov.in: dark header and hero, service cards with the
  vehicle art, How to ride, Deliver, Safety and Pink Taxi, the Government's vision (the 2026 manifesto's "Tamil Taxi
  app" promise, photo slot empty until the owner supplies an official photo), Drive, FAQ, Get the app, a full footer,
  text size A / A+ / A++, a phone menu, and Organization / FAQPage structured data. Every page says Tamil Taxi is
  independent of the Government of Tamil Nadu.
- `fc65e04` The Clean White logo, as in the apps: in a white header and on a white tile in the footer; new app icons,
  favicon and social preview image (the old "TamilTaxi" wordmark and kolam icons are gone).
- Both apps are live on Google Play: the "Coming soon to Google Play" buttons now say "Get it on Google Play" and open
  each app's listing (`site.onPlayStore`).
- The download buttons are Google's official "Get it on Google Play" badge, and the footer links both apps ("For
  riders" / "For drivers"; it had only the rider app), with Google's trademark line.
- Privacy and terms (dated 4 November 2026), the home page and the FAQ: the driver identity check is done by hand
  (licence and Aadhaar matched to the profile photo); no Didit, no live or daily selfie, no rider Verified badge.

---

## Staging · API and admin on the staging server

Each deploy's backups, checks and rollback images are in [using.tech.md](tech-docs/using.tech.md) §9b. The first
deploys (26–29 Sep 2026: first start, Didit and HTTPS, the first 28 Sep deploy, `DEV_OTP_CODE`, the move to
`/opt/tamiltaxi`) weren't recorded with a commit, so they have no release.

### Next deploy

Nothing yet: staging runs `92ab7ee` (API) and `619c322` (admin).

### 10 Nov 2026 (second) · API at `92ab7ee`

Release: `staging-2026-11-10.2` at `92ab7ee`

API only, no database change.

- **Drivers choose their city at sign-up:** `POST /drivers` and `PATCH /drivers/me` take `cityId` (an active service
  city, else 400 "Choose one of our cities"; on an edit only checked when it changes). Needed by the next driver
  app, which sends it.

### 10 Nov 2026 · API at `cd32cf6`

Release: `staging-2026-11-10` at `cd32cf6`

API only, with a database change (migration `20261110120000_meter_trips`).

- **Meter trips:** `POST /drivers/me/meter-trips` stores a trip measured with the driver app's meter (D-42) for a
  passenger picked up off the app, once per phone id (a resend is not counted twice); Earnings count them (total,
  rides, chart) and list them as meter trips. Commission saved stays on booked trips only.

### 9 Nov 2026 (third) · API and admin at `619c322`

Release: `staging-2026-11-09.3` at `619c322`

API and admin, with database changes (migrations `20261109120000_welcome_messages` and
`20261109140000_reminder_messages`; the second one adds the three reminder messages sent so far).

- **New Engage area in the admin:** one Engage item with Overview (the week's numbers, what is running, the latest
  messages), Automations, Campaigns, In-app (announcements, splash and Home banners) and History (every message that
  went out). Old links redirect.
- **Reminder messages, picked at random:** admins add as many wordings as they like for each reminder (Didn't book in
  town or outstation, Usual trip), with the rider's name, the place, the usual time or vehicle filled in. Each reminder
  picks one at random, and each wording shows how many it sent and how many riders booked after it. The messages sent
  so far are kept as the first ones.
- **No reminder for a trip that can't be booked:** a rider checking fares from a place with no service (e.g. Ooty) no
  longer gets a "Didn't book" push.
- **WhatsApp welcome messages:** one WhatsApp message per person when a rider finishes sign-up, someone registers as
  a driver, or a driver is approved. Each is switched on separately under Engage › Automations and stays off until its
  template is approved in WATX; Send test to my WhatsApp checks a template first.

### 9 Nov 2026 (second) · API and admin at `d3db661`

Release: `staging-2026-11-09.2` at `d3db661`

API and admin (no database change).

- **Driver and rider pages kept apart:** no "Driver profile / Account & rides as rider" tabs. The driver page shows
  only driving (its last location is the GPS); the rider page shows only riding: no Driver profile card, no driver
  location, no driver changes in its History. Riders now also lists drivers who booked a ride, with only their rides;
  All accounts opens a driver on their driver page. Notes are still shared between the two pages.

### 9 Nov 2026 · API and admin at `3896d94`

Release: `staging-2026-11-09` at `3896d94`

API and admin (no database change).

- **Last location with the time** on the admin user page (rider and driver) and the driver page: a driver's newest
  GPS fix, also after going offline, and a rider's map pin (their phone's location on Home unless they moved the
  pin, to about 110 m), each with an "Open map" link. Kept 30 days from the last update and deleted with the
  account. Recording starts with this deploy: no earlier locations exist.

### 5 Nov 2026 (second) · API and admin at `320e1df`

Release: `staging-2026-11-05.2` at `320e1df`

API and admin (no database change).

- **Outstation round trips priced by time** (like Red Taxi): both ways' km at the round-trip rate, the waiting there
  by the hour (Mini ₹90, Sedan ₹100, SUV ₹130) and the driver allowance per 24 hours away. No more 250 km a day:
  Pollachi and back the same morning is about ₹1,190 for a Mini instead of ₹3,050. A round trip without a return
  time comes straight back; coming back more than 30 min late adds the time at the end. Trips booked before keep
  their price.
- **Admin › City › Rentals & more:** Outstation has "Waiting ₹/hour" instead of "Round trip, km a day", and a round
  trip example under the table.

### 5 Nov 2026 · API at `e5f3f14`

Release: `staging-2026-11-05` at `e5f3f14`

API only (no database change).

- **Live surge is harder to fake:** only riders with a finished ride or delivery count as demand, never a driver's
  own account; a booking the rider cancels within a minute, before any driver took it, is taken back out; and
  drivers who went offline in the demand window still count as free drivers, so logging off together doesn't raise
  fares.

### 4 Nov 2026 (fifth) · API and admin at `cf87969`

Release: `staging-2026-11-04.5` at `cf87969`

API and admin (no database change).

- **Zones can use finer hexagons** than their city: Hexagon size in the zone editor (City size ~1 km, Fine ~400 m,
  Finest ~150 m across), so a zone can leave out streets it shouldn't cover. Fares, no-service rules, pickup points
  and the driver map match each zone at its own size. Zone stats in res 9 cities (Tiruppur) count again.

### 4 Nov 2026 (fourth) · API at `6fcc5bc`

Release: `staging-2026-11-04.4` at `6fcc5bc`

API only (no database change).

- Driver map (`/demand/hotspots`) is cut to the **driver's home city**, read from their Bearer token (a Coimbatore
  driver saw Tiruppur's service area and zones): hotspots, zones and the service-area outline carry a `cityId`.
  No token, or no home city yet: every city, as before. Works with the driver app already on Play.

### 4 Nov 2026 (third) · API at `9ac9221`

Release: `staging-2026-11-04.3` at `9ac9221`

API only (no database change).

- A blocked or deleted account's session gets **401** `ACCOUNT_BLOCKED` (was 403), so the apps sign out and show the
  welcome screen instead of retrying for ever ("Could not load your documents"); signing in again says the
  account is blocked. Works with the apps already on Play (they drop a session on 401).

### 4 Nov 2026 (second) · API and admin at `e28e30a`

Release: `staging-2026-11-04.2` at `e28e30a`

API (database change: migration `20261104120000_remove_didit`) and admin.

- **Didit removed:** identities are checked only by hand (the driver's licence and Aadhaar, verified by an admin, with
  the approved profile photo as the matching face). Gone: the Didit sessions, webhook and face match, the
  `manualIdentityCheck` setting, the **daily selfie** before going online (`dailySelfieCheckEnabled`,
  `POST /drivers/me/selfie-check`) and the riders' **Verified** badge (riders have no identity check; drivers' request
  cards no longer show one).
- The migration drops the Didit sessions table, the drivers' reference selfies, photo match scores and selfie-check
  times, and resets riders' identity status. `GET /kyc/me` stays for apps up to 0.1.1 (`isEnabled: false`).
- Admin: no Didit card, session or console link; a driver's page says whether the identity check is asked of them
  (apps from 0.1.2). The Approvals bucket "Identity in review" is now **Waiting for the photo** (licence and Aadhaar
  verified, profile photo to approve or still to come). Settings lose the daily selfie and "check by hand" switches;
  riders lose the Verified badge and filter.
- Admin Heatmap: no more "Something went wrong" when cities use different hex sizes (Tiruppur is res 9, the others
  res 8): `cellsOutline` outlines each resolution on its own (H3 can't merge them).
- API: the driver map (`GET /v1/demand/hotspots`) also lists the admin **zones live now** (`zones`: surge with its
  multiplier and vehicles, demand, no service, pickup points with the meeting spot, hours and end time, outline).

### 4 Nov 2026 · API and admin on tamiltaxi.co.in (settings only, code at `3dd117c`)

Release: `staging-2026-11-04` at `3dd117c`

Server settings, no code or database change.

- The API is at `https://api.tamiltaxi.co.in` and the admin at `https://admin.tamiltaxi.co.in`. The sslip.io names
  keep working: the apps up to 0.1.1 call `api.65-0-233-253.sslip.io`.
- Live trip share links now open on `admin.tamiltaxi.co.in`.

### 3 Nov 2026 (seventh) · API and admin at `3dd117c`

Release: `staging-2026-11-03.7` at `3dd117c`

API and admin (no database change).

- `5bc697b` `4f7a44b` Identity check by hand: the selfie is gone; it is the driving licence and Aadhaar, verified by an
  admin, with the profile photo approved as the matching face (it is also the daily-selfie face).
- Documents to review: one **Review** dialog per driver shows each upload large, with the driver's photo and name
  beside the licence and Aadhaar, Verify (valid-until date where one is printed) or Reject with one-tap reasons, then
  the next one; new profile photos are reviewed there too. Fixes "Unknown document" when verifying a licence or
  Aadhaar. The licence and Aadhaar are listed under Documents to review, not Identity in review.
- Drivers get a push only for a rejection, or once everything is approved (no "Photo received", no push per verified
  document).

### 3 Nov 2026 (sixth) · API and admin at `9fef08c`

Release: `staging-2026-11-03.6` at `9fef08c`

API and admin. Migration `20261103120000_manual_identity` (the SELFIE document type, `Driver.appVersion`) applied on
start.

- `e4989a9` `652faf8` Identity check by hand: drivers can upload their driving licence, Aadhaar and a selfie for an
  admin to verify in Documents, instead of Didit. Settings › Driver approval › **Check identity by hand** switches it
  on; driver apps from 0.1.2 also switch to it by themselves when Didit can't be used (no credits, down), so Didit never
  stops a sign-up. Drivers on older apps can't upload these: by hand they are approved on RC + insurance. A verified
  selfie is the daily-selfie face and, if there is none, the profile photo.
- Every profile photo now waits for an admin in Drivers › Approvals › Photos (no automatic face match).
- The daily selfie lets the driver through when Didit is down or out of credits.

### 3 Nov 2026 (fifth) · admin at `8b0a9b8`

Release: `staging-2026-11-03.5` at `8b0a9b8`

Admin only (no API or database change).

- `8b0a9b8` Zones and Service area tabs: full screen keeps the side content: the zone list, or the zone form while
  editing, on the left; the Save service area card and the help on the right. The map keeps its view, and Esc returns to
  the page.

### 3 Nov 2026 (fourth) · admin at `78b18a3`

Release: `staging-2026-11-03.4` at `78b18a3`

Admin only (no API or database change).

- `78b18a3` Maps: a **Places** switch (the editors' Layers menu, a button on the Heatmap) hides Google's places such as shops,
  hospitals and temples; the browser remembers the choice for every map. It appears once the second Map ID is set
  (`NEXT_PUBLIC_GOOGLE_MAP_ID_NO_PLACES`).

### 3 Nov 2026 (third) · admin at `e3a2cfe`

Release: `staging-2026-11-03.3` at `e3a2cfe`

Admin only (no API or database change).

- `e3a2cfe` City boundary: only the line now; the white tint inside the city washed the map out. The admin maps take Google's
  own default look, like Google Maps (coloured roads, water, parks and places), at the owner's request: the Cloud map
  style is just `{ "variant": "light" }` (`cloud-map-style.json`).

### 3 Nov 2026 (second) · admin at `52f4be2`

Release: `staging-2026-11-03.2` at `52f4be2`

Admin only (no API or database change).

- `52f4be2` City boundary switched on: the admin is built with the Map ID (`tamiltaxi-admin`, style
  `tamiltaxi-ui-map-layer` with the Locality layer), so the maps take the grey look from that Google Cloud style and
  outline each city's limits.
- Maps that fit themselves to a few hexagons (the Heatmap with little data) stop at zoom 14 instead of zooming to
  street level.

### 3 Nov 2026 · API and admin at `24340fe`

Release: `staging-2026-11-03` at `24340fe`

Migration `20261102120000_city_place_id` applied on start; both cities (Coimbatore, and Tiruppur, inactive) got their
place ID at start-up.

- `91db3bd` `24340fe` City boundary: the admin maps (city page, Heatmap, Live map, Dashboard, Travel speeds) outline
  each city's limits by default with Google's own boundary, like Google Maps, with a "City boundary" switch in the
  editors' Layers menu. The API looks up each city's Google place ID (when a city is made or renamed, and at start-up
  for the others). The outline appears once the admin is built with a Map ID (`NEXT_PUBLIC_GOOGLE_MAP_ID`); until then
  the maps look as before.

### 2 Nov 2026 (third) · admin at `8b0f6c8`

Release: `staging-2026-11-02.3` at `8b0f6c8`

Admin only (no API or database change).

- `8b0f6c8` Zones tab: the zone list moves to the left of the map and scrolls on its own: the column is exactly the
  map's height, the list has a thin scrollbar that stays visible and a fade while more zones are below, and the page and
  the map stay put. While a zone is edited its form takes the column and scrolls on its own; the list comes back on save
  or cancel.

### 2 Nov 2026 (second) · admin at `106f5b3`

Release: `staging-2026-11-02.2` at `106f5b3`

Admin only (no API or database change).

- `106f5b3` Zones tab: every zone in the list can be reached: the list grows with the page (it used to scroll inside a
  box the map's height with no visible scrollbar, hiding zones past the fourth) while the map stays in view beside it;
  Edit on a zone far down brings the edit form into view. Replaced by the next deploy: only the list scrolls now.

### 2 Nov 2026 · admin at `d1aadde`

Release: `staging-2026-11-02` at `d1aadde`

Admin only (no API or database change).

- `599e779` Maps easier to read: each zone kind has its own colour (surge red, high demand violet, pickup point cyan, no
  service dark slate) and every zone one solid edge; zones outside their hours fade and ended ones are only an edge; on
  the Zones tab, the heatmap and the live map the service area is a slate edge instead of a coral or grey hexagon grid,
  so roads and names show through; the Service area tab's coral is lighter with a solid edge. The zone colour picker is
  gone (the kind decides the colour).
- `d1aadde` Heatmap legend: no more "1–0 … 0–0" bands when a range has little or no data ("None in this range" instead),
  and each swatch matches the hexagons it stands for (one trip in total is the darkest colour, as on the map).

### 1 Nov 2026 (fourth) · admin at `2fb594b`

Release: `staging-2026-11-01.4` at `2fb594b`

Admin only (no API or database change).

- `2fb594b` Team: picking a city-limited person's cities scales to hundreds of cities: a search over city and state names,
  results grouped by state with "Pick all", the picked ones as removable chips and a count; the Staff table shows the
  first three cities and "+N more".

### 1 Nov 2026 (third) · API and admin at `56f879c`

Release: `staging-2026-11-01.3` at `56f879c`

Migration `staff_roles` applied on start; the one support admin (Arun Kumar) got the Support role.

- `9ca420b` Zones tab: the map and the zone list share one height (the list scrolls beside the map instead of stretching the
  map's card with an empty band), a wider list on large screens, and a surge's vehicles in short ("All except Auto,
  Auto Priority, Parcel on Auto").
- `56f879c` **Team** (Setup › Team, migration `staff_roles`): staff added by phone (no sign-in needed first) and **custom
  roles** that say what each kind of staff may view or change per area (trips, drivers and documents, riders, support
  and SOS, cities and zones, engage, plans and payments, settings, system), plus CSV exports, deleting accounts and
  "only their own cities". The API checks every admin request; sidebar and pages follow at once. Current support and
  city admins move to the ready-made roles Support and City admin. Owners only.

### 1 Nov 2026 (second) · API and admin at `6e7fdc4`

Release: `staging-2026-11-01.2` at `6e7fdc4`

Migrations `document_expiry`, `admin_levels`, `driver_city`, `zone_rules`, `zone_nudges` and `zone_meeting_point`
applied on start. The backups folder is mounted read-only into the API (`BACKUP_DIR=/backups`). No staging driver
had a trip to take a home city from, so all 14 get one when they next go online.

- `384065a` Admin **Missed rides** (Trips › Missed rides): riders who got no driver (none found, or they gave up while
  searching), by hour, vehicle and area, with the riders to call back; a **Missed today** tile on the Dashboard;
  `GET /admin/missed`. The heatmap's unmet layer now counts the same trips (it used to count every cancellation).
- `f533ae5` Driver documents get a **valid-until date** when an admin verifies them (migration `document_expiry`): the driver
  is reminded 30 and 7 days before; the day after, the document is rejected and the driver goes offline until the
  renewed one is verified. Admin: Documents › Expiring soon, "Change date", a dashboard count. Existing documents
  have no date until an admin adds one.
- `ff6a30c` Admin **Server health** (System › Server health): CPU, memory, disk, database and Redis, Google Maps calls per
  SKU against the free monthly calls, push sent and failed, the last backup. Counting starts with this deploy.
- `6b1b04f` **Admin levels** (migration `admin_levels`): owners, support admins and city admins (support with assigned cities,
  who set up only those cities). Every current admin stays an owner; people made admin in the panel start as support.
  Owners set it on the person's page under **Access**.
- `1e07eee` City page: the whole window wide, tabs as links, a new **Overview** (bookings, missed share, wait for a driver and
  drivers online, for the city and each zone; `GET /admin/cities/:id/stats`); each zone shows its 7-day numbers.
- `1836ff4` Drivers get a **home city** (migration `driver_city`: filled from each driver's latest trip; new ones get it when
  they first go online in a city; admins change it in the driver's profile). The city page has a **Drivers** tab;
  All drivers has a City column and filter.
- `8161ba9` **Zone rules** (migration `zone_rules`): zones on set days and hours or between two dates, surge for chosen
  vehicles only, no-service zones that stop only pickups or only drops, and **Surge now** (rain or a rush: a surge for
  a few hours that ends by itself and can tell the city's drivers). The apps get only the zones live now.
- `64ee3fa` **Busy-zone nudges** (migration `zone_nudges`): a demand or surge zone can push the city's offline drivers when its
  riders go unserved (2 in 15 minutes, hardly any driver free; daytime, a driver at most once an hour).
- `06a5bbb` Pickup points get a **meeting spot** (migration `zone_meeting_point`): bookings picked up inside show the driver
  "Meet at Gate 2, P1 parking".

### 1 Nov 2026 · API and admin at `96499af`

Release: `staging-2026-11-01` at `96499af`

Migration `scooty_parcel` applied on start. Staging had no city Auto fare rows, so the government rates apply as built.

- `7a6adce` Parcels in town like Porter: `SCOOTY_PARCEL` (Parcel on Scooty, up to 20 kg, scooters with Parcels on;
  migration `20261018060000_scooty_parcel`), no `TRUCK` in parcel quotes, "Book any" or the parcel map, and a truck
  parcel in town is refused. Admin: "Parcel on Scooty" label and map colour. The Play rider 0.1.0 hides the new
  Scooty quote (unknown tier) and stops showing Truck once this is deployed.
- `bad701e` Autos charge the Tamil Nadu government fare (G.O. Ms. No. 366, 27 Oct 2026): Auto ₹50 for 1.8 km, then
  ₹25 a km, no time charge; Auto Priority 1.2× that; Parcel on Auto the same with a ₹55 minimum. A city's own Auto
  rows (admin City › Fares) override these; staging has none.
- `1840740` Autos' night fare: booked 10 pm–5 am IST, the whole fare × 1.5 instead of any peak (settings
  `autoNightMultiplier` / `autoNightStartHour` / `autoNightEndHour`, admin Settings › Pricing & surge; 1.0 = off);
  `night: true` on the fare, `autoNight` on `GET /fares/rate-card`; admin trip page says "Night fare".

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
