// D-06 shows the service city in its locked City field even though the cities load after the screen's first frame:
// the only one, else the one nearest the phone (not simply the API's first city).
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_driver/features/onboarding/d06_personal_details_screen.dart';
import 'package:tamiltaxi_driver/state/driver_location.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import 'support/harness.dart';
import 'support/live_fakes.dart';

/// The City dropdown's value (a city id).
String? _cityValue(WidgetTester tester) =>
    tester.state<FormFieldState<String>>(find.byType(DropdownButtonFormField<String>)).value;

void main() {
  testWidgets('the City dropdown picks the only city once the cities load', (tester) async {
    await loadTestFonts();
    usePhone(tester);
    await tester.pumpWidget(ProviderScope(
      child: MaterialApp(theme: TtTheme.light(), home: const D06PersonalDetailsScreen()),
    ));
    await tester.pump();
    await tester.pump();
    expect(_cityValue(tester), Seed.demoCity.id, reason: 'the only city');
    expect(find.text(Seed.demoCity.name), findsOneWidget);
  });

  testWidgets('several cities: the one nearest the phone, not the first the API lists', (tester) async {
    await loadTestFonts();
    usePhone(tester);
    ServiceCity city(String name, double lat, double lng) =>
        ServiceCity(id: name.toLowerCase(), name: name, state: 'Tamil Nadu', center: LatLng(lat, lng));
    await tester.pumpWidget(ProviderScope(
      overrides: [
        // The staging order: Virudhunagar first. The fake phone is in Coimbatore.
        serviceCitiesProvider.overrideWith((ref) async =>
            [city('Virudhunagar', 9.5869, 77.9529), city('Coimbatore', 11.0168, 76.9658), city('Tiruppur', 11.108, 77.3417)]),
        driverLocatorProvider.overrideWithValue(FakeLocator()),
      ],
      child: MaterialApp(theme: TtTheme.light(), home: const D06PersonalDetailsScreen()),
    ));
    await tester.pump();
    await tester.pump();
    expect(_cityValue(tester), 'coimbatore', reason: 'nearest the phone, not the first listed');

    // The driver can choose another from the list.
    await tester.tap(find.text('Coimbatore'));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.text('Tiruppur').last);
    await tester.pump(const Duration(milliseconds: 400));
    expect(_cityValue(tester), 'tiruppur');
  });
}
