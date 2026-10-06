import 'dart:math' as math;

import 'package:latlong2/latlong.dart';

import '../goods_modes.dart';
import '../pricing.dart';
import '../models/driver.dart';
import '../models/people.dart';
import '../models/place.dart';
import '../models/trip.dart';
import '../models/vehicle.dart';
import '../repositories/repositories.dart';
import '../ride_modes.dart';
import '../seed.dart';
import 'api_client.dart';
import 'api_mappers.dart';
import 'service_cities.dart';

List<Json> _list(dynamic body) => [for (final e in (body as List? ?? const [])) (e as Map).cast<String, dynamic>()];
Json _map(dynamic body) => (body as Map).cast<String, dynamic>();

/// Phone + OTP sign-in and the passenger profile (`/auth`, `/me`).
class ApiAuthRepository implements AuthRepository {
  ApiAuthRepository(this.api);
  final ApiClient api;

  @override
  bool get hasSeenOnboarding => api.session.hasSeenOnboarding;
  @override
  bool get isLoggedIn => api.session.isLoggedIn;
  @override
  void markOnboardingSeen() => api.session.markOnboardingSeen();

  @override
  Future<void> sendOtp(String phone) => api.post('/auth/otp', {'phone': apiPhone(phone)});

  /// `app: 'passenger'`: the API signs this phone in as a rider (the same phone can also be a driver).
  @override
  Future<OtpResult> verifyOtp(String phone, String otp) async {
    try {
      final res = _map(await api.post('/auth/verify', {'phone': apiPhone(phone), 'code': otp, 'app': 'passenger'}));
      await api.session.save(token: res['accessToken'] as String, driverId: res['driverId'] as String?);
      return res['isNewUser'] == true ? OtpResult.newUser : OtpResult.existingUser;
    } on ApiException catch (e) {
      if (e.status == 400 || e.status == 401) return OtpResult.incorrect;
      rethrow;
    }
  }

  @override
  Future<void> logout() => api.session.clear();

  /// `DELETE /me` (204), then signs out. A 409 (an unfinished trip) keeps the account and says why.
  @override
  Future<void> deleteAccount() async {
    await api.delete('/me');
    await api.session.clear();
  }

  @override
  Future<PassengerProfile> profile() async =>
      passengerFromJson(_map(await api.get('/me')));

  /// Saves the profile fields, then syncs emergency contacts and saved places by difference.
  @override
  Future<PassengerProfile> updateProfile(PassengerProfile profile) async {
    final current = await this.profile();
    await api.patch('/me', {
      if (!(current.name.trim().isEmpty && profile.name == 'Rider'))
        'name': profile.name,
      'email': profile.email.trim().isEmpty ? null : profile.email.trim(),
      'gender': enumToApi(profile.gender),
      'preferWomenDriver': profile.preferWomenDriver,
      'autoShareTrips': profile.autoShareTrips,
    });
    final keepContacts = {for (final c in profile.emergencyContacts) c.id};
    for (final c in current.emergencyContacts.where(
      (c) => !keepContacts.contains(c.id),
    )) {
      await api.delete('/me/emergency-contacts/${c.id}');
    }
    final known = {for (final c in current.emergencyContacts) c.id};
    for (final c in profile.emergencyContacts.where(
      (c) => !known.contains(c.id),
    )) {
      await api.post('/me/emergency-contacts', {
        'name': c.name,
        'relation': c.relation,
        'phone': apiPhone(c.phone),
      });
    }
    return this.profile();
  }
}

/// Search (Google Places through the API, seeded places as fallback), saved places and reverse geocoding.
class ApiPlacesRepository implements PlacesRepository {
  ApiPlacesRepository(this.api);
  final ApiClient api;

  /// Last known device location (set by the apps when the GPS answers); until then [kUnknownPickupId] at the first
  /// service city's centre, which the apps show as "Choose your pickup" and never book from.
  Place? _current;
  String _session = _newSession();
  final Map<String, bool> _serviceArea = {};

