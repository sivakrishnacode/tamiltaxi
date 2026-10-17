// House shifting (PH-01 … PH-04 → P-36), goods to another town (PP-01 / PP-06 → P-36) and PP-03's "I'm receiving
// it myself", in mock mode. Items are typed (or pasted), never picked from a catalogue.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_passenger/features/ride/p36_booked_later_screen.dart';
import 'package:tamiltaxi_passenger/features/shifting/ph02_items_screen.dart';
import 'package:tamiltaxi_passenger/features/shifting/ph03_schedule_screen.dart';
import 'package:tamiltaxi_passenger/features/shifting/ph04_review_screen.dart';
import 'package:tamiltaxi_passenger/features/shifting/widgets/shifting_widgets.dart';
import 'package:tamiltaxi_passenger/router/routes.dart';
import 'package:tamiltaxi_passenger/state/parcel_flow.dart';
import 'package:tamiltaxi_passenger/state/shifting_flow.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import 'support/harness.dart';

Future<void> advance(WidgetTester tester, Duration total) async {
  for (var t = Duration.zero; t < total; t += const Duration(milliseconds: 100)) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Future<void> tapText(WidgetTester tester, String text) async {
  final f = find.text(text);
  await tester.ensureVisible(f.first);
  await tester.pump(const Duration(milliseconds: 200));
  await tester.tap(f.hitTestable().first);
  await advance(tester, const Duration(milliseconds: 700));
}

void main() {
  group('parseItemList', () {
    test('one item per line, counts before or after, details after a dash', () {
      final items = parseItemList('2 chairs\nFridge - single door\nCartons x10\n\n- Double cot: wooden\n3. Mirror\nTable - 2');
      expect([for (final i in items) (i.qty, i.name, i.note)], [
        (2, 'chairs', ''),
        (1, 'Fridge', 'single door'),
        (10, 'Cartons', ''),
        (1, 'Double cot', 'wooden'),
        (1, 'Mirror', ''),
        (2, 'Table', ''),
      ]);
    });

    test('blank lines are skipped; counts are capped', () {
      expect(parseItemList('   \n\n'), isEmpty);
      expect(parseItemList('99 cartons').single.qty, 50);
    });
  });

  testWidgets('House shifting: places, floors and size; typed and pasted items; a day and extras; booked', (tester) async {
    final container = await pumpRoute(tester, Routes.shifting);
    await advance(tester, const Duration(milliseconds: 500));
    final flow = container.read(shiftingFlowProvider.notifier);
    expect(find.text('Moving home?'), findsOneWidget);
    // No price before the new home is chosen.
    expect(find.text('Choose the new home to see the price'), findsOneWidget);
    // …and no price placeholder, which looked like it was loading for ever.
    expect(find.descendant(of: find.byType(ShiftingPriceBar), matching: find.byType(SkeletonBox)), findsNothing);
    flow.setDrop(Seed.raceCourse);
    await advance(tester, const Duration(milliseconds: 300));
    await tapText(tester, '2 BHK');
    expect(container.read(shiftingFlowProvider).vehicleOrSuggested, VehicleKind.truck);
    expect(find.textContaining('3 helpers to load and unload'), findsOneWidget);
    // Second floor at the old home: one tap on its floor strip; stairs until Lift is chosen.
    final second = find.bySemanticsLabel('2nd floor at the old home');
    await tester.ensureVisible(second);
    await tester.pump();
    await tester.tap(second);
    await advance(tester, const Duration(milliseconds: 300));
    expect(container.read(shiftingFlowProvider).details.pickupFloor, 2);
    expect(container.read(shiftingFlowProvider).quote!.lines.stairs, 300);
    expect(find.text('₹300 for 2 floors of stairs'), findsOneWidget);
    await tester.tap(find.bySemanticsLabel('Lift for furniture at the old home'));
    await advance(tester, const Duration(milliseconds: 300));
    expect(container.read(shiftingFlowProvider).quote!.lines.stairs, 0);
    expect(find.text('No stairs charge'), findsOneWidget);
    await tester.tap(find.bySemanticsLabel('Stairs only at the old home'));
    await advance(tester, const Duration(milliseconds: 300));
    expect(container.read(shiftingFlowProvider).quote!.lines.stairs, 300);

    await tapText(tester, 'Add items');
    expect(find.byType(PH02ItemsScreen), findsOneWidget);
    expect(find.text('Nothing on the list yet'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Item, e.g. Double cot, fridge, sofa'), 'Double cot');
    await tester.enterText(find.widgetWithText(TextField, 'Details (optional): size, material, fragile…'), 'Wooden, comes apart');
    await tester.pump();
    await tapText(tester, 'Add to list');
    expect(find.text('Double cot'), findsOneWidget);
    expect(find.text('Wooden, comes apart'), findsOneWidget);

    await tapText(tester, 'Paste a list');
    await tester.enterText(find.byType(TextField).last, '2 chairs\nFridge - single door');
    await tester.pump();
    expect(find.text('Add 2 items'), findsOneWidget);
    await tapText(tester, 'Add 2 items');
    final items = container.read(shiftingFlowProvider).details.items;
    expect([for (final i in items) '${i.qty} ${i.name}'], ['1 Double cot', '2 chairs', '1 Fridge']);

    // The button, not the step bar's label.
    await tester.tap(find.widgetWithText(TtButton, 'Day & extras'));
    await advance(tester, const Duration(milliseconds: 700));
    expect(find.byType(PH03ScheduleScreen), findsOneWidget);
    await tapText(tester, '11 AM–1 PM');
    expect(container.read(shiftingFlowProvider).slotHour, 11);
    await tapText(tester, 'Full');
    final s = container.read(shiftingFlowProvider);
    expect(s.details.packing, PackingLevel.full);
    expect(s.quote!.lines.packing, 1899);

    await tapText(tester, 'Review');
    expect(find.byType(PH04ReviewScreen), findsOneWidget);
    expect(find.text('3 items · 4 in all'), findsOneWidget);
    final total = container.read(shiftingFlowProvider).quote!.lines.total;
    await tapText(tester, 'Book · ${formatInr(total)}');
    await advance(tester, const Duration(seconds: 1));
    expect(find.byType(P36BookedLaterScreen), findsOneWidget);
    expect(find.text("You're booked"), findsOneWidget);
    expect(find.textContaining('11 AM–1 PM'), findsWidgets);
    final booked = container.read(mockDatabaseProvider).upcoming.single;
    expect(booked.isShifting, isTrue);
    expect(booked.shifting!.items, hasLength(3));
    expect(booked.fare, total);
    expect(booked.scheduledAt!.hour, 11);
    // The plan starts afresh for the next move.
    expect(container.read(shiftingFlowProvider).details.items, isEmpty);
  });

  testWidgets('Goods to another town: goods trucks only, by the km, scheduled for tomorrow', (tester) async {
    final container = await pumpRoute(tester, Routes.parcel);
    await advance(tester, const Duration(milliseconds: 500));
    expect(find.text('Up to 10\u00A0kg', skipOffstage: false), findsOneWidget, reason: 'the goods bike, in town');
    await tapText(tester, 'To another town');
    expect(container.read(parcelFlowProvider).outstation, isTrue);
    expect(find.text('Up to 10\u00A0kg', skipOffstage: false), findsNothing, reason: 'no goods bike to other towns');

    final flow = container.read(parcelFlowProvider.notifier)
      ..setDrop(Seed.outstationTowns[1]);
    final q = container.read(parcelFlowProvider).quote;
    final terms = q.modeTerms! as OutstationTerms;
    expect(terms.perKm, 22);
    expect(q.total, terms.includedKm * 22);
    final now = DateTime.now();
    flow.setLeaveAt(DateTime(now.year, now.month, now.day + 1, 7));
    final r = await flow.bookForLater();
    expect(r.error, isNull);
    final booked = container.read(mockDatabaseProvider).upcoming.single;
    expect((booked.kind, booked.rideMode, booked.status), (TripKind.parcel, RideMode.outstation, TripStatus.scheduled));
    expect(container.read(parcelFlowProvider).leaveAt, isNull);
  });

  testWidgets("PP-03: I'm receiving it myself shows the rider as the receiver, nothing to type", (tester) async {
    await pumpRoute(tester, Routes.parcelDrop);
    await advance(tester, const Duration(milliseconds: 500));
    await tapText(tester, "I'm receiving it myself");
    expect(find.text('Priya Raman'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'Priya Raman'), findsNothing);
    expect(find.text('Receiver name'), findsNothing);
    expect(find.text('You get the delivery OTP in the app'), findsOneWidget);
    expect(find.text('Shop'), findsOneWidget);
  });

  testWidgets('PP-01: with no drop yet, "Where should it go?" searches first instead of opening PP-03 on a made-up drop',
      (tester) async {
    final container = await pumpRoute(tester, Routes.parcel);
    await advance(tester, const Duration(milliseconds: 500));
    expect(container.read(parcelFlowProvider).dropSet, isFalse);
    await tapText(tester, 'Where should it go?');
    expect(find.text('Search for a place'), findsOneWidget);
    expect(find.text('Drop details'), findsNothing);
    // Backing out of the search stays on PP-01 with no drop.
    tester.state<NavigatorState>(find.byType(Navigator).last).pop();
    await advance(tester, const Duration(milliseconds: 500));
    expect(find.text('Drop details'), findsNothing);
    expect(find.text('Where should it go?'), findsOneWidget);
    expect(container.read(parcelFlowProvider).dropSet, isFalse);
  });

  testWidgets('PP-01: "Set on map" in the first drop search opens PP-03 on a new pin at the pickup', (tester) async {
    final container = await pumpRoute(tester, Routes.parcel);
    await advance(tester, const Duration(milliseconds: 500));
    await tapText(tester, 'Where should it go?');
    expect(find.text('Set on map'), findsOneWidget);
    await tapText(tester, 'Set on map');
    await advance(tester, const Duration(milliseconds: 800));
    expect(find.text('Drop details'), findsOneWidget);
    final flow = container.read(parcelFlowProvider);
    expect(flow.dropSet, isTrue);
    expect(flow.drop.location, flow.pickup.location);
  });

  testWidgets('PP-01 Switch: pickup and drop change places, and so do the sender and the receiver', (tester) async {
    final container = await pumpRoute(tester, Routes.parcel);
    await advance(tester, const Duration(milliseconds: 500));
    final ctrl = container.read(parcelFlowProvider.notifier)..setDrop(Seed.raceCourse);
    final before = container.read(parcelFlowProvider);
    ctrl.swapStops();
    final after = container.read(parcelFlowProvider);
    expect(after.pickup.name, before.drop.name);
    expect(after.drop.name, before.pickup.name);
    expect(after.details.senderName, before.details.receiverName);
    expect(after.details.receiverName, before.details.senderName);
    expect(after.dropSet, isTrue);
  });

  testWidgets('PP-03 Confirm drop goes straight to PP-06; parcel details are optional there', (tester) async {
    final container = await pumpRoute(tester, Routes.parcelDrop);
    await advance(tester, const Duration(milliseconds: 500));
    await tapText(tester, 'Confirm drop');
    await advance(tester, const Duration(milliseconds: 800));
    expect(find.text('Choose a vehicle'), findsOneWidget);
    expect(find.text('What are you sending?'), findsOneWidget);
    expect(find.text('By booking, you confirm no prohibited items.'), findsOneWidget);
    expect(container.read(parcelFlowProvider).detailsSet, isFalse);
    // Optional details: PP-04 Save comes back here with the parcel described.
    await tapText(tester, 'What are you sending?');
    await advance(tester, const Duration(milliseconds: 800));
    await tapText(tester, 'Documents');
    await tapText(tester, 'Save');
    await advance(tester, const Duration(milliseconds: 800));
    expect(container.read(parcelFlowProvider).detailsSet, isTrue);
    expect(find.textContaining('Documents ·'), findsOneWidget);
  });

  testWidgets('PP-06 in town, like Porter: Scooty listed, no Truck; a 5–20 kg parcel moves from Bike to Scooty', (tester) async {
    final container = await pumpRoute(tester, Routes.parcelDrop);
    await advance(tester, const Duration(milliseconds: 500));
    await tapText(tester, 'Confirm drop');
    await advance(tester, const Duration(milliseconds: 800));
    expect(find.text('Scooty'), findsWidgets);
    expect(find.text('Truck'), findsNothing);
    final ctrl = container.read(parcelFlowProvider.notifier)..selectVehicle(VehicleKind.goodsBike);
    ctrl.updateDetails(container.read(parcelFlowProvider).details.copyWith(weight: WeightBand.from5to20));
    expect(container.read(parcelFlowProvider).vehicle, VehicleKind.scootyParcel);
  });
}
