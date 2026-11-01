import 'package:latlong2/latlong.dart';

import '../fare_engine.dart';
import '../goods_modes.dart';
import '../models/driver.dart';
import '../models/people.dart';
import '../models/place.dart';
import '../models/trip.dart';
import '../models/vehicle.dart';
import '../ride_modes.dart';
import '../seed.dart';
import 'service_cities.dart';

/// JSON from the Tamil Taxi API ↔ app models. API enums are SCREAMING_SNAKE (`GOODS_BIKE`), app enums camelCase.
typedef Json = Map<String, dynamic>;

String enumToApi(Enum e) => e.name.replaceAllMapped(RegExp('[A-Z]'), (m) => '_${m[0]}').toUpperCase();

T enumFromApi<T extends Enum>(List<T> values, Object? raw, T fallback) => _enumOrNull(values, raw) ?? fallback;

T? _enumOrNull<T extends Enum>(List<T> values, Object? raw) {
  if (raw is! String) return null;
  final camel = raw.toLowerCase().replaceAllMapped(RegExp('_([a-z])'), (m) => m[1]!.toUpperCase());
  for (final v in values) {
    if (v.name == camel) return v;
  }
  return null;
}

double _d(Object? v, [double fallback = 0]) => v is num ? v.toDouble() : fallback;
int _i(Object? v, [int fallback = 0]) => v is num ? v.round() : fallback;
String _s(Object? v, [String fallback = '']) => v is String ? v : fallback;
DateTime _date(Object? v) => (v is String ? DateTime.tryParse(v)?.toLocal() : null) ?? DateTime.now();

/// "98430 12345" / "+91-98430-12345" → "+919843012345" (the API's format). Other input is returned compact.
String apiPhone(String phone) {
  final compact = phone.replaceAll(RegExp(r'[\s()-]'), '');
  return RegExp(r'^[6-9]\d{9}$').hasMatch(compact) ? '+91$compact' : compact;
}

VehicleKind vehicleKindFromApi(Object? raw) => enumFromApi(VehicleKind.values, raw, VehicleKind.bike);

/// The app's vehicle for an API `vehicleKind`, or null for a tier this version doesn't know (a newer server added
/// one). Lists the rider picks from drop those: shown as a second "Bike" at another price, it would book as BIKE.
VehicleKind? knownVehicleKind(Object? raw) => _enumOrNull(VehicleKind.values, raw);

/// `quotes` of a fare answer, without vehicles this app doesn't know ([knownVehicleKind]).
List<FareQuote> quotesFromJson(Object? raw) => [
      for (final q in (raw as List? ?? const []))
        if (q is Map && knownVehicleKind(q['vehicleKind']) != null) quoteFromJson(q.cast<String, dynamic>()),
    ];

VehicleType vehicleTypeFor(VehicleKind kind) => Seed.allVehicles.firstWhere((v) => v.kind == kind);

Gender genderFromApi(Object? raw) => enumFromApi(Gender.values, raw, Gender.preferNotToSay);

/// A trip's Butterfly choice (`womenDriver`: NONE / PREFERRED / ONLY).
WomenDriverPref womenDriverFromApi(Object? raw) => enumFromApi(WomenDriverPref.values, raw, WomenDriverPref.none);

/// A point for request bodies (`PointDto`).
Json pointJson(Place p) => {
      'lat': p.location.latitude,
      'lng': p.location.longitude,
      if (p.name.isNotEmpty) 'name': p.name.length > 120 ? p.name.substring(0, 120) : p.name,
      if (p.address.isNotEmpty) 'address': p.address.length > 200 ? p.address.substring(0, 200) : p.address,
    };

/// Placeholder location for a search suggestion until [PlacesRepository.resolve] runs: the first service city's
/// centre ([CityDefaults]).
LatLng get kCityCentre => CityDefaults.center;

