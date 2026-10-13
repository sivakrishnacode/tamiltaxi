// P-01's intro: it starts on the native splash's frame (the logo alone), gives the logo a small bounce, ends on the
// tagline frame and routes on; with animations turned off it shows the last frame at once.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_passenger/app.dart';
import 'package:tamiltaxi_passenger/common/rider_logo.dart';
import 'package:tamiltaxi_passenger/features/onboarding/p02_welcome_screen.dart';
import 'package:tamiltaxi_passenger/router/app_router.dart';
import 'package:tamiltaxi_passenger/router/routes.dart';

import 'support/harness.dart';

const _tagline = 'Fair rides. Full fare to your driver.';

Future<void> _pumpSplash(WidgetTester tester) async {
  await loadTestFonts();
  usePhone(tester);
  final container = ProviderContainer();
  addTearDown(container.dispose);
  await tester.pumpWidget(UncontrolledProviderScope(
    container: container,
    child: TtPassengerApp(router: createPassengerRouter(initialLocation: Routes.splash)),
  ));
}

double _logoScale(WidgetTester tester) => tester
    .widget<Transform>(find.ancestor(of: find.byType(RiderLogo), matching: find.byType(Transform)).first)
    .transform
    .getMaxScaleOnAxis();

double _taglineOpacity(WidgetTester tester) =>
    tester.widget<Opacity>(find.ancestor(of: find.text(_tagline), matching: find.byType(Opacity)).first).opacity;

Future<void> _finish(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox());
  await tester.pump(const Duration(minutes: 1));
}

void main() {
  testWidgets('starts on the native splash frame, plays the intro, then opens onboarding', (tester) async {
    await _pumpSplash(tester);
    expect(find.byType(RiderLogo), findsOneWidget);
    expect(_logoScale(tester), 1, reason: 'the first frame is the native splash: the logo alone, at its size');
    expect(_taglineOpacity(tester), 0);

    await tester.pump(const Duration(milliseconds: 800));
    expect(_logoScale(tester), greaterThan(1), reason: 'the logo bounces');

    await tester.pump(const Duration(milliseconds: 900));
    expect(_logoScale(tester), closeTo(1, 0.001), reason: 'and settles back');
    expect(_taglineOpacity(tester), greaterThan(0));
    expect(find.byType(P02WelcomeScreen), findsNothing);

    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.byType(P02WelcomeScreen), findsOneWidget);
    await _finish(tester);
  });

  testWidgets('with animations off it shows the last frame at once and opens onboarding after 1.5 s', (tester) async {
    tester.platformDispatcher.accessibilityFeaturesTestValue = const FakeAccessibilityFeatures(disableAnimations: true);
    addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
    await _pumpSplash(tester);
    expect(_logoScale(tester), 1);
    expect(_taglineOpacity(tester), 1);

    await tester.pump(const Duration(milliseconds: 1600));
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.byType(P02WelcomeScreen), findsOneWidget);
    await _finish(tester);
  });
}
