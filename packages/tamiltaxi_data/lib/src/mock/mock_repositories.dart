import 'dart:math' as math;

import 'package:latlong2/latlong.dart';

import '../demo_settings.dart';
import '../fare_engine.dart';
import '../goods_modes.dart';
import '../pricing.dart';
import '../maps/google_maps_config.dart';
import '../maps/google_places_client.dart';
import '../models/driver.dart';
import '../models/people.dart';
import '../models/place.dart';
import '../models/trip.dart';
import '../models/vehicle.dart';
import '../repositories/repositories.dart';
import '../ride_modes.dart';
import '../seed.dart';
import '../simulation/trip_simulator.dart';
import 'mock_database.dart';

typedef SettingsReader = DemoSettings Function();

/// Shared latency: 300–800 ms so loading states are visible; 3 s with "Slow loading".
mixin _Latency {
  SettingsReader get settings;
  static final _rng = math.Random(7);

  Future<void> delay({bool network = true}) async {
    final s = settings();
    if (network && s.offline) {
      await Future<void>.delayed(const Duration(milliseconds: 300));
      throw const OfflineException();
    }
    final ms = s.slowLoading ? 3000 : 300 + _rng.nextInt(500);
    await Future<void>.delayed(Duration(milliseconds: s.fastMode ? ms ~/ 3 : ms));
  }
}

class MockAuthRepository with _Latency implements AuthRepository {
  MockAuthRepository(this.db, this.settings);
  final MockDatabase db;
  @override
  final SettingsReader settings;

  @override
  bool get hasSeenOnboarding => db.hasSeenOnboarding;
  @override
  bool get isLoggedIn => db.passengerLoggedIn;
  @override
  void markOnboardingSeen() => db.hasSeenOnboarding = true;

  @override
  Future<void> sendOtp(String phone) => delay();

  @override
  Future<OtpResult> verifyOtp(String phone, String otp) async {
    await delay();
    if (otp.length != 6 || otp == Seed.badLoginOtp) return OtpResult.incorrect;
    final isNew = db.passengerIsNew;
    db.passengerLoggedIn = true;
    db.passengerIsNew = false;
    return isNew ? OtpResult.newUser : OtpResult.existingUser;
  }

  @override
  Future<void> logout() async {
    await delay(network: false);
    db.passengerLoggedIn = false;
  }

  /// Seed data: signs out (nothing to delete).
  @override
  Future<void> deleteAccount() => logout();

  @override
  Future<PassengerProfile> profile() async {
    await delay(network: false);
    return db.passenger;
  }

  @override
  Future<PassengerProfile> updateProfile(PassengerProfile profile) async {
    await delay(network: false);
    return db.passenger = profile;
  }
}

/// Seed places, upgraded to Google Places autocomplete / details and Geocoding when a key is
/// configured ([isGoogleMapsEnabled]). Any Google error (offline, quota, bad key) falls back to
/// the seed data, so the demo never breaks.
class MockPlacesRepository with _Latency implements PlacesRepository {
  MockPlacesRepository(this.db, this.settings, {GooglePlacesClient? google}) : _google = google;
  final MockDatabase db;
  @override
  final SettingsReader settings;
  final GooglePlacesClient? _google;

  GooglePlacesClient? get _client => isGoogleMapsEnabled ? (_google ?? GooglePlacesClient.shared) : null;

  @override
  Place get currentLocation => settings().outsideServiceArea ? Seed.outsideArea : Seed.gandhipuram;

