// Fakes for the live (API) driver session: realtime socket, LiveJobs and GPS. Shared by the live tests.
import 'dart:async';

import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_driver/state/driver_location.dart';
import 'package:tamiltaxi_driver/state/request_voice.dart';

const kHere = LatLng(11.0168, 76.9558);

LiveTripUpdate liveUpdate(String id, String status, {Map<String, Object?> extra = const {}}) {
  final r = Seed.rideRequest;
  return LiveTripUpdate(
    Trip(
      id: id,
      kind: TripKind.ride,
      vehicle: VehicleKind.bike,
      pickup: r.pickup,
      drop: r.drop,
      fare: 64,
      status: TripStatus.driverAssigned,
      startedAt: DateTime(2026, 9, 26),
      distanceKm: 6,
      durationMin: 20,
      otp: '',
    ),
    status,
    {
      ...extra,
      'id': id,
      'status': status,
      'passenger': {'name': 'Priya', 'phone': '+919876543210'},
    },
  );
}

class FakeRealtime extends RealtimeClient {
  FakeRealtime(super.api);
  final sent = <LatLng>[];
  final payloads = <Map<String, Object>>[];
  final batches = <List<Map<String, Object>>>[];
  bool connected = true;
  bool batchAck = true;
  final connectionCtl = StreamController<bool>.broadcast();
  final statusCtl = StreamController<Map<String, dynamic>>.broadcast();

  @override
  Stream<Map<String, dynamic>> on(String name) => name == 'driver.status' ? statusCtl.stream : super.on(name);

  @override
  bool get isConnected => connected;
  @override
  Stream<bool> get connection => connectionCtl.stream;
  @override
  void connect() {}
  @override
  void leaveTrip(String tripId) {}
  @override
  Future<bool> joinTrip(String tripId) async => true;
  @override
  void sendLocation(Map<String, Object> fix) {
    payloads.add(fix);
    sent.add(LatLng(fix['lat']! as double, fix['lng']! as double));
  }

  @override
  Future<bool> sendLocations(List<Map<String, Object>> fixes) async {
    batches.add(fixes);
    return batchAck;
  }
}

class FakeJobs extends LiveJobs {
  FakeJobs(super.api, super.realtime);

  final offersCtl = StreamController<LiveOffer>.broadcast();
  final updatesCtl = StreamController<LiveTripUpdate>.broadcast();
  final nudgesCtl = StreamController<TripNudge>.broadcast();
  final pausesCtl = StreamController<DateTime>.broadcast();
  @override
  Stream<DateTime> pauses() => pausesCtl.stream;
  @override
  Stream<TripNudge> nudges(String tripId) => nudgesCtl.stream.where((n) => n.tripId == tripId);
  final calls = <String>[];
  Object? onlineError;
  Object? acceptError;

  /// Refuse arrived / complete without a far reason (the API's 422 TOO_FAR).
  bool tooFar = false;
  final positions = <LatLng?>[];

  static ApiException _tooFar(String stop, int metres) => ApiException(
        422,
        "You're $metres m from the $stop point",
        code: 'TOO_FAR',
        details: {'stop': stop, 'distanceM': metres, 'radiusM': stop == 'pickup' ? 250 : 400, 'reasons': ['GPS is wrong', 'Passenger moved']},
      );

  @override
  Future<void> goOnline(LatLng at) async {
    calls.add('online');
    if (selfieRequired) throw const ApiException(403, 'Take your daily selfie first', code: 'SELFIE_CHECK_REQUIRED');
    if (onlineError != null) throw onlineError!;
  }

  /// The server wants the daily selfie: going online is refused until a [selfieCheck] passes.
  bool selfieRequired = false;

  /// Answers for the next selfie checks, in order (an exception is thrown; null passes).
  final selfieAnswers = <Object?>[];
  int selfieChecks = 0;

  @override
  Future<DateTime> selfieCheck(List<int> bytes, String filename) async {
    selfieChecks++;
    final answer = selfieAnswers.isEmpty ? null : selfieAnswers.removeAt(0);
    if (answer != null) throw answer;
    selfieRequired = false;
    return DateTime.now();
  }

  @override
  Future<void> goOffline() async => calls.add('offline');
  @override
  Stream<LiveOffer> offers() => offersCtl.stream;
  @override
  Future<LiveOffer?> currentOffer() async => null;
  final closedCtl = StreamController<String>.broadcast();
  final openOffers = <LiveOffer>[];
  @override
  Stream<String> closedOffers() => closedCtl.stream;
  @override
  Future<List<LiveOffer>> currentOffers() async => openOffers;
  BookingPrefs prefs = const BookingPrefs();
  @override
  Future<BookingPrefs> bookingPrefs() async => prefs;
  @override
  Future<BookingPrefs> setBookingPrefs(BookingPrefs next) async => prefs = next;
  @override
  Stream<LiveTripUpdate> updates(String tripId) => updatesCtl.stream.where((u) => u.trip.id == tripId);

  @override
  Future<LiveTripUpdate> accept(String tripId) async {
    calls.add('accept');
    if (acceptAssignsThenFails) {
      current = liveUpdate(tripId, 'DRIVER_ASSIGNED');
      throw const OfflineException();
    }
    if (acceptError != null) throw acceptError!;
    return current = liveUpdate(tripId, 'DRIVER_ASSIGNED');
  }

