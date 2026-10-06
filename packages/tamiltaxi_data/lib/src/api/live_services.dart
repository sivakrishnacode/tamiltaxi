import 'dart:async';

import 'package:latlong2/latlong.dart';

import '../goods_modes.dart';
import '../ride_modes.dart';
import '../models/booking_prefs.dart';
import '../rate_card.dart';
import '../models/cancellation.dart';
import '../models/driver.dart';
import '../models/driver_fix.dart';
import '../models/people.dart';
import '../models/place.dart';
import '../models/trip.dart';
import '../models/vehicle.dart';
import 'api_client.dart';
import 'api_mappers.dart';
import 'demand_map.dart';
import 'realtime_client.dart';
import '../simulation/road_router.dart';

Json _map(dynamic body) => (body as Map).cast<String, dynamic>();

/// A trip update from the API: the mapped [trip] plus the raw API [status] (which also has `NO_DRIVERS`).
class LiveTripUpdate {
  const LiveTripUpdate(this.trip, this.status, this.json);

  /// A trip as the API sends it (`trip.updated`, `GET /trips/:id`).
  factory LiveTripUpdate.fromJson(Json j) => LiveTripUpdate(tripFromJson(j), apiStatusOf(j), j);

  final Trip trip;

  /// SEARCHING, NO_DRIVERS, DRIVER_ASSIGNED, DRIVER_ARRIVED, IN_PROGRESS, PICKED_UP, COMPLETED, DELIVERED, CANCELLED.
  final String status;
  final Json json;

  bool get isNoDrivers => status == 'NO_DRIVERS';

  /// Cancelled (or ended with no drivers): by whom and why.
  CancelledBy? get cancelledBy => CancelledBy.fromApi(json['cancelledBy']);
  CancelCode? get cancelCode => CancelCode.fromApi(json['cancelCode']);

  /// At the pickup: from then the driver may cancel as "Passenger didn't come" (after the no-show wait).
  DateTime? get noShowAt => json['noShowAt'] is String ? DateTime.tryParse(json['noShowAt'] as String)?.toLocal() : null;

  /// Times a driver dropped this trip and it searched again.
  int get reassignCount => (json['reassignCount'] as num?)?.toInt() ?? 0;

  /// The driver's last fix when the passenger read the trip (`GET /trips/:id`, `/trips/active`), so the car shows
  /// at once after a reconnect or a restart; null in pushes and when there is none fresh.
  LiveLocation? get driverLocation => LiveLocation.fromJson(trip.id, json['driverLocation']);

  /// "Book any": vehicles the passenger added to the search besides [Trip.vehicle].
  List<VehicleKind> get alsoVehicles => [
        for (final k in (json['alsoKinds'] as List?) ?? const []) ?knownVehicleKind(k),
      ];
}

/// "Book any" (like Namma Yatra): another vehicle a slow search could add. Free drivers of it are within the maximum
/// search radius; [quote] is its fare on the booked route.
class VehicleAlternative {
  const VehicleAlternative({required this.vehicle, required this.quote, required this.driversNearby, required this.nearestKm});

  factory VehicleAlternative.fromJson(Json j) => VehicleAlternative(
        vehicle: vehicleKindFromApi(j['vehicleKind']),
        quote: quoteFromJson(_map(j['quote'])),
        driversNearby: (j['driversNearby'] as num?)?.toInt() ?? 0,
        nearestKm: (j['nearestKm'] as num?)?.toDouble() ?? 0,
      );

  final VehicleKind vehicle;
  final FareQuote quote;
  final int driversNearby;

  /// Straight-line km from the pickup to the nearest of them.
  final double nearestKm;
}

/// Live driver position on the passenger's map.
class LiveLocation {
  const LiveLocation(this.tripId, this.point, this.at, {this.heading});

  /// `{lat, lng, at?, hdg?}` as `trip.location` and a trip's `driverLocation` carry it; null when unusable.
  static LiveLocation? fromJson(String tripId, Object? raw) {
    if (raw is! Map || raw['lat'] is! num || raw['lng'] is! num) return null;
    final at = raw['at'];
    return LiveLocation(
      tripId,
      LatLng((raw['lat'] as num).toDouble(), (raw['lng'] as num).toDouble()),
      at is num ? DateTime.fromMillisecondsSinceEpoch(at.toInt()) : DateTime.now(),
      heading: raw['hdg'] is num ? (raw['hdg'] as num).toDouble() : null,
    );
  }

  final String tripId;
  final LatLng point;
  final DateTime at;

