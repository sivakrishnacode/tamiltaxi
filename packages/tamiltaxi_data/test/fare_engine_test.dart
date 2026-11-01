import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_data/src/api/api_mappers.dart' show quoteFromJson;

void main() {
  group('FareEngine', () {
    final ride = FareEngine.estimate(Seed.gandhipuram, Seed.brookefields);
    final goods = FareEngine.estimate(Seed.peelamedu, Seed.raceCourse);

    test('demo routes use the measured distances', () {
      expect(ride.distanceKm, 4.2);
      expect(ride.durationMin, 14);
      expect(goods.distanceKm, 6.8);
      expect(goods.durationMin, 23);
    });

    test('no peak markup by default', () {
      final quotes = FareEngine.quoteAll([Seed.bike, Seed.auto, Seed.cab], ride);
      expect([for (final q in quotes) q.total], [35, 110, 132]);
      expect(quotes.every((q) => q.multiplier == 1.0 && q.peakCharge == 0 && !q.hasPeak), isTrue);
    });

    test('ride fares match the designs (peak 1.1x)', () {
      int total(VehicleType v) => FareEngine.quote(v, ride, multiplier: 1.1).total;
      expect(total(Seed.bike), 38);
      expect(total(Seed.auto), 121);
      expect(total(Seed.cab), 145);
    });

    test('goods fares match the designs (peak 1.1x)', () {
      int total(VehicleType v) => FareEngine.quote(v, goods, multiplier: 1.1).total;
      expect(total(Seed.goodsBike), 49);
      expect(total(Seed.threeWheeler), 180);
      expect(total(Seed.miniTruck), 420);
    });

    test('bike breakdown: 12 + 21 + 2 = 35, peak +3, total 38', () {
      final q = FareEngine.quote(Seed.bike, ride, multiplier: 1.1);
      expect([q.base, q.distanceCharge, q.timeCharge, q.subtotal, q.peakCharge, q.total], [12, 21, 2, 35, 3, 38]);
    });

    test('every breakdown adds up exactly', () {
      for (final v in Seed.allVehicles) {
        for (final r in [ride, goods, FareEngine.estimate(Seed.saibabaColony, Seed.airport)]) {
          final q = FareEngine.quote(v, r, multiplier: 1.1);
          expect(q.base + q.distanceCharge + q.timeCharge + q.minFareTopUp, q.subtotal);
          expect(q.subtotal + q.peakCharge, q.total);
        }
      }
    });

    test('multiplier is capped at 1.5', () {
      final q = FareEngine.quote(Seed.cab, ride, multiplier: 3);
      expect(q.multiplier, 1.5);
    });

    test('multiplier applies before the minimum fare, never to the top-up', () {
      // Bike 0.5 km / 1 min: 12 + 2 + 0 = 14, x 1.5 = 21, topped up to the ₹25 minimum.
      final q = FareEngine.quote(Seed.bike, const RouteEstimate(distanceKm: 0.5, durationMin: 1), multiplier: 1.5);
      expect([q.subtotal, q.minFareTopUp, q.peakCharge, q.total], [18, 4, 7, 25]);
    });

    test('fallback distance is haversine x 1.3', () {
      final r = FareEngine.estimate(Seed.townHall, Seed.singanallur);
      expect(r.distanceKm, greaterThan(7));
      expect(r.durationMin, FareEngine.durationFor(r.distanceKm));
    });
  });
  // Same file as apps/api/src/modules/fares/fare-engine.spec.ts, so the Dart and API engines can't drift apart.
  group('shared fare cases (test/fixtures/fare_cases.json)', () {
    final cases = (jsonDecode(File('test/fixtures/fare_cases.json').readAsStringSync()) as Map<String, dynamic>)['cases']
        as List<dynamic>;

    test('has at least 10 cases', () => expect(cases.length, greaterThanOrEqualTo(10)));

    for (final c in cases.cast<Map<String, dynamic>>()) {
      test(c['name'] as String, () {
        final input = c['input'] as Map<String, dynamic>;
        final expected = c['expected'] as Map<String, dynamic>;
        final vehicle = Seed.vehicle(vehicleKindFromApi(input['vehicleKind']));
        final q = FareEngine.quoteRule(
          vehicle,
          vehicle.fareRule,
          RouteEstimate(distanceKm: (input['distanceKm'] as num).toDouble(), durationMin: input['durationMin'] as int),
          multiplier: (input['multiplier'] as num).toDouble(),
          cap: (input['maxMultiplier'] as num?)?.toDouble() ?? FareEngine.maxMultiplier,
        );
        expect({
          'base': q.base,
          'distanceCharge': q.distanceCharge,
          'timeCharge': q.timeCharge,
          'minFareTopUp': q.minFareTopUp,
          'subtotal': q.subtotal,
          'multiplier': q.multiplier,
          'peakCharge': q.peakCharge,
          'total': q.total,
        }, expected);
      });
    }
  });

  // Same cases as apps/api/src/modules/fares/fare-engine.spec.ts ("shared waiting case").
  group('shared waiting cases (test/fixtures/fare_cases.json)', () {
    final cases = (jsonDecode(File('test/fixtures/fare_cases.json').readAsStringSync()) as Map<String, dynamic>)['waitingCases']
        as List<dynamic>;

    test('has at least 10 cases', () => expect(cases.length, greaterThanOrEqualTo(10)));

    for (final c in cases.cast<Map<String, dynamic>>()) {
      test(c['name'] as String, () {
        final input = c['input'] as Map<String, dynamic>;
        final expected = c['expected'] as Map<String, dynamic>;
        final vehicle = Seed.vehicle(vehicleKindFromApi(input['vehicleKind']));
        final q = FareEngine.quoteRule(
          vehicle,
          vehicle.fareRule,
          RouteEstimate(
            distanceKm: (input['distanceKm'] as num?)?.toDouble() ?? 1,
            durationMin: (input['durationMin'] as int?) ?? 1,
          ),
          multiplier: (input['multiplier'] as num?)?.toDouble() ?? 1,
          freeWaitMin: (input['freeWaitMin'] as int?) ?? FareEngine.freeWaitMin,
          waitMaxCharge: (input['waitMaxCharge'] as int?) ?? FareEngine.waitMaxCharge,
        );
        expect(q.waitPerMin, expected['waitPerMin']);
        final arrived = DateTime(2026, 9, 28, 10);
        final charge = q.waitingFrom(arrived).chargeAt(arrived.add(Duration(seconds: input['waitedSec'] as int)));
        expect(charge, expected['waitingCharge']);
        final fare = FareEngine.withWaiting(q, charge);
        expect(fare.subtotal + fare.peakCharge + fare.waitingCharge, fare.total);
        if (expected['total'] != null) expect(fare.total, expected['total']);
      });
    }
  });

  group('WaitingTerms', () {
    final arrived = DateTime(2026, 9, 28, 10);
    const terms = (freeMin: 3, perMin: 2, maxCharge: 30);
    final w = WaitingTerms(arrivedAt: arrived, freeMin: terms.freeMin, perMin: terms.perMin, maxCharge: terms.maxCharge);

    test('counts the free minutes down, then charges each started minute', () {
      expect(w.freeLeft(arrived.add(const Duration(seconds: 15))), const Duration(minutes: 2, seconds: 45));
      expect(w.freeLeft(arrived.add(const Duration(minutes: 4))), Duration.zero);
      expect(w.chargeAt(arrived.add(const Duration(minutes: 3))), 0);
      expect(w.chargeAt(arrived.add(const Duration(minutes: 3, seconds: 1))), 2);
      expect(w.chargeAt(arrived.add(const Duration(hours: 2))), 30);
    });

    test('quotes from the API carry the terms; old fares fall back to the vehicle rate', () {
      final q = quoteFromJson({'vehicleKind': 'CAB', 'total': 132, 'waitingCharge': 4, 'freeWaitMin': 5, 'waitPerMin': 3, 'waitMaxCharge': 40});
      expect([q.waitingCharge, q.freeWaitMin, q.waitPerMin, q.waitMaxCharge, q.hasWaiting], [4, 5, 3, 40, true]);
      final fee = quoteFromJson({'vehicleKind': 'BIKE', 'subtotal': 35, 'total': 45, 'previousCancellationFee': 10});
      expect([fee.previousCancellationFee, fee.hasCancellationFee], [10, true]);
      final old = quoteFromJson({'vehicleKind': 'CAB', 'total': 132});
      expect([old.waitingCharge, old.freeWaitMin, old.waitPerMin, old.waitMaxCharge, old.hasWaiting], [0, 3, 2, 30, false]);
    });
  });
}