  @override
  Future<List<Place>> search(String query, {LatLng? origin, bool anywhere = false}) async {
    final q = query.trim().toLowerCase();
    if (anywhere) {
      await delay();
      final all = [...Seed.outstationTowns, ...Seed.places.where((p) => p.id != 'gandhipuram')];
      return q.isEmpty ? Seed.outstationTowns : all.where((p) => p.name.toLowerCase().contains(q) || p.address.toLowerCase().contains(q)).toList();
    }
    final google = _client;
    final useGoogle = google != null && q.length >= GooglePlacesClient.minQueryLength;
    // A real network call has its own latency; the fake one is only for seed results.
    if (useGoogle && settings().offline) throw const OfflineException();
    if (!useGoogle) await delay();
    if (q.isEmpty) return Seed.places.where((p) => p.id != 'gandhipuram').take(6).toList();
    final seed = Seed.places
        .where((p) => p.name.toLowerCase().contains(q) || p.address.toLowerCase().contains(q))
        .toList();
    if (useGoogle) {
      try {
        final results = await google.autocomplete(query);
        if (results.isNotEmpty) return results;
      } catch (_) {
        // Fall back to the seed matches below.
      }
    }
    return seed;
  }

  @override
  Future<Place> resolve(Place place) async {
    if (!place.id.startsWith(GooglePlacesClient.idPrefix)) return place;
    final google = _client;
    if (google == null) throw const OfflineException();
    try {
      final details = await google.placeDetails(place.id.substring(GooglePlacesClient.idPrefix.length));
      // Keep the suggestion's name: Details only returns Essentials fields.
      return details.copyWith(name: place.name.isNotEmpty ? place.name : details.name);
    } catch (_) {
      throw const OfflineException();
    }
  }

  @override
  Future<List<Place>> recentDestinations() async {
    await delay();
    return Seed.recentDestinations;
  }

  @override
  Future<List<SavedPlace>> savedPlaces() async {
    await delay(network: false);
    return db.passenger.savedPlaces;
  }

  @override
  Future<List<SavedPlace>> saveSavedPlace(SavedPlace place) async {
    await delay(network: false);
    final list = [...db.passenger.savedPlaces];
    final i = list.indexWhere((p) => p.id == place.id);
    i >= 0 ? list[i] = place : list.add(place);
    db.passenger = db.passenger.copyWith(savedPlaces: list);
    return list;
  }

  @override
  Future<List<SavedPlace>> removeSavedPlace(String id) async {
    await delay(network: false);
    final list = db.passenger.savedPlaces.where((p) => p.id != id).toList();
    db.passenger = db.passenger.copyWith(savedPlaces: list);
    return list;
  }

  @override
  Future<Place> reverseGeocode(LatLng point) async {
    await Future<void>.delayed(const Duration(milliseconds: 250));
    if (!isInServiceArea(point)) return Seed.outsideArea.copyWith(location: point);
    final google = _client;
    if (google != null && !settings().offline) {
      try {
        final place = await google.reverseGeocode(point);
        if (place != null) return place;
      } catch (_) {
        // Fall back to the nearest seed place.
      }
    }
    const d = Distance();
    final nearest = Seed.places.reduce((a, b) => d(a.location, point) <= d(b.location, point) ? a : b);
    return nearest.copyWith(location: point);
  }

  @override
  bool isInServiceArea(LatLng point) =>
      const Distance().as(LengthUnit.Kilometer, Seed.cityCentre, point) <= Seed.serviceRadiusKm;

  @override
  Future<bool> checkServiceArea(LatLng point) async => isInServiceArea(point);
}

class MockRideRepository with _Latency implements RideRepository {
  MockRideRepository(this.db, this.settings);
  final MockDatabase db;
  @override
  final SettingsReader settings;

  @override
  List<VehicleType> get rideVehicles => Seed.rideVehicles;

  @override
  Future<List<FareQuote>> quotes(Place from, Place to, {bool womenOnly = false}) async {
    await delay();
    return FareEngine.quoteAll(rideVehicles, FareEngine.estimate(from, to));
  }

  @override
  Future<List<FareQuote>> modeQuotes(Place pickup, Place? drop, ModeRequest request) async {
    await delay();
    return RideModeRates.quotesFor(pickup, drop, request);
  }

  @override
  Future<List<Trip>> upcomingTrips() async {
    await delay();
    return [...db.upcoming]..sort((a, b) => (a.scheduledAt ?? a.startedAt).compareTo(b.scheduledAt ?? b.startedAt));
  }

  /// Mock mode: the built-in prices.
  @override
  Future<ModePricing> modePricing(LatLng at) async => ModePricing.defaults;

