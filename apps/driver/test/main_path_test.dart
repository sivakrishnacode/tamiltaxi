// Main driver path, end to end with fast mode and fake time:
// Home → GO ONLINE → ride request → swipe to accept → Arrived at pickup →
// (back asks "Leave this screen?") → OTP 4829 → Start ride → Swipe to end ride → Received cash → rate → Home, with today's
// earnings and rides up by the fare.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_driver/features/jobs/d15_ride_request_screen.dart';
import 'package:tamiltaxi_driver/features/jobs/d16_navigate_pickup_screen.dart';
import 'package:tamiltaxi_driver/features/jobs/d17_ride_otp_screen.dart';
import 'package:tamiltaxi_driver/features/jobs/d18_ride_in_progress_screen.dart';
import 'package:tamiltaxi_driver/features/jobs/d19_collect_payment_screen.dart';
import 'package:tamiltaxi_driver/router/routes.dart';
import 'package:tamiltaxi_driver/state/driver_session.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import 'support/harness.dart';

Future<void> advance(WidgetTester tester, Duration total) async {
  var elapsed = Duration.zero;
  while (elapsed < total) {
    await tester.pump(const Duration(milliseconds: 100));
    elapsed += const Duration(milliseconds: 100);
  }
}

Future<void> waitFor(WidgetTester tester, Finder finder, {Duration timeout = const Duration(seconds: 30)}) async {
  var waited = Duration.zero;
  while (finder.evaluate().isEmpty) {
    if (waited >= timeout) fail('Timed out waiting for $finder');
    await tester.pump(const Duration(milliseconds: 100));
    waited += const Duration(milliseconds: 100);
  }
}

Future<void> swipe(WidgetTester tester) async {
  await tester.drag(find.byKey(const ValueKey('swipe-knob')).hitTestable().first, const Offset(600, 0));
  await advance(tester, const Duration(milliseconds: 800));
}

void main() {
  testWidgets('driver goes online, accepts, OTP 4829, ends the ride and collects payment', (tester) async {
    final container = await pumpRoute(tester, Routes.home);
    container.read(demoSettingsProvider.notifier).update((s) => s.copyWith(fastMode: true));
    await advance(tester, const Duration(seconds: 1));
    final before = container.read(driverSessionProvider);

    // GO ONLINE → online on Home.
    await tester.tap(find.text('GO ONLINE').hitTestable().first);
    await advance(tester, const Duration(seconds: 1));
    expect(container.read(driverSessionProvider).online, isTrue);

    // A ride request arrives on its own.
    await waitFor(tester, find.byType(D15RideRequestScreen));
    expect(find.text('₹38'), findsWidgets);
    expect(find.text('Swipe to accept'), findsOneWidget, reason: 'a stray tap never takes a trip');
    await swipe(tester);
    await waitFor(tester, find.byType(D16NavigateToPickupScreen));
    await advance(tester, const Duration(seconds: 1));
    await waitFor(tester, find.byKey(const ValueKey('swipe-knob')).hitTestable());

    await swipe(tester);
    await waitFor(tester, find.byType(D17RideOtpScreen));

    // Let earlier snackbars expire so they don't cover the button.
    await advance(tester, const Duration(seconds: 5));

    // Back works on D-17: Home is still underneath the job screens, and leaving asks first.
    await tester.tap(find.byTooltip('Back').hitTestable().first);
    await advance(tester, const Duration(milliseconds: 500));
    expect(find.text('Leave this screen?'), findsOneWidget);
    await tester.tap(find.text('Stay here').hitTestable().first);
    await advance(tester, const Duration(milliseconds: 500));
    expect(find.byType(D17RideOtpScreen), findsOneWidget);

    // Wrong OTP first: stays on D-17.
    await tester.enterText(find.byKey(const ValueKey('otp-field')), '1111');
    await advance(tester, const Duration(milliseconds: 300));
    await tester.tap(find.descendant(of: find.byType(TtButton), matching: find.text('Start ride')).hitTestable().first);
    await advance(tester, const Duration(milliseconds: 600));
    expect(find.byType(D17RideOtpScreen), findsOneWidget);
    expect(find.text('Wrong OTP, please try again'), findsOneWidget);

    await tester.enterText(find.byKey(const ValueKey('otp-field')), Seed.rideOtp);
    await advance(tester, const Duration(milliseconds: 300));
    await tester.tap(find.descendant(of: find.byType(TtButton), matching: find.text('Start ride')).hitTestable().first);
    await waitFor(tester, find.byType(D18RideInProgressScreen));
    expect(container.read(driverSessionProvider).phase, JobPhase.toDrop);

    await swipe(tester);
    await waitFor(tester, find.byType(D19CollectPaymentScreen));

    await tester.tap(find.text('Received cash').hitTestable().first);
    await waitFor(tester, find.text('Submit').hitTestable());
    await tester.tap(find.byKey(const ValueKey('star-5')).hitTestable().first);
    await advance(tester, const Duration(milliseconds: 300));
    await tester.tap(find.text('Submit').hitTestable().first);
    await advance(tester, const Duration(seconds: 2));

    final after = container.read(driverSessionProvider);
    expect(after.onJob, isFalse);
    expect(after.online, isTrue);
    expect(after.todayEarnings, before.todayEarnings + 38);
    expect(after.todayRides, before.todayRides + 1);
    expect(tester.takeException(), isNull);

    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(minutes: 1));
  }, timeout: const Timeout(Duration(minutes: 3)));
}
