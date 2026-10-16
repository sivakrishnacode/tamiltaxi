# Play Console answers: Tamil Taxi Driver

Package `com.tamiltaxi.driver` · version 0.1.0 (1) · target SDK 36 · min SDK 24 · checked against the code on
16 Oct 2026. Only what differs from the rider app is written out; for everything else use
[passenger.md](passenger.md). Store graphics are in [driver/](driver/), made the same way as the rider's.

## Store listing

| Field | Answer |
|---|---|
| App name | `Tamil Taxi Driver` |
| Category | Maps & Navigation |

**Short description** (79 of 80):

```
Drive in Coimbatore with 0% commission and no subscription. Keep 100% of fares.
```

**Full description:**

```
Tamil Taxi Driver: earn with your bike, auto, cab or goods vehicle in Coimbatore, and keep 100% of every fare.

Tamil Taxi takes 0% commission and charges no subscription, for every vehicle type. Riders pay you directly, in cash or on your UPI ID.

HOW IT WORKS
• Sign up with your phone number, add your vehicle and pass a quick identity check
• Go online and get ride, parcel and house-shifting requests near you
• See the pickup, drop and fare before you accept
• Navigate to the pickup, start the ride with the rider's OTP and get paid directly

FOR YOU
• 0% commission, no subscription
• Rides, parcels, rentals, outstation trips and Packers & Movers jobs
• Choose which services you take and pause any of them
• Requests reach you even while you use other apps, with a floating bubble
• Earnings for each day and trip
• SOS and an emergency contact during every trip

Tamil Taxi is an independent service. It is not run by, or affiliated with, the Government of Tamil Nadu or any government body.

Questions? Use Help & support in the app or write to support@tamiltaxi.co.in.
```

**Graphics** (files in [`driver/`](driver/)):

| Field | File |
|---|---|
| App icon | `driver/icon-512.png` |
| Feature graphic | `driver/feature-graphic.png` (ChatGPT art: label it as AI-made, like the icon) |
| Phone screenshots | `driver/phone/01…06`: online with busy areas, ride request, going to pickup, collect 100%, earnings, delivery on the way |
| 7-inch / 10-inch tablet screenshots | `driver/tablet-7in/01…06`, `driver/tablet-10in/01…06` |

## App access

| Field | Answer |
|---|---|
| Phone | `+919100000101` (Arun Kumar, an approved test cab driver from `npm run seed:test-drivers -w @tamiltaxi/api`) |
| Code | the staging `OTP_REVIEW_CODE` (same value as `DEV_OTP_CODE`, see `docs/tech-docs/credentials.local.md`); the number is a review number, so no WhatsApp message is sent to it |

```
Enter the password above as the 6-digit one-time code: it always works. This driver is already approved, so no identity check is needed. Tap "Go online" on Home. Requests only arrive when a rider in Coimbatore books, so request screens may not appear during review.
```

Check that the test drivers exist on the API first (`seed:test-drivers` is idempotent). A new number can't be used: a
new driver must pass the Didit identity check before going online.

## Content rating, target audience, ads, news, government, financial, health, advertising ID

Same answers as the rider app: 18+ only, no ads, not news, not government, no financial or health features, no
advertising ID. The content rating answers are the same (users interact, location shared).

## Data safety

Same overview answers as the rider app (encrypted in transit, phone + code accounts, the same deletion URL, no data
shared). Data types:

| Category › type | Required? | What | Purposes |
|---|---|---|---|
| Location › Approximate and Precise | Required | Location while online or on a job, also in the background (with a notification) | App functionality; Fraud prevention, security and compliance |
| Personal info › Name | Required | | App functionality; Account management |
| Personal info › Phone number | Required | | App functionality; Account management; Fraud prevention, security and compliance |
| Personal info › User IDs | Required | | App functionality; Account management |
| Personal info › Other info | Required | Gender, vehicle details (type, model, colour, plate), and from the ID check: name and date of birth on the ID, last 4 digits of the driving licence and Aadhaar | App functionality; Fraud prevention, security and compliance |
| Financial info › User payment info | Required | UPI ID that riders pay | App functionality |
| Financial info › Other financial info | Required | Earnings per trip and day | App functionality |
| Photos and videos › Photos | Required | RC and insurance photos, profile photo, identity-check document scans and selfie, the selfie before going online | App functionality; Fraud prevention, security and compliance |
| Messages › Other in-app messages | Optional | Trip chat, Help & support | App functionality |
| Contacts › Contacts | Optional | Emergency contact | App functionality |
| App activity › Other user-generated content | Optional | Ratings and comments for riders, support tickets | App functionality; Fraud prevention, security and compliance |
| App activity › Other actions | Optional | Booking preferences, services paused | App functionality |
| Device or other IDs | Required | Notification token | App functionality |

Not collected: as for the rider app, plus no Purchase history (drivers don't buy anything) and no In-app search
history. The same Didit video / audio check applies.

## Declarations only the driver app needs

### Foreground service permissions

The app declares two foreground service types. The console asks, for each, what it does, and wants a **video link**
(an unlisted YouTube video, under a minute, recorded on a phone) showing the feature from the user's point of view.

| Permission | Task to pick | Describe it as |
|---|---|---|
| `FOREGROUND_SERVICE_LOCATION` | Location sharing / navigation (user-initiated) | "While a driver is online or on a trip, the app shares the driver's location with our dispatch and with the rider of the current trip. The driver starts it by tapping Go online and stops it by going offline; a notification shows the whole time." |
| `FOREGROUND_SERVICE_SPECIAL_USE` | Special use | "A floating bubble and an incoming ride request card shown over other apps while the driver is online, so drivers who use navigation or other apps don't miss ride requests. No other foreground service type covers an overlay that must stay alive while the app is in the background." |

Video: `dist/tamiltaxi-driver-fgs-video.mp4` (git-ignored, 46 s, recorded 16 Oct 2026 on a phone against staging):
Go online → the location notification → Home, open another app (Calculator) → the bubble stays on top → tap it to
come back → Go offline, and the notification goes. The map, the profile photo, the Wi-Fi name and the home screen are
blurred; captions name each step. Upload it to YouTube as **Unlisted** and paste the same link for both permissions.
It doesn't show a request card over another app (that needs a staging rider near the phone); record that part too if
Google asks.

`FOREGROUND_SERVICE_SPECIAL_USE` is the declaration most likely to be questioned. If Google rejects it, the fallback is
to drop the overlay service and rely on the full-screen request alert.

### Full-screen intent

**My app's core functionality is not alarm or calling.** On Android 14+ the permission is then not granted at
install. The app already handles that: it checks `canUseFullScreenIntent()` and sends the driver to the settings page
to allow it (`apps/driver/lib/overlay/background_permissions.dart`).

### Other permissions

- Display over other apps (`SYSTEM_ALERT_WINDOW`): no Play form; the driver grants it in Android settings.
- No `ACCESS_BACKGROUND_LOCATION`: location in the background runs through the location foreground service above, so
  there is no background-location declaration.
- Camera and microphone: no form (the microphone comes with the Didit SDK).
