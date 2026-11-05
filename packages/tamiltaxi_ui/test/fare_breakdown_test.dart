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

  test('an outstation round trip: km, the waiting there and the allowance add up to the total; a late return after', () {
    final leave = DateTime.utc(2026, 10, 6, 0, 30);
    final t = RideModeRates.outstationTerms(VehicleKind.cab,
        routeKm: 40.1, driveMin: 55, roundTrip: true, leaveAt: leave, returnAt: leave.add(const Duration(hours: 14)));
    final q = RideModeRates.quote(Seed.cab, t, distanceKm: 81, durationMin: 840);
    final lines = FareBreakdown.fromQuote(q).lines;
    expect([for (final l in lines) (l.label, l.amount)], [('Round trip', 891), ('Waiting there', 1095), ("Driver's allowance", 300)]);
    expect(lines.fold(0, (sum, l) => sum + l.amount), q.total);
    final late = q.copyWith(extraTimeCharge: 15, total: q.total + 15);
    expect(FareBreakdown.fromQuote(late).lines.last.label, 'Back later');
    // Straight back: no waiting line.
    final quick = RideModeRates.outstationTerms(VehicleKind.cab, routeKm: 40.1, driveMin: 55, roundTrip: true, leaveAt: leave);
    expect([for (final l in FareBreakdown.fromQuote(RideModeRates.quote(Seed.cab, quick, distanceKm: 81, durationMin: 110)).lines) l.label],
        ['Round trip', "Driver's allowance"]);
  });
}
