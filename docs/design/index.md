# Tamil Taxi · screens

Screenshots of the apps as they are today, one per screen: every frame in each app's Design gallery
(Account › Design gallery) plus the screens added after the original design. Phone frames are 390 × 844 at 2x
(780 × 1688), rendered from the real widgets with seed data (mock mode).

**Refresh:** `python3 scripts/export_design.py` renders both apps (each app's `test/tool/design_export_test.dart`)
and rebuilds this folder and `index.csv`. Don't edit the PNGs by hand.

Notes:
- Maps show no tiles here (tests never load the network); on a phone they show CARTO or Google tiles.
- Areas on maps are H3 hexes, never circles: demand (res 7, nested res 8), the service-area outline and the
  search area. The search radar pulse stays round (an animation, not an area). Live maps draw the API's real H3
  outlines.
- Tamil text and a few symbols (e.g. "→" in Poppins headings) show as boxes in these renders only: the test
  engine has no system fallback font. Phones render them.
- Paid-plan screens are still in the code but switched off (`driverPlansEnabled`), so riders and drivers don't
  see them while the app is free.
- Icons: Material Symbols Rounded (`material_symbols_icons`).

## Design system

| Frame ID | Screen | Status | File |
|---|---|---|---|
| DS | Design system board · page 1 of 25 | In the app | [system/DS-board-01.png](system/DS-board-01.png) |
| DS | Design system board · page 2 of 25 | In the app | [system/DS-board-02.png](system/DS-board-02.png) |
| DS | Design system board · page 3 of 25 | In the app | [system/DS-board-03.png](system/DS-board-03.png) |
| DS | Design system board · page 4 of 25 | In the app | [system/DS-board-04.png](system/DS-board-04.png) |
| DS | Design system board · page 5 of 25 | In the app | [system/DS-board-05.png](system/DS-board-05.png) |
| DS | Design system board · page 6 of 25 | In the app | [system/DS-board-06.png](system/DS-board-06.png) |
| DS | Design system board · page 7 of 25 | In the app | [system/DS-board-07.png](system/DS-board-07.png) |
| DS | Design system board · page 8 of 25 | In the app | [system/DS-board-08.png](system/DS-board-08.png) |
| DS | Design system board · page 9 of 25 | In the app | [system/DS-board-09.png](system/DS-board-09.png) |
| DS | Design system board · page 10 of 25 | In the app | [system/DS-board-10.png](system/DS-board-10.png) |
| DS | Design system board · page 11 of 25 | In the app | [system/DS-board-11.png](system/DS-board-11.png) |
| DS | Design system board · page 12 of 25 | In the app | [system/DS-board-12.png](system/DS-board-12.png) |
| DS | Design system board · page 13 of 25 | In the app | [system/DS-board-13.png](system/DS-board-13.png) |
| DS | Design system board · page 14 of 25 | In the app | [system/DS-board-14.png](system/DS-board-14.png) |
| DS | Design system board · page 15 of 25 | In the app | [system/DS-board-15.png](system/DS-board-15.png) |
| DS | Design system board · page 16 of 25 | In the app | [system/DS-board-16.png](system/DS-board-16.png) |
| DS | Design system board · page 17 of 25 | In the app | [system/DS-board-17.png](system/DS-board-17.png) |
| DS | Design system board · page 18 of 25 | In the app | [system/DS-board-18.png](system/DS-board-18.png) |
| DS | Design system board · page 19 of 25 | In the app | [system/DS-board-19.png](system/DS-board-19.png) |
| DS | Design system board · page 20 of 25 | In the app | [system/DS-board-20.png](system/DS-board-20.png) |
| DS | Design system board · page 21 of 25 | In the app | [system/DS-board-21.png](system/DS-board-21.png) |
| DS | Design system board · page 22 of 25 | In the app | [system/DS-board-22.png](system/DS-board-22.png) |
| DS | Design system board · page 23 of 25 | In the app | [system/DS-board-23.png](system/DS-board-23.png) |
| DS | Design system board · page 24 of 25 | In the app | [system/DS-board-24.png](system/DS-board-24.png) |
| DS | Design system board · page 25 of 25 | In the app | [system/DS-board-25.png](system/DS-board-25.png) |

## Passenger app

| Frame ID | Screen | Status | File |
|---|---|---|---|
| P-01 | Splash | In the app | [passenger/P-01.png](passenger/P-01.png) |
| P-02 | Welcome | Added after the design | [passenger/P-02.png](passenger/P-02.png) |
| P-03 | Phone number | In the app | [passenger/P-03.png](passenger/P-03.png) |
| P-04 | OTP verification | In the app | [passenger/P-04.png](passenger/P-04.png) |
| P-05 | Profile setup | In the app | [passenger/P-05.png](passenger/P-05.png) |
| P-06 | Location permission | In the app | [passenger/P-06.png](passenger/P-06.png) |
| P-07 | Home · Ride tab | In the app | [passenger/P-07.png](passenger/P-07.png) |
| P-07b | Home · trip in progress banner | In the app | [passenger/P-07b.png](passenger/P-07b.png) |
| P-08 | Search pickup and drop | In the app | [passenger/P-08.png](passenger/P-08.png) |
| P-09 | Pin on map | In the app | [passenger/P-09.png](passenger/P-09.png) |
| P-10 | Choose vehicle | In the app | [passenger/P-10.png](passenger/P-10.png) |
| P-34 | Rent a cab · by the hour | Added after the design | [passenger/P-34.png](passenger/P-34.png) |
| P-35 | Outstation · one way or round trip | Added after the design | [passenger/P-35.png](passenger/P-35.png) |
| P-35b | Outstation · where to | Added after the design | [passenger/P-35b.png](passenger/P-35b.png) |
| P-36 | Booked for later | Added after the design | [passenger/P-36.png](passenger/P-36.png) |
| P-11 | Fare details (sheet) | In the app | [passenger/P-11.png](passenger/P-11.png) |
| P-12 | Finding your driver | In the app | [passenger/P-12.png](passenger/P-12.png) |
| P-13 | Driver assigned · arriving | In the app | [passenger/P-13.png](passenger/P-13.png) |
| P-14 | Chat with driver | In the app | [passenger/P-14.png](passenger/P-14.png) |
| P-15 | Driver has arrived | In the app | [passenger/P-15.png](passenger/P-15.png) |
| P-16 | Ride in progress | In the app | [passenger/P-16.png](passenger/P-16.png) |
| P-17 | SOS · Emergency help | In the app | [passenger/P-17.png](passenger/P-17.png) |
| P-18 | Share trip (sheet) | In the app | [passenger/P-18.png](passenger/P-18.png) |
| P-19 | Ride completed · pay driver | In the app | [passenger/P-19.png](passenger/P-19.png) |
| P-20 | Rate driver | In the app | [passenger/P-20.png](passenger/P-20.png) |
| P-21 | Activity | In the app | [passenger/P-21.png](passenger/P-21.png) |
| P-22 | Trip details | In the app | [passenger/P-22.png](passenger/P-22.png) |
| P-23 | Account | In the app | [passenger/P-23.png](passenger/P-23.png) |
| P-23b | Add / edit saved place | In the app | [passenger/P-23b.png](passenger/P-23b.png) |
| P-24 | Emergency contacts | In the app | [passenger/P-24.png](passenger/P-24.png) |
| P-24b | Add emergency contact (sheet) | In the app | [passenger/P-24b.png](passenger/P-24b.png) |
| P-25 | Help & support | In the app | [passenger/P-25.png](passenger/P-25.png) |
| P-25b | New support ticket | In the app | [passenger/P-25b.png](passenger/P-25b.png) |
| P-10b | Who's riding (sheet) | Added after the design | [passenger/P-10b.png](passenger/P-10b.png) |
| P-26 | Edit profile | Added after the design | [passenger/P-26.png](passenger/P-26.png) |
| P-27 | Saved places | Added after the design | [passenger/P-27.png](passenger/P-27.png) |
| P-28 | Safety preferences | Added after the design | [passenger/P-28.png](passenger/P-28.png) |
| P-29 | Verify identity | Added after the design | [passenger/P-29.png](passenger/P-29.png) |
| P-31 | About | Added after the design | [passenger/P-31.png](passenger/P-31.png) |
| P-32 | Terms | Added after the design | [passenger/P-32.png](passenger/P-32.png) |
| P-33 | Privacy | Added after the design | [passenger/P-33.png](passenger/P-33.png) |

## Send parcel (passenger app)

| Frame ID | Screen | Status | File |
|---|---|---|---|
| PP-01 | Parcel home | In the app | [parcel/PP-01.png](parcel/PP-01.png) |
| PP-02 | Pickup details | In the app | [parcel/PP-02.png](parcel/PP-02.png) |
| PP-03 | Drop · receiver details | In the app | [parcel/PP-03.png](parcel/PP-03.png) |
| PP-04 | Parcel details | In the app | [parcel/PP-04.png](parcel/PP-04.png) |
| PP-05 | Prohibited items (sheet) | In the app | [parcel/PP-05.png](parcel/PP-05.png) |
| PP-06 | Choose goods vehicle · review | In the app | [parcel/PP-06.png](parcel/PP-06.png) |
| PP-07 | Finding a goods driver | In the app | [parcel/PP-07.png](parcel/PP-07.png) |
| PP-08 | Driver assigned · picking up | In the app | [parcel/PP-08.png](parcel/PP-08.png) |
| PP-09 | Parcel in transit | In the app | [parcel/PP-09.png](parcel/PP-09.png) |
| PP-10 | Parcel delivered | In the app | [parcel/PP-10.png](parcel/PP-10.png) |
| PH-01 | Packers & Movers · moving details | Added after the design | [parcel/PH-01.png](parcel/PH-01.png) |
| PH-02 | Packers & Movers · items (typed) | Added after the design | [parcel/PH-02.png](parcel/PH-02.png) |
| PH-03 | Packers & Movers · day and extras | Added after the design | [parcel/PH-03.png](parcel/PH-03.png) |
| PH-04 | Packers & Movers · review | Added after the design | [parcel/PH-04.png](parcel/PH-04.png) |
| PH-05 | Packers & Movers · booked | Added after the design | [parcel/PH-05.png](parcel/PH-05.png) |

## Passenger states

| Frame ID | Screen | Status | File |
|---|---|---|---|
| S-01 | No drivers nearby | In the app | [states/S-01.png](states/S-01.png) |
| S-02 | Driver cancelled | In the app | [states/S-02.png](states/S-02.png) |
| S-03 | Cancel ride · confirm dialog | In the app | [states/S-03.png](states/S-03.png) |
| S-04 | No internet | In the app | [states/S-04.png](states/S-04.png) |
| S-05 | Location permission denied | In the app | [states/S-05.png](states/S-05.png) |
| S-06 | Empty activity | In the app | [states/S-06.png](states/S-06.png) |
| S-07a | Loading · Home sheet skeleton | In the app | [states/S-07a.png](states/S-07a.png) |
| S-07b | Loading · Activity skeleton | In the app | [states/S-07b.png](states/S-07b.png) |
| S-08 | Service not available | In the app | [states/S-08.png](states/S-08.png) |

## Driver app

| Frame ID | Screen | Status | File |
|---|---|---|---|
| D-01 | Splash | In the app | [driver/D-01.png](driver/D-01.png) |
| D-02 | Welcome | In the app | [driver/D-02.png](driver/D-02.png) |
| D-03a | Phone number | In the app | [driver/D-03a.png](driver/D-03a.png) |
| D-03b | OTP verification | In the app | [driver/D-03b.png](driver/D-03b.png) |
| D-04 | Choose work type | In the app | [driver/D-04.png](driver/D-04.png) |
| D-05 | Choose vehicle | As in the flow (plans off: no price) | [driver/D-05.png](driver/D-05.png) |
| D-06 | Personal details | In the app | [driver/D-06.png](driver/D-06.png) |
| D-07 | Registration · vehicle card + checklist | In the app | [driver/D-07.png](driver/D-07.png) |
| D-08a | Upload document · before capture | In the app | [driver/D-08a.png](driver/D-08a.png) |
| D-08b | Upload document · captured | In the app | [driver/D-08b.png](driver/D-08b.png) |
| D-09 | Selfie verification | In the app | [driver/D-09.png](driver/D-09.png) |
| D-11 | Choose plan · start free trial | Off while the app is free (paid plans switched off) | [driver/D-11.png](driver/D-11.png) |
| D-12a | UPI Autopay setup | Off while the app is free (paid plans switched off) | [driver/D-12a.png](driver/D-12a.png) |
| D-12b | Autopay success | Off while the app is free (paid plans switched off) | [driver/D-12b.png](driver/D-12b.png) |
| D-13 | Home · offline | In the app | [driver/D-13.png](driver/D-13.png) |
| D-14 | Home · online, waiting | In the app | [driver/D-14.png](driver/D-14.png) |
| D-14b | Home · trip in progress banner | In the app | [driver/D-14b.png](driver/D-14b.png) |
| D-15 | Incoming ride request | In the app | [driver/D-15.png](driver/D-15.png) |
| D-15c | Incoming request · rental | Added after the design | [driver/D-15c.png](driver/D-15c.png) |
| D-15d | Incoming request · outstation, booked ahead | Added after the design | [driver/D-15d.png](driver/D-15d.png) |
| D-16 | Navigate to pickup | In the app | [driver/D-16.png](driver/D-16.png) |
| D-17 | Enter ride OTP | In the app | [driver/D-17.png](driver/D-17.png) |
| D-17-error | Enter ride OTP · error state | In the app | [driver/D-17-error.png](driver/D-17-error.png) |
| D-18 | Ride in progress | In the app | [driver/D-18.png](driver/D-18.png) |
| D-18c | Rental in progress | Added after the design | [driver/D-18c.png](driver/D-18c.png) |
| D-18b | Driver SOS | In the app | [driver/D-18b.png](driver/D-18b.png) |
| D-19 | Collect payment | In the app | [driver/D-19.png](driver/D-19.png) |
| D-19c | Collect payment · rental with extra km and time | Added after the design | [driver/D-19c.png](driver/D-19c.png) |
| D-20 | Incoming delivery request | In the app | [driver/D-20.png](driver/D-20.png) |
| D-20c | Incoming request · Packers & Movers | Added after the design | [driver/D-20c.png](driver/D-20c.png) |
| D-21 | Delivery in progress | In the app | [driver/D-21.png](driver/D-21.png) |
| D-21c | Packers & Movers · at the pickup | Added after the design | [driver/D-21c.png](driver/D-21c.png) |
| D-22a | Complete delivery with OTP | In the app | [driver/D-22a.png](driver/D-22a.png) |
| D-22b | Collect from receiver | In the app | [driver/D-22b.png](driver/D-22b.png) |
| D-22c | Collect · Packers & Movers | Added after the design | [driver/D-22c.png](driver/D-22c.png) |
| D-23 | Earnings | In the app | [driver/D-23.png](driver/D-23.png) |
| D-23b | Earnings · trip detail sheet | In the app | [driver/D-23b.png](driver/D-23b.png) |
| D-24 | Plan · active | Off while the app is free (paid plans switched off) | [driver/D-24.png](driver/D-24.png) |
| D-24b | Plan · paused | Off while the app is free (paid plans switched off) | [driver/D-24b.png](driver/D-24b.png) |
| D-24c | Plan · cancelled | Off while the app is free (paid plans switched off) | [driver/D-24c.png](driver/D-24c.png) |
| D-25a | Home · grace period | Off while the app is free (paid plans switched off) | [driver/D-25a.png](driver/D-25a.png) |
| D-25b | Home · plan expired | Off while the app is free (paid plans switched off) | [driver/D-25b.png](driver/D-25b.png) |
| D-26 | Driver account | In the app | [driver/D-26.png](driver/D-26.png) |
| D-40 | Services | Added after the design | [driver/D-40.png](driver/D-40.png) |
| D-40b | Services · pause sheet | Added after the design | [driver/D-40b.png](driver/D-40b.png) |
| D-41 | Rate card | Added after the design | [driver/D-41.png](driver/D-41.png) |
| D-27 | Profile photo | Added after the design | [driver/D-27.png](driver/D-27.png) |
| D-28 | My documents | Added after the design | [driver/D-28.png](driver/D-28.png) |
| D-29 | Vehicle details | Added after the design | [driver/D-29.png](driver/D-29.png) |
| D-30 | UPI ID | Added after the design | [driver/D-30.png](driver/D-30.png) |
| D-31 | Emergency contact | Added after the design | [driver/D-31.png](driver/D-31.png) |
| D-32 | Booking preferences | Added after the design | [driver/D-32.png](driver/D-32.png) |
| D-34 | Help & support | Added after the design | [driver/D-34.png](driver/D-34.png) |
| D-35 | Raise a ticket | Added after the design | [driver/D-35.png](driver/D-35.png) |
| D-36 | Chat with passenger | Added after the design | [driver/D-36.png](driver/D-36.png) |
| D-38 | Terms | Added after the design | [driver/D-38.png](driver/D-38.png) |
| D-39 | Privacy | Added after the design | [driver/D-39.png](driver/D-39.png) |

## Driver states

| Frame ID | Screen | Status | File |
|---|---|---|---|
| S-10 | Account on hold | In the app | [states/S-10.png](states/S-10.png) |
| S-10b | Paused for cancellations | Added after the design | [states/S-10b.png](states/S-10b.png) |
| S-11 | Missed ride request | In the app | [states/S-11.png](states/S-11.png) |
| S-12 | No ride requests yet | In the app | [states/S-12.png](states/S-12.png) |
| S-13 | Selfie check before going online | In the app | [states/S-13.png](states/S-13.png) |
| S-14 | Autopay payment failed | Off while the app is free (paid plans switched off) | [states/S-14.png](states/S-14.png) |
| S-15 | Empty earnings | In the app | [states/S-15.png](states/S-15.png) |
| S-16 | GPS weak / location off | In the app | [states/S-16.png](states/S-16.png) |
| S-17 | Cancellation rate warning | Added after the design | [states/S-17.png](states/S-17.png) |
