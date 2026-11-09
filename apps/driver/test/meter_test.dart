// The meter (D-42) for passengers picked up off the app: how GPS fixes become kilometres, the fare at the driver's
// rates, where it started, what is saved on the phone and sent to the API, and the whole flow from Home to Done.
import 'dart:convert';

import 'package:flutter/widgets.dart' show Text;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart' show TtBottomNav, formatInr;
import 'package:tamiltaxi_driver/features/home/widgets/meter_chip.dart';
import 'package:tamiltaxi_driver/router/routes.dart';
import 'package:tamiltaxi_driver/state/driver_location.dart';
import 'package:tamiltaxi_driver/state/driver_session.dart';
import 'package:tamiltaxi_driver/state/meter.dart';

import 'support/harness.dart';
import 'support/live_fakes.dart';

final _auto = Seed.vehicle(VehicleKind.auto).fareRule;
final _t0 = DateTime(2026, 11, 10, 9);

MeterState _running() => MeterState(status: MeterStatus.running, rule: _auto, startedAt: _t0, lastFixAt: _t0);

GpsFix _fix(LatLng at, int seconds, {double accuracy = 5, bool mocked = false}) =>
    GpsFix(at, at: _t0.add(Duration(seconds: seconds)), accuracy: accuracy, isMocked: mocked);

/// The API as the meter uses it: posts are kept (or refused with [failWith]); the address lookup finds Gandhipuram.
class _MeterApi extends ApiClient {
  _MeterApi(SharedPreferences prefs) : super(baseUrl: 'http://localhost:1/v1', session: ApiSession(prefs));

  final sent = <Map<String, dynamic>>[];
  Object? failWith;

  @override
  Future<dynamic> post(String path, [Object? body, bool idempotent = false]) async {
    if (failWith case final e?) throw e;
    expect(path, '/drivers/me/meter-trips');
    sent.add(Map<String, dynamic>.from(body! as Map));
    return {'id': 'srv-${sent.length}'};
  }

  @override
  Future<dynamic> get(String path, {Map<String, Object?>? query}) async {
    if (path == '/places/reverse') {
      return {
        'place': {'name': 'Gandhipuram', 'address': '100 Feet Rd, Gandhipuram, Coimbatore', 'landmark': 'Near KG Hospital'},
        'isInServiceArea': true,
      };
    }
    throw const ApiException(404, 'Not found');
  }
}