  static String _newSession() {
    final r = math.Random.secure();
    return List.generate(32, (_) => r.nextInt(16).toRadixString(16)).join();
  }

  @override
  Place get currentLocation =>
      _current ?? Place(id: kUnknownPickupId, name: 'Choose your pickup', address: '', location: CityDefaults.center);

  /// Remembers the device location (used as the default pickup).
  set currentLocation(Place place) => _current = place;

  /// Empty: recent drops (none for an outstation search). Under [kMinPlaceQuery] characters: nothing, without asking
  /// the API (Google autocomplete is billed per request, and the server answers [] below that anyway).
  @override
  Future<List<Place>> search(String query, {LatLng? origin, bool anywhere = false}) async {
    final q = query.trim();
    if (q.isEmpty) return anywhere ? const [] : recentDestinations();
    if (q.length < kMinPlaceQuery) return const [];
    // The same session token for every keystroke until [resolve]; the pickup as origin adds each distance.
    final res = _map(await api.get('/places/autocomplete', query: {
      'q': q,
      'session': _session,
      if (origin != null) 'lat': origin.latitude.toStringAsFixed(5),
      if (origin != null) 'lng': origin.longitude.toStringAsFixed(5),
      if (anywhere) 'scope': 'outstation',
    }));
    return [for (final r in _list(res['results'])) suggestionFromJson(r)];
  }

  @override
  Future<Place> resolve(Place place) async {
    if (!place.id.startsWith(kApiPlacePrefix)) return place;
    final id = place.id.substring(kApiPlacePrefix.length);
    final res = await api.get('/places/details/${Uri.encodeComponent(id)}', query: {'session': _session});
    _session = _newSession(); // Place Details ends the autocomplete session (one billable session).
    // The API answered: the place is gone from Google (not a connection problem).
    if (res == null) throw const ApiException(404, "That place isn't listed any more. Search again or set it on the map.");
    final json = _map(res);
    final resolved = resolvedPlaceFromJson(json);
    if (json['isInServiceArea'] is bool) _serviceArea[_key(resolved.location)] = json['isInServiceArea'] as bool;
    return resolved.copyWith(name: place.name.isNotEmpty ? place.name : resolved.name);
  }

  /// Recent drops from the trip history (unique), newest first.
  @override
  Future<List<Place>> recentDestinations() async {
    final trips = _list(await api.get('/trips')).map(tripFromJson);
    final seen = <String>{};
    return [
      for (final t in trips)
        if (seen.add(t.drop.name)) t.drop.copyWith(id: 'recent-${t.id}'),
    ].take(6).toList();
  }

  @override
  Future<List<SavedPlace>> savedPlaces() async {
    final me = _map(await api.get('/me'));
    return [for (final p in _list(me['savedPlaces'])) savedPlaceFromJson(p)];
  }

  /// Adds, or replaces (add, then delete the old one) when [place] already has a server id, so a place the API
  /// rejects leaves the old one in place.
  @override
  Future<List<SavedPlace>> saveSavedPlace(SavedPlace place) async {
    final existing = await savedPlaces();
    await api.post('/me/saved-places', savedPlaceToJson(place));
    if (existing.any((p) => p.id == place.id)) await api.delete('/me/saved-places/${place.id}');
    return savedPlaces();
  }

  @override
  Future<List<SavedPlace>> removeSavedPlace(String id) async {
    await api.delete('/me/saved-places/$id');
    return savedPlaces();
  }

  @override
  Future<Place> reverseGeocode(LatLng point) async {
    final res = _map(await api.get('/places/reverse', query: {'lat': point.latitude, 'lng': point.longitude}));
    _serviceArea[_key(point)] = res['isInServiceArea'] == true;
    final place = res['place'];
    // Keep the exact pin: the API may return the nearest known place's name.
    return place == null
        ? Place(id: 'pin-${_key(point)}', name: 'Pinned location', address: '', location: point)
        : resolvedPlaceFromJson(_map(place)).copyWith(id: 'pin-${_key(point)}', location: point);
  }

