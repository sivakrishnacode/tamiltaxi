// P-01's intro: it starts on the native splash's frame (the name alone), ends on the tagline frame and routes on;
// with animations turned off it shows the last frame at once.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_passenger/app.dart';
import 'package:tamiltaxi_passenger/features/onboarding/p02_welcome_screen.dart';
import 'package:tamiltaxi_passenger/router/app_router.dart';
import 'package:tamiltaxi_passenger/router/routes.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

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

double _taglineOpacity(WidgetTester tester) =>
    tester.widget<Opacity>(find.ancestor(of: find.text(_tagline), matching: find.byType(Opacity)).first).opacity;

Future<void> _finish(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox());
  await tester.pump(const Duration(minutes: 1));
}

void main() {
  testWidgets('starts on the native splash frame, plays the intro, then opens onboarding', (tester) async {
    await _pumpSplash(tester);
    expect(find.byType(TtAppName), findsOneWidget);
    expect(find.byType(KolamRing), findsNothing, reason: 'the first frame is the native splash: the name alone');
    expect(_taglineOpacity(tester), 0);

    await tester.pump(const Duration(milliseconds: 700));
    expect(find.byType(KolamRing), findsOneWidget, reason: 'the ring is drawing itself');

    await tester.pump(const Duration(milliseconds: 1000));
    expect(find.byType(KolamRing), findsNothing, reason: 'the ring has faded out');
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
    expect(find.byType(KolamRing), findsNothing);
    expect(_taglineOpacity(tester), 1);

    await tester.pump(const Duration(milliseconds: 1600));
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.byType(P02WelcomeScreen), findsOneWidget);
    await _finish(tester);
  });
}
