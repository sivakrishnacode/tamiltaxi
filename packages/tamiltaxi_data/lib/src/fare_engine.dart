import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:latlong2/latlong.dart';

import 'models/place.dart';
import 'models/vehicle.dart';

/// Distance and duration between two places.
@immutable
class RouteEstimate {
  const RouteEstimate({required this.distanceKm, required this.durationMin, this.travelMin});

  final double distanceKm;

  /// Fare minutes (distance at 18 km/h): the time charge is billed on these.
  final int durationMin;

  /// Live API: Google's traffic-aware travel minutes (display only; null when Google is off or for an old server).
  final int? travelMin;

  /// Minutes to show the rider: Google's travel time when known, else the fare minutes.
  int get tripMin => travelMin ?? durationMin;

  /// "4.2 km · 14 min" (travel time when known)
  String get label => '${distanceKm.toStringAsFixed(1)} km · $tripMin min';
}

/// Pure-Dart fare engine used by every screen that shows a price.
///
/// fare = max(minFare, (base + perKm × km + perMin × min) × multiplier), multiplier capped at 1.5.
/// The multiplier applies to the ride only, never to the minimum-fare top-up.
/// A night multiplier (autos at night, the Tamil Nadu government fare) multiplies the whole fare, the minimum
/// included, and replaces the peak price when higher; it shows on the peak line with [FareQuote.night].
/// Every line is rounded DOWN to a whole rupee and the peak line is the difference,
/// so the breakdown always adds up exactly to the total (same as apps/api fare-engine.ts).
abstract final class FareEngine {
  static const double roadFactor = 1.3;
  static const double averageSpeedKmh = 18;
  static const double maxMultiplier = 1.5;

  /// Multiplier when none is given: no peak markup ("Peak time" shows only above 1.0).
  static const double currentMultiplier = 1.0;

  /// Waiting at the pickup: free minutes and the cap per trip (the API's `freeWaitMin` / `waitMaxCharge` defaults).
  static const int freeWaitMin = 3;
  static const int waitMaxCharge = 30;

  /// "Add extra" while nobody has taken the trip: the steps offered (same as apps/api extra-fare.ts).
  static const List<int> extraSteps = [10, 20, 30];

  /// The most a rider can add in all on a quote of [quoteTotal]: half of it (to ₹10), at least ₹100.
  static int maxExtra(int quoteTotal) => math.max(100, (quoteTotal / 20).round() * 10);

  static const double _eps = 1e-9;

  /// Measured road distances for the demo routes, so seed screens match the designs.
  /// Any other pair falls back to haversine × [roadFactor].
  static const Map<String, double> _knownRoutesKm = {
    'gandhipuram|brookefields': 4.2,
    'gandhipuram|brookefields-plaza': 4.4,
    'gandhipuram|brookebond-road': 4.0,
    'peelamedu|race-course': 6.8,
    'saibaba-colony|airport': 12.4,
    'rs-puram|junction': 3.6,
    'town-hall|ukkadam': 1.4,
    'psg-tech|tidel-park': 3.4,
  };

  static const Distance _distance = Distance();

  /// Straight-line distance × road factor, rounded to 0.1 km.
  static RouteEstimate estimate(Place from, Place to) {
    final known = _knownRoutesKm['${from.id}|${to.id}'] ?? _knownRoutesKm['${to.id}|${from.id}'];
    final km = known ?? roadDistanceKm(from.location, to.location);
    return RouteEstimate(distanceKm: km, durationMin: durationFor(km));
  }

  /// Haversine × 1.3, rounded to one decimal.
  static double roadDistanceKm(LatLng a, LatLng b) {
    final metres = _distance.as(LengthUnit.Meter, a, b);
    final km = metres / 1000 * roadFactor;
    return math.max(0.5, (km * 10).roundToDouble() / 10);
  }

  /// distance ÷ 18 km/h, in whole minutes (at least 1).
  static int durationFor(double km) => math.max(1, (km / averageSpeedKmh * 60).round());

  static int _floor(double v) => (v + _eps).floor();

  /// Builds the itemised quote for one vehicle.
  static FareQuote quote(VehicleType vehicle, RouteEstimate route, {double multiplier = currentMultiplier}) =>
      quoteRule(vehicle, vehicle.fareRule, route, multiplier: multiplier);

  /// [quote] with explicit [rule] rates (per-city fares; shared fixture tests). [night] is the night fare multiplier
  /// (1 = none), as the API's `nightMultiplier` gives it.
  static FareQuote quoteRule(VehicleType vehicle, FareRule rule, RouteEstimate route,
      {double multiplier = currentMultiplier,
      double cap = maxMultiplier,
      double night = 1,
      int freeWaitMin = freeWaitMin,
      int waitMaxCharge = waitMaxCharge}) {
    final m = multiplier.clamp(1.0, math.max(1.0, cap)).toDouble();
    final base = rule.base;
    final distanceCharge = _floor(rule.perKm * route.distanceKm);
    final timeCharge = _floor(rule.perMin * route.durationMin);
    final raw = base + distanceCharge + timeCharge;
    final surged = _floor(raw * m);
    final dayTopUp = math.max(0, rule.minFare - surged);
    final dayTotal = surged + dayTopUp;
    final n = math.max(1.0, night);
    final regular = math.max(raw, rule.minFare);
    final nightTotal = _floor(regular * n);
    final isNight = n > 1 && nightTotal >= dayTotal;
    final topUp = isNight ? regular - raw : dayTopUp;
    final subtotal = raw + topUp;
    final total = isNight ? nightTotal : dayTotal;
    return FareQuote(
      vehicle: vehicle,
      distanceKm: route.distanceKm,
      durationMin: route.durationMin,
      base: base,
      distanceCharge: distanceCharge,
      timeCharge: timeCharge,
      minFareTopUp: topUp,
      subtotal: subtotal,
      multiplier: isNight ? n : m,
      peakCharge: total - subtotal,
      night: isNight,
      total: total,
      pickupEtaMin: vehicle.etaMin,
      freeWaitMin: freeWaitMin,
      waitPerMin: rule.waitPerMin,
      waitMaxCharge: waitMaxCharge,
    );
  }

  /// [q] with its waiting line set to [charge] (replacing any earlier one); the total moves by the difference.
  /// Waiting is never surged.
  static FareQuote withWaiting(FareQuote q, int charge) =>
      q.copyWith(waitingCharge: charge, total: q.total - q.waitingCharge + charge);

  /// Quotes for a list of vehicles along one route.
  static List<FareQuote> quoteAll(List<VehicleType> vehicles, RouteEstimate route,
          {double multiplier = currentMultiplier}) =>
      [for (final v in vehicles) quote(v, route, multiplier: multiplier)];
}
