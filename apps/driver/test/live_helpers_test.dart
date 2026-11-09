// Pure helpers of the live (API) driver session: status → job phase, GPS upload throttle, ETA along the
// stored route, start route after log-in, API job → request card, phone / plate / UPI rules.
import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_driver/state/driver_session.dart';
import 'package:tamiltaxi_driver/state/live_helpers.dart';

List<KycDocument> docs(Map<KycDocType, KycStatus> overrides) => [
      for (final t in driverUploadDocs) KycDocument(type: t, status: overrides[t] ?? KycStatus.verified),
    ];

LiveTripUpdate update({String status = 'DRIVER_ASSIGNED', Map<String, dynamic>? passenger, int fare = 64}) {
  final r = Seed.rideRequest;
  return LiveTripUpdate(
    Trip(
      id: 'trip-1',
      kind: TripKind.ride,
      vehicle: VehicleKind.bike,
      pickup: r.pickup,
      drop: r.drop,
      fare: fare,
      status: TripStatus.driverAssigned,
      startedAt: DateTime(2026, 9, 26, 10),
      distanceKm: 6.2,
      durationMin: 21,
      otp: '',
    ),
    status,
    {'id': 'trip-1', 'status': status, 'passenger': ?passenger},
  );
}

void main() {
  group('jobPhaseForStatus', () {
    test('maps every API status to the job screens', () {
      expect(jobPhaseForStatus('DRIVER_ASSIGNED'), JobPhase.toPickup);
      expect(jobPhaseForStatus('DRIVER_ARRIVED'), JobPhase.atPickup);
      expect(jobPhaseForStatus('IN_PROGRESS'), JobPhase.toDrop);
      expect(jobPhaseForStatus('PICKED_UP'), JobPhase.toDrop);
      expect(jobPhaseForStatus('COMPLETED'), JobPhase.collect);
      expect(jobPhaseForStatus('DELIVERED'), JobPhase.collect);
      expect(jobPhaseForStatus('CANCELLED'), JobPhase.none);
      expect(jobPhaseForStatus('SEARCHING'), JobPhase.none);
      expect(jobPhaseForStatus('NO_DRIVERS'), JobPhase.none);
      expect(jobPhaseForStatus(''), JobPhase.none);
    });
  });

  group('shouldSendFix', () {
    const a = LatLng(11.0168, 76.9558);
    final t0 = DateTime(2026, 9, 26, 10);

    test('always sends the first fix', () {
      expect(shouldSendFix(last: null, lastAt: null, next: a, now: t0), isTrue);
    });

    test('sends every 5 s even when standing still', () {
      expect(shouldSendFix(last: a, lastAt: t0, next: a, now: t0.add(const Duration(seconds: 4))), isFalse);
      expect(shouldSendFix(last: a, lastAt: t0, next: a, now: t0.add(const Duration(seconds: 5))), isTrue);
    });

    test('sends early after 20 m, but not more often than every 2 s', () {
      final moved = offsetPoint(a, 30, 90);
      expect(shouldSendFix(last: a, lastAt: t0, next: moved, now: t0.add(const Duration(seconds: 1))), isFalse);
      expect(shouldSendFix(last: a, lastAt: t0, next: moved, now: t0.add(const Duration(seconds: 3))), isTrue);
      final near = offsetPoint(a, 10, 90);
      expect(shouldSendFix(last: a, lastAt: t0, next: near, now: t0.add(const Duration(seconds: 3))), isFalse);
    });
  });

  group('ETA along the stored route', () {
    const start = LatLng(11.0000, 76.9500);
    final route = [for (var i = 0; i <= 10; i++) LatLng(start.latitude + i * 0.001, start.longitude)];

    test('remainingFraction is 1 at the start, ~0.5 halfway and 0 at the end', () {
      expect(remainingFraction(route, route.first), closeTo(1, 0.001));
      expect(remainingFraction(route, route[5]), closeTo(0.5, 0.001));
      expect(remainingFraction(route, route.last), closeTo(0, 0.001));
    });

    test('etaAlong scales the leg minutes and rounds up', () {
      expect(etaAlong(route, route.first, 10), 10);
      expect(etaAlong(route, route[5], 10), 5);
      expect(etaAlong(route, route[9], 10), 1);
      expect(etaAlong(route, route.last, 10), 0);
      expect(etaAlong(route, route[5], 0), 0);
    });

    test('short routes and estimates', () {
      expect(remainingFraction(const [start], start), 0);
      expect(routeKm(route), closeTo(1.11, 0.02));
      expect(estimateMinutes(0.1), 1);
      expect(estimateMinutes(5), 15);
    });
  });

  group('rideRequestFromUpdate', () {
    test('takes the trip from the API and the passenger from the payload', () {
      final r = rideRequestFromUpdate(update(passenger: {'name': 'Priya Raman', 'phone': '+919876543210'}));
      expect(r.id, 'trip-1');
      expect(r.fare, 64);
      expect(r.tripKm, 6.2);
      expect(r.tripMin, 21);
      expect(r.customerName, 'Priya Raman');
      expect(r.customerPhone, '+919876543210');
      expect(r.otp, isEmpty, reason: 'the driver never sees the ride OTP');
    });

    test('keeps what only the offer had', () {
      final offer = Seed.rideRequest.copyWith(customerName: 'Priya', customerPhone: '+919000000000', pickupEtaMin: 4, pickupDistanceKm: 1.2);
      final r = rideRequestFromUpdate(update(fare: 0), offer: offer);
      expect(r.customerName, 'Priya');
      expect(r.customerPhone, '+919000000000');
      expect(r.pickupEtaMin, 4);
      expect(r.pickupDistanceKm, 1.2);
      expect(r.fare, offer.fare);
    });

    test('keeps a rental, booked-for-later or house-shifting job what it is', () {
      const terms = RentalTerms(packageId: '4h', hours: 4, km: 40, price: 899, extraKmRate: 14, extraMinRate: 2);
      final at = DateTime(2026, 10, 3, 6);
      final base = update();
      final rental = LiveTripUpdate(
        base.trip.copyWith(rideMode: RideMode.rental, modeTerms: terms, scheduledAt: at),
        'IN_PROGRESS',
        {...base.json, 'startedAt': '2026-10-03T00:45:00.000Z'},
      );
      final r = rideRequestFromUpdate(rental);
      expect(r.rideMode, RideMode.rental);
      expect(r.modeTerms, terms);
      expect(r.scheduledAt, at);
      expect(r.rideStartedAt, DateTime.utc(2026, 10, 3, 0, 45).toLocal());

      // An accept answer without the mode keeps the offer's.
      final offer = Seed.rideRequest.copyWith(rideMode: RideMode.outstation, scheduledAt: at);
      final o = rideRequestFromUpdate(update(), offer: offer);
      expect(o.rideMode, RideMode.outstation);
      expect(o.scheduledAt, at);
    });
  });

  group('formats', () {
    test('apiPhone', () {
      expect(apiPhone('98430 12345'), '+919843012345');
      expect(apiPhone('+91 98430 12345'), '+919843012345');
      expect(apiPhone('+919843012345'), '+919843012345');
    });

    test('plate and UPI rules match the API', () {
      expect(kPlatePattern.hasMatch('TN 37 AB 4521'), isTrue);
      expect(kPlatePattern.hasMatch('tn37ab4521'), isTrue);
      expect(kPlatePattern.hasMatch('TN 37 F 9914'), isTrue);
      expect(kPlatePattern.hasMatch('37 AB 4521'), isFalse);
      expect(kUpiPattern.hasMatch('karthik@okaxis'), isTrue);
      expect(kUpiPattern.hasMatch('k@okaxis'), isFalse);
      expect(kUpiPattern.hasMatch('karthik@ok1'), isFalse);
    });

    test('userMessage', () {
      expect(userMessage(const ApiException(403, 'Plan expired. Renew to go online again')),
          'Plan expired. Renew to go online again');
      expect(userMessage(const OfflineException()), contains('offline'));
      expect(userMessage(Exception('boom')), 'Something went wrong. Please try again.');
    });
  });
}
