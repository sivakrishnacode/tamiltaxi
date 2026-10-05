// P-10 lists every ride tier (Bike, Scooty, Auto, Auto Priority, Mini, Sedan, SUV) with its picture and the demo
// fares, the same numbers the API quotes for the demo route.
import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_passenger/features/ride/p07_home_screen.dart';
import 'package:tamiltaxi_passenger/router/routes.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import 'support/harness.dart';

void main() {
  testWidgets('P-10 shows the seven ride tiers with their pictures and fares', (tester) async {
    await pumpRoute(tester, Routes.chooseVehicle);
    await tester.pump(const Duration(seconds: 1));

    const tiers = {'Bike': 35, 'Scooty': 39, 'Auto': 66, 'Auto Priority': 80, 'Mini': 132, 'Sedan': 158, 'SUV': 210};
    for (final MapEntry(key: name, value: fare) in tiers.entries) {
      expect(find.text(name, skipOffstage: false), findsWidgets, reason: name);
      expect(find.text(formatInr(fare), skipOffstage: false), findsWidgets, reason: '$name $fare');
    }
    // One picture per tier row (the Pink Taxi strip has its own pink car).
    expect(
      find.descendant(
        of: find.byType(VehicleOptionCard, skipOffstage: false),
        matching: find.byType(VehicleArt, skipOffstage: false),
      ),
      findsNWidgets(7),
    );
    expect(Seed.rideVehicles.map((v) => v.kind), [
      VehicleKind.bike,
      VehicleKind.scooty,
      VehicleKind.auto,
      VehicleKind.autoPriority,
      VehicleKind.cab,
      VehicleKind.sedan,
      VehicleKind.suv,
    ]);
  });

  testWidgets('P-10 shows the free vehicles that could take the selected tier', (tester) async {
    await pumpRoute(tester, Routes.chooseVehicle);
    await tester.pump(const Duration(seconds: 1));
    Finder markers(MapVehicleType type) => find.byWidgetPredicate((w) => w is VehicleMarker && w.type == type);
    // Bike: the mock's two bikes and one scooter; no autos or cars.
    expect(markers(MapVehicleType.bike), findsNWidgets(3));
    expect(markers(MapVehicleType.auto), findsNothing);
    expect(markers(MapVehicleType.car), findsNothing);
    await tester.ensureVisible(find.text('Auto Priority'));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text('Auto Priority'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(markers(MapVehicleType.auto), findsNWidgets(2));
    expect(markers(MapVehicleType.bike), findsNothing);

  });

  testWidgets('Home shows free vehicles of every kind around the pickup', (tester) async {
    await pumpRoute(tester, Routes.ride);
    await tester.pump(const Duration(seconds: 1));
    expect(find.byType(P07HomeScreen), findsOneWidget);
    Finder markers(MapVehicleType type) => find.byWidgetPredicate((w) => w is VehicleMarker && w.type == type);
    expect(markers(MapVehicleType.bike), findsNWidgets(3));
    expect(markers(MapVehicleType.auto), findsNWidgets(2));
    expect(markers(MapVehicleType.car), findsNWidgets(3));
  });

  test('every ride tier has a render; Auto Priority is not a driver vehicle', () {
    for (final v in Seed.rideVehicles) {
      expect(v.kind.artAsset, isNotNull, reason: v.name);
    }
    expect(VehicleKind.autoPriority.isDriverVehicle, isFalse);
    expect(VehicleKind.scooty.isTwoWheeler, isTrue);
    expect(VehicleKind.suv.isRide, isTrue);
    expect(VehicleKind.goodsBike.isGoods, isTrue);
    expect(VehicleKind.bike.servedBy, [VehicleKind.bike, VehicleKind.scooty]);
    expect(VehicleKind.autoPriority.servedBy, [VehicleKind.auto]);
    expect(VehicleKind.sedan.servedBy, [VehicleKind.sedan]);
  });
}
