// The floating overlay's protocol: which surface shows in the background, and the request card data that
// crosses isolates as JSON.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_driver/features/jobs/widgets/request_stack_view.dart';
import 'package:tamiltaxi_driver/overlay/overlay_protocol.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

void main() {
  group('backgroundSurfaceFor', () {
    BackgroundSurface f({bool bg = true, bool online = true, bool request = false, bool allowed = true}) =>
        backgroundSurfaceFor(inBackground: bg, online: online, hasRequest: request, overlayAllowed: allowed);

    test('nothing in front or offline', () {
      expect(f(bg: false), BackgroundSurface.none);
      expect(f(bg: false, request: true), BackgroundSurface.none);
      expect(f(online: false), BackgroundSurface.none);
      expect(f(online: false, request: true), BackgroundSurface.none);
    });

    test('online in the background: the bubble, or nothing without the permission', () {
      expect(f(), BackgroundSurface.bubble);
      expect(f(allowed: false), BackgroundSurface.none);
    });

    test('a request: the overlay card, or the full-screen notification without the permission', () {
      expect(f(request: true), BackgroundSurface.requestOverlay);
      expect(f(request: true, allowed: false), BackgroundSurface.requestNotification);
    });
  });

  group('OverlayOffer', () {
    test('a rental or an outstation trip booked ahead keeps its terms and pickup time', () {
      final expiresAt = DateTime(2026, 10, 1, 21);
      for (final r in [Seed.rentalRequest, Seed.outstationRequest]) {
        final o = OverlayOffer.fromJson(jsonDecode(jsonEncode(OverlayOffer.fromRequest(r, expiresAt).toJson())))!.toRequest();
        expect(o.rideMode, r.rideMode);
        expect(o.modeLabel, r.modeLabel);
        expect(o.scheduledAt, r.scheduledAt == null ? isNull : DateTime.fromMillisecondsSinceEpoch(r.scheduledAt!.millisecondsSinceEpoch));
      }
      final shift = OverlayOffer.fromJson(jsonDecode(jsonEncode(OverlayOffer.fromRequest(Seed.shiftingRequest, expiresAt).toJson())))!
          .toRequest()
          .shifting!;
      expect(shift.items, Seed.shiftingRequest.shifting!.items);
      expect(shift.lines!.helperCount, 2);
      expect((shift.pickupFloor, shift.pickupLift, shift.dropFloor, shift.dropLift), (2, false, 5, true));
      final back = OverlayOffer.fromJson(
              jsonDecode(jsonEncode(OverlayOffer.fromRequest(Seed.outstationRequest, expiresAt).toJson())))!
          .toRequest()
          .modeTerms! as OutstationTerms;
      final want = Seed.outstationRequest.modeTerms! as OutstationTerms;
      expect((back.roundTrip, back.days, back.includedKm, back.perKm), (want.roundTrip, want.days, want.includedKm, want.perKm));
      expect(back.returnAt, want.returnAt);
    });

    final expires = DateTime(2026, 9, 26, 10, 0, 15);
    final r = Seed.deliveryRequest.copyWith(id: 'trip-9', customerName: 'Meena', pickupDistanceKm: 1.4, pickupEtaMin: 5);

    test('survives the JSON trip between isolates', () {
      final json = jsonDecode(jsonEncode(OverlayOffer.fromRequest(r, expires).toJson()));
      final o = OverlayOffer.fromJson(json)!;
      expect(o.id, 'trip-9');
      expect(o.fare, r.fare);
      expect(o.vehicle, r.vehicle);
      expect(o.isDelivery, isTrue);
      expect(o.pickupName, r.pickup.name);
      expect(o.dropName, r.drop.name);
      expect(o.pickupKm, 1.4);
      expect(o.pickupEtaMin, 5);
      expect(o.customerName, 'Meena');
      expect(o.expiresAtMs, expires.millisecondsSinceEpoch);
    });

    test("carries the rider's extra", () {
      final boosted = OverlayOffer.fromRequest(r.copyWith(fare: 90, extra: 30), expires);
      final back = OverlayOffer.fromJson(jsonDecode(jsonEncode(boosted.toJson())))!;
      expect(back.extra, 30);
      expect(back.toRequest().extra, 30);
      expect(OverlayOffer.fromJson(jsonDecode(jsonEncode(OverlayOffer.fromRequest(r, expires).toJson())))!.extra, 0);
    });

    test('carries the Butterfly choice, so the bubble shows the pink band too', () {
      OverlayOffer roundTrip(RideRequest req) =>
          OverlayOffer.fromJson(jsonDecode(jsonEncode(OverlayOffer.fromRequest(req, expires).toJson())))!;
      expect(roundTrip(r.copyWith(womenDriver: WomenDriverPref.preferred)).toRequest().womenDriver, WomenDriverPref.preferred);
      expect(roundTrip(r.copyWith(womenDriver: WomenDriverPref.only)).toRequest().isWomenOnly, isTrue);
      expect(roundTrip(r).toRequest().isButterfly, isFalse);
    });

    test('countdown from the server expiry, never negative', () {
      final o = OverlayOffer.fromRequest(r, expires);
      expect(o.remaining(DateTime(2026, 9, 26, 10, 0, 5)), const Duration(seconds: 10));
      expect(o.remaining(DateTime(2026, 9, 26, 10, 1)), Duration.zero);
    });

    test('carries what the comparison list shows, and back to a request', () {
      final rich = r.copyWith(customerRating: 4.6);
      final o = OverlayOffer.fromJson(jsonDecode(jsonEncode(OverlayOffer.fromRequest(rich, expires).toJson())))!;
      final back = o.toRequest();
      expect(back.id, 'trip-9');
      expect(back.fare, r.fare);
      expect(back.pickup.address, r.pickup.address);
      expect(back.drop.address, r.drop.address);
      expect(back.customerRating, 4.6);
      expect(back.isDelivery, isTrue);
      expect(o.expiresAt, expires);
    });

    test('rejects non-offers', () {
      expect(OverlayOffer.fromJson(null), isNull);
      expect(OverlayOffer.fromJson({'fare': 10}), isNull);
      expect(OverlayOffer.fromJson('x'), isNull);
    });
  });

  // The overlay runs in its own isolate with no ProviderScope: its cards must build without one (the voice toggle
  // is a ConsumerWidget and drew a grey error screen there).
  testWidgets('the overlay request list builds without app state', (tester) async {
    final r = Seed.rideRequest;
    final soon = DateTime.now().add(const Duration(seconds: 10));
    await tester.pumpWidget(MaterialApp(
      theme: TtTheme.light(),
      home: RequestStackView(
        entries: [(request: r, expiresAt: soon)],
        showVoiceToggle: false,
        onAccept: (_) {},
        onDecline: (_) {},
        onExpired: (_) {},
      ),
    ));
    expect(tester.takeException(), isNull);
    expect(find.text('New ride request'), findsOneWidget);
    expect(find.text('Swipe to accept'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });
}
