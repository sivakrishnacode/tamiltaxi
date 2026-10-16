# Google Play submission

Everything Play Console asks for, answered from the code, plus the store graphics. Written 16 Oct 2026 for version
0.1.0 (1) of both apps.

| File | What |
|---|---|
| [passenger.md](passenger.md) | Tamil Taxi (rider): store listing text, every App content answer, Data safety form, release notes |
| [driver.md](driver.md) | Tamil Taxi Driver: what differs from the rider app, and the extra declarations (foreground services, full-screen alerts) |
| [passenger/](passenger/) | Rider store graphics: `icon-512.png`, `feature-graphic.png`, `phone/` (6), `tablet-7in/` (6), `tablet-10in/` (6) |

The screenshots are the real rider app on an Android phone with Google Maps: Design gallery frames in mock mode, with
the phone's location turned off for the app so every place is a seed place. `scripts/store_screenshots.py` paints out
the phone's notification icons and frames each one with a caption. Names, numbers, places and fares in them are demo
data. The feature graphic's art was made with ChatGPT; the logo and text on it are ours.

## Before you submit

Must fix, or the upload or review fails:

1. **Upload key: done (16 Oct 2026).** `flutter build appbundle` signs with the upload key in the git-ignored
   `android/key.properties` of each app (one keystore for both, outside the repo; path, password and SHA-1 in
   `docs/tech-docs/credentials.local.md`). **Back the keystore file and its password up off this laptop.** APKs from
   `build_apks.sh` stay debug-signed. Build: `cd apps/passenger && ../../scripts/flutter.sh build appbundle` →
   `build/app/outputs/bundle/release/app-release.aab`. Raise `version:` in `pubspec.yaml` for every new upload.
2. **Play App Signing changes the app's certificate.** Copy the app signing key's SHA-1 from Play Console › Test and
   release › App integrity, then:
   - add it (and the upload key's SHA-1) to the Android restriction of the Google Maps key, or maps stay blank in
     installs from Play;
   - update the app hash in both WATX WhatsApp templates (`using.tech.md`, "WhatsApp autofill"), or code autofill
     stops working.
3. **Privacy policy.** `apps/web/src/lib/legal.ts` still names "An SMS provider" for sign-in codes (now WhatsApp
   through WATX) and doesn't mention reminder and offer notifications. Fix both and redeploy the website before you
   fill in Data safety; the two must agree.
4. **Support mailbox.** `support@tamiltaxi.co.in` is the public contact on the listing, the website and the apps.
   It must exist and be read.
5. **Plain HTTP exception: done (16 Oct 2026).** Release builds of both apps allow HTTPS only.

Worth knowing:

- **New personal developer accounts** must run a closed test with at least 12 testers for 14 days in a row before
  they can apply for production. Organisation accounts (D-U-N-S number) skip this. Start the closed test early.
- **Review login.** Reviewers sign in with the staging `DEV_OTP_CODE`, which only works while `OTP_DEV_MODE=true`.
  Before you switch to live codes, keep one review number with a fixed code.
- **Name.** The ruling party's manifesto promised a government "Tamil Taxi app". The listing says Tamil Taxi is
  independent. Check the trademark question before launch, and don't run government-scheme banners in the app
  while the listing is in review, so it doesn't look government-run.
- **Tablets.** The tablet screenshots show the phone app inside a tablet-sized frame (the app has no tablet layout).
  That's enough to list the app on tablets, but Google won't feature it in tablet sections.

## Order in Play Console

1. **Create app** (passenger.md §1).
2. **Dashboard › Set up your app:** App access, Ads, Content rating, Target audience, News apps, Data safety,
   Government apps, Financial features, Health, Advertising ID (passenger.md §4), Store settings (§2), Main store
   listing with the graphics (§3).
3. **Test and release › Internal testing:** create a release, upload the `.aab`, accept Play App Signing, add
   testers, roll out. Then do step 2 under "Must fix".
4. **Closed testing** with 12+ testers for 14 days if the account is personal.
5. **Production:** India only, release notes from passenger.md §5, send for review (first reviews take a few days).

Then repeat for the driver app with [driver.md](driver.md).

## Refreshing the screenshots

```bash
python3 scripts/store_screenshots.py      # raw phone captures in docs/play-store/raw/ → framed PNGs in passenger/
```

Captions are in the script's `SHOTS` list. The top of the script says how to retake the raw captures (mock-mode build
with the Design gallery, location off, clean status bar, `adb`).