  /// The phone's direction of travel (degrees from north), sent while moving.
  final double? heading;
}

/// Passenger side of a real trip: book, follow it (status, driver GPS, chat), cancel and rate.
///
/// Status arrives as `trip.updated` / `trip.no_drivers` on the user's room; driver location and chat on the trip room.
/// [poll] is the fallback when the socket is down.
class LiveTrips {
  LiveTrips(this.api, this.realtime);
  final ApiClient api;
  final RealtimeClient realtime;

  /// Books a trip. [mode]: a rental (no drop sent) or outstation trip, maybe for later (`SCHEDULED`).
  Future<LiveTripUpdate> book({
    required TripKind kind,
    required VehicleKind vehicle,
    required Place pickup,
    required Place drop,
    PaymentMode paymentMode = PaymentMode.cash,
    ParcelDetails? parcel,
    WomenDriverPref womenDriver = WomenDriverPref.none,
    OtherRider? rider,
    ModeRequest? mode,
    ShiftingDetails? shifting,
    DateTime? slot,
  }) async {
    realtime.connect();
    final res = _map(await api.post('/trips', {
      'kind': kind == TripKind.parcel ? 'PARCEL' : 'RIDE',
      'vehicleKind': enumToApi(vehicle),
      'pickup': pointJson(pickup),
      if (mode?.mode != RideMode.rental) 'drop': pointJson(drop),
      if (mode != null && mode.mode != RideMode.local) ...mode.toJson(),
      // Only a server that sends landmarks gets one back (older servers reject unknown fields).
      if (pickup.landmark != null) 'pickupLandmark': pickup.landmark!.length > 120 ? pickup.landmark!.substring(0, 120) : pickup.landmark,
      'paymentMode': enumToApi(paymentMode),
      if (parcel != null) 'parcel': parcelToJson(parcel),
      if (parcel != null) 'payer': enumToApi(parcel.payer),
      if (womenDriver.isOn) 'womenDriver': enumToApi(womenDriver),
      if (rider != null) 'rider': {'name': rider.name.trim(), 'phone': apiPhone(rider.phone), 'isWoman': rider.isWoman},
      // House shifting: its details and items, for a slot (the server picks LOCAL / OUTSTATION from `between`).
      if (shifting != null) 'shifting': shifting.toJson(),
      if (shifting != null && slot != null) 'scheduledAt': slot.toUtc().toIso8601String(),
    }));
    final update = _update(res);
    unawaited(realtime.joinTrip(update.trip.id));
    return update;
  }

  /// Status changes of [tripId] (`trip.updated`, `trip.no_drivers`).
  ///
  /// `trip.no_drivers` only carries the trip id (the server sends no `trip.updated` with it). It becomes a NO_DRIVERS
  /// update straight away: it used to wait for a poll of the trip, and when that poll failed the rider stayed on
  /// "Finding your driver" for good.
  Stream<LiveTripUpdate> updates(String tripId) {
    realtime.connect();
    final updated = realtime.on('trip.updated').where((j) => j['id'] == tripId).map(_update);
    final noDrivers = realtime.on('trip.no_drivers').where((j) => j['tripId'] == tripId).map((_) => noDriversUpdate(tripId));
    return _merge([updated, noDrivers]);
  }

  /// The search for [tripId] ended without a driver (dispatch gave up), as the API records it.
  static LiveTripUpdate noDriversUpdate(String tripId) =>
      _update({'id': tripId, 'status': 'NO_DRIVERS', 'cancelledBy': 'SYSTEM', 'cancelCode': 'NO_DRIVERS'});

  /// Driver GPS for [tripId] (joins the trip room).
  Stream<LiveLocation> locations(String tripId) {
    unawaited(realtime.joinTrip(tripId));
    return realtime
        .on('trip.location')
        .where((j) => j['tripId'] == tripId)
        .map((j) => LiveLocation.fromJson(tripId, j))
        .where((l) => l != null)
        .cast<LiveLocation>();
  }

  Stream<ChatMessage> messages(String tripId) =>
      realtime.on('trip.message').where((j) => j['tripId'] == tripId).map((j) => chatFromJson(j, iAmDriver: false));

  Future<List<ChatMessage>> chatHistory(String tripId) async =>
      [for (final m in (await api.get('/trips/$tripId/messages') as List)) chatFromJson(_map(m), iAmDriver: false)];

  Future<ChatMessage> sendMessage(String tripId, String text) async =>
      chatFromJson(_map(await api.post('/trips/$tripId/messages', {'text': text})), iAmDriver: false);

