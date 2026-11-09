import 'package:flutter/foundation.dart';

import 'api/api_mappers.dart';
import 'fare_engine.dart';
import 'models/vehicle.dart';
import 'pricing.dart';
import 'seed.dart';

/// The driver app's Rate card for a city (`GET /fares/rate-card`): every vehicle's in-town rates (the city's, else
/// built-in), the waiting charge, the peak cap, the cancellation fee (null while it is off) and the up-front prices
/// (rentals, outstation, goods to another town).
@immutable
class RateCard {
  const RateCard({
    required this.rules,
    this.freeWaitMin = FareEngine.freeWaitMin,
    this.waitMaxCharge = FareEngine.waitMaxCharge,
    this.maxMultiplier = FareEngine.maxMultiplier,
    this.cancellationFee,
    this.autoNight,
    this.pricing = ModePricing.defaults,
  });

  final Map<VehicleKind, FareRule> rules;
  final int freeWaitMin;
  final int waitMaxCharge;
  final double maxMultiplier;
  final int? cancellationFee;

  /// The autos' government night fare (null while off, and from older servers).
  final AutoNightFare? autoNight;
  final ModePricing pricing;

  /// [kind]'s rates (built-in when the card has none for it).
  FareRule ruleFor(VehicleKind kind) => rules[kind] ?? Seed.vehicle(kind).fareRule;

  /// Mock mode, and before the card loads: the built-in rates.
  static final demo = RateCard(rules: {for (final v in Seed.allVehicles) v.kind: v.fareRule});

  factory RateCard.fromJson(Map<String, dynamic> j) {
    num n(Object? v, num fallback) => v is num ? v : fallback;
    final raw = j['rules'] is Map ? j['rules'] as Map : const {};
    final rules = <VehicleKind, FareRule>{};
    for (final kind in VehicleKind.values) {
      final r = raw[enumToApi(kind)];
      if (r is! Map) continue;
      final b = Seed.vehicle(kind).fareRule;
      rules[kind] = FareRule(
        base: n(r['base'], b.base).round(),
        perKm: n(r['perKm'], b.perKm).toDouble(),
        perMin: n(r['perMin'], b.perMin).toDouble(),
        minFare: n(r['minFare'], b.minFare).round(),
        waitPerMin: n(r['waitPerMin'], b.waitPerMin).round(),
      );
    }
    return RateCard(
      rules: rules,
      freeWaitMin: n(j['freeWaitMin'], FareEngine.freeWaitMin).round(),
      waitMaxCharge: n(j['waitMaxCharge'], FareEngine.waitMaxCharge).round(),
      maxMultiplier: n(j['maxMultiplier'], FareEngine.maxMultiplier).toDouble(),
      cancellationFee: j['cancellationFee'] is num ? (j['cancellationFee'] as num).round() : null,
      autoNight: AutoNightFare.fromJson(j['autoNight']),
      pricing: j['pricing'] is Map ? ModePricing.fromJson(j['pricing']) : ModePricing.defaults,
    );
  }
}

/// Autos' night fare (Tamil Nadu government fare): bookings from [startHour] to [endHour] IST pay the whole fare ×
/// [multiplier] (API `autoNightMultiplier`, `autoNightStartHour`, `autoNightEndHour`).
@immutable
class AutoNightFare {
  const AutoNightFare({required this.multiplier, required this.startHour, required this.endHour});

  final double multiplier;
  final int startHour;
  final int endHour;

  /// The vehicles that pay it (the API's `NIGHT_FARE_KINDS`).
  static const kinds = {VehicleKind.auto, VehicleKind.autoPriority, VehicleKind.autoParcel};

  /// The multiplier for [kind] at [at] (1 = none): from [startHour] (inclusive) to [endHour] (exclusive) in IST,
  /// wrapping past midnight when start > end; start == end is never (the API's `isNightIst`).
  double multiplierFor(VehicleKind kind, DateTime at) {
    if (!kinds.contains(kind) || startHour == endHour) return 1;
    final h = at.toUtc().add(const Duration(hours: 5, minutes: 30)).hour;
    final night = startHour < endHour ? h >= startHour && h < endHour : h >= startHour || h < endHour;
    return night ? multiplier : 1;
  }

  /// Null when [j] isn't a night fare that applies (missing, or a multiplier of 1 or less).
  static AutoNightFare? fromJson(Object? j) {
    if (j is! Map || j['multiplier'] is! num || (j['multiplier'] as num) <= 1) return null;
    int hour(Object? v, int fallback) => v is num ? v.round() % 24 : fallback;
    return AutoNightFare(
      multiplier: (j['multiplier'] as num).toDouble(),
      startHour: hour(j['startHour'], 22),
      endHour: hour(j['endHour'], 5),
    );
  }
}