  /// The API's answer for [point] (from a reverse geocode or a resolved search result); true while unknown, since
  /// booking is checked again by the API. No city or radius is built in.
  @override
  bool isInServiceArea(LatLng point) => _serviceArea[_key(point)] ?? true;

  static String _key(LatLng p) => '${p.latitude.toStringAsFixed(4)},${p.longitude.toStringAsFixed(4)}';
}

/// Ride quotes and trip history. Booking and live trips go through [LiveTrips].
class ApiRideRepository implements RideRepository {
  ApiRideRepository(this.api);
  final ApiClient api;

  @override
  List<VehicleType> get rideVehicles => Seed.rideVehicles;

  @override
  Future<List<FareQuote>> quotes(Place from, Place to, {bool womenOnly = false}) =>
      _quotes(api, from, to, 'RIDE', womenOnly: womenOnly);

  /// Not used with the live API: dispatch assigns a driver and pushes `trip.updated`.
  @override
  Future<DriverProfile?> findDriver(VehicleKind kind) async => null;

  /// `POST /fares/quote` with the rental / outstation fields: the cab tiers with their terms.
  @override
  Future<List<FareQuote>> modeQuotes(Place pickup, Place? drop, ModeRequest request) async {
    final res = _map(await api.post('/fares/quote', {
      'pickup': pointJson(pickup),
      if (drop != null && request.mode != RideMode.rental) 'drop': pointJson(drop),
      ...request.toJson(),
    }));
    return quotesFromJson(res['quotes']);
  }

  /// `GET /trips/upcoming`.
  @override
  Future<List<Trip>> upcomingTrips() async => _list(await api.get('/trips/upcoming')).map(tripFromJson).toList();

  /// `GET /fares/rates?lat&lng`.
  @override
  Future<ModePricing> modePricing(LatLng at) async {
    final res = _map(await api.get('/fares/rates', query: {
      'lat': at.latitude.toStringAsFixed(5),
      'lng': at.longitude.toStringAsFixed(5),
    }));
    return ModePricing.fromJson(res['pricing']);
  }

  /// `GET /places/outstation-destinations`.
  @override
  Future<List<Place>> outstationDestinations(LatLng at) async {
    final res = _map(await api.get('/places/outstation-destinations', query: {
      'lat': at.latitude.toStringAsFixed(5),
      'lng': at.longitude.toStringAsFixed(5),
    }));
    return [
      for (final d in _list(res['destinations']))
        Place(
          id: 'os-${d['name']}',
          name: '${d['name']}',
          address: '${d['address'] ?? ''}',
          location: LatLng((d['lat'] as num).toDouble(), (d['lng'] as num).toDouble()),
          distanceKm: (d['distanceKm'] as num?)?.toDouble(),
        ),
    ];
  }

  /// `GET /drivers/nearby` (signed-in riders).
  @override
  Future<List<NearbyVehicle>> nearbyVehicles(LatLng at, {bool parcels = false}) async {
    final res = _map(await api.get('/drivers/nearby', query: {
      'lat': at.latitude.toStringAsFixed(5),
      'lng': at.longitude.toStringAsFixed(5),
      if (parcels) 'trip': 'PARCEL',
    }));
    return [
      for (final v in _list(res['vehicles']))
        if (knownVehicleKind(v['vehicleKind'] ?? v['kind']) case final kind?)
          NearbyVehicle(
            id: v['id'] is String ? v['id'] as String : null,
            kind: kind,
            position: LatLng((v['lat'] as num).toDouble(), (v['lng'] as num).toDouble()),
            heading: (v['heading'] as num?)?.toDouble(),
          ),
    ];
  }

  @override
  Future<List<Trip>> history() async => _list(await api.get('/trips')).map(tripFromJson).toList();

  @override
  Future<Trip?> tripById(String id) async {
    try {
      return tripFromJson(_map(await api.get('/trips/$id')));
    } on ApiException catch (e) {
      if (e.status == 404) return null;
      rethrow;
    }
  }

  /// The API records trips itself.
  @override
  Future<void> addTrip(Trip trip) async {}

  @override
  List<ChatMessage> chatSeed() => const [];