/// Search suggestion ids from the API are prefixed so [resolve] knows to fetch their details.
const String kApiPlacePrefix = 'api:';

Place suggestionFromJson(Json j) => Place(
      id: '$kApiPlacePrefix${_s(j['placeId'])}',
      name: _s(j['name']),
      address: _s(j['address']),
      location: kCityCentre,
      // Road distance from the pickup, when the app sent one (older servers: none).
      distanceKm: j['distanceKm'] is num ? (j['distanceKm'] as num).toDouble() : null,
    );

Place resolvedPlaceFromJson(Json j) => Place(
      id: _s(j['placeId'], 'pin-${j['lat']},${j['lng']}'),
      name: _s(j['name'], 'Pinned location'),
      address: _s(j['address']),
      location: LatLng(_d(j['lat']), _d(j['lng'])),
      landmark: _optText(j['landmark']),
    );

/// A non-empty string, else null (older servers omit the field).
String? _optText(Object? v) => v is String && v.trim().isNotEmpty ? v.trim() : null;

FareQuote quoteFromJson(Json j) => FareQuote(
      vehicle: vehicleTypeFor(vehicleKindFromApi(j['vehicleKind'])),
      distanceKm: _d(j['distanceKm']),
      durationMin: _i(j['durationMin'], 1),
      base: _i(j['base']),
      distanceCharge: _i(j['distanceCharge']),
      timeCharge: _i(j['timeCharge']),
      minFareTopUp: _i(j['minFareTopUp']),
      subtotal: _i(j['subtotal']),
      multiplier: _d(j['multiplier'], 1),
      peakCharge: _i(j['peakCharge']),
      total: _i(j['total']),
      night: j['night'] == true,
      pickupEtaMin: j['pickupEtaMin'] is num ? _i(j['pickupEtaMin']) : null,
      // Older servers (and fares stored before it) have no travelMin: the apps show durationMin.
      travelMin: j['travelMin'] is num ? _i(j['travelMin']) : null,
      waitingCharge: _i(j['waitingCharge']),
      freeWaitMin: _i(j['freeWaitMin'], FareEngine.freeWaitMin),
      // Fares stored before waiting charges existed: the vehicle's built-in rate.
      waitPerMin: j['waitPerMin'] is num
          ? _i(j['waitPerMin'])
          : vehicleTypeFor(vehicleKindFromApi(j['vehicleKind'])).fareRule.waitPerMin,
      waitMaxCharge: _i(j['waitMaxCharge'], FareEngine.waitMaxCharge),
      previousCancellationFee: _i(j['previousCancellationFee']),
      extra: _i(j['extra']),
      modeTerms: ModeTerms.fromJson(j['modeTerms']),
      extraKmCharge: _i(j['extraKmCharge']),
      extraTimeCharge: _i(j['extraTimeCharge']),
    );

/// A driver (`Driver` with its `user`).
DriverProfile driverFromJson(Json j) {
  final user = (j['user'] as Map?)?.cast<String, dynamic>() ?? const {};
  return DriverProfile(
    id: _s(j['id']),
    name: _s(user['name'], 'Tamil Taxi driver'),
    phone: _s(user['phone']),
    vehicleKind: vehicleKindFromApi(j['vehicleKind']),
    vehicleModel: _s(j['vehicleModel']),
    vehicleColor: _s(j['vehicleColor']),
    plate: _s(j['plate']),
    rating: _d(j['rating'], 5),
    rides: _i(j['ridesCount']),
    upiId: _s(j['upiId']),
    gender: genderFromApi(user['gender']),
    // ?v= changes when the photo does, so the image cache refreshes.
    photoPath: j['photoFile'] is String ? '/drivers/${_s(j['id'])}/photo?v=${j['photoFile']}' : null,
    hasPendingPhoto: j['pendingPhotoFile'] is String,
    photoRejectReason: j['photoRejectReason'] as String?,
  );
}

