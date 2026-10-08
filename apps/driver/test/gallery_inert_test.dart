// Design gallery frames are previews: their buttons show a note and never log out, go online, take a selfie or leave
// the gallery.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_driver/common/showcase.dart';
import 'package:tamiltaxi_driver/features/account/d26_account_screen.dart';
import 'package:tamiltaxi_driver/features/home/d13_home_screen.dart';
import 'package:tamiltaxi_driver/features/onboarding/d02_welcome_screen.dart';
import 'package:tamiltaxi_driver/features/onboarding/d09_selfie_screen.dart';
import 'package:tamiltaxi_driver/features/states/s13_selfie_check_screen.dart';
import 'package:tamiltaxi_driver/router/routes.dart';
import 'package:tamiltaxi_driver/state/driver_session.dart';

import 'support/harness.dart';

Future<void> _frames(WidgetTester tester, [int n = 10]) async {
  for (var i = 0; i < n; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Future<void> _tap(WidgetTester tester, String text) async {
  final f = find.text(text);
  if (f.hitTestable().evaluate().isEmpty) {
    await tester.dragUntilVisible(f, find.byType(Scrollable).last, const Offset(0, -200));
    await tester.pump();
  }
  await tester.tap(f.hitTestable().first);
  await _frames(tester);
}

void main() {
  testWidgets('D-26 frame: Log out only shows the note', (tester) async {
    final container = await pumpRoute(tester, Routes.galleryView('D-26'));
    await _tap(tester, 'Log out');
    expect(find.text('Log out?'), findsNothing);
    expect(find.text(kPreviewNote), findsOneWidget);
    expect(find.byType(D26AccountScreen), findsOneWidget);
    await closeApp(tester, container);
  });

  testWidgets('D-09 frame: Take selfie stays in the frame', (tester) async {
    final container = await pumpRoute(tester, Routes.galleryView('D-09'));
    await _tap(tester, 'Take selfie');
    await _frames(tester, 20);
    expect(find.byType(D09SelfieScreen), findsOneWidget);
    expect(find.text(kPreviewNote), findsOneWidget);
    await closeApp(tester, container);
  });

  testWidgets('S-13 frame: Take selfie opens nothing', (tester) async {
    final container = await pumpRoute(tester, Routes.galleryView('S-13'));
    await _tap(tester, 'Take selfie');
    expect(find.byType(S13SelfieCheckScreen), findsOneWidget);
    expect(find.byType(D09SelfieScreen), findsNothing);
    await closeApp(tester, container);
  });

  testWidgets('D-13 frame: GO ONLINE does not go online', (tester) async {
    final container = await pumpRoute(tester, Routes.galleryView('D-13'));
    await _tap(tester, 'GO ONLINE');
    expect(container.read(driverSessionProvider).online, isFalse);
    expect(find.byType(D13HomeScreen), findsOneWidget);
    expect(find.byType(S13SelfieCheckScreen), findsNothing);
    await closeApp(tester, container);
  });

  testWidgets('D-02 frame: Continue opens nothing', (tester) async {
    final container = await pumpRoute(tester, Routes.galleryView('D-02'));
    await _tap(tester, 'Continue with phone number');
    expect(find.byType(D02WelcomeScreen), findsOneWidget);
    expect(find.text(kPreviewNote), findsOneWidget);
    await closeApp(tester, container);
  });
}
