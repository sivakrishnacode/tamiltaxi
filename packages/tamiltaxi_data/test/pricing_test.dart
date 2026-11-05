// A city's prices from the API (`GET /fares/rates`): parsed section by section, the built-in rates for what is missing
// or malformed, and every price function follows them.
import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';

/// The API's `pricing` JSON for the built-in rates (apps/api fares/pricing.ts DEFAULT_PRICING).
Map<String, Object> apiDefaults() => {
      'rental': {
        for (final MapEntry(:key, :value) in RideModeRates.rental.entries)
          enumToApi(key): {'prices': value.prices, 'extraKm': value.extraKm, 'extraMin': value.extraMin},
      },
      'outstation': {
        for (final MapEntry(:key, :value) in RideModeRates.outstation.entries)
          enumToApi(key): {
            'oneWayPerKm': value.oneWayPerKm,
            'roundTripPerKm': value.roundTripPerKm,
            'allowancePerDay': value.allowancePerDay,
            'oneWayMinKm': value.oneWayMinKm,
            'waitPerHour': value.waitPerHour,
          },
      },
      'goodsOutstation': {
        for (final MapEntry(:key, :value) in GoodsModeRates.outstation.entries) enumToApi(key): {'perKm': value.perKm, 'minKm': value.minKm},
      },
      'shifting': {
        'sizes': {
          for (final MapEntry(:key, :value) in GoodsModeRates.sizes.entries)
            key.api: {
              'vehicle': enumToApi(value.vehicle),
              'helpers': value.helpers,
              'packing': {'BASIC': value.basic, 'FULL': value.full},
              'unpack': value.unpack,
            },
        },
        'helperCity': 450,
        'helperBetween': 700,
        'stairsPerFloor': 150,
        'dismantlePerPiece': 199,
        'weekendPct': 10,
      },
    };

void main() {
  test("the built-in prices read back as they are; nothing, or a broken section, keeps the built-in one", () {
    final p = ModePricing.fromJson(apiDefaults());
    expect(p.rental[VehicleKind.sedan]!.prices, RideModeRates.rental[VehicleKind.sedan]!.prices);
    expect(p.outstation[VehicleKind.suv], RideModeRates.outstation[VehicleKind.suv]);
    expect(p.goodsOutstation[VehicleKind.truck], GoodsModeRates.outstation[VehicleKind.truck]);
    expect(p.shifting.size(HomeSize.twoBhk), GoodsModeRates.sizes[HomeSize.twoBhk]);
    expect(identical(ModePricing.fromJson(null), ModePricing.defaults), isTrue);
    final broken = ModePricing.fromJson({...apiDefaults(), 'rental': {'CAB': {'prices': [1, 2]}}, 'shifting': 'x'});
    expect(identical(broken.rental, ModePricing.defaults.rental), isTrue);
    expect(identical(broken.shifting, ModePricing.defaults.shifting), isTrue);
  });

  test("a city's own prices change every price the apps work out", () {
    final json = apiDefaults();
    ((json['rental']! as Map)['CAB'] as Map)['prices'] = [299, 499, 699, 899, 1299, 1699, 2099, 2499];
    ((json['outstation']! as Map)['SEDAN'] as Map)['oneWayMinKm'] = 80;
    ((json['goodsOutstation']! as Map)['PICKUP'] as Map)['perKm'] = 33;
    (json['shifting']! as Map)['helperCity'] = 500;
    final p = ModePricing.fromJson(json);
    expect(RideModeRates.rentalTerms(VehicleKind.cab, '1h', pricing: p)!.price, 299);
    final leave = DateTime.utc(2026, 10, 6, 1);
    expect(RideModeRates.outstationTerms(VehicleKind.sedan, routeKm: 50, driveMin: 70, roundTrip: false, leaveAt: leave, pricing: p).includedKm, 80);
    expect(GoodsModeRates.outstationTerms(VehicleKind.pickup, 100, pricing: p).perKm, 33);
    const d = ShiftingDetails(homeSize: HomeSize.oneBhk);
    expect(GoodsModeRates.lines(d, 1000, DateTime.utc(2026, 10, 1, 3, 30), pricing: p).helpers, 1000);
    expect(GoodsModeRates.lines(d, 1000, DateTime.utc(2026, 10, 1, 3, 30)).helpers, 900);
  });
}