  @override
  List<String> get quickReplies => Seed.quickReplies;
}

Future<List<FareQuote>> _quotes(ApiClient api, Place from, Place to, String kind, {bool womenOnly = false}) async {
  final res = _map(await api.post(
      '/fares/quote', {'pickup': pointJson(from), 'drop': pointJson(to), 'kind': kind, if (womenOnly) 'womenOnly': true}, true));
  return quotesFromJson(res['quotes']);
}

class ApiParcelRepository implements ParcelRepository {
  ApiParcelRepository(this.api);
  final ApiClient api;

  @override
  List<VehicleType> get goodsVehicles => Seed.goodsVehicles;

  @override
  Future<List<FareQuote>> quotes(Place from, Place to, {bool outstation = false}) async {
    if (!outstation) return _quotes(api, from, to, 'PARCEL');
    final res = _map(await api.post(
        '/fares/quote', {'pickup': pointJson(from), 'drop': pointJson(to), 'kind': 'PARCEL', 'rideMode': 'OUTSTATION'}, true));
    return quotesFromJson(res['quotes']);
  }

  /// `POST /fares/shifting-quote`.
  @override
  Future<ShiftingQuote> shiftingQuote(Place from, Place to, ShiftingDetails d, {VehicleKind? vehicle, required DateTime at}) async =>
      shiftingQuoteFromJson(_map(await api.post(
          '/fares/shifting-quote',
          {
            'pickup': pointJson(from),
            'drop': pointJson(to),
            'shifting': d.toJson(withItems: false),
            if (vehicle != null) 'vehicleKind': enumToApi(vehicle),
            'at': at.toUtc().toIso8601String(),
          },
          true)));

  @override
  Future<List<Trip>> recentParcels() async =>
      _list(await api.get('/trips')).map(tripFromJson).where((t) => t.isParcel).toList();
}

/// The signed-in driver: sign-up, profile, KYC uploads and earnings. Requests and jobs go through [LiveJobs].
class ApiDriverRepository implements DriverRepository {
  ApiDriverRepository(this.api);
  final ApiClient api;

  /// Signed in with a driver account (a phone that hasn't finished sign-up has a token but no driver id).
  @override
  bool get isLoggedIn => api.session.isLoggedIn && (api.session.driverId ?? '').isNotEmpty;

  @override
  Future<void> sendOtp(String phone) => api.post('/auth/otp', {'phone': apiPhone(phone)});

  /// existingUser = already a driver; newUser = continue to sign-up (the token is kept for [register]). Sent with
  /// `app: 'driver'`, so the API checks the driver account (blocked drivers, the driver id in the token).
  @override
  Future<OtpResult> verifyOtp(String phone, String otp) async {
    try {
      final res = _map(await api.post('/auth/verify', {'phone': apiPhone(phone), 'code': otp, 'app': 'driver'}));
      final driverId = res['driverId'] as String?;
      await api.session.save(token: res['accessToken'] as String, driverId: driverId);
      return driverId == null ? OtpResult.newUser : OtpResult.existingUser;
    } on ApiException catch (e) {
      if (e.status == 400 || e.status == 401) return OtpResult.incorrect;
      rethrow;
    }
  }

  /// Tells dispatch the driver is offline (one call, at most 5 s), then ends the session on the phone. Signing out
  /// works offline too: dispatch also drops drivers whose heartbeat stops.
  @override
  Future<void> logout() async {
    try {
      if (isLoggedIn) await api.post('/drivers/me/offline').timeout(const Duration(seconds: 5));
    } on Exception {
      // Offline, slow or refused: sign out anyway.
    }
    await api.session.clear();
  }

  @override
  Future<DriverProfile> profile() async =>
      driverFromJson(_map(await api.get('/drivers/me')));

  @override
  Future<DriverProfile> updateProfile(DriverProfile profile) async =>
      driverFromJson(
        _map(
          await api.patch('/drivers/me', {
            'name': profile.name,
            'gender': enumToApi(profile.gender),
            'vehicleModel': profile.vehicleModel,
            'vehicleColor': profile.vehicleColor,
            'plate': profile.plate,
            'upiId': profile.upiId,
          }),
        ),
      );