TripStatus tripStatusFromApi(Object? raw) => switch (raw) {
      'SCHEDULED' => TripStatus.scheduled,
      'SEARCHING' => TripStatus.searching,
      'DRIVER_ASSIGNED' => TripStatus.driverAssigned,
      'DRIVER_ARRIVED' => TripStatus.driverArrived,
      'IN_PROGRESS' => TripStatus.inProgress,
      'PICKED_UP' => TripStatus.pickedUp,
      'COMPLETED' => TripStatus.completed,
      'DELIVERED' => TripStatus.delivered,
      // NO_DRIVERS and CANCELLED both end the trip without a ride.
      'NO_DRIVERS' || 'CANCELLED' => TripStatus.cancelled,
      // A status this version doesn't know (a newer server) is not an ending: the trip goes on until the server says
      // it ended.
      _ => TripStatus.inProgress,
    };

Json parcelToJson(ParcelDetails p) => {
      'category': p.category.name,
      'weight': p.weight.name,
      'senderName': p.senderName,
      'senderPhone': p.senderPhone,
      'receiverName': p.receiverName,
      'receiverPhone': p.receiverPhone,
      'pickupNote': p.pickupNote,
      'dropNote': p.dropNote,
      'hasPhoto': p.hasPhoto,
    };

ParcelDetails parcelFromJson(Json j, {required String otp, ParcelPayer payer = ParcelPayer.sender}) => ParcelDetails(
      category: ParcelCategory.values.firstWhere((c) => c.name == j['category'], orElse: () => ParcelCategory.other),
      weight: WeightBand.values.firstWhere((w) => w.name == j['weight'], orElse: () => WeightBand.under5),
      senderName: _s(j['senderName']),
      senderPhone: _s(j['senderPhone']),
      receiverName: _s(j['receiverName']),
      receiverPhone: _s(j['receiverPhone']),
      pickupNote: _s(j['pickupNote']),
      dropNote: _s(j['dropNote']),
      payer: payer,
      deliveryOtp: otp,
      hasPhoto: j['hasPhoto'] == true,
    );

Place _tripPlace(Json j, String prefix) => Place(
      id: '${j['id']}-$prefix',
      name: _s(j['${prefix}Name'], 'Pinned location'),
      address: _s(j['${prefix}Addr']),
      location: LatLng(_d(j['${prefix}Lat']), _d(j['${prefix}Lng'])),
      // Only the pickup has one ("Near KG Hospital", for the driver).
      landmark: _optText(j['${prefix}Landmark']),
    );

Trip tripFromJson(Json j) {
  final kind = j['kind'] == 'PARCEL' ? TripKind.parcel : TripKind.ride;
  final fare = (j['fare'] as Map?)?.cast<String, dynamic>();
  final driver = (j['driver'] as Map?)?.cast<String, dynamic>();
  final parcel = (j['parcel'] as Map?)?.cast<String, dynamic>();
  final otp = _s(j['otp']);
  final payer = enumFromApi(ParcelPayer.values, j['payer'], ParcelPayer.sender);
  return Trip(
    id: _s(j['id']),
    kind: kind,
    vehicle: vehicleKindFromApi(j['vehicleKind']),
    pickup: _tripPlace(j, 'pickup'),
    drop: _tripPlace(j, 'drop'),
    fare: _i(j['fareTotal']),
    // A trip's fare JSON doesn't repeat its terms: the quote gets the trip's (for the fare breakdown).
    quote: fare == null ? null : _withTerms(quoteFromJson(fare), ModeTerms.fromJson(j['modeTerms'])),
    status: tripStatusFromApi(j['status']),
    startedAt: _date(j['createdAt']),
    driver: driver == null ? null : driverFromJson(driver),
    distanceKm: _d(j['distanceKm']),
    durationMin: _i(j['durationMin']),
    otp: otp,
    paymentMode: enumFromApi(PaymentMode.values, j['paymentMode'], PaymentMode.cash),
    parcel: parcel == null ? null : parcelFromJson(parcel, otp: otp, payer: payer),
    rating: j['rating'] is num ? _i(j['rating']) : null,
    rideMode: enumFromApi(RideMode.values, j['rideMode'], RideMode.local),
    // The trip's own terms; a quote's fare JSON doesn't repeat them.
    modeTerms: ModeTerms.fromJson(j['modeTerms']),
    scheduledAt: j['scheduledAt'] is String ? DateTime.tryParse(j['scheduledAt'] as String)?.toLocal() : null,
    shifting: ShiftingDetails.fromJson(j['shifting']),
  );
}

