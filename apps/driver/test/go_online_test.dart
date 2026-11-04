// Going online is refused the same way everywhere: on hold → S-10, paused → S-10b, not approved → D-07, Location off →
// a snack with Settings.
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_driver/common/go_online.dart';
import 'package:tamiltaxi_driver/features/home/d13_home_screen.dart';
import 'package:tamiltaxi_driver/features/onboarding/d07_documents_screen.dart';
import 'package:tamiltaxi_driver/features/states/s10_account_on_hold_screen.dart';
import 'package:tamiltaxi_driver/router/routes.dart';
import 'package:tamiltaxi_driver/state/driver_location.dart';
import 'package:tamiltaxi_driver/state/driver_session.dart';

import 'support/harness.dart';
import 'support/live_fakes.dart';

const _signedIn = {'tamiltaxi.accessToken': 'token', 'tamiltaxi.driverId': 'd1'};

Future<LiveRig> _rig() => LiveRig.create(
      prefs: _signedIn,
      client: MockClient((_) async => http.Response('{"message":"Not here"}', 404, headers: {'content-type': 'application/json'})),
    );

Future<void> _advance(WidgetTester tester, [Duration total = const Duration(seconds: 1)]) async {
  for (var t = Duration.zero; t < total; t += const Duration(milliseconds: 100)) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  test('refusals map to their screens', () {
    expect(goOnlineRefusalRoute(const ApiException(403, 'Account is on_hold')), Routes.accountOnHold);
    expect(goOnlineRefusalRoute(const ApiException(403, 'Account is pending')), Routes.documents);
    final until = DateTime.utc(2026, 10, 2, 10);
    expect(
      goOnlineRefusalRoute(ApiException(403, 'Paused', code: 'DRIVER_TEMP_BLOCKED', details: {'until': until.toIso8601String()})),
      Routes.accountPaused(until.toLocal()),
    );
    expect(goOnlineRefusalRoute(const ApiException(403, 'Plan expired. Renew to go online again')), isNull);
  });

  testWidgets('Home: on hold opens S-10', (tester) async {
    final rig = await _rig();
    rig.jobs.onlineError = const ApiException(403, 'Account is on_hold');
    final container = await pumpRoute(tester, Routes.home, overrides: rig.overrides);
    await tester.tap(find.text('GO ONLINE').hitTestable().first);
    await _advance(tester);
    expect(find.byType(S10AccountOnHoldScreen), findsOneWidget);
    expect(container.read(driverSessionProvider).online, isFalse);
    await closeApp(tester, container);
  });

  testWidgets('Home: paused for cancellations opens S-10b', (tester) async {
    final rig = await _rig();
    final until = DateTime.now().add(const Duration(hours: 3));
    rig.jobs.onlineError = ApiException(403, 'You cancelled too many rides',
        code: 'DRIVER_TEMP_BLOCKED', details: {'until': until.toUtc().toIso8601String()});
    final container = await pumpRoute(tester, Routes.home, overrides: rig.overrides);
    await tester.tap(find.text('GO ONLINE').hitTestable().first);
    await _advance(tester, const Duration(seconds: 2));
    final s10 = tester.widget<S10AccountOnHoldScreen>(find.byType(S10AccountOnHoldScreen));
    expect(s10.pausedUntil, isNotNull);
    expect(find.text('You cancelled too many rides'), findsNothing);
    await closeApp(tester, container);
  });

  testWidgets('Home: Location off shows Settings', (tester) async {
    final rig = await _rig();
    rig.locator.problem = const LocationProblem('Turn on Location to go online', fix: LocationFix.locationSettings);
    final container = await pumpRoute(tester, Routes.home, overrides: rig.overrides);
    await tester.tap(find.text('GO ONLINE').hitTestable().first);
    await _advance(tester, const Duration(seconds: 2));
    expect(find.byType(D13HomeScreen), findsOneWidget);
    expect(find.text('Turn on Location to go online'), findsOneWidget);
    expect(find.text('Settings'), findsOneWidget);
    await closeApp(tester, container);
  });

  testWidgets('not approved any more (a new plate): the registration page', (tester) async {
    final rig = await _rig();
    rig.jobs.onlineError = const ApiException(403, 'Account is pending');
    final container = await pumpRoute(tester, Routes.home, overrides: rig.overrides);
    await tester.tap(find.text('GO ONLINE').hitTestable().first);
    await _advance(tester);
    expect(find.byType(D07DocumentsScreen), findsOneWidget);
    await closeApp(tester, container);
  });
}
