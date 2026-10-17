# Tamil Taxi design assets

Our logos, app icons and the pictures the apps use, in one place. The repo is public, so everything here is public
too: don't add anything private (owner-only files go in the git-ignored `docs/private/`).

## Logos

| File | What it is | Size | Used for |
|---|---|---|---|
| [logo/tamil-taxi.png](logo/tamil-taxi.png) | Rider logo, "Clean White": navy car and தமிழ், coral pin and "— TAXI —", transparent background | 1024 × 984 | The rider app: splash (P-01), welcome (P-02), About, launcher icon, Android splash screens |
| [logo/tamil-taxi-driver.png](logo/tamil-taxi-driver.png) | Driver logo: the same with "DRIVER" under TAXI | 954 × 1024 | The driver app: splash (D-01), welcome (D-02), launcher icon, Android splash screens, the floating bubble |

These two files are the masters: the apps get their copies from them (see [Updating](#updating)).

- Use them on white or a very light background. There is no white-on-dark or one-colour version yet.
- Leave free space around the logo of about the height of the TAXI line.
- Don't redraw or retype the Tamil lettering, recolour, stretch, outline or add shadows.

## App icons

| File | What it is |
|---|---|
| [app-icon/tamil-taxi-512.png](app-icon/tamil-taxi-512.png) | Rider app Play Store icon, 512 × 512 (the store rounds the corners) |
| [app-icon/tamil-taxi-driver-512.png](app-icon/tamil-taxi-driver-512.png) | Driver app Play Store icon, 512 × 512 |

The launcher icons on the phone are built from the same logos, in each app's `android/app/src/main/res/mipmap-*`.

## Vehicles

[vehicles/](vehicles/): the vehicle miniatures, 336 × 240 transparent WebP, soft 3D, white with one coral accent,
pointing right, with a soft ground shadow. The same files as `packages/tamiltaxi_ui/assets/vehicles/`.

| Files | What they are |
|---|---|
| `bike`, `scooty`, `auto`, `auto_priority`, `mini`, `sedan`, `suv` | The rider's ride tiers (`mini` is the app's "Mini", the cab) |
| `*_pink` | Pink Taxi copies (women riders with women drivers): the coral accent turned pink |
| `goods_bike`, `goods_scooty`, `three_wheeler`, `mini_truck`, `pickup`, `truck` | Parcel and Packers & Movers vehicles (`goods_scooty`: the scooty with the goods bike's box, made by `build.py`) |
| `way_rental`, `way_outstation` | Home's Rental and Outstation tiles: a stopwatch / suitcase in front of a sedan |

## Pictures

| File | What it is | Used on |
|---|---|---|
| [pictures/welcome-rider.webp](pictures/welcome-rider.webp) | A rider choosing between a bike, an auto and a cab | P-02 welcome |
| [pictures/welcome-driver.webp](pictures/welcome-driver.webp) | A smiling auto driver showing a payment received | D-02 welcome |
| [pictures/home-footer.png](pictures/home-footer.png) | Line art at the end of the rider's Home sheet | P-07 Home |

The ChatGPT prompts for the welcome pictures are in [../onboarding/prompts.md](../onboarding/prompts.md).

## Colours

| Name | Hex | Where |
|---|---|---|
| Coral 500 | `#F4511E` | Brand colour: the logo's pin and TAXI, accents and icons |
| Coral 600 | `#D84315` | Buttons, links and selected tabs (the app theme's primary colour) |
| Navy 900 | `#1E293B` | Text, the logo's car and தமிழ் |
| Yellow | `#FFC400` | The logo's roof sign and road edge |
| Green | `#16A34A` | Pickup on maps and lists |
| Red | `#DC2626` | Drop on maps and lists, SOS |
| White | `#FFFFFF` | Backgrounds, splash screens, app icon |

The app's full palette is in `packages/tamiltaxi_ui/lib/src/theme/tt_colors.dart`.

## Fonts

- App: **Poppins** for headings and **Inter** for text, bundled in `packages/tamiltaxi_ui/assets/google_fonts/`.
- Logo: "TAXI" and "DRIVER" are Montserrat SemiBold. "தமிழ்" is custom lettering from the brand board, not a font.

## Updating

- **New logo art:** `python3 scripts/brand_icons.py passenger --from new-art.png` (or `driver`). It trims the art,
  saves it here as the master, copies it into the app and rebuilds the launcher icons, splash screens and the Play
  Store icon.
- **Rebuild from the masters here:** `python3 scripts/brand_icons.py passenger` and `python3 scripts/brand_icons.py driver`.
- **Vehicles:** `python3 scripts/vehicle_icons/build.py` writes the app files and the copies here. It needs the
  ChatGPT sprite sheets in `docs/design/vechile/`, which are kept local (git-ignored).
- **Pictures:** replace the file in the app and copy it here under the name above.
