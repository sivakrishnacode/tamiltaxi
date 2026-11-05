import 'package:flutter/foundation.dart';

import 'fare_engine.dart';
import 'models/place.dart';
import 'models/vehicle.dart';
import 'pricing.dart';
import 'seed.dart';

/// How a ride is priced: [local] by distance and time, [rental] a cab by the hour (package), [outstation] a cab to
/// another town (one way or round trip). Same as the API's `RideMode`.
enum RideMode { local, rental, outstation }

/// A rental package: "4 hrs · 40 km".
@immutable
class RentalPackage {
  const RentalPackage({required this.id, required this.hours, required this.km});

  final String id;
  final int hours;
  final int km;

  String get hoursLabel => hours == 1 ? '1 hr' : '$hours hrs';
  String get label => '$hoursLabel · $km km';
}

/// What a rental or outstation trip agreed to (`Trip.modeTerms`; quotes carry it as `modeTerms`).
@immutable
sealed class ModeTerms {
  const ModeTerms();

  RideMode get mode;

  /// The API's shape (what [fromJson] reads), e.g. to hand a request to the driver's overlay isolate.
  Map<String, Object> toJson();

  static ModeTerms? fromJson(Object? raw) {
    if (raw is! Map) return null;
    final j = raw.cast<String, dynamic>();
    num n(String k, [num or = 0]) => j[k] is num ? j[k] as num : or;
    return switch (j['mode']) {
      'RENTAL' => RentalTerms(
          packageId: '${j['packageId'] ?? ''}',
          hours: n('hours').toInt(),
          km: n('km').toInt(),
          price: n('price').toInt(),
          extraKmRate: n('extraKmRate').toDouble(),
          extraMinRate: n('extraMinRate').toDouble(),
        ),
      'OUTSTATION' => OutstationTerms(
          roundTrip: j['roundTrip'] == true,
          returnAt: DateTime.tryParse('${j['returnAt']}')?.toLocal(),
          days: n('days', 1).toInt(),
          includedKm: n('includedKm').toInt(),
          perKm: n('perKm').toDouble(),
          allowancePerDay: n('allowancePerDay').toInt(),
          routeKm: n('routeKm').toDouble(),
          driveMin: n('driveMin').toInt(),
          awayMin: n('awayMin').toInt(),
          waitMin: n('waitMin').toInt(),
          waitPerHour: n('waitPerHour').toInt(),
        ),
      _ => null,
    };
  }
}

@immutable
final class RentalTerms extends ModeTerms {
  const RentalTerms({
    required this.packageId,
    required this.hours,
    required this.km,
    required this.price,
    required this.extraKmRate,
    required this.extraMinRate,
  });

  final String packageId;
  final int hours;
  final int km;
  final int price;
  final double extraKmRate;
  final double extraMinRate;

  @override
  RideMode get mode => RideMode.rental;

  RentalPackage get package => RentalPackage(id: packageId, hours: hours, km: km);

  @override
  Map<String, Object> toJson() => {
        'mode': 'RENTAL',
        'packageId': packageId,
        'hours': hours,
        'km': km,
        'price': price,
        'extraKmRate': extraKmRate,
        'extraMinRate': extraMinRate,
      };
}

@immutable
final class OutstationTerms extends ModeTerms {
  const OutstationTerms({
    required this.roundTrip,
    required this.returnAt,
    required this.days,
    required this.includedKm,
    required this.perKm,
    required this.allowancePerDay,
    required this.routeKm,
    this.driveMin = 0,
    this.awayMin = 0,
    this.waitMin = 0,
    this.waitPerHour = 0,
  });

  final bool roundTrip;

  /// Round trip: when the rider comes back; straight back = leaving + the drive both ways.
  final DateTime? returnAt;

  /// Days of driver allowance: 1 one way; a round trip's 24-hour blocks away (26 h = 2).
  final int days;

  /// One way: the km charged (the route, at least the minimum); round trip: both ways' km, included in the price.
  final int includedKm;
  final double perKm;
  final int allowancePerDay;
  final double routeKm;

  /// Round trip (0 one way and on trips booked before 5 Nov 2026): the drive one way, minutes.
  final int driveMin;

  /// Round trip: minutes from leaving to coming back, at least the drive both ways.
  final int awayMin;

