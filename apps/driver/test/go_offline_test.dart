// Going offline asks first: the button sits low on Home, where a phone going into a pocket can tap it.
import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_driver/router/routes.dart';
import 'package:tamiltaxi_driver/state/driver_session.dart';

import 'support/harness.dart';

void main() {
  testWidgets('Go offline asks first: Stay online keeps the driver online, Go offline ends it', (tester) async {
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

    await tester.tap(find.text('Go offline').hitTestable());
    await tester.pump(const Duration(milliseconds: 400));
    // The dialog's button: the panel's one is under the scrim.
    await tester.tap(find.text('Go offline').hitTestable());
    await tester.pump(const Duration(milliseconds: 400));
    expect(container.read(driverSessionProvider).online, isFalse);
    expect(find.text("You're offline. No new requests."), findsOneWidget);
    await closeApp(tester, container);
  });
}
