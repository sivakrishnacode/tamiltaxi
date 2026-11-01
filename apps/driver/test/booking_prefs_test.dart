import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_driver/features/account/booking_preferences_screen.dart';
import 'package:tamiltaxi_driver/features/home/widgets/direction_panel.dart';
import 'package:tamiltaxi_driver/state/booking_prefs.dart';
import 'package:tamiltaxi_driver/state/driver_account.dart';
import 'package:tamiltaxi_driver/state/rate_card.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/harness.dart';
import 'support/live_fakes.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  const home = SavedArea(name: 'Home', location: LatLng(11.08, 77));

  /// Scrolls [f] to the middle (the Save bar and snacks cover the bottom edge) before a tap.
  Future<void> center(WidgetTester tester, Finder f) async {
    await Scrollable.ensureVisible(tester.element(f), alignment: 0.5);
    await tester.pump();
  }

  test('summary and JSON of the preferences', () {
    const none = BookingPrefs();
    expect(none.hasFilters, isFalse);
    expect(none.toJson(), {
      'maxPickupKm': null,
      'minTripKm': null,
      'maxTripKm': null,
      'goTo': null,
      'stayIn': null,
      'areas': <Object>[],
      'shifting': false,
      'helpers': 2,
    });

    const prefs = BookingPrefs(
      maxPickupKm: 2,
      minTripKm: 5,
      maxTripKm: 15,
      goTo: GoToDestination(location: LatLng(11.08, 77), name: 'Home'),
    );
    expect(prefs.summary, 'going to Home · pickup ≤ 2 km · trips 5–15 km');
    expect(prefs.tripFilterSummary, 'pickup ≤ 2 km · trips 5–15 km');
    expect(const BookingPrefs(minTripKm: 5).summary, 'trips over 5 km');
    expect(const BookingPrefs(maxTripKm: 2.5).summary, 'trips under 2.5 km');

    final back = BookingPrefs.fromJson({
      'maxPickupKm': 2,
      'minTripKm': null,
      'maxTripKm': 15,
      'goTo': {'lat': 11.08, 'lng': 77, 'name': 'Home', 'until': '2026-09-29T12:00:00Z'},
      'parcels': false,
      'areas': [
        {'name': 'Home', 'lat': 11.08, 'lng': 77},
        {'name': 'Broken'},
      ],
    });
    expect(back.maxPickupKm, 2);
    expect(back.minTripKm, isNull);
    expect(back.goTo!.until, isNotNull);
    expect(back.parcels, isFalse);
    expect(back.areas, [home]);
    // Not set: the vehicle's default (on for bikes, off for autos: their passenger seat).
    final unset = BookingPrefs.fromJson(const {});
    expect(unset.parcels, isNull);
    expect(unset.isOn(DriverService.parcels, VehicleKind.bike, DateTime.now()), isTrue);
    expect(unset.isOn(DriverService.parcels, VehicleKind.auto, DateTime.now()), isFalse);
    // A pause from the server holds the service off until it ends.
    final paused = BookingPrefs.fromJson({
      'parcels': true,
      'pauses': {'parcels': {'until': DateTime.now().add(const Duration(minutes: 30)).toUtc().toIso8601String(), 'reason': 'Too far'}},
    });
    expect(paused.isOn(DriverService.parcels, VehicleKind.auto, DateTime.now()), isFalse);
    expect(paused.isOn(DriverService.parcels, VehicleKind.auto, DateTime.now().add(const Duration(hours: 1))), isTrue);
    // House shifting: off unless switched on; helpers within 0–8.
    expect(BookingPrefs.fromJson(const {}).shifting, isFalse);
    final mover = BookingPrefs.fromJson(const {'shifting': true, 'helpers': 12});
    expect((mover.shifting, mover.helpers), (true, 8));
    expect(const BookingPrefs(shifting: true, helpers: 3).summary, 'Packers & Movers with 3 helpers');
  });

  test('Go To and Stay In are never on together', () {
    final stay = const BookingPrefs().stayingIn(home, radiusKm: 8);
    expect(stay.stayIn?.radiusKm, 8);
    expect(stay.hasDirection, isTrue);
    expect(stay.toJson()['stayIn'], {'lat': 11.08, 'lng': 77.0, 'name': 'Home', 'radiusKm': 8.0});
    final go = stay.goingTo(home);
    expect(go.goTo?.name, 'Home');
    expect(go.stayIn, isNull);
    expect(go.goingTo(null).hasDirection, isFalse);
    expect(StayInArea.fromJson({'lat': 11, 'lng': 77, 'name': 'X', 'radiusKm': 5, 'until': '2026-09-29T20:00:00Z'})!.until, isNotNull);
  });

  test('the request card tag follows what is on, until its time is up', () {
    final now = DateTime(2026, 9, 30, 10);
    final going = BookingPrefs(goTo: GoToDestination(location: home.location, name: 'Home', until: now.add(const Duration(hours: 1))));
    expect(directionTag(going, now), 'Towards Home');
    expect(directionTag(going, now.add(const Duration(hours: 2))), isNull);
    final staying = BookingPrefs(stayIn: StayInArea(location: home.location, name: 'RS Puram', radiusKm: 5));
    expect(directionTag(staying, now), 'Inside RS Puram');
    expect(directionTag(const BookingPrefs(), now), isNull);
  });

  test('a Go To whose time is up is dropped; one still running (or not yet timed) stays', () {
    final now = DateTime(2026, 10, 3, 12);
    final over = BookingPrefs(goTo: GoToDestination(location: home.location, name: 'Home', until: now.subtract(const Duration(minutes: 1))));
    expect(withoutExpired(over, now).goTo, isNull);
    final running = BookingPrefs(stayIn: StayInArea(location: home.location, name: 'Home', radiusKm: 5, until: now.add(const Duration(hours: 1))));
    expect(withoutExpired(running, now).stayIn, isNotNull);
    expect(withoutExpired(const BookingPrefs().goingTo(home), now).goTo, isNotNull);
  });

  test('live: an expired Go To is not shown, and saving other preferences does not send it back', () async {
    final rig = await LiveRig.create();
    rig.jobs.prefs = BookingPrefs(
      maxPickupKm: 3,
      goTo: GoToDestination(location: home.location, name: 'Home', until: DateTime.now().subtract(const Duration(minutes: 5))),
    );
    final container = ProviderContainer(overrides: rig.overrides);
    addTearDown(container.dispose);
    final loaded = await container.read(bookingPrefsProvider.future);
    expect(loaded.goTo, isNull);
    expect(loaded.maxPickupKm, 3);

    // The stored copy goes stale on the server's side too: change() never re-sends it.
    rig.jobs.prefs = rig.jobs.prefs.copyWith(
        goTo: () => GoToDestination(location: home.location, name: 'Home', until: DateTime.now().subtract(const Duration(minutes: 1))));
    container.read(bookingPrefsProvider.notifier).state = AsyncData(rig.jobs.prefs);
    await container.read(bookingPrefsProvider.notifier).change((p) => p.copyWith(parcels: false));
    expect(rig.jobs.prefs.goTo, isNull);
    expect(rig.jobs.prefs.parcels, isFalse);
  });

  testWidgets('set the farthest pickup and a minimum trip length, then save; Services is a link', (tester) async {
    final container = await pumpRoute(tester, '/account/booking-preferences');
    expect(find.byType(BookingPreferencesScreen), findsOneWidget);
    expect(find.text('Any distance'), findsOneWidget);
    expect(find.text('Go To / Stay In'), findsOneWidget);
    // Parcels and the other services moved to Services.
    expect(find.text('Parcels too'), findsNothing);
    expect(find.text('Services', skipOffstage: false), findsOneWidget);

    await tester.tap(find.byTooltip('More').first);
    await tester.pump();
    expect(find.text('1.0 km max'), findsOneWidget);
    await tester.tap(find.byTooltip('More').first);
    await tester.pump();
    expect(find.text('1.5 km max'), findsOneWidget);

    await center(tester, find.byType(Checkbox).first);
    await tester.tap(find.byType(Checkbox).first);
    await tester.pump();
    expect(find.text('5.0 km'), findsOneWidget);

    await center(tester, find.text('Save'));
    await tester.tap(find.text('Save'));
    await tester.pump(const Duration(milliseconds: 300));
    final saved = container.read(bookingPrefsProvider).value!;
    expect(saved.maxPickupKm, 1.5);
    expect(saved.minTripKm, 5);
    expect(saved.maxTripKm, isNull);
    await tester.pump(const Duration(seconds: 5)); // snack
  });

  testWidgets('Services: a goods-truck driver switches Packers & Movers on with the helpers they bring', (tester) async {
    final container = await pumpRoute(tester, '/account/services', overrides: [driverProfileProvider.overrideWith(_Mover.new)]);
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Always on'), findsOneWidget, reason: 'parcels, their main service');
    expect(find.text('Goods to another town'), findsOneWidget);
    await center(tester, find.text('Packers & Movers'));
    await tester.tap(find.byType(Switch).last);
    await tester.pumpAndSettle();
    expect(find.text('Helpers you bring'), findsOneWidget);
    await tester.tap(find.byTooltip('More'));
    await tester.pump();
    expect(find.text('Moves needing up to 3. The customer pays for them in the price.'), findsOneWidget);
    await tester.tap(find.text('Switch on'));
    await tester.pumpAndSettle();
    final saved = container.read(bookingPrefsProvider).value!;
    expect((saved.shifting, saved.helpers), (true, 3));
    expect(find.text('With 3 helpers'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5)); // snack
  });

  testWidgets('Services: an auto driver switches parcels on, then pauses them for 30 minutes', (tester) async {
    final container = await pumpRoute(tester, '/account/services', overrides: [driverProfileProvider.overrideWith(_AutoDriver.new)]);
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Auto rides'), findsOneWidget);
    expect(find.text('Packers & Movers'), findsNothing);
    final kind = VehicleKind.auto;
    bool parcelsOn() => container.read(bookingPrefsProvider).value!.isOn(DriverService.parcels, kind, DateTime.now());
    expect(parcelsOn(), isFalse, reason: 'off for autos until switched on');
    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();
    expect(parcelsOn(), isTrue);
    await tester.pump(const Duration(seconds: 5)); // snack

    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();
    expect(find.text('Pause Parcels?'), findsOneWidget);
    expect(tester.widget<TtButton>(find.widgetWithText(TtButton, 'Pause')).onPressed, isNull, reason: 'pick how long first');
    await tester.tap(find.text('30 min'));
    await tester.tap(find.text('Too far'));
    await tester.pump();
    await tester.tap(find.widgetWithText(TtButton, 'Pause'));
    await tester.pumpAndSettle();
    final p = container.read(bookingPrefsProvider).value!.pauseOf(DriverService.parcels, DateTime.now());
    expect(p?.reason, 'Too far');
    expect(parcelsOn(), isFalse);
    expect(find.textContaining('Paused till'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5)); // snack
  });

  testWidgets('Rate card: an auto driver sees Auto, Auto Priority and Parcels rates', (tester) async {
    await pumpRoute(tester, '/account/rate-card', overrides: [driverProfileProvider.overrideWith(_AutoDriver.new)]);
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Auto Priority'), findsOneWidget);
    expect(find.text('Base fare'), findsOneWidget);
    expect(find.text('₹25'), findsOneWidget);
    await tester.tap(find.text('Auto Priority'));
    await tester.pump();
    expect(find.text('₹30'), findsOneWidget);
    await tester.tap(find.text('Parcels'));
    await tester.pump();
    expect(find.text('₹55'), findsOneWidget, reason: 'Parcel on Auto minimum fare');
    expect(find.text('Night fare'), findsNothing, reason: 'the demo card has no night fare');
  });

  testWidgets('Rate card: autos see the government night fare; other vehicles do not', (tester) async {
    final card = RateCard(
      rules: RateCard.demo.rules,
      autoNight: const AutoNightFare(multiplier: 1.5, startHour: 22, endHour: 5),
    );
    await pumpRoute(tester, '/account/rate-card', overrides: [
      driverProfileProvider.overrideWith(_AutoDriver.new),
      rateCardProvider.overrideWith((ref) async => card),
    ]);
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Night fare'), findsOneWidget);
    expect(find.text('1.5×'), findsOneWidget);
    expect(find.text('Booked 10 pm to 5 am: the whole fare, instead of peak'), findsOneWidget);
    expect(find.text('Time'), findsNothing, reason: 'the government auto fare has no time charge');
  });

  testWidgets('add an area, turn Go To on, then Stay In there within 8 km (Go To goes off)', (tester) async {
    final container = await pumpRoute(tester, '/account/booking-preferences');
    await tester.tap(find.text('Go To / Stay In'));
    await tester.pumpAndSettle();
    expect(find.text('Where do you want trips?'), findsOneWidget);
    expect(find.text('Save a place you often go to, like Home or your stand.'), findsOneWidget);
    // Nothing picked yet: nothing to turn on.
    expect(tester.widget<TtButton>(find.widgetWithText(TtButton, 'Turn on Go To')).onPressed, isNull);

    await tester.tap(find.text('Add area'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Brookefields');
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Brookefields Mall').first);
    await tester.pumpAndSettle();

    // Back on the sheet: the new area is saved and picked.
    expect(container.read(bookingPrefsProvider).value!.areas.map((a) => a.name), ['Brookefields Mall']);
    await center(tester, find.widgetWithText(TtButton, 'Turn on Go To'));
    await tester.tap(find.widgetWithText(TtButton, 'Turn on Go To'));
    await tester.pumpAndSettle();
    expect(container.read(bookingPrefsProvider).value!.goTo?.name, 'Brookefields Mall');
    expect(find.text('Going to Brookefields Mall'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5)); // the snack goes
    await tester.pumpAndSettle();

    await tester.tap(find.text('Go To / Stay In'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Stay In').first);
    await tester.pump();
    await tester.tap(find.text('Brookefields Mall').last);
    await center(tester, find.text('8 km'));
    await tester.tap(find.text('8 km'));
    await tester.pump();
    expect(find.text('Go To (Brookefields Mall) turns off.'), findsOneWidget);
    await center(tester, find.widgetWithText(TtButton, 'Turn on Stay In'));
    await tester.tap(find.widgetWithText(TtButton, 'Turn on Stay In'));
    await tester.pumpAndSettle();
    final prefs = container.read(bookingPrefsProvider).value!;
    expect(prefs.goTo, isNull);
    expect(prefs.stayIn?.radiusKm, 8);
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('request screen bar: Set when nothing is on, what is on with Change, both open the sheet', (tester) async {
    await loadTestFonts();
    usePhone(tester);
    final container = ProviderContainer();
    addTearDown(container.dispose);
    await container.read(bookingPrefsProvider.future);
    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: MaterialApp(theme: TtTheme.light(), home: const Scaffold(body: Center(child: RequestDirectionBar()))),
    ));
    await tester.pump();
    expect(find.text('Go To or Stay In'), findsOneWidget);
    expect(find.text('Set'), findsOneWidget);

    await container.read(bookingPrefsProvider.notifier).save(const BookingPrefs().stayingIn(home, radiusKm: 5));
    await tester.pump();
    expect(find.text('Inside Home'), findsOneWidget);
    expect(find.text('Change'), findsOneWidget);
    await tester.tap(find.byType(RequestDirectionBar));
    await tester.pumpAndSettle();
    expect(find.text('Where do you want trips?'), findsOneWidget);
    expect(find.widgetWithText(TtButton, 'Turn Stay In off'), findsOneWidget);
  });

  testWidgets('Home strip: what is on, and ✕ turns it off', (tester) async {
    await loadTestFonts();
    usePhone(tester);
    final container = ProviderContainer();
    addTearDown(container.dispose);
    await container.read(bookingPrefsProvider.future);
    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: MaterialApp(theme: TtTheme.light(), home: const Scaffold(body: Center(child: DirectionRow()))),
    ));
    await tester.pump();
    expect(find.text('Go To'), findsOneWidget);
    expect(find.text('Stay In'), findsOneWidget);

    await container.read(bookingPrefsProvider.notifier).save(const BookingPrefs().stayingIn(home, radiusKm: 3));
    await tester.pump();
    expect(find.text('Staying in Home'), findsOneWidget);
    expect(find.text('Only trips within 3 km'), findsOneWidget);

    await tester.tap(find.byTooltip('Turn Stay In off'));
    await tester.pump();
    expect(container.read(bookingPrefsProvider).value!.hasDirection, isFalse);
    expect(find.text('Go To'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
  });
}

/// The demo goods driver (a three-wheeler) instead of the bike driver.
class _Mover extends DriverProfileController {
  @override
  Future<DriverProfile> build() async => Seed.selvam;
}

class _AutoDriver extends DriverProfileController {
  @override
  Future<DriverProfile> build() async => Seed.murugan;
}