  /// Round trip: minutes waiting there that the price includes (away − the drive both ways).
  final int waitMin;

  /// Round trip: ₹ an hour of waiting, and of a late return past [RideModeRates.lateGraceMin].
  final int waitPerHour;

  /// The waiting there in the fare, whole rupees rounded down (0 one way and on older trips).
  int get waitCharge => waitMin * waitPerHour ~/ 60;

  @override
  RideMode get mode => RideMode.outstation;

  @override
  Map<String, Object> toJson() => {
        'mode': 'OUTSTATION',
        'roundTrip': roundTrip,
        if (returnAt != null) 'returnAt': returnAt!.toUtc().toIso8601String(),
        'days': days,
        'includedKm': includedKm,
        'perKm': perKm,
        'allowancePerDay': allowancePerDay,
        'routeKm': routeKm,
        if (roundTrip) ...{'driveMin': driveMin, 'awayMin': awayMin, 'waitMin': waitMin, 'waitPerHour': waitPerHour},
      };
}

/// "Rental · 4 hrs · 40 km", "Outstation · round trip", "Outstation · one way"; null for a local ride.
String? rideModeLabel(RideMode mode, ModeTerms? terms) => switch (terms) {
      RentalTerms t => 'Rental · ${t.package.label}',
      OutstationTerms t => t.roundTrip ? 'Outstation · round trip' : 'Outstation · one way',
      null => switch (mode) {
          RideMode.local => null,
          RideMode.rental => 'Rental',
          RideMode.outstation => 'Outstation',
        },
    };

/// What the rider chose for a rental / outstation quote or booking.
@immutable
class ModeRequest {
  const ModeRequest({required this.mode, this.packageId, this.roundTrip = false, this.leaveAt, this.returnAt});

  final RideMode mode;

  /// Rental: "1h" … "12h".
  final String? packageId;

  /// Outstation: back to the pickup at [returnAt] (true) or one way.
  final bool roundTrip;

  /// Pickup time for a trip booked for later; null = now.
  final DateTime? leaveAt;
  final DateTime? returnAt;

  bool get isLater => leaveAt != null;

  ModeRequest copyWith({RideMode? mode, String? packageId, bool? roundTrip, DateTime? leaveAt, DateTime? returnAt, bool clearLeave = false, bool clearReturn = false}) =>
      ModeRequest(
        mode: mode ?? this.mode,
        packageId: packageId ?? this.packageId,
        roundTrip: roundTrip ?? this.roundTrip,
        leaveAt: clearLeave ? null : (leaveAt ?? this.leaveAt),
        returnAt: clearReturn ? null : (returnAt ?? this.returnAt),
      );

  /// The fields `POST /fares/quote` and `POST /trips` take.
  Map<String, Object> toJson() => {
        'rideMode': mode == RideMode.rental ? 'RENTAL' : mode == RideMode.outstation ? 'OUTSTATION' : 'LOCAL',
        if (mode == RideMode.rental && packageId != null) 'rentalPackageId': packageId!,
        if (mode == RideMode.outstation) 'roundTrip': roundTrip,
        if (leaveAt != null) 'scheduledAt': leaveAt!.toUtc().toIso8601String(),
        if (mode == RideMode.outstation && roundTrip && returnAt != null) 'returnAt': returnAt!.toUtc().toIso8601String(),
      };
}

/// What a finished rental / round trip added past what it included.
typedef ModeSettlement = ({double extraKm, int extraMin, int extraKmCharge, int extraTimeCharge});

/// Rental and outstation rates for the cab tiers, the same as the API's `fares/ride-modes.ts` (shared cases in
/// test/fixtures/ride_mode_cases.json). Used by mock mode; the live app shows the API's quotes.
abstract final class RideModeRates {
  /// The tiers that do rentals and outstation trips: Mini, Sedan, SUV.
  static const cabTiers = [VehicleKind.cab, VehicleKind.sedan, VehicleKind.suv];

  static const packages = [
    RentalPackage(id: '1h', hours: 1, km: 10),
    RentalPackage(id: '2h', hours: 2, km: 20),
    RentalPackage(id: '3h', hours: 3, km: 30),
    RentalPackage(id: '4h', hours: 4, km: 40),
    RentalPackage(id: '6h', hours: 6, km: 60),
    RentalPackage(id: '8h', hours: 8, km: 80),
    RentalPackage(id: '10h', hours: 10, km: 100),
    RentalPackage(id: '12h', hours: 12, km: 120),
  ];

