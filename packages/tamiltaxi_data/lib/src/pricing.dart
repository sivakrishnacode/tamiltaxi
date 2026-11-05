import 'package:flutter/foundation.dart';

import 'goods_modes.dart';
import 'models/vehicle.dart';
import 'ride_modes.dart';

typedef RentalTierRates = ({List<int> prices, double extraKm, double extraMin});
typedef OutstationTierRates = ({double oneWayPerKm, double roundTripPerKm, int allowancePerDay, int oneWayMinKm, int waitPerHour});
typedef GoodsTruckRates = ({double perKm, int minKm});
typedef ShiftingSizeRates = ({VehicleKind vehicle, int helpers, int basic, int full, int unpack});

/// What a house shift's price depends on (the API's `ShiftingRates`).
@immutable
class ShiftingRates {
  const ShiftingRates({
    required this.sizes,
    required this.helperCity,
    required this.helperBetween,
    required this.stairsPerFloor,
    required this.dismantlePerPiece,
    required this.weekendPct,
  });

  final Map<HomeSize, ShiftingSizeRates> sizes;
  final int helperCity;
  final int helperBetween;
  final int stairsPerFloor;
  final int dismantlePerPiece;
  final int weekendPct;

  ShiftingSizeRates size(HomeSize s) => sizes[s] ?? GoodsModeRates.sizes[s]!;
  int helperRate({required bool between}) => between ? helperBetween : helperCity;
}

/// A city's prices for the services priced up front (the API's `ModePricing`, `GET /fares/rates`): rentals,
/// outstation, goods to another town and house shifting. [defaults] are the built-in rates; a city may set its own in
/// admin. Quotes always come from the server; the apps use these for the prices they show before quoting.
@immutable
class ModePricing {
  const ModePricing({required this.rental, required this.outstation, required this.goodsOutstation, required this.shifting});

  final Map<VehicleKind, RentalTierRates> rental;
  final Map<VehicleKind, OutstationTierRates> outstation;
  final Map<VehicleKind, GoodsTruckRates> goodsOutstation;
  final ShiftingRates shifting;

  static const defaults = ModePricing(
    rental: RideModeRates.rental,
    outstation: RideModeRates.outstation,
    goodsOutstation: GoodsModeRates.outstation,
    shifting: ShiftingRates(
      sizes: GoodsModeRates.sizes,
      helperCity: GoodsModeRates.helperCity,
      helperBetween: GoodsModeRates.helperBetween,
      stairsPerFloor: GoodsModeRates.stairsPerFloor,
      dismantlePerPiece: GoodsModeRates.dismantlePerPiece,
      weekendPct: GoodsModeRates.weekendPct,
    ),
  );

  static const _kinds = {
    'CAB': VehicleKind.cab,
    'SEDAN': VehicleKind.sedan,
    'SUV': VehicleKind.suv,
    'THREE_WHEELER': VehicleKind.threeWheeler,
    'MINI_TRUCK': VehicleKind.miniTruck,
    'PICKUP': VehicleKind.pickup,
    'TRUCK': VehicleKind.truck,
  };

  /// The API's `pricing` JSON; a section that is missing or malformed keeps the built-in one.
  static ModePricing fromJson(Object? raw) {
    if (raw is! Map) return defaults;
    double d(Object? v) => (v as num).toDouble();
    int i(Object? v) => (v as num).round();
    Map<VehicleKind, T> byKind<T>(Object? section, Map<VehicleKind, T> fallback, T Function(Map<dynamic, dynamic>) read) {
      if (section is! Map) return fallback;
      try {
        final out = <VehicleKind, T>{};
        for (final MapEntry(:key, :value) in section.entries) {
          final kind = _kinds[key];
          if (kind != null && value is Map) out[kind] = read(value);
        }
        return out.length == fallback.length ? out : fallback;
      } on Object {
        return fallback;
      }
    }

    ShiftingRates shifting() {
      final s = raw['shifting'];
      if (s is! Map || s['sizes'] is! Map) return defaults.shifting;
      try {
        final sizes = <HomeSize, ShiftingSizeRates>{};
        for (final size in HomeSize.values) {
          final r = (s['sizes'] as Map)[size.api] as Map;
          final packing = r['packing'] as Map;
          sizes[size] = (
            vehicle: _kinds[r['vehicle']] ?? GoodsModeRates.sizes[size]!.vehicle,
            helpers: i(r['helpers']),
            basic: i(packing['BASIC']),
            full: i(packing['FULL']),
            unpack: i(r['unpack']),
          );
        }
        return ShiftingRates(
          sizes: sizes,
          helperCity: i(s['helperCity']),
          helperBetween: i(s['helperBetween']),
          stairsPerFloor: i(s['stairsPerFloor']),
          dismantlePerPiece: i(s['dismantlePerPiece']),
          weekendPct: i(s['weekendPct']),
        );
      } on Object {
        return defaults.shifting;
      }
    }

    return ModePricing(
      rental: byKind(raw['rental'], defaults.rental, (r) {
        final prices = [for (final p in r['prices'] as List) i(p)];
        if (prices.length != RideModeRates.packages.length) throw const FormatException('packages');
        return (prices: prices, extraKm: d(r['extraKm']), extraMin: d(r['extraMin']));
      }),
      outstation: byKind(
        raw['outstation'],
        defaults.outstation,
        (r) => (
          oneWayPerKm: d(r['oneWayPerKm']),
          roundTripPerKm: d(r['roundTripPerKm']),
          allowancePerDay: i(r['allowancePerDay']),
          oneWayMinKm: i(r['oneWayMinKm']),
          waitPerHour: i(r['waitPerHour']),
        ),
      ),
      goodsOutstation: byKind(raw['goodsOutstation'], defaults.goodsOutstation, (r) => (perKm: d(r['perKm']), minKm: i(r['minKm']))),
      shifting: shifting(),
    );
  }
}
