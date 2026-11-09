import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_data/src/api/api_mappers.dart';

/// Shapes as the Tamil Taxi API returns them (see apps/api trips.service TRIP_INCLUDE, dispatch offerDetails).
const _trip = {
  'id': 'cmtrip1',
  'kind': 'RIDE',
  'status': 'DRIVER_ASSIGNED',
  'vehicleKind': 'BIKE',
  'pickupName': 'Gandhipuram',
  'pickupAddr': 'Cross Cut Rd',
  'pickupLat': 11.0183,
  'pickupLng': 76.9725,
  'dropName': 'Brookefields Mall',
  'dropAddr': 'RS Puram',
  'dropLat': 11.009,
  'dropLng': 76.96,
  'distanceKm': 2.4,
  'durationMin': 8,
  'fare': {
    'vehicleKind': 'BIKE', 'distanceKm': 2.4, 'durationMin': 8, 'base': 20, 'distanceCharge': 12, 'timeCharge': 2,
    'minFareTopUp': 0, 'subtotal': 34, 'multiplier': 1, 'peakCharge': 0, 'total': 34,
  },
  'fareTotal': 34,
  'otp': '4821',
  'paymentMode': 'CASH',
  'createdAt': '2026-09-26T05:30:00.000Z',
  'driver': {
    'id': 'cmdrv1', 'vehicleKind': 'BIKE', 'vehicleModel': 'Honda Activa', 'vehicleColor': 'Grey', 'plate': 'TN 37 AB 1234',
    'upiId': 'k@okaxis', 'rating': 4.9, 'ridesCount': 120,
    'user': {'id': 'u2', 'name': 'Karthik S', 'phone': '+919876500002', 'gender': 'MALE'},
  },
  'passenger': {'id': 'u1', 'name': 'Priya R', 'phone': '+919876500001'},
};

