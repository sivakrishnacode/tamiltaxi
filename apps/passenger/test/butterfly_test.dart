// P-10 Pink Taxi (women riders; code name Butterfly): off / women first / women only, each explained in one line.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_passenger/features/ride/p10_choose_vehicle_screen.dart';
import 'package:tamiltaxi_passenger/features/ride/p10b_who_is_riding_sheet.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import 'support/harness.dart';

const _out = String.fromEnvironment('OUT');
const _outRider = String.fromEnvironment('OUT_RIDER');

void main() {
  testWidgets('Pink Taxi switches between any driver, women first and women only', (tester) async {
    await loadTestFonts();
    usePhone(tester, height: 400);
    var value = WomenDriverPref.none;
    await tester.pumpWidget(MaterialApp(
      theme: TtTheme.light(),
      home: Scaffold(
        body: RepaintBoundary(
          key: shotKey,
          child: StatefulBuilder(
            builder: (context, setState) => Padding(
              padding: const EdgeInsets.all(16),
              child: PinkTaxiStrip(value: value, onChanged: (v) => setState(() => value = v)),
            ),
          ),
        ),
      ),
    ));
    expect(find.text('Pink Taxi'), findsOneWidget);
    expect(find.text('A woman driver, for women riders'), findsOneWidget);
    expect(find.text('Women only'), findsNothing);

    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();
    expect(value, WomenDriverPref.preferred);
    expect(find.text('Women drivers get it first'), findsOneWidget);

    await tester.tap(find.text('Women only'));
    await tester.pumpAndSettle();
    expect(value, WomenDriverPref.only);
    expect(find.text('Women only, may take longer'), findsOneWidget);

    await tester.tap(find.text('Women first'));
    await tester.pumpAndSettle();
    expect(value, WomenDriverPref.preferred);

    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();
    expect(value, WomenDriverPref.none);
    if (_out.isNotEmpty) {
      await tester.tap(find.byType(Switch));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Women only'));
      await tester.pumpAndSettle();
      await saveScreenshot(tester, _out);
    }
  });

  testWidgets('"Who\'s riding?" checks the name and number, then returns a woman rider', (tester) async {
    await loadTestFonts();
    usePhone(tester, height: 900);
    ({OtherRider? rider})? result;
    await tester.pumpWidget(RepaintBoundary(
      key: shotKey,
      child: MaterialApp(
      theme: TtTheme.light(),
      home: Scaffold(
        body: RepaintBoundary(
          child: Builder(
            builder: (context) => Center(
              child: TextButton(
                onPressed: () async => result = await P10bWhoIsRidingSheet.show(context, me: 'Ravi'),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      ),
    )));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Someone else'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Done'));
    await tester.pumpAndSettle();
    expect(find.text('Enter their name'), findsOneWidget);
    expect(find.text('Enter their 10-digit mobile number'), findsOneWidget);
    expect(result, isNull);

    await tester.enterText(find.byType(TextField).first, 'Anjali');
    await tester.enterText(find.byKey(const ValueKey('phone-input')), '9876512345');
    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();
    if (_outRider.isNotEmpty) await saveScreenshot(tester, _outRider);
    await tester.tap(find.text('Done'));
    await tester.pumpAndSettle();
    expect(result?.rider, const OtherRider(name: 'Anjali', phone: '9876512345', isWoman: true));
  });
}
