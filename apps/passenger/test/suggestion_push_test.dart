// Tapped automation pushes: "Siva, Ooty?" opens P-35 with Ooty as the destination, a usual trip opens P-10 with its
// pickup, drop and vehicle, a campaign opens the screen it names; nothing opens while signed out.
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_passenger/router/routes.dart';
import 'package:tamiltaxi_passenger/state/ride_flow.dart';
import 'package:tamiltaxi_passenger/state/session_actions.dart';

Future<WidgetRef> _ref(WidgetTester tester, {bool loggedIn = true}) async {
  late WidgetRef ref;
  await tester.pumpWidget(ProviderScope(
    child: Consumer(builder: (context, r, _) {
      ref = r;
      return const SizedBox();
    }),
  ));
  ref.read(mockDatabaseProvider).passengerLoggedIn = loggedIn;
  return ref;
}

const _ooty = {
  'type': 'suggest',
  'kind': 'search',
  'mode': 'OUTSTATION',
  'dropName': 'Ooty',
  'dropAddress': 'The Nilgiris',
  'dropLat': '11.4102',
  'dropLng': '76.6950',
  'pickupName': 'Gandhipuram',
  'pickupAddress': 'Cross Cut Rd',
  'pickupLat': '11.0183',
  'pickupLng': '76.9725',
};

void main() {
  testWidgets('"Siva, Ooty?" opens outstation to Ooty', (tester) async {
    final ref = await _ref(tester);
    expect(routeForSuggestionPush(ref, _ooty), Routes.outstation);
    final state = ref.read(rideFlowProvider);
    expect(state.isOutstation, isTrue);
    expect(state.drop.name, 'Ooty');
    expect(state.drop.location, const LatLng(11.4102, 76.6950));
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('a usual trip opens P-10 with its pickup, drop and vehicle', (tester) async {
    final ref = await _ref(tester);
    final route = routeForSuggestionPush(ref, {
      ..._ooty,
      'kind': 'routine',
      'mode': 'LOCAL',
      'vehicle': 'AUTO',
      'dropName': 'Tidel Park',
      'dropLat': '11.0247',
      'dropLng': '77.0279',
    });
    expect(route, Routes.chooseVehicle);
    final state = ref.read(rideFlowProvider);
    expect(state.isOutstation, isFalse);
    expect(state.pickup.name, 'Gandhipuram');
    expect(state.drop.name, 'Tidel Park');
    expect(state.vehicle, VehicleKind.auto);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('signed out: a suggestion opens nothing; campaigns open their screen', (tester) async {
    final ref = await _ref(tester, loggedIn: false);
    expect(routeForSuggestionPush(ref, _ooty), isNull);
    expect(routeForCampaignPush({'type': 'campaign', 'target': 'OUTSTATION'}), Routes.outstation);
    expect(routeForCampaignPush({'type': 'campaign', 'target': 'RENTAL'}), Routes.rental);
    expect(routeForCampaignPush({'type': 'campaign', 'target': 'PARCEL'}), Routes.parcel);
    expect(routeForCampaignPush({'type': 'campaign'}), Routes.ride);
    await tester.pumpWidget(const SizedBox());
  });
}
