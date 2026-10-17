# Mobile app versions

Every build of the two apps sent to Google Play, what it was built from, and the app changes waiting for the next
upload. Fixes and new features ship together in the next release, not as separate builds.

**Keep it current:**
- Commit an app change (`apps/passenger`, `apps/driver`, or `packages/*` when an app uses it): add it under that
  app's **Next release** in the same commit.
- Upload a bundle: raise `version:` in the app's `pubspec.yaml`, add a row to its table (with the commit the bundle was
  built from), move the "Next release" items into it and start a new empty list.
- A Play status changes (review passed, rolled out, production): update the row's **Status**.

`version: X.Y.Z+N` in `pubspec.yaml`: `X.Y.Z` is the version name riders see, `N` the version code. Play refuses a
version code it has seen before, so raise `N` for every upload. Changes on the server (API, admin, Google Cloud keys)
need no app release and are not listed here.

---

## Tamil Taxi (rider) · `com.tamiltaxi.passenger`

| Version | Code | Built | Built from | Track | Status |
|---|---|---|---|---|---|
| 0.1.0 | 1 | 16 Oct 2026 | `42008b6` plus upload-key signing and HTTPS-only release builds (committed a minute later as `56e3442`, `8ebcea4`) | Closed testing – Alpha (India) | Sent for review 16 Oct 2026 |

0.1.0 release notes: "First release of Tamil Taxi: bike, auto and cab rides, parcels and house shifting in Coimbatore,
with 0% commission for drivers."

### Next release: 0.1.1 (code 2)

- `0907cbe` In-app privacy text: sign-in codes come on WhatsApp; ride reminders.
- `824a1c1` Sign-in screens ask for the WhatsApp number.

---

## Tamil Taxi Driver · `com.tamiltaxi.driver`

| Version | Code | Built | Built from | Track | Status |
|---|---|---|---|---|---|
| 0.1.0 | 1 | 16 Oct 2026 | `824a1c1` | Closed testing – Alpha (India) | Available to testers: installed from Play on the test phone 16 Oct 2026 |

0.1.0 release notes: "First release of Tamil Taxi Driver: get ride, parcel and house-shifting requests in Coimbatore
and keep 100% of every fare. 0% commission, no subscription."

### Next release: 0.1.1 (code 2)

- `09f6669` D-06 Personal details shows the service city (it was empty for new sign-ups).
- `2b006a6` D-03c Permissions after the OTP and at start-up: precise location, notifications, display over other apps,
  full-screen alerts and no battery limits must all be allowed to continue. Adds the
  `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` permission (see [driver.md](driver.md), "Other permissions").
