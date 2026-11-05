// Rental and outstation rates: the shared cases (test/fixtures/ride_mode_cases.json) must come out exactly as in the
// API (apps/api/src/modules/fares/ride-modes.spec.ts reads the same file).
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';

void main() {
  final cases = jsonDecode(File('test/fixtures/ride_mode_cases.json').readAsStringSync()) as Map<String, dynamic>;
  VehicleKind kind(Object? k) => vehicleKindFromApi(k);
  Map<String, Object> settled(ModeSettlement s) =>
      {'extraKm': s.extraKm, 'extraMin': s.extraMin, 'extraKmCharge': s.extraKmCharge, 'extraTimeCharge': s.extraTimeCharge};
  bool same(Object? a, Object? b) => a is num && b is num ? (a - b).abs() < 1e-9 : a == b;

  for (final c in (cases['rental'] as List).cast<Map<String, dynamic>>()) {
    test(c['name'] as String, () {
      final i = (c['input'] as Map).cast<String, dynamic>();
      final e = (c['expected'] as Map).cast<String, dynamic>();
      final t = RideModeRates.rentalTerms(kind(i['kind']), i['packageId'] as String)!;
      final q = RideModeRates.quote(Seed.vehicle(kind(i['kind'])), t, distanceKm: t.km.toDouble(), durationMin: t.hours * 60);
      expect(t.price, e['price']);
      expect(same(t.extraKmRate, e['extraKmRate']), isTrue);
      expect(same(t.extraMinRate, e['extraMinRate']), isTrue);
      expect(q.total, e['total']);
      final s = settled(RideModeRates.settle(t, (i['actualKm'] as num?)?.toDouble(), (i['actualMin'] as num).toDouble()));
      for (final MapEntry(:key, :value) in (e['settlement'] as Map).cast<String, dynamic>().entries) {
        expect(same(s[key], value), isTrue, reason: '$key: ${s[key]} vs $value');
      }
    });
  }

  for (final c in (cases['outstation'] as List).cast<Map<String, dynamic>>()) {
    test(c['name'] as String, () {
      final i = (c['input'] as Map).cast<String, dynamic>();
      final e = (c['expected'] as Map).cast<String, dynamic>();
      final t = RideModeRates.outstationTerms(
        kind(i['kind']),
        routeKm: (i['routeKm'] as num).toDouble(),
        driveMin: i['driveMin'] as int,
        roundTrip: i['roundTrip'] as bool,
        leaveAt: DateTime.parse(i['leaveAt'] as String),
        returnAt: i['returnAt'] == null ? null : DateTime.parse(i['returnAt'] as String),
      );
      final q = RideModeRates.quote(Seed.vehicle(kind(i['kind'])), t, distanceKm: (i['routeKm'] as num).toDouble(), durationMin: 60);
      expect(t.days, e['days']);
      expect(t.includedKm, e['includedKm']);
      expect(same(t.perKm, e['perKm']), isTrue);
      expect(t.allowancePerDay, e['allowancePerDay']);
      if (t.roundTrip) {
        expect(t.awayMin, e['awayMin']);
        expect(t.waitMin, e['waitMin']);
      }
      expect(q.total, e['total']);
      final s = settled(RideModeRates.settle(t, (i['actualKm'] as num).toDouble(), ((i['actualMin'] as num?) ?? 600).toDouble()));
      for (final MapEntry(:key, :value) in (e['settlement'] as Map).cast<String, dynamic>().entries) {
        expect(same(s[key], value), isTrue, reason: '$key: ${s[key]} vs $value');
      }
    });
  }

  test('rental terms parse from the API', () {
    final t = ModeTerms.fromJson({'mode': 'RENTAL', 'packageId': '4h', 'hours': 4, 'km': 40, 'price': 979, 'extraKmRate': 14, 'extraMinRate': 2.5});
    expect(t, isA<RentalTerms>());
    expect((t! as RentalTerms).package.label, '4 hrs · 40 km');
    expect(ModeTerms.fromJson(null), isNull);
  });

  test('round trip terms: straight back by default, the waiting there in the time charge, read back from the API', () {
    final leave = DateTime.utc(2026, 10, 6, 0, 30);
    final quick = RideModeRates.outstationTerms(VehicleKind.cab, routeKm: 40.1, driveMin: 55, roundTrip: true, leaveAt: leave);
    expect(quick.returnAt, DateTime.utc(2026, 10, 6, 2, 20));
    expect((quick.awayMin, quick.waitMin, quick.days, quick.includedKm), (110, 0, 1, 81));
    final evening = RideModeRates.outstationTerms(VehicleKind.cab,
        routeKm: 40.1, driveMin: 55, roundTrip: true, leaveAt: leave, returnAt: leave.add(const Duration(hours: 14)));
    expect((evening.waitMin, evening.waitCharge), (730, 1095));
    final q = RideModeRates.quote(Seed.vehicle(VehicleKind.cab), evening, distanceKm: 81, durationMin: 840);
    expect((q.base, q.timeCharge, q.total), (891, 1395, 2286));
    final back = ModeTerms.fromJson(evening.toJson())! as OutstationTerms;
    expect((back.driveMin, back.awayMin, back.waitMin, back.waitPerHour, back.waitCharge), (55, 840, 730, 90, 1095));
    // A trip booked before 5 Nov 2026 has none of them: no waiting, no late charge.
    final old = ModeTerms.fromJson({'mode': 'OUTSTATION', 'roundTrip': true, 'days': 2, 'includedKm': 500, 'perKm': 11, 'allowancePerDay': 300})!
        as OutstationTerms;
    expect(old.waitCharge, 0);
    expect(RideModeRates.settle(old, 512.3, 5000).extraTimeCharge, 0);
  });

  test('mode requests send the API what it needs', () {
    expect(const ModeRequest(mode: RideMode.rental, packageId: '4h').toJson(), {'rideMode': 'RENTAL', 'rentalPackageId': '4h'});
    final leave = DateTime.utc(2026, 10, 6, 0, 30);
    final back = DateTime.utc(2026, 10, 7, 14, 30);
    expect(ModeRequest(mode: RideMode.outstation, roundTrip: true, leaveAt: leave, returnAt: back).toJson(), {
      'rideMode': 'OUTSTATION',
      'roundTrip': true,
      'scheduledAt': '2026-10-06T00:30:00.000Z',
      'returnAt': '2026-10-07T14:30:00.000Z',
    });
    // One way never sends a return time.
    expect(ModeRequest(mode: RideMode.outstation, returnAt: back).toJson(), {'rideMode': 'OUTSTATION', 'roundTrip': false});
  });
}