FareQuote _withTerms(FareQuote q, ModeTerms? terms) => terms == null || q.modeTerms != null ? q : q.copyWith(modeTerms: terms);

/// The API status string of a trip (the app's [TripStatus] folds NO_DRIVERS into cancelled).
String apiStatusOf(Json j) => _s(j['status']);

/// Driver offer (`trip.offer` / `GET /trips/offer`) → the request card.
RideRequest rideRequestFromOffer(Json offer) {
  final trip = tripFromJson((offer['trip'] as Map).cast<String, dynamic>());
  final passenger = (offer['passenger'] as Map?)?.cast<String, dynamic>() ?? const {};
  return RideRequest(
    id: trip.id,
    kind: trip.kind,
    vehicle: trip.vehicle,
    fare: trip.fare,
    pickup: trip.pickup,
    drop: trip.drop,
    pickupDistanceKm: _d(offer['pickupKm'], 1),
    pickupEtaMin: _i(offer['pickupEtaMin'], 3),
    tripKm: trip.distanceKm,
    tripMin: trip.durationMin,
    customerName: _s(passenger['name'], 'Tamil Taxi customer'),
    customerRating: 4.8,
    customerPhone: _s(passenger['phone']),
    isCustomerVerified: passenger['isVerified'] == true,
    womenDriver: womenDriverFromApi((offer['trip'] as Map)['womenDriver']),
    bookedBy: passenger['bookedBy'] is String ? passenger['bookedBy'] as String : null,
    parcel: trip.parcel,
    otp: '',
    extra: trip.quote?.extra ?? 0,
    rideMode: trip.rideMode,
    modeTerms: trip.modeTerms,
    scheduledAt: trip.scheduledAt,
    quote: trip.quote,
    shifting: trip.shifting,
  );
}

/// A trip the driver is on (`GET /trips/active`, `trip.updated`) as a [RideRequest] for the job screens.
RideRequest rideRequestFromTrip(Json j) {
  final trip = tripFromJson(j);
  final passenger = (j['passenger'] as Map?)?.cast<String, dynamic>() ?? const {};
  return RideRequest(
    id: trip.id,
    kind: trip.kind,
    vehicle: trip.vehicle,
    fare: trip.fare,
    pickup: trip.pickup,
    drop: trip.drop,
    pickupDistanceKm: 0,
    pickupEtaMin: 0,
    tripKm: trip.distanceKm,
    tripMin: trip.durationMin,
    // Booked for someone else: the rider is who the driver meets and calls.
    customerName: j['riderName'] is String
        ? j['riderName'] as String
        : _s(passenger['name'], 'Tamil Taxi customer'),
    customerRating: 4.8,
    customerPhone: j['riderPhone'] is String
        ? j['riderPhone'] as String
        : _s(passenger['phone']),
    isCustomerVerified:
        j['riderName'] is! String && passenger['identityStatus'] == 'APPROVED',
    womenDriver: womenDriverFromApi(j['womenDriver']),
    bookedBy: j['riderName'] is String
        ? _s(passenger['name'], 'Tamil Taxi customer')
        : null,
    parcel: trip.parcel,
    parcelPhotoFile: j['parcelPhotoFile'] as String?,
    otp: '',
    extra: trip.quote?.extra ?? 0,
    rideMode: trip.rideMode,
    modeTerms: trip.modeTerms,
    scheduledAt: trip.scheduledAt,
    quote: trip.quote,
    rideStartedAt: j['startedAt'] is String
        ? DateTime.tryParse(j['startedAt'] as String)?.toLocal()
        : null,
    shifting: trip.shifting,
  );
}

