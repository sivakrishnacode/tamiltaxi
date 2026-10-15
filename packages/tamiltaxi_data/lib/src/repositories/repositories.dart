import 'package:latlong2/latlong.dart';

import '../goods_modes.dart';
import '../pricing.dart';
import '../models/driver.dart';
import '../models/people.dart';
import '../models/place.dart';
import '../models/trip.dart';
import '../models/vehicle.dart';
import '../ride_modes.dart';

/// Thrown by repositories when Demo control "Offline mode" is on (or a real network call fails).
class OfflineException implements Exception {
  const OfflineException();
  @override
  String toString() => "You're offline";
}

/// Thrown when an Autopay / UPI payment fails.
class PaymentFailedException implements Exception {
  const PaymentFailedException(this.amount);
  final int amount;
  @override
  String toString() => 'Your ₹$amount payment didn\'t go through';
}

/// An admin put the driver's account on hold (S-10): not "under review", and not something D-07 can fix.
class AccountOnHoldException implements Exception {
  const AccountOnHoldException();
  @override
  String toString() => 'Your account is on hold';
}

/// The driver's application is still being reviewed (D-10 "Check status" before an admin has decided).
class StillUnderReviewException implements Exception {
  const StillUnderReviewException();
  @override
  String toString() => 'Your documents are still being reviewed';
}

enum OtpResult { newUser, existingUser, incorrect }

/// Phone + OTP sign-in and the signed-in passenger's profile.
abstract interface class AuthRepository {
  bool get hasSeenOnboarding;
  bool get isLoggedIn;
  void markOnboardingSeen();
  Future<void> sendOtp(String phone);
  Future<OtpResult> verifyOtp(String phone, String otp);
  Future<void> logout();

  /// Deletes the account and signs out. Throws [ApiException] (409, with why) while a trip is unfinished.
  Future<void> deleteAccount();

  Future<PassengerProfile> profile();
  Future<PassengerProfile> updateProfile(PassengerProfile profile);
}

/// Live place search asks the API from this many characters (trimmed); the apps show recents and a hint below it.
const int kMinPlaceQuery = 4;

/// Search, saved places and reverse geocoding.
abstract interface class PlacesRepository {
  Place get currentLocation;

  /// Places matching [query]. [origin] (the pickup): live suggestions then carry [Place.distanceKm]. [anywhere]:
  /// outstation search, beyond the service area (other towns). Live: nothing under [kMinPlaceQuery] characters.
  Future<List<Place>> search(String query, {LatLng? origin, bool anywhere = false});

  /// Completes a [search] result before it is used as a pickup / drop: Google suggestions
  /// (id `api:…`) only carry a placeholder location until their details are fetched. Seed places
  /// come back unchanged. Throws [OfflineException] when the API can't be reached, [ApiException] (404) when the
  /// place is no longer listed.
  Future<Place> resolve(Place place);
  Future<List<Place>> recentDestinations();
  Future<List<SavedPlace>> savedPlaces();
  Future<List<SavedPlace>> saveSavedPlace(SavedPlace place);
  Future<List<SavedPlace>> removeSavedPlace(String id);

  /// Address at [point] (used by "Pin on map" and the device location).
  Future<Place> reverseGeocode(LatLng point);
  bool isInServiceArea(LatLng point);

  /// [isInServiceArea], asking the API when it doesn't know [point] yet (a recent place): false only when it says
  /// so. Never throws (booking is checked again by the API).
  Future<bool> checkServiceArea(LatLng point);
}

/// Ride vehicles, quotes, and the passenger's trip history (rides and parcels).
abstract interface class RideRepository {
  List<VehicleType> get rideVehicles;

  /// [womenOnly] (Butterfly "only"): pickup ETAs count women drivers only.
  Future<List<FareQuote>> quotes(Place from, Place to, {bool womenOnly = false});

  /// Null when Demo control "No drivers nearby" is on.
  Future<DriverProfile?> findDriver(VehicleKind kind);

  /// Rental / outstation quotes for the cab tiers ([request]), each with its [FareQuote.modeTerms]. [drop]: not for a
  /// rental.
  Future<List<FareQuote>> modeQuotes(Place pickup, Place? drop, ModeRequest request);

  /// The passenger's trips booked for later, soonest first.
  Future<List<Trip>> upcomingTrips();