  @override
  Future<void> decline(String tripId) async => calls.add('decline');

  @override
  Future<LiveTripUpdate> arrived(String tripId, {LatLng? at, String? farReason}) async {
    positions.add(at);
    if (tooFar && farReason == null) throw _tooFar('pickup', 850);
    calls.add(farReason == null ? 'arrived' : 'arrived:$farReason');
    return current = liveUpdate(tripId, 'DRIVER_ARRIVED');
  }

  @override
  Future<LiveTripUpdate> start(String tripId, {String? otp}) async {
    calls.add('start:$otp');
    if (otp != '1234') throw const ApiException(400, 'Wrong OTP, please try again');
    return current = liveUpdate(tripId, 'IN_PROGRESS');
  }

  @override
  Future<LiveTripUpdate> complete(String tripId, {String? otp, LatLng? at, String? farReason}) async {
    positions.add(at);
    if (otp != null && otp != '5678') throw const ApiException(400, 'Wrong OTP, please try again');
    if (tooFar && farReason == null) throw _tooFar('drop', 1200);
    calls.add(farReason == null ? 'complete' : 'complete:$farReason');
    current = null;
    return liveUpdate(tripId, 'COMPLETED');
  }

  /// Thrown by the next [recordPayment] (once), e.g. [OfflineException].
  Object? paymentError;

  @override
  Future<void> recordPayment(String tripId, PaymentMode mode) async {
    calls.add('payment:${mode.name}');
    final error = paymentError;
    paymentError = null;
    if (error != null) throw error;
  }

  @override
  Future<LiveTripUpdate> cancel(String tripId, {CancelCode code = CancelCode.other, String? note}) async {
    calls.add('cancel:${code.api}');
    if (cancelError != null) throw cancelError!;
    current = null;
    return liveUpdate(tripId, 'CANCELLED');
  }

  @override
  Future<LiveTripUpdate?> active() async {
    activeChecks++;
    return current;
  }

  int activeChecks = 0;

  /// The driver's job as the server sees it (GET /trips/active): set by accept / arrived / start, cleared by complete
  /// and cancel; tests set it to null to play a cancel the app missed.
  LiveTripUpdate? current;

  /// The server assigns the trip but the accept answer is lost (OfflineException).
  bool acceptAssignsThenFails = false;
  Object? cancelError;
  @override
  Future<void> heartbeat(DriverFix fix) async => calls.add('heartbeat');
}

class FakeLocator extends DriverLocator {
  final fixes = StreamController<GpsFix>.broadcast();
  Object? problem;
  LocationAccess accessResult = LocationAccess.granted;
  int asked = 0;

  @override
  Future<LocationAccess> access({bool ask = false}) async {
    if (ask) asked++;
    return accessResult;
  }

  @override
  Future<GpsFix?> lastKnownFix() async => GpsFix(offsetPoint(kHere, 300, 90), at: DateTime.now());

  int currentFixCalls = 0;

  @override
  Future<GpsFix> currentFix() async {
    currentFixCalls++;
    if (problem != null) throw problem!;
    return GpsFix(kHere, at: DateTime.now());
  }

  @override
  Future<void> ensureReady() async {
    if (problem != null) throw problem!;
  }

  @override
  Future<void> requestNotificationPermission() async {}
  int gpsListens = 0;
  @override
  Stream<GpsFix> positions() {
    gpsListens++;
    return fixes.stream;
  }
  final previewFixes = StreamController<GpsFix>.broadcast();
  @override
  Stream<GpsFix> previewPositions() => previewFixes.stream;
  @override
  Future<bool> isReadyWithoutPrompt() async => true;
}

LiveOffer liveOffer(String id, {int seconds = 15, int? fare}) => LiveOffer(
      Seed.rideRequest.copyWith(id: id, customerName: 'Priya', customerPhone: '+919876543210', otp: '', fare: fare),
      seconds,
    );


class SilentSpeaker implements RequestSpeaker {
  @override
  Future<void> speak(String text, VoiceLanguage language) async {}
  @override
  Future<void> stop() async {}
}

/// A live (API) app on fakes: [api] answers from [client] (default: every request fails as offline), the socket,
/// dispatch and GPS are fakes. [prefs] seeds the stored session (e.g. a signed-in driver).
class LiveRig {
  LiveRig._(this.api, this.realtime, this.jobs, this.locator);

  static Future<LiveRig> create({Map<String, Object> prefs = const {}, http.Client? client}) async {
    SharedPreferences.setMockInitialValues(prefs);
    final api = ApiClient(baseUrl: 'http://localhost:1/v1', session: ApiSession(await SharedPreferences.getInstance()), client: client);
    final realtime = FakeRealtime(api);
    return LiveRig._(api, realtime, FakeJobs(api, realtime), FakeLocator());
  }

  final ApiClient api;
  final FakeRealtime realtime;
  final FakeJobs jobs;
  final FakeLocator locator;

  /// Every repository on [api] (like the live app), with the fake socket, dispatch and GPS.
  List<Override> get overrides => [
        ...liveApiOverrides(api),
        realtimeProvider.overrideWithValue(realtime),
        liveJobsProvider.overrideWithValue(jobs),
        driverLocatorProvider.overrideWithValue(locator),
        requestSpeakerProvider.overrideWithValue(SilentSpeaker()),
      ];
}
