import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_driver/features/home/widgets/zone_sheet.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import 'support/harness.dart';

Future<void> pumpScreen(WidgetTester tester, Widget child) async {
  await loadTestFonts();
  await tester.pumpWidget(MaterialApp(theme: TtTheme.light(), home: Scaffold(body: Padding(padding: const EdgeInsets.all(16), child: child))));
}

const _ring = [LatLng(11.0, 76.9), LatLng(11.0, 77.0), LatLng(11.1, 77.0)];
final _now = DateTime(2026, 11, 4, 18, 30);

MapZone _zone(MapZoneKind kind, {double multiplier = 1, List<VehicleKind> vehicles = const [], bool pickups = false, bool drops = false, String? meet, int? start, int? end, List<int> days = const [], DateTime? endsAt}) =>
    MapZone(
      id: 'z',
      name: 'Gandhipuram',
      kind: kind,
      multiplier: multiplier,
      vehicleKinds: vehicles,
      blocksPickups: pickups,
      blocksDrops: drops,
      meetingPoint: meet,
      startMinute: start,
      endMinute: end,
      days: days,
      endsAt: endsAt,
      centre: const LatLng(11.05, 76.95),
      outline: const [_ring],
    );

void main() {
  test('when a zone runs, in plain words', () {
    expect(zoneWhen(_zone(MapZoneKind.surge, start: 17 * 60, end: 21 * 60 + 30, days: [6, 0, 5]), _now), '5:00 PM – 9:30 PM · Fri, Sat, Sun');
    expect(zoneWhen(_zone(MapZoneKind.surge, endsAt: DateTime(2026, 11, 4, 20, 15)), _now), 'Until 8:15 PM', reason: 'a Surge now');
    expect(zoneWhen(_zone(MapZoneKind.demand, start: 22 * 60, end: 2 * 60, endsAt: DateTime(2026, 11, 30)), _now), '10:00 PM – 2:00 AM · until 30 Nov');
    expect(zoneWhen(_zone(MapZoneKind.noService), _now), 'All day');
    expect(zoneWhen(_zone(MapZoneKind.demand, days: [1]), _now), 'All day · Mon');
  });

  testWidgets('a surge zone: the fare, the vehicles, the hours and Directions', (tester) async {
    var directions = 0;
    await pumpScreen(tester, ZoneDetails(zone: _zone(MapZoneKind.surge, multiplier: 1.3, vehicles: [VehicleKind.auto], start: 17 * 60, end: 21 * 60), now: _now, onDirections: () => directions++));
    expect(find.text('Surge 1.3x'), findsOneWidget);
    expect(find.text('Gandhipuram'), findsOneWidget);
    expect(find.text('Fares are 1.3x on trips that start here'), findsOneWidget);
    expect(find.text('For Auto'), findsOneWidget);
    expect(find.text('5:00 PM – 9:00 PM'), findsOneWidget);
    await tester.tap(find.text('Directions'));
    expect(directions, 1);
  });

  testWidgets('a no-pickup zone says drops are fine and offers no directions', (tester) async {
    await pumpScreen(tester, ZoneDetails(zone: _zone(MapZoneKind.noService, pickups: true), now: _now));
    expect(find.text('No pickups'), findsOneWidget);
    expect(find.text('No requests start inside. Drops here are fine'), findsOneWidget);
    expect(find.text('Directions'), findsNothing);
  });

  testWidgets('a pickup point shows where to meet riders', (tester) async {
    await pumpScreen(tester, ZoneDetails(zone: _zone(MapZoneKind.pickupPoint, meet: 'Gate 2, P1 parking'), now: _now, onDirections: () {}));
    expect(find.text('Pickup point'), findsOneWidget);
    expect(find.text('Meet riders at: Gate 2, P1 parking'), findsOneWidget);
  });

  testWidgets('a demand hex: its level and live surge', (tester) async {
    const h = Hotspot(cell: 'a', level: HotspotLevel.high, score: 1, multiplier: 1.2, centre: LatLng(11.05, 76.95), boundary: _ring, name: 'RS Puram');
    await pumpScreen(tester, HotspotDetails(hotspot: h, onDirections: () {}));
    expect(find.text('High demand'), findsOneWidget);
    expect(find.text('RS Puram'), findsOneWidget);
    expect(find.text('Fares are 1.2x here right now'), findsOneWidget);
    expect(find.byType(TtButton), findsOneWidget);
  });
}