  static const Map<VehicleKind, ({List<int> prices, double extraKm, double extraMin})> rental = {
    VehicleKind.cab: (prices: [249, 449, 649, 849, 1249, 1599, 1999, 2349], extraKm: 12, extraMin: 2),
    VehicleKind.sedan: (prices: [289, 519, 749, 979, 1429, 1849, 2299, 2699], extraKm: 14, extraMin: 2.5),
    VehicleKind.suv: (prices: [379, 679, 979, 1279, 1879, 2399, 2999, 3499], extraKm: 18, extraMin: 3),
  };

  /// One way: the route km (at least the minimum) and a day's allowance. Round trip, priced by time (5 Nov 2026):
  /// both ways' km, the waiting there by the hour and the allowance per 24 hours away.
  static const Map<VehicleKind, OutstationTierRates> outstation = {
    VehicleKind.cab: (oneWayPerKm: 14, roundTripPerKm: 11, allowancePerDay: 300, oneWayMinKm: 60, waitPerHour: 90),
    VehicleKind.sedan: (oneWayPerKm: 15, roundTripPerKm: 12, allowancePerDay: 300, oneWayMinKm: 60, waitPerHour: 100),
    VehicleKind.suv: (oneWayPerKm: 19, roundTripPerKm: 16, allowancePerDay: 400, oneWayMinKm: 60, waitPerHour: 130),
  };

  /// Up to a week away: how far ahead a trip can be booked, and the longest round trip.
  static const maxDaysAhead = 7;

  /// A round trip back this much later than booked pays nothing more (ETA error, a slow ghat road).
  static const lateGraceMin = 30;

  /// Minutes before the pickup time that a trip booked for later starts looking for a driver (the API's default).
  static const dispatchLeadMin = 30;

  static RentalPackage? package(String id) => packages.where((p) => p.id == id).firstOrNull;

  /// [pricing]: the pickup city's prices (built-in by default).
  static RentalTerms? rentalTerms(VehicleKind kind, String packageId, {ModePricing pricing = ModePricing.defaults}) {
    final i = packages.indexWhere((p) => p.id == packageId);
    final r = pricing.rental[kind];
    if (i < 0 || r == null) return null;
    final p = packages[i];
    return RentalTerms(packageId: p.id, hours: p.hours, km: p.km, price: r.prices[i], extraKmRate: r.extraKm, extraMinRate: r.extraMin);
  }

  /// [returnAt] null, or before the drive both ways ([driveMin] each), means straight back: leaving + the drive
  /// both ways (P-35's default, Red Taxi style).
  static OutstationTerms outstationTerms(
    VehicleKind kind, {
    required double routeKm,
    required int driveMin,
    required bool roundTrip,
    required DateTime leaveAt,
    DateTime? returnAt,
    ModePricing pricing = ModePricing.defaults,
  }) {
    final r = pricing.outstation[kind] ?? outstation[kind]!;
    final km = (routeKm * 10).round() / 10;
    if (!roundTrip) {
      final charged = km.ceil() < r.oneWayMinKm ? r.oneWayMinKm : km.ceil();
      return OutstationTerms(
          roundTrip: false, returnAt: null, days: 1, includedKm: charged, perKm: r.oneWayPerKm, allowancePerDay: r.allowancePerDay, routeKm: km);
    }
    final drive = driveMin < 1 ? 1 : driveMin;
    final asked = returnAt == null ? 0 : (returnAt.difference(leaveAt).inSeconds / 60).round();
    final straightBack = asked < 2 * drive;
    final away = straightBack ? 2 * drive : asked;
    return OutstationTerms(
      roundTrip: true,
      returnAt: straightBack ? leaveAt.add(Duration(minutes: away)) : returnAt,
      days: (away / 1440).ceil().clamp(1, 1 << 30),
      includedKm: (2 * km).ceil(),
      perKm: r.roundTripPerKm,
      allowancePerDay: r.allowancePerDay,
      routeKm: km,
      driveMin: drive,
      awayMin: away,
      waitMin: away - 2 * drive,
      waitPerHour: r.waitPerHour,
    );
  }

