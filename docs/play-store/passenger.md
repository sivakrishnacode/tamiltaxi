# Play Console answers: Tamil Taxi (rider app)

Package `com.tamiltaxi.passenger` · version 0.1.0 (1) · target SDK 36 · min SDK 24 · checked against the code on
16 Oct 2026 (merged release manifest, `pubspec.yaml`s, `schema.prisma`, the website's privacy policy).

Each heading below is a page in Play Console, in the order the console shows them. Copy the text in the boxes as-is.

---

## 1. Create app

| Field | Answer |
|---|---|
| App name | `Tamil Taxi` (or, for search, `Tamil Taxi: Bike, Auto & Cab`: 28 of 30 characters) |
| Default language | English (India) – en-IN |
| App or game | App |
| Free or paid | Free (can't be changed to paid later; fine, the app is free) |
| Declarations | Tick both: Developer Program Policies, US export laws |

## 2. Store settings

| Field | Answer |
|---|---|
| Category | Maps & Navigation (where Uber, Ola and Rapido are) |
| Tags | Pick up to 5 that exist in the list, closest first: Taxi / ride hailing, Transportation, Delivery, Travel |
| Email | `support@tamiltaxi.co.in` (shown publicly; the mailbox must exist and be read) |
| Phone | Optional. Leave empty unless you want a public support number |
| Website | `https://tamiltaxi.co.in` |
| External marketing | Leave on |

## 3. Main store listing

**App name:** as in section 1.

**Short description** (76 of 80 characters):

```
Bike, auto & cab rides and parcels in Coimbatore. 0% commission for drivers.
```

**Full description** (about 1,900 of 4,000 characters):

```
Tamil Taxi: rides and parcels in Coimbatore, with 0% commission.

Book a bike, scooty, auto or cab in a couple of taps. See the fare before you book, track your driver live and pay the driver directly by cash or UPI. Tamil Taxi takes no commission from drivers and charges them no subscription, so the fare you pay goes to the person who drove you.

WHY TAMIL TAXI
• 0% commission: drivers keep 100% of the fare
• The fare is shown and locked before you book. Peak pricing is capped at 1.5x and goes to the driver
• Pay your driver directly: cash or UPI
• No ads, and we never sell your data

RIDES
• Bike, Scooty, Auto, Auto Priority, Mini, Sedan and SUV
• Book Any: whichever auto or cab is nearest, for a quick pickup
• Pink Taxi: women riders can ask for a woman driver
• Rentals by the hour, and outstation trips one way or round trip
• Ride now or book for later
• Book a ride for someone else

PARCELS AND HOUSE SHIFTING
• Send parcels in town or to another town, on a bike, auto, 3-wheeler, mini truck, pickup or truck
• Packers & Movers: a truck, helpers and packing for your house move, with the price before you book
• A delivery OTP, so your parcel reaches the right person

SAFETY
• Watch your driver arrive on the map
• Your ride OTP starts every ride
• Share your live trip with family
• SOS button during the ride
• Emergency contacts
• Optional identity check for a Verified badge

WHERE WE RUN
Tamil Taxi runs in Coimbatore, Tamil Nadu, and will add cities one by one.

FOR DRIVERS
Drivers use the separate Tamil Taxi Driver app: 0% commission and no subscription, for every vehicle type.

Tamil Taxi is an independent service. It is not run by, or affiliated with, the Government of Tamil Nadu or any government body.

Questions? Use Help & support in the app or write to support@tamiltaxi.co.in.
Open source (AGPL-3.0): github.com/sivakrishnacode/tamiltaxi
```

Keep the "independent service" line: the ruling party's manifesto promised a government "Tamil Taxi app", and Play's
misrepresentation policy rejects apps that look government-run when they aren't.

**Graphics** (files in [`passenger/`](passenger/)):

| Field | File | Rule |
|---|---|---|
| App icon | `passenger/icon-512.png` | 512 × 512 PNG, ≤ 1 MB |
| Feature graphic | `passenger/feature-graphic.png` | 1024 × 500, no transparency |
| Phone screenshots | `passenger/phone/01…06` | 2–8; 1440 × 2560 (9:16) qualifies for promotion |
| 7-inch tablet screenshots | `passenger/tablet-7in/01…06` | 4–8, 16:9, sides 1080–7680 px |
| 10-inch tablet screenshots | `passenger/tablet-10in/01…06` | 4–8, 16:9, sides 1080–7680 px |
| Video | none | optional (YouTube link) |

---

## 4. App content (Policy › App content)

### Privacy policy

```
https://www.tamiltaxi.co.in/privacy/
```

Live today (redirects to www.tamiltaxi.co.in). Fix it before you submit, so it matches the app and the Data safety form
(both are in [README › Before you submit](README.md#before-you-submit)):

- It names "An SMS provider" for sign-in codes. Codes now go out on WhatsApp through WATX.
- "How we use it" doesn't mention the reminder and offer notifications (a fare checked but not booked, usual trips,
  festival campaigns).

### App access

**All or some functionality is restricted** → Add instructions:

| Field | Answer |
|---|---|
| Name | `Rider sign-in` |
| Username / phone | `+919876500001` (any Indian mobile number works; a new number creates a new rider) |
| Password / code | the staging `DEV_OTP_CODE` from `docs/tech-docs/credentials.local.md` (never write it in this repo) |
| Any other information | text below |

```
Enter the password above as the 6-digit one-time code: it always works, no SMS or WhatsApp needed.
The app serves Coimbatore, India. Outside Coimbatore, tap the pickup at the top of Home and search "Gandhipuram", then choose "Brookefields Mall" as the drop to see fares.
A booking needs a driver online nearby, so a test booking may end with "No drivers nearby".
```

The box takes at most 500 characters. Tick "Sign in details… provide full access to all the features": nothing in the app is paid.

This only works while the API keeps `OTP_DEV_MODE=true` with `DEV_OTP_CODE` set (true on staging today). If you
switch to live codes, keep one review number that always accepts a fixed code, or reviewers can't sign in.

### Ads

**No, my app does not contain ads.** No ad SDK is in the app. Home banners and the festival splash are our own
announcements, edited in Admin › Splash & banners, and no one pays for them. If you ever run a paid banner for
someone else, change this to Yes.

### Content rating

Start questionnaire → email `support@tamiltaxi.co.in` → category **All other app types**.

| Question | Answer |
|---|---|
| Violence, fear, sexuality, nudity, bad language, drugs, alcohol, tobacco, crude humour, gambling | No to every one |
| Can users interact or exchange content with each other? | **Yes**: rider and driver chat during a trip and can call each other |
| Does the app share the user's current location with other users? | **Yes**: the driver sees the pickup and the rider sees the driver's location during the trip |
| Can users buy digital goods? | No. Rides are paid to the driver in cash or UPI, outside the app |
| Unrestricted internet or web browsing? | No |
| Is the app a web browser or search engine? | No |

Expected result: 3+ / Everyone, with "Users interact" and "Shares location".

### Target audience and content

| Question | Answer |
|---|---|
| Target age groups | **18 and over** only |
| Could the app unintentionally appeal to children? | No |
| Store presence (ages under 13) | Not shown, because only 18+ is selected |

### News apps

**No**, my app is not a news app.

### COVID-19 contact tracing and status apps

If the console still shows it: **My app is not a publicly available COVID-19 contact tracing or status app.**

### Data safety

**Overview**

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** (HTTPS to `api.65-0-233-253.sslip.io`, Google, Firebase and Didit; release builds allow HTTPS only) |
| Which of the following methods of account creation does your app support? | **Username and other authentication** (phone number + one-time code) |
| Delete account URL | `https://www.tamiltaxi.co.in/delete-account/` (the `www` address loads without a redirect) |
| Can users request deletion of some data without deleting their account? | **No** (optional question). Riders can remove saved places, emergency contacts, email and gender in the app, but a Yes needs a web page with the steps, and `/delete-account/` only covers closing the account |
| Committed to the Families Policy? | Not shown (18+ app) |
| Independent security review? | No |

**Data shared with third parties: none.** Everything below is "Collected", none of it "Shared". Google doesn't count
these as sharing: service providers that process data for us (AWS, Google Maps, Firebase Cloud Messaging, Didit,
WATX), what the rider sends on purpose (the driver sees the rider's name, number and pickup after a booking; trip share
and SOS go to contacts the rider picks), and disclosures the law requires.

**Ephemeral: No** for every type (trip chat is deleted a day after the last message, which is longer than Google's
"in memory only" meaning).

**Data types** (Required = the app doesn't work without it; Optional = the rider can skip it):

| Category › type | Collected | Required? | Purposes |
|---|---|---|---|
| Location › Approximate location | Yes | Optional (the pickup can be typed) | App functionality; Fraud prevention, security and compliance |
| Location › Precise location | Yes | Optional | App functionality; Fraud prevention, security and compliance |
| Personal info › Name | Yes | Required | App functionality; Account management |
| Personal info › Email address | Yes | Optional | Account management |
| Personal info › User IDs | Yes | Required | App functionality; Account management |
| Personal info › Address | Yes (saved Home / Work places) | Optional | App functionality; Personalization |
| Personal info › Phone number | Yes | Required | App functionality; Account management; Fraud prevention, security and compliance |
| Personal info › Other info | Yes (gender for Pink Taxi; from the optional ID check: name and date of birth on the ID, last 4 digits of the document number) | Optional | App functionality; Fraud prevention, security and compliance |
| Financial info › Purchase history | Yes (trips, fares, payment mode cash / UPI) | Required | App functionality; Personalization; Advertising or marketing (usual-trip reminders) |
| Messages › Other in-app messages | Yes (trip chat, Help & support tickets) | Optional | App functionality |
| Photos and videos › Photos | Yes (parcel photo, support screenshot, ID-check document scans and selfie) | Optional | App functionality; Fraud prevention, security and compliance |
| Contacts › Contacts | Yes (emergency contacts the rider adds; the receiver's name and number for a parcel) | Optional | App functionality |
| App activity › In-app search history | Yes (place searches; a fare checked but not booked) | Required | App functionality; Personalization; Advertising or marketing (the "Ooty?" reminder after an unbooked fare) |
| App activity › Other user-generated content | Yes (ratings and comments for drivers, parcel and moving details) | Optional | App functionality; Fraud prevention, security and compliance |
| Device or other IDs | Yes (notification token per device) | Required | App functionality |

**Not collected:** Health and fitness, Financial › User payment info (the rider pays in their own UPI app), Credit
score, Other financial info, Videos, Audio (the Didit SDK declares the microphone permission; our code never records),
Files and docs, Calendar, Web browsing, Installed apps (the app only checks whether WhatsApp is installed, for code
autofill, and sends nothing), App interactions, Other actions, Crash logs, Diagnostics (no analytics or crash SDK in
the app).

> Check once in the Didit console: if your identity workflow records a video or sound for liveness, also tick
> Photos and videos › Videos (and Audio › Voice or sound recordings), Optional, Fraud prevention.

### Government apps

**No**, not developed by or on behalf of a government.

### Financial features

**My app doesn't provide any financial features.** (The rider pays the driver in cash or in their own UPI app; the app
only shows the driver's UPI ID / QR. Paid driver plans are switched off.)

### Health apps

**My app does not have any health features.**

### Advertising ID

**No**, the app doesn't use an advertising ID (no `AD_ID` permission in the merged manifest, no ads or analytics SDK).

### Sensitive permissions

None of the rider app's permissions needs a declaration form: no background location, SMS, call log, all-files or
photo/video library access (photos come through the system photo picker or the camera).

If the console asks for a **Foreground service** declaration: the geolocator plugin declares a location service in the
manifest, but the rider app never starts it. The cleanest fix is to remove that service from the rider manifest
(`tools:node="remove"`) and upload again. Ask Claude to do it.

---

## 5. Release

| Step | What to do |
|---|---|
| Countries / regions | India only |
| Release name | `0.1.0 (1)` |
| Release notes (en-IN) | text below |

```
First release of Tamil Taxi: bike, auto and cab rides, parcels and house shifting in Coimbatore, with 0% commission for drivers.
```
