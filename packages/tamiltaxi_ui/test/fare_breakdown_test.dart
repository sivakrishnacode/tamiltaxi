import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

void main() {
  const route = RouteEstimate(distanceKm: 4.2, durationMin: 14);

  Future<void> pump(WidgetTester tester, FareQuote q) => tester.pumpWidget(MaterialApp(
        theme: TtTheme.light(),
        home: Scaffold(body: SingleChildScrollView(child: FareBreakdown.fromQuote(q))),
      ));

  testWidgets("an auto at night: the government night fare on the peak line, no ₹0 time charge", (tester) async {
    final q = FareEngine.quoteRule(Seed.auto, Seed.auto.fareRule, route, night: 1.5);
    expect([q.subtotal, q.peakCharge, q.total, q.night], [110, 55, 165, true]);
    await pump(tester, q);
    expect(find.text('Night fare'), findsOneWidget);
    expect(find.text('1.5x'), findsOneWidget);
    expect(find.text('Peak time'), findsNothing);
    expect(find.text('Time charge'), findsNothing);
  });

  testWidgets('a cab at peak (no night fare: autos only, chosen by the API) keeps "Peak time" and its time charge',
      (tester) async {
    await pump(tester, FareEngine.quoteRule(Seed.cab, Seed.cab.fareRule, route, multiplier: 1.1));
    expect(find.text('Peak time'), findsOneWidget);
    expect(find.text('Night fare'), findsNothing);
    expect(find.text('Time charge'), findsOneWidget);
  });
}
