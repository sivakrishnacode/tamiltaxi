// A local search for a town beyond the city (Ooty from Coimbatore) offers outstation instead: "Book outstation" opens
// P-35 with it as the destination, "Change drop" stays on the search.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_passenger/features/ride/p08_search_screen.dart';
import 'package:tamiltaxi_passenger/features/ride/p35_outstation_screen.dart';
import 'package:tamiltaxi_passenger/router/routes.dart';
import 'package:tamiltaxi_passenger/state/ride_flow.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import 'support/harness.dart';

/// The local search also finds Ooty (as Google does).
class _OotyPlaces extends MockPlacesRepository {
  _OotyPlaces(super.db, super.settings);

  static final ooty = Seed.outstationTowns.firstWhere((p) => p.id == 'os-ooty');

  @override
  Future<List<Place>> search(String query, {LatLng? origin, bool anywhere = false}) async =>
      query.trim().toLowerCase().startsWith('oot') ? [ooty] : super.search(query, origin: origin, anywhere: anywhere);
}

Future<void> _pickOoty(WidgetTester tester) async {
  await tester.enterText(find.byType(TextField).last, 'Ooty');
  await tester.pump(const Duration(seconds: 1));
  await tester.tap(find.descendant(of: find.byType(LocationRow), matching: find.text('Ooty')));
  await tester.pump(const Duration(milliseconds: 300));
  await tester.pump(const Duration(milliseconds: 300));
}

void main() {
  final overrides = [
    placesRepositoryProvider.overrideWith((ref) => _OotyPlaces(ref.watch(mockDatabaseProvider), () => ref.read(demoSettingsProvider))),
  ];

  testWidgets('P-08: a drop outside the city offers outstation; "Book outstation" opens P-35 to it', (tester) async {
    final container = await pumpRoute(tester, Routes.search, overrides: overrides);
    await _pickOoty(tester);

    expect(find.text('Book outstation instead?'), findsOneWidget);
    expect(find.textContaining('Ooty is outside'), findsOneWidget);
    await precacheImages(tester);
    if (Platform.environment['TT_SHOTS'] != null) await saveScreenshot(tester, Platform.environment['TT_SHOTS']!);

    await tester.tap(find.text('Book outstation'));
    await tester.pump(const Duration(milliseconds: 600));
    await tester.pump(const Duration(milliseconds: 600));
    expect(find.byType(P35OutstationScreen), findsOneWidget);
    final state = container.read(rideFlowProvider);
    expect(state.isOutstation, isTrue);
    expect(state.drop.id, 'os-ooty');
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('P-08: "Change drop" closes the offer and stays on the search', (tester) async {
    final container = await pumpRoute(tester, Routes.search, overrides: overrides);
    await _pickOoty(tester);

    await tester.tap(find.text('Change drop'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
    expect(find.text('Book outstation instead?'), findsNothing);
    expect(find.byType(P08SearchScreen), findsOneWidget);
    expect(container.read(rideFlowProvider).isOutstation, isFalse);
    await tester.pump(const Duration(seconds: 2));
  });
}