  @override
  Future<List<Place>> outstationDestinations(LatLng at) async {
    await delay();
    return [
      for (final t in Seed.outstationTowns)
        t.copyWith(distanceKm: (const Distance().as(LengthUnit.Meter, at, t.location) / 100).round() / 10),
    ];
  }

  /// A fixed mix around [at] (same spots every time, so screenshots are stable).
  @override
  Future<List<NearbyVehicle>> nearbyVehicles(LatLng at, {bool parcels = false}) async {
    if (settings().noDrivers) return const [];
    const rides = [
      (VehicleKind.cab, 520.0, 20.0, 15.0),
      (VehicleKind.sedan, 430.0, 320.0, 30.0),
      (VehicleKind.auto, 420.0, 72.0, 110.0),
      (VehicleKind.bike, 330.0, 235.0, 70.0),
      (VehicleKind.scooty, 360.0, 140.0, 120.0),
      (VehicleKind.auto, 610.0, 200.0, 250.0),
      (VehicleKind.bike, 260.0, 300.0, 340.0),
      (VehicleKind.suv, 700.0, 110.0, 200.0),
    ];
    const goods = [
      (VehicleKind.goodsBike, 330.0, 235.0, 70.0),
      (VehicleKind.threeWheeler, 420.0, 72.0, 110.0),
      (VehicleKind.bike, 360.0, 140.0, 120.0),
      (VehicleKind.miniTruck, 560.0, 20.0, 15.0),
      (VehicleKind.pickup, 690.0, 300.0, 210.0),
    ];
    return [
      for (final (kind, metres, bearing, heading) in parcels ? goods : rides)
        NearbyVehicle(kind: kind, position: offsetPoint(at, metres, bearing), heading: heading),
    ];
  }

  @override
  Future<DriverProfile?> findDriver(VehicleKind kind) async {
    if (settings().noDrivers) return null;
    return Seed.driverFor(kind);
  }

  @override
  Future<List<Trip>> history() async {
    await delay();
    if (settings().emptyActivity) return const [];
    final list = [...db.trips]..sort((a, b) => b.startedAt.compareTo(a.startedAt));
    return list;
  }

  @override
  Future<Trip?> tripById(String id) async {
    await delay(network: false);
    for (final t in db.trips) {
      if (t.id == id) return t;
    }
    return null;
  }

  @override
  Future<void> addTrip(Trip trip) async {
    db.trips = [trip, ...db.trips.where((t) => t.id != trip.id)];
  }

  @override
  List<ChatMessage> chatSeed() => Seed.chatSeed();

  @override
  List<String> get quickReplies => Seed.quickReplies;
}

class MockParcelRepository with _Latency implements ParcelRepository {
  MockParcelRepository(this.db, this.settings);
  final MockDatabase db;
  @override
  final SettingsReader settings;

  @override
  List<VehicleType> get goodsVehicles => Seed.goodsVehicles;

  @override
  Future<List<FareQuote>> quotes(Place from, Place to, {bool outstation = false}) async {
    await delay();
    if (outstation) return GoodsModeRates.outstationQuotes(from, to);
    return FareEngine.quoteAll(goodsVehicles, FareEngine.estimate(from, to));
  }

  @override
  Future<ShiftingQuote> shiftingQuote(Place from, Place to, ShiftingDetails d, {VehicleKind? vehicle, required DateTime at}) async {
    await delay();
    return GoodsModeRates.quote(from, to, d, vehicle: vehicle, at: at);
  }

  @override
  Future<List<Trip>> recentParcels() async {
    await delay();
    if (settings().emptyActivity) return const [];
    final list = db.trips.where((t) => t.isParcel).toList()..sort((a, b) => b.startedAt.compareTo(a.startedAt));
    return list;
  }
}

class MockDriverRepository with _Latency implements DriverRepository {
  MockDriverRepository(this.db, this.settings);
  final MockDatabase db;
  @override
  final SettingsReader settings;

  @override
  bool get isLoggedIn => db.driverLoggedIn;