void main() {
  group('Distance from GPS fixes', () {
    test('The first fix only sets the start point; drift while standing adds nothing', () {
      var m = _running().withFix(_fix(kHere, 1));
      expect((m.metres, m.anchor), (0, kHere));
      m = m.withFix(_fix(offsetPoint(kHere, 8, 90), 6));
      expect(m.metres, 0, reason: 'within ${MeterState.minStepM} m of the last counted point');
      expect(m.lastFixAt, _t0.add(const Duration(seconds: 6)), reason: 'still a usable fix: GPS is good');
    });

    test('Driving counts the whole stretch once past the step; slow traffic is not lost', () {
      var m = _running().withFix(_fix(kHere, 0));
      // Crawling 6 m every 3 s: nothing until 24 m, then all 24 m.
      for (var i = 1; i <= 4; i++) {
        m = m.withFix(_fix(offsetPoint(kHere, 6.0 * i, 90), 3 * i));
      }
      expect(m.metres, closeTo(24, 0.5));
    });

    test('Inaccurate, mocked and impossible fixes are skipped', () {
      final m = _running().withFix(_fix(kHere, 0));
      final far = offsetPoint(kHere, 500, 0);
      expect(m.withFix(_fix(far, 30, accuracy: 80)), same(m), reason: 'accuracy worse than 35 m');
      expect(m.withFix(_fix(far, 30, mocked: true)), same(m), reason: 'a mock-location app');
      expect(m.withFix(_fix(offsetPoint(kHere, 2000, 0), 3)), same(m), reason: '2 km in 3 s is a GPS jump');
    });

    test('After a gap without fixes the straight line counts × the road factor', () {
      var m = _running().withFix(_fix(kHere, 0));
      m = m.withFix(_fix(offsetPoint(kHere, 1000, 0), 120));
      expect(m.metres, closeTo(1000 * FareEngine.roadFactor, 1));
    });

    test('Only a running meter counts', () {
      const idle = MeterState();
      expect(idle.withFix(_fix(kHere, 0)), same(idle));
    });
  });

  group('Fare', () {
    test("The fare engine's fare for the km so far, rounded down to 100 m; the minimum fare from the start", () {
      expect(_running().fare, _auto.minFare);
      final m = MeterState(status: MeterStatus.running, rule: _auto, startedAt: _t0, metres: 3150);
      expect(m.km, 3.1);
      final expected = FareEngine.quoteRule(Seed.vehicle(VehicleKind.auto), _auto,
              const RouteEstimate(distanceKm: 3.1, durationMin: 10))
          .total;
      expect(m.fare, expected);
      expect(m.fare, 82, reason: 'auto at the government fare: ₹5 + 3.1 km × ₹25');
    });

    test('The night fare multiplies the whole fare, the minimum included', () {
      final m = MeterState(status: MeterStatus.running, rule: _auto, startedAt: _t0, night: 1.5);
      expect(m.fare, 75);
    });

    test('Autos started in the night hours (IST) get the night fare; cabs never', () {
      const night = AutoNightFare(multiplier: 1.5, startHour: 22, endHour: 5);
      final auto = MeterRates(vehicle: VehicleKind.auto, rule: _auto, night: night);
      final cab = MeterRates(vehicle: VehicleKind.cab, rule: Seed.vehicle(VehicleKind.cab).fareRule, night: night);
      final elevenPmIst = DateTime.utc(2026, 11, 9, 17, 30);
      expect(auto.nightAt(elevenPmIst), 1.5);
      expect(auto.nightAt(DateTime.utc(2026, 11, 9, 6)), 1, reason: '11:30 am IST');
      expect(cab.nightAt(elevenPmIst), 1);
    });
  });

  group('Saved on the phone', () {
    test('A meter trip comes back the same from JSON', () {
      final m = _running().withFix(_fix(kHere, 0)).withFix(_fix(offsetPoint(kHere, 400, 45), 40));
      final back = MeterState.fromJson(jsonDecode(jsonEncode(m.toJson())) as Map<String, dynamic>);
      expect((back.status, back.vehicle, back.metres, back.fare), (m.status, m.vehicle, m.metres, m.fare));
      expect(back.anchor!.latitude, closeTo(m.anchor!.latitude, 1e-9));
      expect(back.startedAt, m.startedAt);
      expect(back.rule!.perKm, _auto.perKm);
    });

    test('Saved rates read back as not fresh; anything else is ignored', () {
      final rates = MeterRates(
        vehicle: VehicleKind.auto,
        rule: _auto,
        night: const AutoNightFare(multiplier: 1.5, startHour: 22, endHour: 5),
        upiId: 'karthik@okaxis',
        payee: 'Karthik S',
      );
      final back = MeterRates.tryParse(jsonEncode(rates.toJson()))!;
      expect((back.vehicle, back.rule.minFare, back.night?.multiplier, back.upiId, back.fresh),
          (VehicleKind.auto, _auto.minFare, 1.5, 'karthik@okaxis', false));
      expect(MeterRates.tryParse('not json'), isNull);
      expect(MeterRates.tryParse(null), isNull);
    });
  });

  testWidgets('From Home online: Meter takes the driver offline, counts the GPS, ends at the fare, Done clears it',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    final locator = FakeLocator();
    final container = await pumpRoute(tester, Routes.home, overrides: [driverLocatorProvider.overrideWithValue(locator)]);
    await container.read(driverSessionProvider.notifier).goOnline();
    await tester.pump(const Duration(milliseconds: 500));

    // Home's Meter button opens the Meter tab.
    await tester.tap(find.byType(MeterChip));
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('Start meter'), findsOneWidget);
    expect(find.textContaining('The meter takes you offline'), findsOneWidget);

    await tester.tap(find.text('Start meter'));
    await tester.pump(const Duration(milliseconds: 500));
    expect(container.read(driverSessionProvider).online, isFalse, reason: 'no requests during a meter trip');
    expect(container.read(meterProvider).status, MeterStatus.running);
    expect(locator.meterListens, 1);
    expect(find.text('METER RUNNING'), findsOneWidget);

    // 1 km at 36 km/h: a fix every 10 s, 100 m apart.
    final start = DateTime.now();
    for (var i = 0; i <= 10; i++) {
      locator.meterFixes.add(GpsFix(offsetPoint(kHere, 100.0 * i, 90), at: start.add(Duration(seconds: 10 * i)), accuracy: 5));
      await tester.pump();
    }
    final meter = container.read(meterProvider);
    expect(meter.km, closeTo(1.0, 0.1));
    expect(find.text(formatInr(meter.fare)), findsOneWidget);
    final saved = (await SharedPreferences.getInstance()).getString('meter.trip');
    expect(saved, isNotNull, reason: 'kept on the phone in case the app closes');

    await tester.tap(find.text('End trip'));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.text('End trip').last);
    await tester.pump(const Duration(milliseconds: 400));
    expect(container.read(meterProvider).status, MeterStatus.ended);
    expect(find.text('Collect ${formatInr(meter.fare)}'), findsOneWidget);

    await tester.tap(find.text('Done, money received'));
    await tester.pump(const Duration(milliseconds: 600));
    expect(container.read(meterProvider).status, MeterStatus.idle);
    // Shown on the closing meter page and on Home while the page changes.
    expect(find.textContaining('Meter trip done'), findsWidgets);
    expect((await SharedPreferences.getInstance()).getString('meter.trip'), isNull);
    await closeApp(tester, container);
  });

  testWidgets('A meter left running comes back when Home opens, with its strip; Go online waits', (tester) async {
    final startedAt = DateTime.now().subtract(const Duration(minutes: 5));
    final left = MeterState(status: MeterStatus.running, rule: _auto, startedAt: startedAt, lastFixAt: startedAt, metres: 2400);
    SharedPreferences.setMockInitialValues({'meter.trip': jsonEncode(left.toJson())});
    final locator = FakeLocator();
    final container = await pumpRoute(tester, Routes.home, overrides: [driverLocatorProvider.overrideWithValue(locator)]);
    await tester.pump(const Duration(milliseconds: 500));

    expect(container.read(meterProvider).status, MeterStatus.running);
    expect(locator.meterListens, 1, reason: 'the GPS counts again');
    expect(find.text('Meter running · ${formatInr(left.fare)}'), findsOneWidget);
    expect(find.text('End the meter trip to go online again.'), findsOneWidget);
    expect(find.byType(MeterChip), findsNothing, reason: 'no second meter');

    // The strip's Return opens the Meter tab, still counting.
    await tester.tap(find.text('Return'));
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('METER RUNNING'), findsOneWidget);

    await container.read(meterProvider.notifier).clear();
    await closeApp(tester, container);
  });

  testWidgets('The Meter tab sits next to Home in the bottom bar', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final container = await pumpRoute(tester, Routes.home, overrides: [driverLocatorProvider.overrideWithValue(FakeLocator())]);
    final labels = [
      for (final e in find.descendant(of: find.byType(TtBottomNav), matching: find.byType(Text)).evaluate())
        (e.widget as Text).data,
    ];
    expect(labels, ['Home', 'Meter', 'Earnings', 'Account'], reason: 'the free app: no Plan tab');

    await tester.tap(find.descendant(of: find.byType(TtBottomNav), matching: find.text('Meter')));
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('Start meter'), findsOneWidget);
    await closeApp(tester, container);
  });

  group('Where it started', () {
    test('The first usable fix is the start; counted stretches make the way driven', () {
      var m = _running().withFix(_fix(kHere, 0, accuracy: 80));
      expect(m.start, isNull, reason: 'an inaccurate fix is no start');
      m = m.withFix(_fix(kHere, 1)).withFix(_fix(offsetPoint(kHere, 8, 90), 4)).withFix(_fix(offsetPoint(kHere, 300, 90), 40));
      expect(m.start, kHere);
      expect(m.path.length, 2, reason: 'the start and the counted point; the 8 m drift is not on it');
    });

    test('The address reads landmark, street, area; nothing found is null', () {
      expect(
        startLabelFromReverse({
          'place': {'name': 'Gandhipuram', 'address': '100 Feet Rd, Gandhipuram, Coimbatore', 'landmark': 'Near KG Hospital'},
        }),
        'Near KG Hospital, 100 Feet Rd, Gandhipuram',
      );
      expect(startLabelFromReverse({'place': {'name': 'Gandhipuram', 'address': 'Gandhipuram, Coimbatore'}}), 'Gandhipuram');
      expect(startLabelFromReverse({'place': null}), isNull);
    });

    test('Ended trips go up with their id, km, fare and start; running ones never', () {
      final running = MeterState(
        id: 'm1abcdefgh',
        status: MeterStatus.running,
        vehicle: VehicleKind.auto,
        rule: _auto,
        startedAt: _t0,
        metres: 3820,
        start: kHere,
        startName: 'Gandhipuram',
      );
      expect(running.toUpload(), isNull);
      final body = running.endedAtTime(_t0.add(const Duration(minutes: 14))).toUpload()!;
      expect(body, {
        'clientId': 'm1abcdefgh',
        'vehicleKind': 'AUTO',
        'startedAt': _t0.toUtc().toIso8601String(),
        'endedAt': _t0.add(const Duration(minutes: 14)).toUtc().toIso8601String(),
        'distanceKm': 3.8,
        'fare': 100,
        'night': 1.0,
        'startLat': kHere.latitude,
        'startLng': kHere.longitude,
        'startName': 'Gandhipuram',
      });
      final back = MeterState.fromJson(jsonDecode(jsonEncode(running.withFix(_fix(kHere, 1)).toJson())) as Map<String, dynamic>);
      expect((back.id, back.start, back.startName, back.path.length), ('m1abcdefgh', kHere, 'Gandhipuram', 1));
    });
  });

  group('Sent to the API', () {
    late ProviderContainer container;
    late _MeterApi api;
    late FakeLocator locator;
    final rates = MeterRates(vehicle: VehicleKind.auto, rule: _auto, upiId: 'karthik@okaxis', payee: 'Karthik S');

    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      api = _MeterApi(await SharedPreferences.getInstance());
      locator = FakeLocator();
      final realtime = FakeRealtime(api);
      container = ProviderContainer(overrides: [
        isLiveApiProvider.overrideWithValue(true),
        apiClientProvider.overrideWithValue(api),
        realtimeProvider.overrideWithValue(realtime),
        liveJobsProvider.overrideWithValue(FakeJobs(api, realtime)),
        driverLocatorProvider.overrideWithValue(locator),
      ]);
      container.listen(meterProvider, (_, _) {});
    });

    tearDown(() async {
      await container.read(meterProvider.notifier).clear();
      container.dispose();
    });

    Future<void> drive() async {
      final meter = container.read(meterProvider.notifier);
      await meter.start(rates);
      final t = DateTime.now();
      for (var i = 0; i <= 10; i++) {
        locator.meterFixes.add(GpsFix(offsetPoint(kHere, 100.0 * i, 90), at: t.add(Duration(seconds: 10 * i)), accuracy: 5));
        await Future<void>.delayed(Duration.zero);
      }
      await Future<void>.delayed(const Duration(milliseconds: 20));
    }

    test('The start gets its address; End trip sends the trip once, with it', () async {
      await drive();
      final m = container.read(meterProvider);
      expect(m.startName, 'Near KG Hospital, 100 Feet Rd, Gandhipuram');
      await container.read(meterProvider.notifier).end();
      // The send runs on its own after End trip (the driver never waits for the network).
      await Future<void>.delayed(const Duration(milliseconds: 50));
      expect(api.sent, hasLength(1));
      expect(api.sent.single, containsPair('clientId', m.id));
      expect(api.sent.single, containsPair('startName', 'Near KG Hospital, 100 Feet Rd, Gandhipuram'));
      expect(api.sent.single['fare'], m.fare);
      final prefs = await SharedPreferences.getInstance();
      expect(jsonDecode(prefs.getString('meter.outbox')!), isEmpty);
      // Another flush (the next app start) sends nothing again.
      await container.read(meterProvider.notifier).flush();
      expect(api.sent, hasLength(1));
    });

    test('No internet: the trip waits on the phone and goes once online; one the API refuses is dropped', () async {
      await drive();
      api.failWith = Exception('No internet');
      await container.read(meterProvider.notifier).end();
      // The send runs on its own after End trip (the driver never waits for the network).
      await Future<void>.delayed(const Duration(milliseconds: 50));
      final prefs = await SharedPreferences.getInstance();
      expect(jsonDecode(prefs.getString('meter.outbox')!), hasLength(1));
      expect(api.sent, isEmpty);

      api.failWith = null;
      await container.read(meterProvider.notifier).flush();
      expect(api.sent, hasLength(1));
      expect(jsonDecode(prefs.getString('meter.outbox')!), isEmpty);

      await container.read(meterProvider.notifier).clear();
      await drive();
      api.failWith = const ApiException(400, 'This meter trip is too old to add');
      await container.read(meterProvider.notifier).end();
      // The send runs on its own after End trip (the driver never waits for the network).
      await Future<void>.delayed(const Duration(milliseconds: 50));
      expect(jsonDecode(prefs.getString('meter.outbox')!), isEmpty, reason: 'it would never be taken');
    });
  });
}