  /// Popular outstation drops around [at] (live: from past trips; empty until there are some).
  Future<List<Place>> outstationDestinations(LatLng at);

  /// The prices for rentals, outstation, goods to another town and house shifting in the city at [at] (what the
  /// screens show before quoting; quotes come from the server).
  Future<ModePricing> modePricing(LatLng at);

  /// Free vehicles around [at] for the map (a few of each kind, nearest first). [parcels]: goods vehicles and
  /// two-wheelers instead of ride vehicles. Empty when nobody is near (or Demo control "No drivers").
  Future<List<NearbyVehicle>> nearbyVehicles(LatLng at, {bool parcels = false});
  Future<List<Trip>> history();
  Future<Trip?> tripById(String id);
  Future<void> addTrip(Trip trip);
  List<ChatMessage> chatSeed();
  List<String> get quickReplies;
}

/// Goods vehicles and parcel quotes.
abstract interface class ParcelRepository {
  List<VehicleType> get goodsVehicles;

  /// In town: every goods vehicle; [outstation]: the goods trucks one way to another town, each with its terms.
  Future<List<FareQuote>> quotes(Place from, Place to, {bool outstation = false});

  /// House shifting [d] by [vehicle] (default: suggested for the home size) at the slot [at].
  Future<ShiftingQuote> shiftingQuote(Place from, Place to, ShiftingDetails d, {VehicleKind? vehicle, required DateTime at});
  Future<List<Trip>> recentParcels();
}

enum EarningsPeriod { today, week, month }

/// The signed-in driver: profile, KYC, earnings and incoming requests.
abstract interface class DriverRepository {
  bool get isLoggedIn;
  Future<void> sendOtp(String phone);

  /// Any 6 digits except 000000. Signs the driver in on success.
  Future<OtpResult> verifyOtp(String phone, String otp);
  Future<void> logout();

  Future<DriverProfile> profile();
  Future<DriverProfile> updateProfile(DriverProfile profile);

  /// Sign-up (D-04 … D-06): creates the driver with a free trial. Throws [ApiException] on invalid details.
  Future<DriverProfile> register(DriverProfile profile, WorkType workType);
  Future<List<KycDocument>> kycDocuments();
  Future<List<KycDocument>> setKycStatus(KycDocType type, KycStatus status, {String? reason});

  /// D-08: uploads a photo / PDF of [type]; the document goes under review.
  Future<List<KycDocument>> uploadKyc(KycDocType type, List<int> bytes, String filename);

  /// D-07 profile photo riders see. True = live now (matches the verified selfie); false = an admin checks it.
  /// Throws [ApiException] (422: no face / several faces, retake; 409: verify identity first).
  Future<bool> uploadProfilePhoto(List<int> bytes, String filename);

  /// True when approved; false when rejected (Demo control "Reject KYC"). Throws [StillUnderReviewException]
  /// while an admin hasn't decided yet, [AccountOnHoldException] when an admin put the account on hold.
  Future<bool> checkApplication();
  Future<EarningsSummary> earnings(EarningsPeriod period);
  Future<void> recordCompletedJob(EarningsTrip trip);
  RideRequest nextRequest(WorkType workType);
  Future<EmergencyContact> emergencyContact();
  Future<void> updateEmergencyContact(EmergencyContact contact);
}

/// The driver's monthly plan and UPI Autopay.
abstract interface class SubscriptionRepository {
  Future<SubscriptionPlan> plan();
  Future<List<PaymentRecord>> payments();
  Future<SubscriptionPlan> setStatus(PlanStatus status);
  Future<SubscriptionPlan> setupAutopay(String upiApp);

  /// Pays one month now. Throws [PaymentFailedException] if Demo control "Fail next payment" is on.
  Future<SubscriptionPlan> payNow(String upiApp);
  Future<SubscriptionPlan> pause();
  Future<SubscriptionPlan> resume();
  Future<SubscriptionPlan> cancel();
  Future<SubscriptionPlan> changePlanVehicle(VehicleKind vehicle);
}

/// Help topics and tickets (shared by both apps).
abstract interface class SupportRepository {
  List<String> topics({required bool driver});
  Future<List<SupportTicket>> tickets();
  Future<SupportTicket> raiseTicket({
    required String topic,
    required String description,
    String? tripId,
  });
  Future<void> uploadAttachment(
    String ticketId,
    List<int> bytes,
    String filename,
  );
}