  @override
  Future<void> sendOtp(String phone) => delay();

  @override
  Future<OtpResult> verifyOtp(String phone, String otp) async {
    await delay();
    if (otp.length != 6 || otp == Seed.badLoginOtp) return OtpResult.incorrect;
    db.driverLoggedIn = true;
    return OtpResult.existingUser;
  }

  @override
  Future<void> logout() async {
    await delay(network: false);
    db.driverLoggedIn = false;
  }

  @override
  Future<DriverProfile> profile() async {
    await delay(network: false);
    return db.driver;
  }

  @override
  Future<DriverProfile> updateProfile(DriverProfile profile) async {
    await delay(network: false);
    return db.driver = profile;
  }

  @override
  Future<DriverProfile> register(DriverProfile profile, WorkType workType) => updateProfile(profile);

  @override
  Future<bool> uploadProfilePhoto(List<int> bytes, String filename) async {
    await delay();
    return true;
  }

  @override
  Future<List<KycDocument>> uploadKyc(KycDocType type, List<int> bytes, String filename) =>
      setKycStatus(type, KycStatus.underReview);

  @override
  Future<List<KycDocument>> kycDocuments() async {
    await delay(network: false);
    return db.kyc;
  }

  @override
  Future<List<KycDocument>> setKycStatus(KycDocType type, KycStatus status, {String? reason}) async {
    db.kyc = [
      for (final d in db.kyc)
        if (d.type == type) KycDocument(type: type, status: status, rejectReason: reason) else d,
    ];
    return db.kyc;
  }

  @override
  Future<bool> checkApplication() async {
    await delay();
    if (settings().rejectKyc) {
      await setKycStatus(KycDocType.vehicleRc, KycStatus.rejected, reason: Seed.kycRejectReason);
      return false;
    }
    db.kyc = List.of(Seed.kycAllVerified);
    return true;
  }

  @override
  Future<EarningsSummary> earnings(EarningsPeriod period) async {
    await delay();
    if (settings().emptyEarnings) {
      return const EarningsSummary(
          total: 0, rides: 0, onlineHours: 0, rating: 4.8, bars: [], trips: [], commissionSaved: 0);
    }
    // Commission saved ≈ 30% of fares on a commission app.
    int saved(int total) => (total * 0.3 / 10).round() * 10;
    switch (period) {
      case EarningsPeriod.today:
        final hours = ['9 AM', '11 AM', '1 PM', '3 PM', '5 PM', '7 PM'];
        final split = [180, 260, 240, 320, 250, 170];
        final extra = db.todayEarnings - Seed.todayEarnings;
        return EarningsSummary(
          total: db.todayEarnings,
          rides: db.todayRides,
          onlineHours: 6,
          rating: db.driver.rating,
          bars: [
            for (var i = 0; i < hours.length; i++)
              EarningsDay(label: hours[i], amount: split[i] + (i == 3 ? extra : 0)),
          ],
          trips: db.todayTrips,
          commissionSaved: saved(db.todayEarnings),
        );
      case EarningsPeriod.week:
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        final total = Seed.weekEarnings.fold<int>(0, (a, b) => a + b);
        return EarningsSummary(
          total: total,
          rides: Seed.weekRides,
          onlineHours: Seed.weekOnlineHours,
          rating: db.driver.rating,
          bars: [for (var i = 0; i < 7; i++) EarningsDay(label: days[i], amount: Seed.weekEarnings[i])],
          trips: db.todayTrips,
          commissionSaved: 2680,
        );
      case EarningsPeriod.month:
        const weeks = [8120, 9460, 8940, 9180];
        return EarningsSummary(
          total: weeks.fold<int>(0, (a, b) => a + b),
          rides: 352,
          onlineHours: 171,
          rating: db.driver.rating,
          bars: [for (var i = 0; i < 4; i++) EarningsDay(label: 'W${i + 1}', amount: weeks[i])],
          trips: db.todayTrips,
          commissionSaved: 10710,
        );
    }
  }