  Future<LiveTripUpdate> poll(String tripId) async => _update(_map(await api.get('/trips/$tripId')));

  /// The passenger's unfinished trip (restores the ride after an app restart), or null.
  Future<LiveTripUpdate?> active() async {
    final res = await api.get('/trips/active');
    if (res == null) return null;
    final update = _update(_map(res));
    unawaited(realtime.joinTrip(update.trip.id));
    return update;
  }

  /// Cancels with a reason [code] (S-03) and an optional [note].
  Future<LiveTripUpdate> cancel(String tripId, {CancelCode code = CancelCode.other, String? note}) async =>
      _update(_map(await api.post('/trips/$tripId/cancel', {'code': code.api, 'note': ?note})));

  /// While searching: other vehicles with drivers in range, cheapest first ("Book any").
  Future<List<VehicleAlternative>> alternatives(String tripId) async => [
        for (final a in (await api.get('/trips/$tripId/alternatives') as List))
          if (a is Map && knownVehicleKind(a['vehicleKind']) != null) VehicleAlternative.fromJson(_map(a)),
      ];

  /// While searching: also look for [vehicle]; the first driver of any of them takes the trip at their fare.
  Future<LiveTripUpdate> addVehicle(String tripId, VehicleKind vehicle) async =>
      _update(_map(await api.post('/trips/$tripId/also', {'vehicleKind': enumToApi(vehicle)})));

  /// While searching: the rider's extra in all on top of the quote ("+₹20"); drivers see "₹50 + ₹20".
  Future<LiveTripUpdate> addExtra(String tripId, int amount) async =>
      _update(_map(await api.post('/trips/$tripId/extra', {'amount': amount})));

  Future<void> rate(String tripId, int rating) => api.post('/trips/$tripId/rate', {'rating': rating});

  static LiveTripUpdate _update(Json j) => LiveTripUpdate.fromJson(j);
}

/// A reminder about the driver's current trip (`trip.nudge`). [kind]: NOT_MOVING, NO_SHOW_ALLOWED, END_TRIP,
/// REASSIGNED, CANCELLED.
class TripNudge {
  const TripNudge({required this.tripId, required this.kind, required this.title, required this.message});

  factory TripNudge.fromJson(Json j) => TripNudge(
        tripId: '${j['tripId'] ?? ''}',
        kind: '${j['kind'] ?? ''}',
        title: '${j['title'] ?? ''}',
        message: '${j['message'] ?? ''}',
      );

  final String tripId;
  final String kind;
  final String title;
  final String message;
}

/// A request offered to this driver, with how long it stays open.
class LiveOffer {
  const LiveOffer(this.request, this.expiresInSeconds);
  final RideRequest request;
  final int expiresInSeconds;
}

/// Driver side: online / offline, offers (`trip.offer`), the job lifecycle, GPS and chat.
class LiveJobs {
  LiveJobs(this.api, this.realtime);
  final ApiClient api;
  final RealtimeClient realtime;

  /// Throws [ApiException] (403) when not approved or the plan has lapsed; the message says why.
  Future<void> goOnline(LatLng at) async {
    realtime.connect();
    await api.post('/drivers/me/online', {'lat': at.latitude, 'lng': at.longitude});
  }

  Future<void> goOffline() => api.post('/drivers/me/offline');

  /// Deletes the signed-in account (`DELETE /me`) and ends the session on the phone. Throws [ApiException] (409 while
  /// a trip is unfinished; the message says so) and keeps the session then.
  Future<void> deleteAccount() async {
    await api.delete('/me');
    await api.session.clear();
  }

  /// The daily selfie before going online (`POST /drivers/me/selfie-check`, multipart `file`): the server matches it
  /// with the selfie from the identity check. Returns when it was checked. Throws [ApiException]: 422 no match or not
  /// exactly one face (retake), 409 no reference selfie yet, 429 too many tries today.
  Future<DateTime> selfieCheck(List<int> bytes, String filename) async {
    final res = await api.upload('/drivers/me/selfie-check', field: 'file', bytes: bytes, filename: filename);
    final at = res is Map ? DateTime.tryParse('${res['checkedAt']}')?.toLocal() : null;
    return at ?? DateTime.now();
  }

  /// Booking preferences (pickup distance, trip length, Go To / Stay In, parcels, saved areas); dispatch only offers
  /// trips that fit.
  Future<BookingPrefs> bookingPrefs() async => BookingPrefs.fromJson(_map(await api.get('/drivers/me/booking-preferences')));