  @override
  Future<DriverProfile> register(
    DriverProfile profile,
    WorkType workType,
  ) async {
    final res = _map(
      await api.post('/drivers', {
        'name': profile.name,
        'gender': enumToApi(profile.gender),
        'workType': enumToApi(workType),
        'vehicleKind': enumToApi(profile.vehicleKind),
        'vehicleModel': profile.vehicleModel,
        'vehicleColor': profile.vehicleColor,
        'plate': profile.plate,
        'upiId': profile.upiId,
      }),
    );
    // 201 for a new driver; 200 with the same driver and a fresh token when the first answer was lost and the
    // driver sent it again. Either way the session is stored.
    final driver = res['driver'] is Map ? _map(res['driver']) : res;
    final token = res['accessToken'];
    final id = driver['id'];
    if (token is! String || id is! String) {
      throw const ApiException(500, 'Something went wrong. Please try again.');
    }
    await api.session.save(token: token, driverId: id);
    return this.profile();
  }

  @override
  Future<List<KycDocument>> kycDocuments() async =>
      _list(await api.get('/drivers/me/documents'))
          .where(
            (j) =>
                KycDocType.values.any((type) => enumToApi(type) == j['type']),
          )
          .map(kycFromJson)
          .toList();

  /// Only an admin changes review status with the live API; this just reloads the list.
  @override
  Future<List<KycDocument>> setKycStatus(
    KycDocType type,
    KycStatus status, {
    String? reason,
  }) => kycDocuments();

  @override
  Future<List<KycDocument>> uploadKyc(
    KycDocType type,
    List<int> bytes,
    String filename,
  ) async {
    await api.upload(
      '/drivers/me/documents/${enumToApi(type)}',
      field: 'file',
      bytes: bytes,
      filename: filename,
    );
    return kycDocuments();
  }

  @override
  Future<bool> uploadProfilePhoto(List<int> bytes, String filename) async =>
      _map(
        await api.upload(
          '/drivers/me/photo',
          field: 'file',
          bytes: bytes,
          filename: filename,
        ),
      )['status'] ==
      'APPROVED';

  @override
  Future<bool> checkApplication() async {
    final me = _map(await api.get('/drivers/me'));
    if (me['status'] is String) {
      await api.session.saveDriverStatus(me['status'] as String);
    }
    return switch (me['status']) {
      'APPROVED' => true,
      'REJECTED' => false,
      'ON_HOLD' => throw const AccountOnHoldException(),
      _ => throw const StillUnderReviewException(),
    };
  }

  @override
  Future<EarningsSummary> earnings(EarningsPeriod period) async =>
      earningsFromJson(_map(await api.get('/drivers/me/earnings', query: {'period': period.name})));

  /// The API records completed jobs itself.
  @override
  Future<void> recordCompletedJob(EarningsTrip trip) async {}

  /// Not used with the live API: offers arrive as `trip.offer` (see [LiveJobs]).
  @override
  RideRequest nextRequest(WorkType workType) => throw UnsupportedError('Requests come from dispatch');

  @override
  Future<EmergencyContact> emergencyContact() async {
    final me = _map(await api.get('/me'));
    final contacts = _list(me['emergencyContacts']);
    return contacts.isEmpty
        ? const EmergencyContact(id: '', name: '', relation: '', phone: '')
        : contactFromJson(contacts.first);
  }

  /// Drivers keep one contact: replaces the current one. The new one is added first, so a number the API rejects
  /// leaves the old contact in place.
  @override
  Future<void> updateEmergencyContact(EmergencyContact contact) async {
    final me = _map(await api.get('/me'));
    final old = _list(me['emergencyContacts']);
    await api.post('/me/emergency-contacts', {'name': contact.name, 'relation': contact.relation, 'phone': apiPhone(contact.phone)});
    for (final c in old) {
      await api.delete('/me/emergency-contacts/${c['id']}');
    }
  }
}

