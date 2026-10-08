import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

void main() {
  final pixel = MemoryImage(base64Decode(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='));

  Widget view({required VoidCallback onContinue, bool animate = true}) => MaterialApp(
        theme: TtTheme.light(),
        home: TtWelcomeView(
          brand: const TtWordmark(size: 28, stacked: false),
          image: pixel,
          semanticLabel: 'A rider',
          title: 'Rides and parcels at fair prices',
          body: 'Bike, auto or cab.',
          animate: animate,
          onContinue: onContinue,
        ),
      );

  testWidgets('one button continues; the picture fades in once and settles', (tester) async {
    var taps = 0;
    await tester.pumpWidget(view(onContinue: () => taps++));
    await tester.pumpAndSettle();
    expect(find.text('Rides and parcels at fair prices'), findsOneWidget);
    expect(find.bySemanticsLabel('A rider'), findsOneWidget);
    await tester.tap(find.text('Continue with phone number'));
    expect(taps, 1);
  });

  testWidgets('showcase shows the picture at once', (tester) async {
    await tester.pumpWidget(view(onContinue: () {}, animate: false));
    final fade = tester.widget<Opacity>(find.ancestor(of: find.byType(Image), matching: find.byType(Opacity)).first);
    expect(fade.opacity, 1);
  });
}