  /// Replaces them; returns what the server saved (a go-to / stay-in comes back with when it switches off).
  Future<BookingPrefs> setBookingPrefs(BookingPrefs prefs) async =>
      BookingPrefs.fromJson(_map(await api.put('/drivers/me/booking-preferences', prefs.toJson())));

  /// Services: [service] on, or paused for [pauseMinutes] (null: until the driver starts it again), with an optional
  /// [reason]; Packers & Movers on with the [helpers] they bring. Returns the preferences as saved.
  Future<BookingPrefs> setService(DriverService service, {required bool on, int? pauseMinutes, String? reason, int? helpers}) async =>
      BookingPrefs.fromJson(_map(await api.put('/drivers/me/services/${service.name}', {
        'on': on,
        'pauseMinutes': ?pauseMinutes,
        'reason': ?reason,
        'helpers': ?helpers,
      })));

  /// The Rate card for the city at [at] (`GET /fares/rate-card`; built-in rates without a point).
  Future<RateCard> rateCard(LatLng? at) async => RateCard.fromJson(_map(await api.get('/fares/rate-card', query: {
        if (at != null) 'lat': at.latitude.toStringAsFixed(5),
        if (at != null) 'lng': at.longitude.toStringAsFixed(5),
      })));

  /// The driver's cancellation rate (Home banner) and pause.
  Future<DriverCancelRate> cancelRate() async => DriverCancelRate.fromJson(_map(await api.get('/drivers/me/cancel-rate')));

  /// The server paused this driver for too many cancellations (`driver.blocked`): until when.
  Stream<DateTime> pauses() {
    realtime.connect();
    return realtime
        .on('driver.blocked')
        .map((j) => j['until'] is String ? DateTime.tryParse(j['until'] as String)?.toLocal() : null)
        .where((d) => d != null)
        .cast<DateTime>();
  }

  Stream<LiveOffer> offers() {
    realtime.connect();
    return realtime.on('trip.offer').map(_offer);
  }

  /// The offer currently open for this driver (missed while the socket was reconnecting), or null.
  Future<LiveOffer?> currentOffer() async {
    final res = await api.get('/trips/offer');
    return res == null ? null : _offer(_map(res));
  }

  /// Every request open for this driver, oldest first (a driver can hold a few at once, stacked on the card).
  Future<List<LiveOffer>> currentOffers() async {
    final res = await api.get('/trips/offers');
    return res is List ? [for (final o in res) _offer(_map(o))] : const [];
  }

  /// A request that is no longer open for this driver (`trip.offer_closed`: taken elsewhere, cancelled, timed out,
  /// or released when they accepted another): its trip id.
  Stream<String> closedOffers() {
    realtime.connect();
    return realtime.on('trip.offer_closed').map((j) => '${j['tripId']}');
  }

  /// Reminders from the server's trip timeouts (`trip.nudge`): "Are you on the way?", the no-show wait is over,
  /// "Please end the trip", the ride went to another driver.
  Stream<TripNudge> nudges(String tripId) => realtime.on('trip.nudge').where((j) => j['tripId'] == tripId).map(TripNudge.fromJson);

  /// Status changes of the job (e.g. the passenger cancelled).
  Stream<LiveTripUpdate> updates(String tripId) =>
      realtime.on('trip.updated').where((j) => j['id'] == tripId).map(LiveTrips._update);

  Future<LiveTripUpdate> accept(String tripId) async {
    final update = LiveTrips._update(_map(await api.post('/trips/$tripId/accept')));
    unawaited(realtime.joinTrip(tripId));
    return update;
  }

  Future<void> decline(String tripId) => api.post('/trips/$tripId/decline');

  /// At the pickup. Throws [ApiException] with [ApiException.tooFar] when [at] is outside the allowed radius and
  /// no [farReason] was given; call again with the driver's reason to continue.
  Future<LiveTripUpdate> arrived(String tripId, {LatLng? at, String? farReason}) async =>
      LiveTrips._update(_map(await api.post('/trips/$tripId/arrived', _position(at, farReason))));

  static Json _position(LatLng? at, String? farReason) => {
        if (at != null) 'lat': at.latitude,
        if (at != null) 'lng': at.longitude,
        'farReason': ?farReason,
      };

  /// Ride: [otp] is the passenger's code. Parcel: marks picked up (no OTP).
  Future<LiveTripUpdate> start(String tripId, {String? otp}) async =>
      LiveTrips._update(_map(await api.post('/trips/$tripId/start', {'otp': ?otp})));