/// Plans and (simulated) UPI Autopay (`/plans`, `/subscriptions`).
class ApiSubscriptionRepository implements SubscriptionRepository {
  ApiSubscriptionRepository(this.api);
  final ApiClient api;

  @override
  Future<SubscriptionPlan> plan() async {
    final res = await api.get('/subscriptions/me');
    if (res == null) throw const ApiException(404, 'No plan yet');
    return planFromJson(_map(res));
  }

  @override
  Future<List<PaymentRecord>> payments() async {
    final paid = _list(await api.get('/subscriptions/me/payments')).map(paymentFromJson).toList();
    final current = await api.get('/subscriptions/me');
    if (current is Map && current['status'] == 'TRIAL') {
      final trial = planFromJson(current.cast());
      paid.add(PaymentRecord(label: 'Free trial', amount: 0, status: PaymentRecordStatus.freeTrial, date: trial.startedAt));
    }
    return paid;
  }

  /// Only pause / resume / cancel can be set by the driver; other statuses come from the API.
  @override
  Future<SubscriptionPlan> setStatus(PlanStatus status) => switch (status) {
    PlanStatus.paused => pause(),
    PlanStatus.cancelled => cancel(),
    PlanStatus.active => resume(),
    _ => plan(),
  };

  @override
  Future<SubscriptionPlan> setupAutopay(String upiApp) async => planFromJson(
    _map(await api.post('/subscriptions/me/autopay', {'upiApp': upiApp})),
  );

  /// Buys the monthly plan for the driver's vehicle (extends from the current end date).
  @override
  Future<SubscriptionPlan> payNow(String upiApp) async {
    final current = await plan();
    final plans = _list(
      await api.get(
        '/plans',
        query: {'vehicleKind': enumToApi(current.vehicle)},
      ),
    );
    if (plans.isEmpty) {
      throw const ApiException(409, 'No plans are available for this vehicle');
    }
    final monthly = plans.firstWhere(
      (p) => p['period'] == 'MONTHLY',
      orElse: () => plans.first,
    );
    try {
      return planFromJson(
        _map(
          await api.post('/subscriptions', {
            'planId': monthly['id'],
            'upiApp': upiApp,
          }),
        ),
      );
    } on ApiException {
      throw PaymentFailedException(_intOf(monthly['price']));
    }
  }

  @override
  Future<SubscriptionPlan> pause() async =>
      planFromJson(_map(await api.post('/subscriptions/me/pause')));
  @override
  Future<SubscriptionPlan> resume() async =>
      planFromJson(_map(await api.post('/subscriptions/me/resume')));
  @override
  Future<SubscriptionPlan> cancel() async =>
      planFromJson(_map(await api.post('/subscriptions/me/cancel')));

  /// Plans are priced per vehicle and the vehicle is fixed at sign-up; support changes it after checking the RC.
  @override
  Future<SubscriptionPlan> changePlanVehicle(VehicleKind vehicle) async =>
      throw const ApiException(
        400,
        'To change your vehicle, raise a "Documents / KYC" ticket in Help',
      );

  static int _intOf(Object? v) => v is num ? v.round() : 0;
}

class ApiSupportRepository implements SupportRepository {
  @override
  Future<void> uploadAttachment(
    String ticketId,
    List<int> bytes,
    String filename,
  ) async {
    await api.upload(
      '/tickets/$ticketId/attachment',
      field: 'file',
      bytes: bytes,
      filename: filename,
    );
  }

  ApiSupportRepository(this.api);
  final ApiClient api;

  @override
  List<String> topics({required bool driver}) =>
      driver ? Seed.driverHelpTopics : Seed.helpTopics;

  @override
  Future<List<SupportTicket>> tickets() async =>
      _list(await api.get('/tickets')).map(ticketFromJson).toList();

  @override
  Future<SupportTicket> raiseTicket({
    required String topic,
    required String description,
    String? tripId,
  }) async => ticketFromJson(
    _map(
      await api.post('/tickets', {
        'topic': topic,
        'description': description,
        'tripId': ?tripId,
      }),
    ),
  );
}