  @override
  Future<void> recordCompletedJob(EarningsTrip trip) async {
    db.todayEarnings += trip.fare;
    db.todayRides += 1;
    db.todayTrips = [trip, ...db.todayTrips];
  }

  @override
  RideRequest nextRequest(WorkType workType) {
    db.requestCounter++;
    final base = workType == WorkType.rides ? Seed.rideRequest : Seed.deliveryRequest;
    return base.copyWith(id: '${base.id}-${db.requestCounter}');
  }

  @override
  Future<EmergencyContact> emergencyContact() async {
    await delay(network: false);
    return db.driverEmergencyContact;
  }

  @override
  Future<void> updateEmergencyContact(EmergencyContact contact) async {
    await delay(network: false);
    db.driverEmergencyContact = contact;
  }
}

class MockSubscriptionRepository with _Latency implements SubscriptionRepository {
  MockSubscriptionRepository(this.db, this.settings, {this.onPaymentAttempt});
  final MockDatabase db;
  @override
  final SettingsReader settings;

  /// Called after each payment so the "Fail next payment" switch can turn itself off.
  final void Function()? onPaymentAttempt;

  @override
  Future<SubscriptionPlan> plan() async {
    await delay(network: false);
    return db.plan;
  }

  @override
  Future<List<PaymentRecord>> payments() async {
    await delay(network: false);
    return db.payments;
  }

  @override
  Future<SubscriptionPlan> setStatus(PlanStatus status) async {
    return db.plan = db.plan.copyWith(status: status);
  }

  @override
  Future<SubscriptionPlan> setupAutopay(String upiApp) async {
    await delay();
    return db.plan = db.plan.copyWith(upiApp: upiApp);
  }

  @override
  Future<SubscriptionPlan> payNow(String upiApp) async {
    await delay();
    final amount = db.plan.monthlyPrice ?? 0;
    if (settings().failNextPayment) {
      onPaymentAttempt?.call();
      throw PaymentFailedException(amount);
    }
    db.payments = [
      PaymentRecord(label: 'Sep 2026', amount: amount, status: PaymentRecordStatus.paid, date: TtClock.today),
      ...db.payments.where((p) => p.status != PaymentRecordStatus.failed),
    ];
    return db.plan = db.plan.copyWith(status: PlanStatus.active, upiApp: upiApp);
  }

  @override
  Future<SubscriptionPlan> pause() async {
    await delay();
    return db.plan = db.plan.copyWith(status: PlanStatus.paused);
  }

  @override
  Future<SubscriptionPlan> resume() async {
    await delay();
    return db.plan = db.plan.copyWith(status: PlanStatus.active);
  }

  @override
  Future<SubscriptionPlan> cancel() async {
    await delay();
    return db.plan = db.plan.copyWith(status: PlanStatus.cancelled);
  }

  @override
  Future<SubscriptionPlan> changePlanVehicle(VehicleKind vehicle) async {
    return db.plan = db.plan.copyWith(
      vehicle: vehicle,
      monthlyPrice: Seed.vehicle(vehicle).subscriptionPrice,
    );
  }
}

class MockSupportRepository with _Latency implements SupportRepository {
  @override
  Future<void> uploadAttachment(
    String ticketId,
    List<int> bytes,
    String filename,
  ) async {}
  MockSupportRepository(this.db, this.settings);
  final MockDatabase db;
  @override
  final SettingsReader settings;

  @override
  List<String> topics({required bool driver}) =>
      driver ? Seed.driverHelpTopics : Seed.helpTopics;

  @override
  Future<List<SupportTicket>> tickets() async {
    await delay();
    return db.tickets;
  }

  @override
  Future<SupportTicket> raiseTicket({required String topic, required String description, String? tripId}) async {
    await delay();
    final ticket = SupportTicket(
      id: 'TK-${3322 + db.tickets.length}',
      topic: topic,
      description: description,
      status: TicketStatus.open,
      createdAt: TtClock.now(),
      tripId: tripId,
    );
    db.tickets = [ticket, ...db.tickets];
    return ticket;
  }
}
