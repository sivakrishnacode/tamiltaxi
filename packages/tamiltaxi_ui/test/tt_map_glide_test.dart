import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

void main() {
  setUp(() => TtMap.tilesEnabled = false);

  Widget map(List<MapVehicle> vehicles) => MaterialApp(
        theme: TtTheme.light(),
        home: SizedBox(
          width: 360,
          height: 640,
          child: TtMap(center: const LatLng(11.0, 76.95), zoom: 15, vehicles: vehicles),
        ),
      );

  double heading(WidgetTester tester) => tester.widget<VehicleMarker>(find.byType(VehicleMarker)).heading;

  testWidgets('a nearby car with a marker id glides to its new place and heading instead of jumping', (tester) async {
    const from = LatLng(11.0, 76.95), to = LatLng(11.001, 76.951);
    await tester.pumpWidget(map(const [MapVehicle(id: 'a', position: from, type: MapVehicleType.car)]));
    expect(heading(tester), 0);

    await tester.pumpWidget(map(const [MapVehicle(id: 'a', position: to, type: MapVehicleType.car, heading: 90)]));
    await tester.pump(const Duration(milliseconds: 900));
    expect(heading(tester), inExclusiveRange(1, 89), reason: 'half way through the glide');

    // An equal list from a parent rebuild mid-glide doesn't restart it: it still ends on time.
    await tester.pumpWidget(map(const [MapVehicle(id: 'a', position: to, type: MapVehicleType.car, heading: 90)]));
    await tester.pump(const Duration(milliseconds: 950));
    expect(heading(tester), 90);
    await tester.pumpAndSettle();
  });

  testWidgets('cars turn the shortest way round (350° → 10° passes north)', (tester) async {
    const p = LatLng(11.0, 76.95);
    await tester.pumpWidget(map(const [MapVehicle(id: 'a', position: p, type: MapVehicleType.bike, heading: 350)]));
    await tester.pumpWidget(map(const [MapVehicle(id: 'a', position: p, type: MapVehicleType.bike, heading: 10)]));
    await tester.pump(const Duration(milliseconds: 900));
    final h = heading(tester);
    expect(h > 350 || h < 10, isTrue, reason: 'went through 0, not back round through 180 ($h)');
    await tester.pumpAndSettle();
  });

  testWidgets('vehicles without an id (the live car glides itself) are drawn where they are given', (tester) async {
    const p = LatLng(11.0, 76.95);
    await tester.pumpWidget(map(const [MapVehicle(position: p, type: MapVehicleType.car, large: true)]));
    await tester.pumpWidget(map(const [MapVehicle(position: p, type: MapVehicleType.car, heading: 120, large: true)]));
    expect(heading(tester), 120);
  });
}
