// D-14c / D-14d: the Surge and High demand areas from Home's chips, nearest first, with when each ends.
import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_driver/features/home/d14c_demand_areas_screen.dart';
import 'package:tamiltaxi_driver/features/home/widgets/demand_areas.dart';
import 'package:tamiltaxi_driver/router/routes.dart';
import 'package:tamiltaxi_driver/state/driver_session.dart';

import 'support/harness.dart';

const _square = [LatLng(11.0, 76.95), LatLng(11.0, 76.96), LatLng(11.01, 76.96), LatLng(11.01, 76.95)];

MapZone _zone(
  String id,
  MapZoneKind kind,
  LatLng centre, {
  double multiplier = 1,
  List<VehicleKind> vehicles = const [],
  int? start,
  int? end,
  DateTime? endsAt,
}) => MapZone(
  id: id,
  name: id,
  kind: kind,
  multiplier: multiplier,
  vehicleKinds: vehicles,
  startMinute: start,
  endMinute: end,
  endsAt: endsAt,
  centre: centre,
  outline: [
    [for (final p in _square) LatLng(p.latitude + centre.latitude - 11.005, p.longitude + centre.longitude - 76.955)],
  ],
);

Hotspot _hex(String cell, HotspotLevel level, LatLng centre, {double multiplier = 1, double score = 0.5}) => Hotspot(
  cell: cell,
  level: level,
  score: score,
  multiplier: multiplier,
  centre: centre,
  name: cell,
  boundary: [
    for (final p in _square) LatLng(p.latitude + centre.latitude - 11.005, p.longitude + centre.longitude - 76.955),
  ],
);

void main() {
  group('when a zone ends', () {
    final now = DateTime(2026, 11, 4, 18, 6);

    test('its daily hours: the time left today, past midnight too', () {
      expect(
        zoneEnds(_zone('a', MapZoneKind.surge, const LatLng(11, 77), start: 17 * 60, end: 21 * 60), now),
        'ends in 2 h 54 min',
      );
      expect(
        zoneEnds(
          _zone('a', MapZoneKind.surge, const LatLng(11, 77), start: 22 * 60, end: 2 * 60),
          DateTime(2026, 11, 4, 23, 30),
        ),
        'ends in 2 h 30 min',
      );
    });

    test('a Surge now ending soon, an end date further away, or all day', () {
      final soon = now.add(const Duration(minutes: 45));
      expect(zoneEnds(_zone('a', MapZoneKind.surge, const LatLng(11, 77), endsAt: soon), now), 'ends in 45 min');
      expect(
        zoneEnds(_zone('a', MapZoneKind.surge, const LatLng(11, 77), endsAt: DateTime(2026, 11, 7, 9)), now),
        'until 7 Nov',
      );
      expect(zoneEnds(_zone('a', MapZoneKind.demand, const LatLng(11, 77)), now), 'all day');
    });
  });

  group('the lists', () {
    final now = DateTime(2026, 11, 4, 18, 6);
    const driver = LatLng(11.005, 76.955);
    final map = DemandMap(
      at: now,
      hotspots: [
        _hex('Tatabad', HotspotLevel.high, const LatLng(11.03, 76.96), multiplier: 1.2, score: 1),
        _hex('Peelamedu', HotspotLevel.busy, const LatLng(11.02, 77.0)),
        _hex('Quiet', HotspotLevel.some, const LatLng(11.0, 76.9), score: 0.1),
      ],
      zones: [
        _zone('Gandhipuram', MapZoneKind.surge, driver, multiplier: 1.3, start: 17 * 60, end: 21 * 60),
        _zone(
          'Autos only',
          MapZoneKind.surge,
          const LatLng(11.05, 76.95),
          multiplier: 1.5,
          vehicles: [VehicleKind.auto],
        ),
        _zone('Singanallur', MapZoneKind.demand, const LatLng(11.0, 77.03)),
        _zone('Bus stand', MapZoneKind.noService, const LatLng(10.99, 76.96)),
      ],
    );
    List<String> names(List<DemandArea> areas) => [for (final a in areas) a.name];

    test('surge: the zones for this vehicle and the hexes surging now, the one the driver is in first', () {
      final surge = areasFor(AreaView.surge, map, vehicle: VehicleKind.bike, from: driver, now: now);
      expect(names(surge), ['Gandhipuram', 'Tatabad']);
      expect(surge.first.here, isTrue);
      expect(surge.first.detail, '1.3x fare · ends in 2 h 54 min');
      expect(surge.last.detail, '1.2x fare · live now');
      expect(names(areasFor(AreaView.surge, map, vehicle: VehicleKind.auto, now: now)), [
        'Autos only',
        'Gandhipuram',
        'Tatabad',
      ], reason: 'no position: the highest surge first; the autos-only surge is an auto driver\'s');
    });

    test('high demand: busy hexes and busy zones, never the quiet ones, nearest first', () {
      final busy = areasFor(AreaView.busy, map, vehicle: VehicleKind.bike, from: driver, now: now);
      expect(names(busy), ['Tatabad', 'Peelamedu', 'Singanallur']);
      expect([for (final a in busy) a.detail], ['High demand now · 1.2x fare', 'Busy now', 'Busy · all day']);
      expect(busy.first.km, closeTo(2.8, 0.2));
    });

    test('no map yet: nothing', () {
      expect(areasFor(AreaView.surge, null, now: now), isEmpty);
    });
  });

  group('screens', () {
    testWidgets('D-14c: the surge areas with a list; the tabs switch to high demand', (tester) async {
      final container = await pumpRoute(tester, Routes.galleryView('D-14c'));
      final seeded = areasFor(AreaView.busy, DemandMap.demo(), vehicle: Seed.karthik.vehicleKind, now: DateTime.now());
      expect(find.text('Surge · 1'), findsOneWidget);
      expect(find.text('Gandhipuram'), findsOneWidget);
      expect(find.textContaining('1.3x fare · '), findsOneWidget);
      expect(find.text('Trips that start here pay more. You keep all of it.'), findsOneWidget);
      await tester.tap(find.text('High demand · ${seeded.length}'));
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text('High demand now'), findsWidgets);
      expect(find.textContaining('1.3x fare'), findsNothing, reason: 'the surge zone is not on the High demand list');
      await closeApp(tester, container);
    });

    testWidgets('D-14e: no surge says so and offers the high demand areas', (tester) async {
      final container = await pumpRoute(tester, Routes.galleryView('D-14e'));
      expect(find.text('No surge right now'), findsOneWidget);
      await tester.tap(find.text('See high demand areas'));
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text('No surge right now'), findsNothing);
      expect(find.text('Busy now'), findsWidgets);
      await closeApp(tester, container);
    });

    testWidgets("Home: the chips count each list and open it", (tester) async {
      final container = await pumpRoute(tester, Routes.home);
      await container.read(driverSessionProvider.notifier).goOnline();
      await tester.pump(const Duration(milliseconds: 500));
      expect(find.bySemanticsLabel('Surge, 1 area'), findsOneWidget);
      await tester.tap(find.text('Surge'));
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 600));
      expect(find.byType(D14cDemandAreasScreen), findsOneWidget);
      expect(find.text('Gandhipuram'), findsOneWidget);
      await closeApp(tester, container);
    });
  });
}
