// MapBottomSheet with snap: let go and it settles at down / middle / up (like Rapido's Home sheet), never half way,
// and a parent rebuild in the middle of a drag doesn't throw it back.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

void main() {
  setUpAll(() => TtTheme.useGoogleFonts = false);

  Future<DraggableScrollableController> pumpSheet(WidgetTester tester, ValueNotifier<int> ticks) async {
    tester.view.physicalSize = const Size(400, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final controller = DraggableScrollableController();
    await tester.pumpWidget(MaterialApp(
      theme: TtTheme.light(),
      home: Scaffold(
        body: ValueListenableBuilder<int>(
          valueListenable: ticks,
          builder: (context, n, _) => MapBottomSheet(
            controller: controller,
            initialSize: 0.58,
            minSize: 0.34,
            maxSize: 0.92,
            snap: true,
            builder: (context) => [for (var i = 0; i < 30; i++) SizedBox(height: 40, child: Text('row $i $n'))],
          ),
        ),
      ),
    ));
    return controller;
  }

  testWidgets('a short drag settles back; a long one goes to the next stop', (tester) async {
    final ticks = ValueNotifier(0);
    final c = await pumpSheet(tester, ticks);
    expect(c.size, closeTo(0.58, 0.001));

    // 40 px up, slowly: back to the middle.
    await tester.timedDrag(find.text('row 0 0'), const Offset(0, -40), const Duration(milliseconds: 800));
    await tester.pumpAndSettle();
    expect(c.size, closeTo(0.58, 0.001));

    // A long drag up: all the way up.
    await tester.timedDrag(find.text('row 0 0'), const Offset(0, -220), const Duration(milliseconds: 800));
    await tester.pumpAndSettle();
    expect(c.size, closeTo(0.92, 0.001));

    // A long drag down from the top: past the middle, so it stops down (never in between).
    await tester.timedDrag(find.text('row 0 0'), const Offset(0, 420), const Duration(milliseconds: 900));
    await tester.pumpAndSettle();
    expect(c.size, anyOf(closeTo(0.34, 0.001), closeTo(0.58, 0.001)));
  });

  testWidgets('a rebuild during the drag keeps the drag going', (tester) async {
    final ticks = ValueNotifier(0);
    final c = await pumpSheet(tester, ticks);
    final gesture = await tester.startGesture(tester.getCenter(find.text('row 0 0')));
    for (var i = 0; i < 10; i++) {
      await gesture.moveBy(const Offset(0, -25));
      ticks.value++; // the parent rebuilds (new fares, nearby vehicles…)
      await tester.pump(const Duration(milliseconds: 16));
    }
    final during = c.size;
    expect(during, greaterThan(0.75), reason: 'the drag moved the sheet up');
    await gesture.up();
    await tester.pumpAndSettle();
    expect(c.size, closeTo(0.92, 0.001));
  });
}
