// D-03c: after the OTP (and at start-up) a driver missing any permission sees the list; each row ticks once allowed
// and Continue opens only when all are.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_driver/common/start_route.dart';
import 'package:tamiltaxi_driver/router/routes.dart';
import 'package:tamiltaxi_driver/state/app_permissions.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import 'app_permissions_test.dart' show FakeChecker;
import 'support/harness.dart';

void main() {
  testWidgets('Continue opens once every permission is allowed, then goes on to the next page', (tester) async {
    final checker = FakeChecker()..granted.addAll([AppPermission.location, AppPermission.notifications]);
    final container = await pumpRoute(
      tester,
      Routes.permissions(next: Routes.documents),
      overrides: [appPermissionCheckerProvider.overrideWithValue(checker)],
    );
    await tester.pump();
    expect(find.text('2 of 5 allowed'), findsOneWidget);
    expect(find.byIcon(Symbols.check_circle_rounded), findsNWidgets(2));
    expect(find.text('Allow all 5 to continue'), findsOneWidget);
    final continueButton = find.widgetWithText(TtButton, 'Continue');
    expect(tester.widget<TtButton>(continueButton).onPressed, isNull);

    await tester.tap(find.text('Display over other apps'));
    await tester.pump();
    expect(checker.requested, [AppPermission.overlay]);

    // Allowed in Settings, then back in the app.
    checker.granted.addAll(AppPermission.values);
    await container.read(missingPermissionsProvider.notifier).refresh();
    await tester.pump();
    expect(find.text('5 of 5 allowed'), findsOneWidget);
    expect(tester.widget<TtButton>(continueButton).onPressed, isNotNull);

    await tester.tap(continueButton);
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 200));
    }
    expect(find.text('5 of 5 allowed'), findsNothing);
  });

  testWidgets('sign-in and start-up go through D-03c only while something is missing', (tester) async {
    final checker = FakeChecker()..granted.add(AppPermission.location);
    late WidgetRef ref;
    await tester.pumpWidget(ProviderScope(
      overrides: [appPermissionCheckerProvider.overrideWithValue(checker)],
      child: Consumer(builder: (context, r, _) {
        ref = r;
        return const SizedBox();
      }),
    ));
    expect(await permissionsFirst(ref, Routes.home), Routes.permissions(next: Routes.home));
    checker.granted.addAll(AppPermission.values);
    expect(await permissionsFirst(ref, Routes.home), Routes.home);
  });
}
