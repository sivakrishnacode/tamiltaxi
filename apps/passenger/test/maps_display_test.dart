// What the passenger sees from Google Maps data: travel time (traffic) vs the fare's minutes on P-10 / P-11.
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_passenger/features/ride/p11_fare_details_sheet.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tamiltaxi_passenger/app.dart';
import 'package:tamiltaxi_passenger/router/app_router.dart';
import 'package:tamiltaxi_passenger/router/routes.dart';
import 'package:tamiltaxi_passenger/state/ride_flow.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/harness.dart';

/// Server quotes for 11.4 km: 38 fare minutes (18 km/h), 24 minutes by Google's traffic-aware route.
class _TrafficRides extends MockRideRepository {
  _TrafficRides(super.db, super.settings, {this.travelMin});
  final int? travelMin;

  @override
  Future<List<FareQuote>> quotes(Place from, Place to, {bool womenOnly = false}) async => [
        for (final q in FareEngine.quoteAll(rideVehicles, const RouteEstimate(distanceKm: 11.4, durationMin: 38)))
          FareQuote(
            vehicle: q.vehicle,
            distanceKm: q.distanceKm,
            durationMin: q.durationMin,
            travelMin: travelMin,
            base: q.base,
            distanceCharge: q.distanceCharge,
            timeCharge: q.timeCharge,
            subtotal: q.subtotal,
            multiplier: q.multiplier,
            peakCharge: q.peakCharge,
            total: q.total,
            pickupEtaMin: 3,
          ),
      ];
}

/// Live-style suggestions with Google's distance from the origin the screen sent.
class _DistancePlaces extends MockPlacesRepository {
  _DistancePlaces(super.db, super.settings);
  final origins = <LatLng?>[];

  @override
  Future<List<Place>> search(String query, {LatLng? origin, bool anywhere = false}) async {
    origins.add(origin);
    return [
      const Place(id: 'api:u1', name: 'Ukkadam Bus stand', address: 'Ukkadam, Coimbatore', location: LatLng(11.0168, 76.9658), distanceKm: 8.7),
      const Place(id: 'api:u2', name: 'Ukkadam Lake', address: 'Coimbatore', location: LatLng(11.0168, 76.9658)),
    ];
  }
}

Future<void> _openP10(WidgetTester tester, {int? travelMin}) async {
  SharedPreferences.setMockInitialValues({});
  final prefs = await tester.runAsync(SharedPreferences.getInstance);
  // No server: calls to it fail at once; the fares come from the fake repository.
  final api = ApiClient(baseUrl: 'http://localhost:0/v1', session: ApiSession(prefs!));
  await pumpRoute(tester, Routes.chooseVehicle, overrides: [
    isLiveApiProvider.overrideWithValue(true),
    apiClientProvider.overrideWithValue(api),
    rideRepositoryProvider.overrideWith(
      (ref) => _TrafficRides(ref.watch(mockDatabaseProvider), () => ref.read(demoSettingsProvider), travelMin: travelMin),
    ),
  ]);
  await tester.pump(const Duration(milliseconds: 300));
}

void main() {
  testWidgets("P-10's route chip and drop time use Google's travel minutes; the fare keeps its own", (tester) async {
    await _openP10(tester, travelMin: 24);
    expect(find.text('11.4 km · 24 min'), findsOneWidget);
    // Pickup in 3 min + 24 min on the road, not 3 + 38 fare minutes. The screen read the clock a moment before this
    // line, so on a minute boundary its time is one minute earlier.
    final now = TtClock.now();
    final drops = {
      for (final m in [26, 27]) '3 min away · Drop ${formatTime(now.add(Duration(minutes: m)))}',
    };
    expect(find.byWidgetPredicate((w) => w is Text && drops.contains(w.data)), findsWidgets);

    await tester.tap(find.byTooltip('Fare details'));
    await tester.pumpAndSettle();
    expect(find.byType(P11FareDetailsSheet), findsOneWidget);
    expect(find.textContaining('38 min at 18 km/h'), findsOneWidget);
  });

  testWidgets('without travel minutes (older server, no Google key) P-10 shows the fare minutes', (tester) async {
    await _openP10(tester);
    expect(find.text('11.4 km · 38 min'), findsOneWidget);
  });

  testWidgets('P-09 shows the reverse-geocoded landmark under the pin', (tester) async {
    await _openWithPickup(tester, Routes.pinPickupOnMap);
    expect(find.byKey(const ValueKey('pin-landmark')), findsOneWidget);
    expect(find.text('Near Ukkadam Bus stand'), findsOneWidget);
  });

  testWidgets('P-08 sends the pickup with the search and shows each suggestion\'s distance', (tester) async {
    late _DistancePlaces places;
    await pumpRoute(tester, Routes.search, overrides: [
      placesRepositoryProvider.overrideWith((ref) => places = _DistancePlaces(ref.watch(mockDatabaseProvider), () => ref.read(demoSettingsProvider))),
    ]);
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('8.7 km'), findsOneWidget);
    expect(find.text('Ukkadam Lake'), findsOneWidget, reason: 'a suggestion without a distance shows none');
    expect(places.origins.last, Seed.gandhipuram.location);
  });

  testWidgets('P-08 shows the landmark next to the pickup', (tester) async {
    await _openWithPickup(tester, Routes.search);
    expect(find.text('Ukkadam · Near Ukkadam Bus stand'), findsOneWidget);
  });
}

/// Opens [location] with the pickup as the live reverse geocode returns it (GPS or a pin).
Future<void> _openWithPickup(WidgetTester tester, String location) async {
  await loadTestFonts();
  usePhone(tester);
  final c = ProviderContainer();
  addTearDown(c.dispose);
  c.read(rideFlowProvider.notifier).setPickup(
        const Place(id: 'pin', name: 'Ukkadam', address: 'Ukkadam', location: LatLng(10.98833, 76.96269), landmark: 'Near Ukkadam Bus stand'),
      );
  await tester.pumpWidget(UncontrolledProviderScope(
    container: c,
    child: TtPassengerApp(router: createPassengerRouter(initialLocation: location)),
  ));
  await tester.pump(const Duration(seconds: 1));
}