ChatMessage chatFromJson(Json j, {required bool iAmDriver}) => ChatMessage(
  id: _s(j['id']),
  text: _s(j['text']),
  fromMe: (j['from'] == 'DRIVER') == iAmDriver,
  sentAt: _date(j['at']),
);

SavedPlace savedPlaceFromJson(Json j) => SavedPlace(
  id: _s(j['id']),
  label: _s(j['label']),
  note: _s(j['note']),
  kind: SavedPlaceKind.values.firstWhere(
    (k) => k.name == j['kind'],
    orElse: () => SavedPlaceKind.other,
  ),
  place: Place(
    id: 'saved-${j['id']}',
    name: _s(j['name']),
    address: _s(j['address']),
    location: LatLng(_d(j['lat']), _d(j['lng'])),
  ),
);

/// Within the API's limits (label 40, name 120, address 200, none empty): a pinned spot has no address of its own.
Json savedPlaceToJson(SavedPlace p) {
  String cut(String s, int max) =>
      s.length <= max ? s : s.substring(0, max).trimRight();
  final label = p.label.trim().isEmpty ? 'Saved place' : p.label.trim();
  final name = p.place.name.trim().isEmpty ? label : p.place.name.trim();
  final address = p.place.address.trim().isEmpty
      ? name
      : p.place.address.trim();
  return {
    'label': cut(label, 40),
    'note': cut(p.note.trim(), 200),
    'kind': p.kind.name,
    'name': cut(name, 120),
    'address': cut(address, 200),
    'lat': p.place.location.latitude,
    'lng': p.place.location.longitude,
  };
}

EmergencyContact contactFromJson(Json j) =>
    EmergencyContact(id: _s(j['id']), name: _s(j['name']), relation: _s(j['relation']), phone: _s(j['phone']));

PassengerProfile passengerFromJson(Json j) => PassengerProfile(
      name: _s(j['name']),
      phone: _s(j['phone']),
      email: _s(j['email']),
      gender: genderFromApi(j['gender']),
      savedPlaces: [for (final p in (j['savedPlaces'] as List? ?? const [])) savedPlaceFromJson((p as Map).cast())],
      emergencyContacts: [for (final c in (j['emergencyContacts'] as List? ?? const [])) contactFromJson((c as Map).cast())],
      preferWomenDriver: j['preferWomenDriver'] == true,
      autoShareTrips: j['autoShareTrips'] != false,
    );

KycDocument kycFromJson(Json j) => KycDocument(
      type: enumFromApi(KycDocType.values, j['type'], KycDocType.drivingLicence),
      status: enumFromApi(KycStatus.values, j['status'], KycStatus.notUploaded),
      rejectReason: j['rejectReason'] as String?,
    );

/// Grace period after a plan ends (matches the API's GRACE_DAYS).
const int kGraceDays = 3;

SubscriptionPlan planFromJson(Json j) {
  final plan = (j['plan'] as Map?)?.cast<String, dynamic>() ?? const {};
  final endsAt = _date(j['endsAt']);
  final status = enumFromApi(PlanStatus.values, j['status'], PlanStatus.expired);
  final daysOver = DateTime.now().difference(endsAt).inDays;
  return SubscriptionPlan(
    vehicle: vehicleKindFromApi(plan['vehicleKind']),
    monthlyPrice: plan['price'] is num ? _i(plan['price']) : null,
    status: status,
    startedAt: _date(j['startsAt']),
    nextDebit: endsAt,
    upiApp: _s(j['upiApp'], 'GPay'),
    graceDaysLeft: (kGraceDays - daysOver).clamp(0, kGraceDays),
  );
}

