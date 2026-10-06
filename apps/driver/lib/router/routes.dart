/// Every driver route path. Build navigation with these, never with string literals.
abstract final class Routes {
  // Start-up, sign-up and KYC
  static const splash = '/splash';
  static const welcome = '/welcome';
  static String phone({required bool signup}) => signup ? '/auth/phone' : '/auth/phone?mode=login';
  static String otp({required String phone, required bool signup}) =>
      '/auth/otp?phone=${Uri.encodeComponent(phone)}${signup ? '' : '&mode=login'}';
  static const workType = '/signup/work-type';
  static const chooseVehicle = '/signup/vehicle';
  static const personalDetails = '/signup/details';
  static const documents = '/signup/documents';
  static String uploadDocument(String type) => '/signup/documents/upload/$type';
  static const profilePhoto = '/signup/photo';
  static const choosePlan = '/signup/plan';

  /// D-12 frame 1. [purpose] is `setup` (D-11), `change` (D-24) or `pay` (D-25 / S-14).
  static String autopay({String purpose = 'setup'}) =>
      '/autopay?purpose=$purpose';
  static String autopaySuccess({String purpose = 'setup'}) =>
      '/autopay/success?purpose=$purpose';
  static const accountOnHold = '/account-on-hold';

  /// Paused for too many cancellations until [until] (S-10b).
  static const accountPausedPath = '/account-paused';
  static String accountPaused(DateTime until) =>
      '$accountPausedPath?until=${Uri.encodeQueryComponent(until.toUtc().toIso8601String())}';
  static const selfieCheck = '/selfie-check';
  static const dailySelfie = '/selfie-check/camera';
  static String legal(String doc) => '/legal/$doc';

  // Tabs
  static const home = '/home';
  static const earnings = '/earnings';
  static const plan = '/plan';
  static const account = '/account';

  // Jobs (full-screen)
  static const request = '/driver/request';
  static const deliveryRequest = '/driver/delivery-request';
  static const pickup = '/driver/pickup';
  static const rideOtp = '/driver/otp';
  static const trip = '/driver/trip';
  static const sos = '/driver/sos';
  static const collect = '/driver/collect';
  static const collectDelivery = '/driver/collect?delivery=1';
  static const delivery = '/driver/delivery';
  static const deliveryOtp = '/driver/delivery-otp';
  static const chat = '/driver/chat';

  // Account
  static const accountDocuments = '/account/documents';
  static const vehicleDetails = '/account/vehicle';
  static const upiId = '/account/upi';
  static const emergencyContact = '/account/emergency-contact';
  static const bookingPreferences = '/account/booking-preferences';
  static const services = '/account/services';
  static const rateCard = '/account/rate-card';
  static const help = '/help';
  /// [tripId]: the ticket is about that trip (support sees which one).
  static String newTicket({String? topic, String? tripId}) {
    final query = [
      if (topic != null) 'topic=${Uri.encodeComponent(topic)}',
      if (tripId != null) 'tripId=${Uri.encodeComponent(tripId)}',
    ];
    return query.isEmpty ? '/help/new-ticket' : '/help/new-ticket?${query.join('&')}';
  }

  static const gallery = '/gallery';
  static String galleryView(String frameId) => '/gallery/view/$frameId';
}
