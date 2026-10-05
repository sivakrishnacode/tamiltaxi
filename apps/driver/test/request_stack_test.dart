import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_driver/features/jobs/widgets/request_stack_view.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/harness.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  Future<void> pump(WidgetTester tester, List<StackEntry> entries,
      {ValueChanged<String>? onAccept, ValueChanged<String>? onDecline, String? acceptingId, Widget? directionBar}) async {
    await loadTestFonts();
    usePhone(tester);
    await tester.pumpWidget(ProviderScope(
      child: MaterialApp(
        theme: TtTheme.light(),
        home: RequestStackView(
          entries: entries,
          acceptingId: acceptingId,
          directionBar: directionBar,
          onAccept: onAccept ?? (_) {},
          onDecline: onDecline ?? (_) {},
          onExpired: (_) {},
        ),
      ),
    ));
    await tester.pump();
  }

  List<StackEntry> three() {
    final now = DateTime.now();
    return [
      (request: Seed.rideRequest.copyWith(id: 'late', fare: 253, tripKm: 11), expiresAt: now.add(const Duration(seconds: 14))),
      (request: Seed.rideRequest.copyWith(id: 'soon', fare: 202, tripKm: 8), expiresAt: now.add(const Duration(seconds: 6))),
      (request: Seed.rideRequest.copyWith(id: 'mid', fare: 217, tripKm: 7), expiresAt: now.add(const Duration(seconds: 10))),
    ];
  }

  testWidgets('every open request is a card with fare and ₹/km, soonest to close first, and a rail entry', (tester) async {
    await pump(tester, three());
    expect(find.text('3 ride requests'), findsOneWidget);
    // Fare on the rail and on the card.
    expect(find.text('₹202'), findsNWidgets(2));
    expect(find.text('₹25/km'), findsOneWidget); // 202 / 8
    expect(find.text('Swipe to accept'), findsNWidgets(3));
    final cards = tester.widgetList<Padding>(find.byWidgetPredicate((w) => w is Padding && w.key is GlobalKey)).toList();
    expect(cards, hasLength(3));
    final soonY = tester.getTopLeft(find.byKey(const ValueKey('card-soon'))).dy;
    final lateY = tester.getTopLeft(find.byKey(const ValueKey('card-late'))).dy;
    expect(soonY, lessThan(lateY));
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets("the rider's extra shows as ₹50 + ₹20 with its own line; the Go To bar sits above the cards", (tester) async {
    final now = DateTime.now();
    await pump(tester, [
      (request: Seed.rideRequest.copyWith(id: 'boosted', fare: 70, extra: 20, tripKm: 5), expiresAt: now.add(const Duration(seconds: 9))),
    ], directionBar: const Text('Towards Home'));
    expect(find.text('₹50 + ₹20'), findsOneWidget);
    expect(find.text('Rider added ₹20 extra'), findsOneWidget);
    expect(find.text('₹14/km'), findsOneWidget); // 70 / 5: on what the driver collects
    expect(find.text('Towards Home'), findsOneWidget);
    expect(tester.getTopLeft(find.text('Towards Home')).dy,
        lessThan(tester.getTopLeft(find.byKey(const ValueKey('card-boosted'))).dy));
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('a bike driver\'s stack of rides and parcels is titled by both', (tester) async {
    final now = DateTime.now();
    await pump(tester, [
      (request: Seed.rideRequest.copyWith(id: 'ride'), expiresAt: now.add(const Duration(seconds: 9))),
      (request: Seed.deliveryRequest.copyWith(id: 'parcel', extra: 10), expiresAt: now.add(const Duration(seconds: 12))),
    ]);
    expect(find.text('2 requests'), findsOneWidget);
    expect(find.text('Sender added ₹10 extra'), findsOneWidget);
    // The rail shows the fare without the extra and the extra under it.
    expect(find.text('+₹10'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('swipe accepts that card; ✕ declines that card', (tester) async {
    String? accepted;
    String? declined;
    await pump(tester, three(), onAccept: (id) => accepted = id, onDecline: (id) => declined = id);
    await tester.drag(find.byKey(const ValueKey('swipe-knob')).first, const Offset(600, 0));
    await tester.pump(const Duration(milliseconds: 300));
    expect(accepted, 'soon');
    await tester.tap(find.bySemanticsLabel('Decline ₹217 request'));
    expect(declined, 'mid');
    await tester.pumpWidget(const SizedBox());
  });

  test('perks: best ₹/km and closest pickup go to one request only, parcels stand out among rides', () {
    final r = Seed.rideRequest;
    final perks = requestPerks([
      r.copyWith(id: 'a', fare: 200, tripKm: 10, pickupDistanceKm: 0.6), // ₹20/km, closest
      r.copyWith(id: 'b', fare: 150, tripKm: 5, pickupDistanceKm: 1.3, isCustomerVerified: true), // ₹30/km
      Seed.deliveryRequest.copyWith(id: 'c', fare: 100, tripKm: 4, pickupDistanceKm: 2), // ₹25/km
    ]);
    expect(perks['a'], [RequestPerk.closest]);
    expect(perks['b'], [RequestPerk.bestRate, RequestPerk.verified]);
    expect(perks['c'], [RequestPerk.parcel]);
    // A tie on what the cards show gives neither; one request alone has nothing to compare with.
    final tie = requestPerks([
      r.copyWith(id: 'a', fare: 200, tripKm: 10, pickupDistanceKm: 1.02),
      r.copyWith(id: 'b', fare: 201, tripKm: 10, pickupDistanceKm: 0.98),
    ]);
    expect(tie['a'], isEmpty);
    expect(tie['b'], isEmpty);
    expect(requestPerks([r.copyWith(id: 'a')])['a'], isEmpty);
  });

  testWidgets('the rail shows what sets each request apart, the card the same tag', (tester) async {
    final now = DateTime.now();
    final r = Seed.rideRequest;
    await pump(tester, [
      (request: r.copyWith(id: 'near', fare: 95, tripKm: 11.7, pickupDistanceKm: 0.6), expiresAt: now.add(const Duration(seconds: 9))),
      (request: r.copyWith(id: 'rate', fare: 90, tripKm: 9.7, pickupDistanceKm: 1.3), expiresAt: now.add(const Duration(seconds: 12))),
    ]);
    Finder inRail(String id, IconData icon) =>
        find.descendant(of: find.byKey(ValueKey('rail-$id')), matching: find.byIcon(icon));
    expect(inRail('near', Symbols.my_location_rounded), findsOneWidget);
    expect(inRail('rate', Symbols.trending_up_rounded), findsOneWidget);
    expect(find.descendant(of: find.byKey(const ValueKey('card-near')), matching: find.text('Closest pickup')), findsOneWidget);
    expect(find.descendant(of: find.byKey(const ValueKey('card-rate')), matching: find.text('Best ₹/km')), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp('Best ₹/km, pickup 1.3 km away')), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('Butterfly requests get the pink band and the butterfly on the rail', (tester) async {
    final now = DateTime.now();
    final r = Seed.rideRequest;
    await pump(tester, [
      (request: r.copyWith(id: 'only', womenDriver: WomenDriverPref.only), expiresAt: now.add(const Duration(seconds: 9))),
      (request: r.copyWith(id: 'pref', womenDriver: WomenDriverPref.preferred), expiresAt: now.add(const Duration(seconds: 12))),
      (request: r.copyWith(id: 'plain'), expiresAt: now.add(const Duration(seconds: 15))),
    ]);
    Finder inCard(String id, Finder f) => find.descendant(of: find.byKey(ValueKey('card-$id')), matching: f);
    expect(inCard('only', find.text('Women drivers only')), findsOneWidget);
    expect(inCard('pref', find.text('Women drivers first')), findsOneWidget);
    expect(inCard('plain', find.text('Pink Taxi')), findsNothing);
    expect(find.descendant(of: find.byKey(const ValueKey('rail-only')), matching: find.byType(ButterflyMark)), findsOneWidget);
    expect(find.descendant(of: find.byKey(const ValueKey('rail-pref')), matching: find.byType(ButterflyMark)), findsOneWidget);
    expect(find.descendant(of: find.byKey(const ValueKey('rail-plain')), matching: find.byType(ButterflyMark)), findsNothing);
    expect(requestPerks([r.copyWith(id: 'a', womenDriver: WomenDriverPref.preferred)])['a'], [RequestPerk.butterfly]);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('the whole card swipes: right accepts, left declines, a short drag springs back', (tester) async {
    String? accepted;
    String? declined;
    await pump(tester, three(), onAccept: (id) => accepted = id, onDecline: (id) => declined = id);
    final mid = find.byKey(const ValueKey('card-mid'));
    final x = tester.getTopLeft(mid).dx;
    // Frames for the spring-back / slide-out (the rings keep animating, so no pumpAndSettle).
    Future<void> settle() async {
      for (var i = 0; i < 5; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
    }

    await tester.drag(mid, const Offset(40, 0));
    await settle();
    expect(accepted, isNull);
    expect(declined, isNull);
    expect(tester.getTopLeft(mid).dx, x);

    // Mid-drag the backdrop says what letting go does.
    final gesture = await tester.startGesture(tester.getCenter(mid));
    await gesture.moveBy(const Offset(-30, 0));
    await gesture.moveBy(const Offset(-170, 0));
    await tester.pump();
    expect(find.text('Decline'), findsOneWidget);
    await gesture.up();
    await settle();
    expect(declined, 'mid');

    await tester.drag(find.byKey(const ValueKey('card-soon')), const Offset(200, 0));
    await settle();
    expect(accepted, 'soon');
    await tester.pump(const Duration(seconds: 2));
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('while one is being accepted the others are locked', (tester) async {
    await pump(tester, three(), acceptingId: 'soon');
    expect(find.text('Accepting'), findsOneWidget);
    final swipes = tester.widgetList<SwipeToConfirm>(find.byType(SwipeToConfirm));
    expect(swipes.every((s) => !s.enabled), isTrue);
    // No card swipes either.
    final mid = find.byKey(const ValueKey('card-mid'));
    final x = tester.getTopLeft(mid).dx;
    await tester.drag(mid, const Offset(200, 0));
    await tester.pump();
    expect(tester.getTopLeft(mid).dx, x);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('each card shows the seconds left and counts down, red at the end', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: TtTheme.light(),
      home: const Scaffold(body: Center(child: SecondsLeft(left: Duration(seconds: 7)))),
    ));
    expect(find.text('7s'), findsOneWidget);
    await tester.pump(const Duration(seconds: 3));
    final label = find.text('4s');
    expect(label, findsOneWidget);
    expect(tester.widget<Text>(label).style?.color, TtColors.error);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('rental and outstation requests get a band, ₹/hr or ₹/km on the package, and no best-₹/km race', (tester) async {
    final now = DateTime.now();
    await pump(tester, [
      (request: Seed.rentalRequest, expiresAt: now.add(const Duration(seconds: 12))),
      (request: Seed.outstationRequest, expiresAt: now.add(const Duration(seconds: 14))),
      (request: Seed.rideRequest, expiresAt: now.add(const Duration(seconds: 10))),
    ]);
    // Rental: package band, by the hour, no drop.
    expect(find.text('4 hrs · 40 km package'), findsOneWidget);
    expect(find.text('₹245/hr'), findsOneWidget); // 979 / 4
    expect(find.text('No fixed drop'), findsOneWidget);
    // Outstation booked ahead: round trip, the pickup time, km each way and when back.
    final o = Seed.outstationRequest;
    final terms = o.modeTerms! as OutstationTerms;
    expect(find.text('Round trip · 2 days'), findsOneWidget);
    expect(find.text('Pickup ${formatWhen(o.scheduledAt!)}'), findsOneWidget);
    expect(find.text('86.0 km each way · back ${formatWhen(terms.returnAt!)}'), findsOneWidget);
    expect(find.text('₹${(o.fare / terms.includedKm).round()}/km'), findsOneWidget);
    // The local ride is the only one with a ₹/km to compare: nobody gets "Best ₹/km".
    expect(find.text('Best ₹/km'), findsNothing);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('a single rental says so in the title', (tester) async {
    await pump(tester, [(request: Seed.rentalRequest, expiresAt: DateTime.now().add(const Duration(seconds: 12)))]);
    expect(find.text('New rental request'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('a house shift: band with the home and team, the slot, items and floors at both ends', (tester) async {
    final r = Seed.shiftingRequest;
    await pump(tester, [(request: r, expiresAt: DateTime.now().add(const Duration(seconds: 12)))]);
    expect(find.text('New Packers & Movers request'), findsOneWidget);
    expect(find.text('1 BHK · 2 helpers'), findsOneWidget);
    expect(find.text('Pickup Tomorrow, 9–11 AM'), findsOneWidget);
    expect(find.text('16 items'), findsOneWidget);
    expect(find.text('2nd floor · no lift'), findsOneWidget);
    expect(find.text('5th floor · lift'), findsOneWidget);
    // No ₹/km on a shift (helpers and packing are in the price).
    expect(find.textContaining('/km'), findsNothing);
    await tester.pumpWidget(const SizedBox());
  });
}
