// D-06 shows the service city in its locked City field even though the cities load after the screen's first frame.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_driver/features/onboarding/d06_personal_details_screen.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import 'support/harness.dart';

void main() {
  testWidgets('the City field fills in once the service cities load', (tester) async {
    await loadTestFonts();
    usePhone(tester);
    await tester.pumpWidget(ProviderScope(
      child: MaterialApp(theme: TtTheme.light(), home: const D06PersonalDetailsScreen()),
    ));
    await tester.pump();
    await tester.pump();
    final fields = tester.widgetList<TextField>(find.byType(TextField));
    expect(fields.any((f) => f.controller?.text == Seed.demoCity.name), isTrue);
  });
}
