// Drivers use the app before an admin approves them: Home shows a banner that says what is left (it can't be closed)
// and keeps Go online locked; Verify now opens the registration page; the approval itself unlocks it.
import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_driver/features/onboarding/d07_documents_screen.dart';
import 'package:tamiltaxi_driver/router/routes.dart';
import 'package:tamiltaxi_driver/state/driver_session.dart';
import 'package:tamiltaxi_driver/state/registration.dart';

import 'support/harness.dart';
import 'support/live_fakes.dart';

const _signedIn = {'tamiltaxi.accessToken': 'token', 'tamiltaxi.driverId': 'd1'};

Future<ProviderContainer> _home(WidgetTester tester, RegistrationProgress progress) async {
  final rig = await LiveRig.create(prefs: _signedIn, approval: DriverApproval.pending);
  return pumpRoute(tester, Routes.home, overrides: [
    ...rig.overrides,
    registrationProgressProvider.overrideWithValue(progress),
  ]);
}

void main() {
  testWidgets('documents missing: how many are left, Go online locked, Verify now opens the registration page',
      (tester) async {
    final container = await _home(tester, const RegistrationProgress(steps: 6, done: 3, errors: 0, allIn: false));
    expect(find.text('Verify your documents to go online'), findsWidgets);
    expect(find.text('3 left · use the Meter meanwhile.'), findsOneWidget);
    expect(find.text('Verify your documents to go online.'), findsOneWidget, reason: 'above the locked Go online');
    expect(find.text('Meter'), findsWidgets, reason: 'the Meter stays open');

    // Go online is locked: a tap does nothing.
    await tester.tap(find.text('GO ONLINE').first, warnIfMissed: false);
    await tester.pump(const Duration(milliseconds: 500));
    expect(container.read(driverSessionProvider).goingOnline, isFalse);
    expect(container.read(driverSessionProvider).online, isFalse);

    await tester.tap(find.text('Verify now'));
    await tester.pump(const Duration(milliseconds: 600));
    await tester.pump(const Duration(milliseconds: 600));
    expect(find.byType(D07DocumentsScreen), findsOneWidget);
    await closeApp(tester, container);
  });

  testWidgets('everything uploaded: under review; something rejected: fix it', (tester) async {
    var container = await _home(tester, const RegistrationProgress(steps: 6, done: 6, errors: 0, allIn: true));
    expect(find.text('Documents under review'), findsWidgets);
    expect(find.text('You can go online once your documents are verified.'), findsOneWidget);
    await closeApp(tester, container);

    container = await _home(tester, const RegistrationProgress(steps: 6, done: 5, errors: 1, allIn: false));
    expect(find.text('1 document needs a new upload'), findsOneWidget);
    expect(find.text('Fix now'), findsOneWidget);
    await closeApp(tester, container);
  });

  test("the admin's approval while waiting: \"You're approved!\", not \"taken offline\"", () async {
    final rig = await LiveRig.create(prefs: _signedIn, approval: null);
    var approval = DriverApproval.pending;
    final container = ProviderContainer(overrides: [
      ...rig.overrides,
      driverApprovalProvider.overrideWith((ref) async => approval),
    ]);
    addTearDown(container.dispose);
    container.listen(driverSessionProvider, (_, _) {});
    expect(await container.read(driverApprovalProvider.future), DriverApproval.pending);
    unawaited(container.read(driverSessionProvider.notifier).attach());
    await pumpEventQueue();

    approval = DriverApproval.approved;
    rig.realtime.statusCtl.add({'status': 'APPROVED', 'isOnline': false});
    await pumpEventQueue();
    expect(container.read(driverSessionProvider).notice?.message, "You're approved! Go online to get requests.");
    expect(await container.read(driverApprovalProvider.future), DriverApproval.approved);
  });
}