  /// Ride: ends the trip. Parcel: [otp] is the receiver's delivery code. Far from the drop without [farReason] →
  /// [ApiException.tooFar] (the OTP is validated first).
  Future<LiveTripUpdate> complete(String tripId, {String? otp, LatLng? at, String? farReason}) async =>
      LiveTrips._update(_map(await api.post('/trips/$tripId/complete', {'otp': ?otp, ..._position(at, farReason)})));

  /// After the trip: "Received cash" / "Received on UPI" (D-19 / D-22b), shown on the rider's receipt and in earnings.
  /// Sending it again is harmless; a later answer corrects an earlier one.
  Future<void> recordPayment(String tripId, PaymentMode mode) => api.post('/trips/$tripId/payment', {'mode': enumToApi(mode)}, true);

  /// Cancels with a reason [code] (D-16) and an optional [note].
  Future<LiveTripUpdate> cancel(String tripId, {CancelCode code = CancelCode.other, String? note}) async =>
      LiveTrips._update(_map(await api.post('/trips/$tripId/cancel', {'code': code.api, 'note': ?note})));

  /// The job this driver is on (restores the app after a restart), or null.
  Future<LiveTripUpdate?> active() async {
    final res = await api.get('/trips/active');
    if (res == null) return null;
    final update = LiveTrips._update(_map(res));
    unawaited(realtime.joinTrip(update.trip.id));
    return update;
  }

  /// GPS fix over the socket (no HTTP request per fix).
  void sendLocation(DriverFix fix) => realtime.sendLocation(fix.toJson());

  /// Fixes buffered while the socket was down, over the socket once it is back. True when the server took them.
  Future<bool> sendBufferedLocations(List<DriverFix> fixes) => realtime.sendLocations([for (final f in fixes) f.toJson()]);

  /// The same over HTTP (socket still down, but requests get through). Throws when the upload failed.
  Future<void> uploadLocations(List<DriverFix> fixes) => api.post('/drivers/me/locations', {
        'fixes': [for (final f in fixes) f.toJson()],
      });

  /// Keeps the dispatch index fresh when the socket is down.
  Future<void> heartbeat(DriverFix fix) => api.post('/drivers/me/location', fix.toJson());

  Stream<ChatMessage> messages(String tripId) =>
      realtime.on('trip.message').where((j) => j['tripId'] == tripId).map((j) => chatFromJson(j, iAmDriver: true));

  Future<List<ChatMessage>> chatHistory(String tripId) async =>
      [for (final m in (await api.get('/trips/$tripId/messages') as List)) chatFromJson(_map(m), iAmDriver: true)];

  Future<ChatMessage> sendMessage(String tripId, String text) async =>
      chatFromJson(_map(await api.post('/trips/$tripId/messages', {'text': text})), iAmDriver: true);

  /// Demand hotspots (res-7 hexes with busy res-8 hexes inside) and the service-area outline, for the map.
  Future<DemandMap> demandMap() async => DemandMap.fromJson(_map(await api.get('/demand/hotspots')));

  static LiveOffer _offer(Json j) => LiveOffer(rideRequestFromOffer(j), (j['expiresInSeconds'] as num?)?.toInt() ?? 15);
}

/// Merges streams (small local helper; avoids a dependency on package:async).
Stream<T> _merge<T>(List<Stream<T>> streams) {
  late StreamController<T> controller;
  final subs = <StreamSubscription<T>>[];
  controller = StreamController<T>(
    onListen: () {
      for (final s in streams) {
        subs.add(s.listen(controller.add, onError: controller.addError));
      }
    },
    onCancel: () async {
      for (final s in subs) {
        await s.cancel();
      }
    },
  );
  return controller.stream;
}

/// [RoadRouter.backend] over `POST /maps/route`: two-wheeler routing for bike legs, Google only on the server.
/// Returns null when the server only has an estimate (the map then draws the curved stand-in).
BackendRouter backendRouter(ApiClient api) => (from, to, mode) async {
      final res = _map(await api.post('/maps/route', {
        'from': {'lat': from.latitude, 'lng': from.longitude},
        'to': {'lat': to.latitude, 'lng': to.longitude},
        if (mode == RouteTravelMode.twoWheeler) 'vehicleKind': 'BIKE',
      }, true));
      if (res['source'] != 'google') return null;
      return [
        for (final p in (res['points'] as List? ?? const []))
          LatLng(((p as Map)['lat'] as num).toDouble(), (p['lng'] as num).toDouble()),
      ];
    };