void main() {
  test('phones are sent in the API format', () {
    expect(apiPhone('98430 12345'), '+919843012345');
    expect(apiPhone('+91-98430-12345'), '+919843012345');
    expect(apiPhone('+919843012345'), '+919843012345');
  });

  test('enum names round-trip between API and app', () {
    expect(enumToApi(VehicleKind.goodsBike), 'GOODS_BIKE');
    expect(enumToApi(KycDocType.policeVerification), 'POLICE_VERIFICATION');
    expect(vehicleKindFromApi('MINI_TRUCK'), VehicleKind.miniTruck);
    expect(vehicleKindFromApi('???'), VehicleKind.bike);
  });

  test('trip with driver and itemised fare', () {
    final t = tripFromJson(_trip);
    expect(t.status, TripStatus.driverAssigned);
    expect(t.vehicle, VehicleKind.bike);
    expect(t.pickup.location.latitude, 11.0183);
    expect(t.fare, 34);
    expect(t.quote!.total, 34);
    expect(t.driver!.name, 'Karthik S');
    expect(t.driver!.rides, 120);
    expect(t.otp, '4821');
  });

  test('NO_DRIVERS folds into cancelled; parcel details and delivery OTP', () {
    expect(tripStatusFromApi('NO_DRIVERS'), TripStatus.cancelled);
    final parcel = tripFromJson({
      ..._trip,
      'kind': 'PARCEL',
      'vehicleKind': 'GOODS_BIKE',
      'status': 'PICKED_UP',
      'payer': 'RECEIVER',
      'parcel': {'category': 'food', 'weight': 'from5to20', 'senderName': 'A', 'senderPhone': '1', 'receiverName': 'B', 'receiverPhone': '2'},
    });
    expect(parcel.isParcel, isTrue);
    expect(parcel.status, TripStatus.pickedUp);
    expect(parcel.parcel!.category, ParcelCategory.food);
    expect(parcel.parcel!.weight, WeightBand.from5to20);
    expect(parcel.parcel!.payer, ParcelPayer.receiver);
    expect(parcel.parcel!.deliveryOtp, '4821');
  });

  test('driver offer becomes a request card without the OTP', () {
    final r = rideRequestFromOffer({
      'trip': {..._trip, 'status': 'SEARCHING', 'otp': ''},
      'passenger': {'name': 'Priya R', 'phone': '+919876500001'},
      'pickupKm': 0.8,
      'pickupEtaMin': 3,
      'expiresInSeconds': 15,
    });
    expect(r.customerName, 'Priya R');
    expect(r.pickupDistanceKm, 0.8);
    expect(r.pickupEtaMin, 3);
    expect(r.otp, isEmpty);
    expect(r.fare, 34);
    expect(r.isWomenOnly, isFalse);
    final butterfly = rideRequestFromOffer({'trip': {..._trip, 'womenDriver': 'ONLY'}, 'passenger': const {}});
    expect(butterfly.isWomenOnly, isTrue);
    expect(butterfly.copyWith(pickupEtaMin: 5).isWomenOnly, isTrue);
    expect(butterfly.womenDriver, WomenDriverPref.only);
    // Women driver preferred: Butterfly too (the pink band), but men may take it.
    final preferred = rideRequestFromOffer({'trip': {..._trip, 'womenDriver': 'PREFERRED'}, 'passenger': const {}});
    expect(preferred.isButterfly, isTrue);
    expect(preferred.isWomenOnly, isFalse);
    expect(r.isButterfly, isFalse);
  });

  test('vehicle quotes carry the pickup ETA; null means nobody is near', () {
    final q = {'vehicleKind': 'BIKE', 'distanceKm': 4.2, 'durationMin': 14, 'total': 38};
    expect(quoteFromJson({...q, 'pickupEtaMin': 3}).pickupEtaMin, 3);
    expect(quoteFromJson({...q, 'pickupEtaMin': null}).pickupEtaMin, isNull);
  });

  test("quotes carry Google's travel minutes when the server has them (display only)", () {
    final q = {'vehicleKind': 'BIKE', 'distanceKm': 11.4, 'durationMin': 38, 'total': 120};
    expect(quoteFromJson({...q, 'travelMin': 24}).tripMin, 24);
    expect(quoteFromJson(q).travelMin, isNull, reason: 'older servers send no travelMin');
    expect(quoteFromJson(q).tripMin, 38);
    expect(const RouteEstimate(distanceKm: 11.4, durationMin: 38, travelMin: 24).label, '11.4 km · 24 min');
  });

  test('reverse geocode and trips carry the pickup landmark; older servers send none', () {
    final pin = {'placeId': 'u', 'name': 'Ukkadam', 'address': 'Coimbatore', 'lat': 10.98, 'lng': 76.96};
    expect(resolvedPlaceFromJson({...pin, 'landmark': 'Near Ukkadam Bus stand'}).landmark, 'Near Ukkadam Bus stand');
    expect(resolvedPlaceFromJson({...pin, 'landmark': null}).landmark, isNull);
    expect(resolvedPlaceFromJson(pin).landmark, isNull);
    final trip = tripFromJson({..._trip, 'pickupLandmark': 'Near KG Hospital'});
    expect(trip.pickup.landmark, 'Near KG Hospital');
    expect(trip.drop.landmark, isNull);
    expect(tripFromJson(_trip).pickup.landmark, isNull);
  });

  test('search suggestions carry the road distance from the pickup when the server sends one', () {
    final j = {'placeId': 'p1', 'name': 'Ukkadam', 'address': 'Coimbatore'};
    expect(suggestionFromJson({...j, 'distanceKm': 8.7}).distanceKm, 8.7);
    expect(suggestionFromJson({...j, 'distanceKm': null}).distanceKm, isNull);
    expect(suggestionFromJson(j).distanceKm, isNull);
  });

  test('chat direction depends on the side', () {
    final m = {'id': 'm1', 'from': 'DRIVER', 'text': 'On my way', 'at': '2026-09-26T05:31:00.000Z'};
    expect(chatFromJson(m, iAmDriver: true).fromMe, isTrue);
    expect(chatFromJson(m, iAmDriver: false).fromMe, isFalse);
  });

  test('earnings, plan, payments, KYC, profile', () {
    final e = earningsFromJson({
      'total': 540, 'rides': 6, 'onlineHours': 5.5, 'rating': 4.9, 'commissionSaved': 160,
      'bars': [{'label': '8 AM', 'amount': 120, 'rides': 2}],
      'trips': [
        {'id': 't', 'at': '2026-09-26T05:31:00.000Z', 'from': 'A', 'to': 'B', 'fare': 60, 'paymentMode': 'UPI', 'distanceKm': 3, 'durationMin': 11, 'passengerName': 'P', 'isDelivery': false},
        {'id': 'm', 'at': '2026-09-26T05:01:00.000Z', 'from': 'Gandhipuram', 'to': '', 'fare': 100, 'paymentMode': 'CASH', 'distanceKm': 3.8, 'durationMin': 14, 'passengerName': '', 'isDelivery': false, 'isMeter': true},
      ],
    });
    expect(e.onlineHours, 6);
    expect(e.bars.single.rides, 2);
    expect(e.trips.first.paymentMode, PaymentMode.upi);
    expect(e.trips.map((t) => t.isMeter), [false, true], reason: 'a meter trip (D-42); older servers send no flag');

    final plan = planFromJson({
      'status': 'TRIAL', 'startsAt': '2026-09-01T00:00:00.000Z', 'endsAt': '2026-10-01T00:00:00.000Z', 'upiApp': 'PhonePe',
      'plan': {'vehicleKind': 'AUTO', 'period': 'MONTHLY', 'price': 999},
    });
    expect(plan.status, PlanStatus.trial);
    expect(plan.vehicle, VehicleKind.auto);
    expect(plan.monthlyPrice, 999);

    final pay = paymentFromJson({'amount': 999, 'status': 'PAID', 'createdAt': '2026-09-01T00:00:00.000Z', 'subscription': {'plan': {'period': 'WEEKLY'}}});
    expect(pay.label, 'Weekly plan');
    expect(pay.status, PaymentRecordStatus.paid);

    expect(kycFromJson({'type': 'VEHICLE_RC', 'status': 'UNDER_REVIEW'}).type, KycDocType.vehicleRc);

    final me = passengerFromJson({
      'name': 'Priya R', 'phone': '+919876500001', 'gender': 'FEMALE', 'preferWomenDriver': true,
      'savedPlaces': [{'id': 's1', 'label': 'Home', 'kind': 'home', 'name': 'Home', 'address': 'RS Puram', 'lat': 11.0, 'lng': 76.9}],
      'emergencyContacts': [{'id': 'c1', 'name': 'Amma', 'relation': 'Mother', 'phone': '+919800000000'}],
    });
    expect(me.gender, Gender.female);
    expect(me.savedPlaces.single.kind, SavedPlaceKind.home);
    expect(me.emergencyContacts.single.relation, 'Mother');
  });

  test('demand map: hotspots with nested hexes and the service-area outline', () {
    final m = DemandMap.fromJson({
      'at': '2026-09-26T15:00:00.000Z',
      'hotspots': [
        {
          'cell': '8761a2', 'level': 'high', 'score': 1, 'multiplier': 1.2, 'centre': [11.0168, 76.9779],
          'boundary': [[11.0, 76.9], [11.1, 76.9], [11.1, 77.0]],
          'nested': [{'cell': '8861a2', 'score': 0.5, 'boundary': [[11.0, 76.95], [11.02, 76.95], [11.02, 76.97]]}],
        },
      ],
      'serviceArea': [[[10.9, 76.8], [11.2, 76.8], [11.2, 77.1]]],
    });
    final h = m.hotspots.single;
    expect(h.level, HotspotLevel.high);
    expect(h.isSurging, isTrue);
    expect(h.centre.latitude, 11.0168);
    expect(h.boundary, hasLength(3));
    expect(h.nested.single.score, 0.5);
    expect(m.serviceArea.single, hasLength(3));
  });

  test('driver photo: API path with a cache key, pending review and reject reason', () {
    final d = driverFromJson({
      'id': 'd1',
      'vehicleKind': 'BIKE',
      'photoFile': 'abc.jpg',
      'pendingPhotoFile': 'new.jpg',
      'photoRejectReason': null,
      'user': {'name': 'Siva Krishna'},
    });
    expect(d.photoPath, '/drivers/d1/photo?v=abc.jpg');
    expect(d.hasPendingPhoto, isTrue);
    expect(driverFromJson({'id': 'd2', 'vehicleKind': 'BIKE', 'user': {}}).photoPath, isNull);
  });

  test('cancel codes: API names round-trip; a cancelled update says who and why', () {
    for (final c in CancelCode.values) {
      expect(CancelCode.fromApi(c.api), c);
    }
    expect(CancelCode.fromApi('NOPE'), isNull);
    expect(CancelCode.forPassenger, isNot(contains(CancelCode.passengerNoShow)));
    expect(CancelCode.forDriver, isNot(contains(CancelCode.driverTooFar)));
    final u = LiveTripUpdate(
      tripFromJson({..._trip, 'status': 'CANCELLED'}),
      'CANCELLED',
      {..._trip, 'status': 'CANCELLED', 'cancelledBy': 'DRIVER', 'cancelCode': 'VEHICLE_ISSUE'},
    );
    expect(u.cancelledBy, CancelledBy.driver);
    expect(u.cancelCode, CancelCode.vehicleIssue);
  });

  test("a rental trip: the quote gets the trip's terms, settled extras and the start time reach the driver", () {
    final j = {
      ..._trip,
      'status': 'COMPLETED',
      'vehicleKind': 'SEDAN',
      'rideMode': 'RENTAL',
      'modeTerms': {'mode': 'RENTAL', 'packageId': '4h', 'hours': 4, 'km': 40, 'price': 979, 'extraKmRate': 14, 'extraMinRate': 2.5},
      'fare': {
        'vehicleKind': 'SEDAN', 'distanceKm': 40, 'durationMin': 240, 'base': 979, 'distanceCharge': 0, 'timeCharge': 0,
        'minFareTopUp': 0, 'subtotal': 979, 'multiplier': 1, 'peakCharge': 0, 'total': 1093,
        'extraKm': 6, 'extraMin': 12, 'extraKmCharge': 84, 'extraTimeCharge': 30,
      },
      'fareTotal': 1093,
      'startedAt': '2026-09-26T06:00:00.000Z',
    };
    final r = rideRequestFromTrip(j);
    expect(r.isRental, isTrue);
    expect(r.modeLabel, 'Rental · 4 hrs · 40 km');
    expect(r.endsAnywhere, isTrue);
    expect(r.fare, 1093);
    expect(r.quote!.modeTerms, isA<RentalTerms>());
    expect((r.quote!.extraKmCharge, r.quote!.extraTimeCharge), (84, 30));
    expect(r.rideStartedAt, DateTime.utc(2026, 9, 26, 6).toLocal());
  });

  test('mode terms round-trip through JSON', () {
    final rental = Seed.rentalRequest.modeTerms!;
    final back = ModeTerms.fromJson(rental.toJson())! as RentalTerms;
    expect((back.packageId, back.hours, back.km, back.price, back.extraMinRate), ('4h', 4, 40, 979, 2.5));
    final out = ModeTerms.fromJson(Seed.outstationRequest.modeTerms!.toJson())! as OutstationTerms;
    expect(out.roundTrip, isTrue);
    expect(out.days, 2);
    expect(rideModeLabel(RideMode.local, null), isNull);
    expect(rideModeLabel(RideMode.outstation, out), 'Outstation · round trip');
  });

  test('a vehicle tier this app does not know is left out (not shown as another Bike)', () {
    final quotes = quotesFromJson([
      {'vehicleKind': 'BIKE', 'total': 35},
      {'vehicleKind': 'E_RICKSHAW', 'total': 41},
      {'vehicleKind': 'AUTO', 'total': 66},
    ]);
    expect(quotes.map((q) => q.vehicle.kind), [VehicleKind.bike, VehicleKind.auto]);
    expect(knownVehicleKind('GOODS_BIKE'), VehicleKind.goodsBike);
    expect(knownVehicleKind('HOVERCRAFT'), isNull);
    expect(knownVehicleKind(null), isNull);
    final update = LiveTripUpdate(tripFromJson(_trip), 'SEARCHING', const {'alsoKinds': ['AUTO', 'E_RICKSHAW']});
    expect(update.alsoVehicles, [VehicleKind.auto]);
  });

  test('a status this app does not know does not end the trip', () {
    expect(tripFromJson({..._trip, 'status': 'AT_DROP'}).status.isFinished, isFalse);
    expect(tripFromJson({..._trip, 'status': 'CANCELLED'}).status, TripStatus.cancelled);
    expect(tripFromJson({..._trip, 'status': 'NO_DRIVERS'}).status, TripStatus.cancelled);
  });
}
