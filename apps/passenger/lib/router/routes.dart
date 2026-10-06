/// Every passenger route path. Build navigation with these, never with string literals.
abstract final class Routes {
  // Start-up and sign-in
  static const splash = '/splash';
  static const onboarding = '/onboarding';
  static const login = '/login';
  static const otp = '/login/otp';
  static const profileSetup = '/profile-setup';
  static const locationPermission = '/location-permission';
  static const locationDenied = '/location-denied';
  static const serviceUnavailable = '/service-unavailable';
  static String legal(String doc) => '/legal/$doc';

  // Ride tab
  static const ride = '/ride';
  static const search = '/ride/search';
  static const pinOnMap = '/ride/pin';
  static const pinPickupOnMap = '/ride/pin?for=pickup';
  static const pinPickOnMap = '/ride/pin?for=pick';
  static const chooseVehicle = '/ride/choose-vehicle';
  static const rental = '/ride/rental';
  static const outstation = '/ride/outstation';
  static const outstationSearch = '/ride/outstation-where';

  /// A rental / outstation trip booked for later (route `extra`: the [Trip]).
  static const bookedLater = '/ride/booked';
  static const findingDriver = '/ride/finding';
  static const driverAssigned = '/ride/driver';
  static const chat = '/ride/chat';
  static const driverArrived = '/ride/arrived';
  static const rideInProgress = '/ride/trip';
  static const rideCompleted = '/ride/completed';
  static const rateDriver = '/ride/rate';
  static const noDrivers = '/ride/no-drivers';
  static const driverCancelled = '/ride/driver-cancelled';
  static String savedPlaceEditor([String? id]) => id == null ? '/ride/saved-place' : '/ride/saved-place?id=$id';

  // Parcel tab
  static const parcel = '/parcel';
  static const parcelPickup = '/parcel/pickup';
  static const parcelDrop = '/parcel/drop';

  /// PP-03 opened from "Set on map": the sheet starts pulled down so the map is big.
  static const parcelDropOnMap = '/parcel/drop?map=1';
  static const parcelDetails = '/parcel/details';
  static const parcelReview = '/parcel/review';
  static const parcelFinding = '/parcel/finding';
  static const parcelAssigned = '/parcel/assigned';
  static const parcelChat = '/parcel/chat';
  static const parcelInTransit = '/parcel/in-transit';
  static const parcelDelivered = '/parcel/delivered';
  static const parcelBooked = '/parcel/booked';

  // House shifting (from the parcel tab), nested so each step's "Change" goes back to it with the steps before.
  static const shifting = '/parcel/shifting';
  static const shiftingItems = '/parcel/shifting/items';
  static const shiftingSchedule = '/parcel/shifting/items/day';
  static const shiftingReview = '/parcel/shifting/items/day/review';

  // Activity tab
  static const activity = '/activity';
  static String tripDetails(String id) => '/activity/trip/$id';

  // Account tab
  static const account = '/account';
  static const editProfile = '/account/edit-profile';
  static const savedPlaces = '/account/saved-places';
  static const safety = '/account/safety';
  static const about = '/account/about';
  static const verifyIdentity = '/account/verify-identity';
  static const emergencyContacts = '/account/emergency-contacts';

  // Full-screen, reachable from anywhere
  static const sos = '/sos';
  static String help({String? tripId}) => tripId == null ? '/help' : '/help?trip=$tripId';
  static String newTicket({String? topic, String? tripId}) {
    final q = [if (topic != null) 'topic=${Uri.encodeComponent(topic)}', if (tripId != null) 'trip=$tripId'];
    return q.isEmpty ? '/help/new-ticket' : '/help/new-ticket?${q.join('&')}';
  }

  static const gallery = '/gallery';
  static String galleryView(String frameId) => '/gallery/view/$frameId';
}