  /// The quote for [terms]: `base` is the package price (rental) or the km charge (outstation), `timeCharge` the
  /// driver allowance plus a round trip's waiting there. No surge.
  static FareQuote quote(VehicleType vehicle, ModeTerms terms, {required double distanceKm, required int durationMin, int? travelMin}) {
    final base = switch (terms) {
      RentalTerms t => t.price,
      OutstationTerms t => (t.includedKm * t.perKm).floor(),
    };
    final allowance = terms is OutstationTerms ? terms.allowancePerDay * terms.days + terms.waitCharge : 0;
    return FareQuote(
      vehicle: vehicle,
      distanceKm: distanceKm,
      durationMin: durationMin,
      travelMin: travelMin,
      base: base,
      distanceCharge: 0,
      timeCharge: allowance,
      subtotal: base + allowance,
      multiplier: 1,
      peakCharge: 0,
      total: base + allowance,
      freeWaitMin: 0,
      waitPerMin: 0,
      waitMaxCharge: 0,
      modeTerms: terms,
    );
  }

  /// Quotes for the cab tiers for [request] from [pickup] (to [drop] for outstation), on the local route estimate
  /// (mock mode; the live app shows the API's quotes).
  static List<FareQuote> quotesFor(Place pickup, Place? drop, ModeRequest request, {ModePricing pricing = ModePricing.defaults}) {
    final cabs = [for (final k in cabTiers) Seed.vehicle(k)];
    if (request.mode == RideMode.rental) {
      final pkg = package(request.packageId ?? '') ?? packages[3];
      return [
        for (final v in cabs)
          quote(v, rentalTerms(v.kind, pkg.id, pricing: pricing)!, distanceKm: pkg.km.toDouble(), durationMin: pkg.hours * 60),
      ];
    }
    final route = FareEngine.estimate(pickup, drop ?? pickup);
    final leave = request.leaveAt ?? DateTime.now();
    return [
      for (final v in cabs)
        () {
          final t = outstationTerms(v.kind,
              routeKm: route.distanceKm,
              driveMin: route.durationMin,
              roundTrip: request.roundTrip,
              leaveAt: leave,
              returnAt: request.returnAt,
              pricing: pricing);
          return quote(v, t,
              distanceKm: request.roundTrip ? t.includedKm.toDouble() : route.distanceKm, durationMin: request.roundTrip ? t.awayMin : route.durationMin);
        }(),
    ];
  }

  /// What a finished trip adds past its terms (null km: the GPS distance failed, nothing added for km). One-way
  /// outstation trips are fixed; a round trip back later than booked pays the time past [lateGraceMin] at its
  /// waiting rate. Each line rounded down.
  static ModeSettlement settle(ModeTerms terms, double? actualKm, double actualMin) {
    if (terms is OutstationTerms && !terms.roundTrip) return (extraKm: 0, extraMin: 0, extraKmCharge: 0, extraTimeCharge: 0);
    final allowedKm = switch (terms) {
      RentalTerms t => t.km,
      OutstationTerms t => t.includedKm,
    };
    final over = actualKm == null ? 0.0 : actualKm - allowedKm;
    final extraKm = over <= 0 ? 0.0 : (over * 10).round() / 10;
    final kmRate = switch (terms) {
      RentalTerms t => t.extraKmRate,
      OutstationTerms t => t.perKm,
    };
    final extraKmCharge = (extraKm * kmRate + 1e-9).floor();
    if (terms is OutstationTerms) {
      // Older round trips (before 5 Nov 2026) had no planned time: nothing added for time.
      final late = terms.awayMin == 0 ? 0 : (actualMin - terms.awayMin - lateGraceMin).ceil().clamp(0, 1 << 30);
      return (extraKm: extraKm, extraMin: late, extraKmCharge: extraKmCharge, extraTimeCharge: late * terms.waitPerHour ~/ 60);
    }
    final rental = terms as RentalTerms;
    final extraMin = (actualMin - rental.hours * 60).ceil().clamp(0, 1 << 30);
    return (
      extraKm: extraKm,
      extraMin: extraMin,
      extraKmCharge: extraKmCharge,
      extraTimeCharge: (extraMin * rental.extraMinRate + 1e-9).floor(),
    );
  }
}