PaymentRecord paymentFromJson(Json j) {
  final sub = (j['subscription'] as Map?)?.cast<String, dynamic>() ?? const {};
  final plan = (sub['plan'] as Map?)?.cast<String, dynamic>() ?? const {};
  final period = _s(plan['period'], 'MONTHLY');
  final label = period.isEmpty
      ? 'Plan payment'
      : '${period[0]}${period.substring(1).toLowerCase()} plan';
  return PaymentRecord(
    label: label,
    amount: _i(j['amount']),
    status: switch (j['status']) {
      'PAID' => PaymentRecordStatus.paid,
      _ => PaymentRecordStatus.failed,
    },
    date: _date(j['createdAt']),
  );
}

SupportTicket ticketFromJson(Json j) => SupportTicket(
  id: _s(j['id']),
  topic: _s(j['topic']),
  description: _s(j['description']),
  status: enumFromApi(TicketStatus.values, j['status'], TicketStatus.open),
  createdAt: _date(j['createdAt']),
  updatedAt: j['updatedAt'] == null ? null : _date(j['updatedAt']),
  tripId: j['tripId'] as String?,
);

EarningsSummary earningsFromJson(Json j) => EarningsSummary(
  total: _i(j['total']),
  rides: _i(j['rides']),
  onlineHours: _i(j['onlineHours']),
  rating: _d(j['rating'], 5),
  commissionSaved: _i(j['commissionSaved']),
  bars: [
    for (final b in (j['bars'] as List? ?? const []))
      EarningsDay(
        label: _s((b as Map)['label']),
        amount: _i(b['amount']),
        rides: _i(b['rides']),
      ),
  ],
  trips: [
    for (final t in (j['trips'] as List? ?? const []))
      EarningsTrip(
        id: _s((t as Map)['id']),
        time: _date(t['at']),
        from: _s(t['from']),
        to: _s(t['to']),
        fare: _i(t['fare']),
        waitingCharge: _i(t['waitingCharge']),
        previousCancellationFee: _i(t['previousCancellationFee']),
        extra: _i(t['extra']),
        paymentMode: enumFromApi(
          PaymentMode.values,
          t['paymentMode'],
          PaymentMode.cash,
        ),
        distanceKm: _d(t['distanceKm']),
        durationMin: _i(t['durationMin']),
        passengerName: _s(t['passengerName']),
        isDelivery: t['isDelivery'] == true,
      ),
  ],
);

/// `POST /fares/shifting-quote` → [ShiftingQuote].
ShiftingQuote shiftingQuoteFromJson(Json j) {
  final terms = ModeTerms.fromJson(j['modeTerms']);
  return ShiftingQuote(
    vehicle: vehicleKindFromApi(j['vehicleKind']),
    distanceKm: _d(j['distanceKm']),
    durationMin: _i(j['durationMin']),
    lines: ShiftingLines.fromJson(j['lines']) ??
        const ShiftingLines(
            transport: 0, helperCount: 0, helpers: 0, stairs: 0, packing: 0, dismantle: 0, unpack: 0, subtotal: 0, weekend: 0, total: 0),
    modeTerms: terms is OutstationTerms ? terms : null,
    vehicles: [
      for (final v in _jsonList(j['vehicles']))
        if (knownVehicleKind(v['vehicleKind']) case final kind?) (kind: kind, total: _i(v['total']), suggested: v['suggested'] == true),
    ],
    days: [
      for (final d in _jsonList(j['days']))
        if (DateTime.tryParse('${d['date']}') case final date?) (date: date, total: _i(d['total']), weekend: d['weekend'] == true),
    ],
  );
}

List<Json> _jsonList(Object? raw) => [for (final e in (raw as List? ?? const [])) if (e is Map) e.cast<String, dynamic>()];
