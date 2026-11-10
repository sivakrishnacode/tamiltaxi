// Going offline asks first: the button sits low on Home, where a phone going into a pocket can tap it. After a day's
// rides, going offline also asks Google Play for its review sheet.
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_driver/router/routes.dart';
import 'package:tamiltaxi_driver/state/driver_session.dart';

import 'support/harness.dart';

void main() {
  testWidgets('Go offline asks first: Stay online keeps the driver online, Go offline ends it', (tester) async {
    // Google Play's review sheet (in_app_review), answered as on a phone installed from Play.
    const play = MethodChannel('dev.britannio.in_app_review');
    final playCalls = <String>[];
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(play, (call) async {
      playCalls.add(call.method);
      return call.method == 'isAvailable' ? true : null;
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(play, null));

    final container = await pumpRoute(tester, Routes.home);
    await container.read(driverSessionProvider.notifier).goOnline();
    await tester.pump(const Duration(milliseconds: 500));

    await tester.tap(find.text('Go offline').hitTestable());
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Go offline?'), findsOneWidget);
    await tester.tap(find.text('Stay online'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Go offline?'), findsNothing);
    expect(container.read(driverSessionProvider).online, isTrue);
    expect(playCalls, isEmpty);

    await tester.tap(find.text('Go offline').hitTestable());
    await tester.pump(const Duration(milliseconds: 400));
    // The dialog's button: the panel's one is under the scrim.
    await tester.tap(find.text('Go offline').hitTestable());
    await tester.pump(const Duration(milliseconds: 400));
    expect(container.read(driverSessionProvider).online, isFalse);
    expect(find.text("You're offline. No new requests."), findsOneWidget);
    expect(container.read(driverSessionProvider).todayRides, greaterThan(0));
    expect(playCalls, ['isAvailable', 'requestReview'], reason: "Play's review sheet after the day's rides");
    await closeApp(tester, container);
  });
}
