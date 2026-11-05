// Rentals and outstation trips (mock mode): Home's tiles open P-34 / P-35; the package, the time and the cab set the
// fare; booking now goes to the finding screen, booking for later to P-36 and Upcoming (cancel is free).
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_passenger/features/activity/p21_activity_screen.dart';
import 'package:tamiltaxi_passenger/features/ride/p12_finding_driver_screen.dart';
import 'package:tamiltaxi_passenger/features/ride/p34_rental_screen.dart';
import 'package:tamiltaxi_passenger/features/ride/p35_outstation_screen.dart';
import 'package:tamiltaxi_passenger/features/ride/p36_booked_later_screen.dart';
import 'package:tamiltaxi_passenger/features/ride/widgets/mode_widgets.dart';
import 'package:tamiltaxi_passenger/router/routes.dart';
import 'package:tamiltaxi_passenger/state/ride_flow.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import 'support/harness.dart';

Future<void> advance(WidgetTester tester, Duration total) async {
  for (var t = Duration.zero; t < total; t += const Duration(milliseconds: 100)) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Future<void> tapText(WidgetTester tester, String text) async {
  final f = find.text(text).hitTestable();
  if (f.evaluate().isEmpty) await tester.ensureVisible(find.text(text).first);
  await tester.pump(const Duration(milliseconds: 200));
  await tester.tap(find.text(text).hitTestable().first);
  await advance(tester, const Duration(milliseconds: 700));
}

/// The booking sheet's own (vertical) list.
Finder _sheet() => find.descendant(of: find.byType(ModeBookingLayout), matching: find.byType(Scrollable)).first;

void main() {
  testWidgets('Home → Rental: package and cab set the fare; Book now finds a driver', (tester) async {
    final container = await pumpRoute(tester, Routes.ride);
    container.read(demoSettingsProvider.notifier).update((s) => s.copyWith(fastMode: true));
    await advance(tester, const Duration(seconds: 1));

    expect(find.text('MORE WAYS TO TRAVEL', skipOffstage: false), findsOneWidget);
    await tester.ensureVisible(find.text('Rental'));
    await tapText(tester, 'Rental');
    expect(find.byType(P34RentalScreen), findsOneWidget);
    // 4 hrs by default, a Sedan: ₹979.
    expect(find.text('Book Sedan · ₹979'), findsOneWidget);
    await tapText(tester, '6 hrs');
    expect(find.text('Book Sedan · ₹1,429'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('SUV'), 200, scrollable: _sheet());
    await tapText(tester, 'SUV');
    expect(find.text('Book SUV · ₹1,879'), findsOneWidget);
    await tester.scrollUntilVisible(find.textContaining('₹18 a km'), 200, scrollable: _sheet());
    expect(find.textContaining('₹18 a km'), findsOneWidget);

    await tapText(tester, 'Book SUV · ₹1,879');
    expect(find.byType(P12FindingDriverScreen), findsOneWidget);
    final ride = container.read(rideFlowProvider);
    expect(ride.isRental, isTrue);
    expect(ride.quote.total, 1879);
    expect(ride.dropTitle, 'Rental · 6 hrs · 60 km');
    // Let the (fast) demo trip run its course so no timer outlives the test.
    await advance(tester, const Duration(seconds: 40));
  });

  testWidgets('Rental booked for later: P-36, then Upcoming in Activity, cancelled for free', (tester) async {
    final container = await pumpRoute(tester, Routes.rental);
    await advance(tester, const Duration(milliseconds: 500));
    expect(find.byType(P34RentalScreen), findsOneWidget);
    final flow = container.read(rideFlowProvider.notifier);
    final at = DateTime.now().add(const Duration(days: 1));
    final when = DateTime(at.year, at.month, at.day, 6);
    flow.updateMode(container.read(rideFlowProvider).mode!.copyWith(leaveAt: when));
    await advance(tester, const Duration(milliseconds: 300));
    expect(find.text('Tomorrow, 6:00 AM', skipOffstage: false), findsOneWidget);

    await tapText(tester, 'Schedule Sedan · ₹979');
    await advance(tester, const Duration(seconds: 1));
    expect(find.byType(P36BookedLaterScreen), findsOneWidget);
    expect(find.text("You're booked"), findsOneWidget);
    expect(find.text('for Tomorrow, 6:00 AM'), findsOneWidget);
    expect(container.read(mockDatabaseProvider).upcoming, hasLength(1));

    await tapText(tester, 'See my trips');
    await advance(tester, const Duration(seconds: 1));
    expect(find.byType(P21ActivityScreen), findsOneWidget);
    expect(find.text('UPCOMING'), findsOneWidget);
    expect(find.text('Sedan · Rental · 4 hrs · 40 km'), findsOneWidget);
    await tapText(tester, 'Cancel booking');
    // The confirm dialog.
    await tapText(tester, 'Cancel booking');
    await advance(tester, const Duration(seconds: 1));
    expect(container.read(mockDatabaseProvider).upcoming, isEmpty);
    expect(find.text('UPCOMING'), findsNothing);
  });

  testWidgets('Outstation: choose a town, round trip straight back by default, priced by time', (tester) async {
    final container = await pumpRoute(tester, Routes.outstation);
    await advance(tester, const Duration(milliseconds: 500));
    expect(find.byType(P35OutstationScreen), findsOneWidget);
    expect(find.text('Choose where to'), findsOneWidget);

    await tapText(tester, 'Choose a town or city');
    expect(find.text('POPULAR FROM HERE'), findsOneWidget);
    await tapText(tester, 'Tiruppur');
    expect(find.byType(P35OutstationScreen), findsOneWidget);
    expect(container.read(rideFlowProvider).drop.name, 'Tiruppur');
    final oneWay = container.read(rideFlowProvider).quote;
    expect((oneWay.modeTerms! as OutstationTerms).roundTrip, isFalse);
    expect(find.text('Book Sedan · ${formatInr(oneWay.total)}'), findsOneWidget);

    await tapText(tester, 'Round trip');
    final round = container.read(rideFlowProvider).quote.modeTerms! as OutstationTerms;
    expect(round.roundTrip, isTrue);
    // Straight back: both ways' km, back after the drive both ways, nothing for waiting.
    expect(container.read(rideFlowProvider).mode!.returnAt, isNull);
    expect(round.includedKm, (2 * round.routeKm).ceil());
    expect((round.awayMin, round.waitMin), (2 * round.driveMin, 0));
    expect(round.returnAt, isNotNull);
    await tester.scrollUntilVisible(find.text('Come back'), 200, scrollable: _sheet());
    expect(find.text('Come back'), findsOneWidget);
    expect(find.text('Straight back · tap to stay longer'), findsOneWidget);
    expect(find.text('${formatMinutes(round.awayMin)} away'), findsOneWidget);
    await tester.scrollUntilVisible(find.textContaining('km included').first, 200, scrollable: _sheet());
    expect(find.textContaining('km included'), findsWidgets);
  });
}
