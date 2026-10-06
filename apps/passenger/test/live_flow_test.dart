// The ride and parcel controllers in live API mode, against a fake LiveTrips (no network):
// book → server statuses → phases, driver GPS → ETA, driver cancels (S-02), stale updates, chat,
// passenger cancel vs server cancel, and rating.
import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart' show Distance, LengthUnit;
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_passenger/router/routes.dart';
import 'package:tamiltaxi_passenger/state/app_notice.dart';
import 'package:tamiltaxi_passenger/state/parcel_flow.dart';
import 'package:tamiltaxi_passenger/state/passenger_session.dart';
import 'package:tamiltaxi_passenger/state/ride_flow.dart';
import 'package:tamiltaxi_passenger/state/shifting_flow.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _driver = DriverProfile(
  id: 'drv-1',
  name: 'Arun Kumar',
  phone: '+919000000001',
  vehicleKind: VehicleKind.bike,
  vehicleModel: 'TVS Jupiter',
  vehicleColor: 'Blue',
  plate: 'TN 37 CD 9876',
  rating: 4.7,
  rides: 120,
  upiId: 'arun@upi',
);

const _quote = FareQuote(
  vehicle: Seed.bike,
  distanceKm: 6.1,
  durationMin: 20,
  base: 12,
  distanceCharge: 30,
  timeCharge: 3,
  subtotal: 45,
  multiplier: 1.1,
  peakCharge: 4,
  total: 49,
);

/// Socket that is always "connected" (so the fallback poll never runs) and never pushes by itself.
class _FakeRealtime extends RealtimeClient {
  _FakeRealtime(super.api);
  @override
  Stream<bool> get connection => const Stream.empty();
  @override
  bool get isConnected => true;
  @override
  void connect() {}
  @override
  Future<bool> joinTrip(String tripId) async => true;
}

/// Records calls; the test pushes server events through [push], [locate] and [message].
class _FakeTrips extends LiveTrips {
  _FakeTrips(super.api, super.realtime);

  final _updates = StreamController<LiveTripUpdate>.broadcast();
  final _locations = StreamController<LiveLocation>.broadcast();
  final _messages = StreamController<ChatMessage>.broadcast();
  final calls = <String>[];
  TripKind kind = TripKind.ride;
  RideMode rideMode = RideMode.local;
  late LiveTripUpdate last;

  /// What the last booking sent as parcel details.
  ParcelDetails? bookedParcel;

  /// The status a booking for later comes back in (SEARCHING: inside the server's dispatch lead).
  String laterStatus = 'SCHEDULED';

  LiveTripUpdate update(
    String status, {
    DriverProfile? driver,
    String? cancelReason,
    VehicleKind? vehicle,
    FareQuote quote = _quote,
    List<String> also = const [],
    Map<String, Object>? driverLocation,
  }) {
    final trip = Trip(
      id: 'trip-1',
      kind: kind,
      vehicle: vehicle ?? (kind == TripKind.parcel ? VehicleKind.threeWheeler : VehicleKind.bike),
      pickup: Seed.gandhipuram,
      drop: Seed.brookefields,
      fare: quote.total,
      quote: quote,
      status: TripStatus.searching,
      startedAt: DateTime(2026, 9, 26, 10),
      driver: driver,
      distanceKm: 6.1,
      durationMin: 20,
      otp: '5821',
      parcel: kind == TripKind.parcel ? kEmptyParcelDetails.copyWith(receiverName: 'Meena', deliveryOtp: '5821') : null,
      rideMode: rideMode,
    );
    return last = LiveTripUpdate(trip, status, {
      'id': 'trip-1',
      'status': status,
      'cancelReason': ?cancelReason,
      'alsoKinds': also,
      'driverLocation': ?driverLocation,
    });
  }

  List<VehicleAlternative> alternativesResult = const [];

  @override
  Future<List<VehicleAlternative>> alternatives(String tripId) async => alternativesResult;

  @override
  Future<LiveTripUpdate> addVehicle(String tripId, VehicleKind vehicle) async {
    calls.add('also:${vehicle.name}');
    return update('SEARCHING', also: [enumToApi(vehicle)]);
  }

  /// Next addExtra refusal (the search ended meanwhile).
  ApiException? extraError;

  @override
  Future<LiveTripUpdate> addExtra(String tripId, int amount) async {
    calls.add('extra:$amount');
    if (extraError != null) throw extraError!;
    final base = last.trip.quote ?? _quote;
    return update('SEARCHING', quote: base.copyWith(extra: amount, total: base.total - base.extra + amount));
  }

  void push(LiveTripUpdate u) => _updates.add(u);
  void locate(LatLng p, {DateTime? at, double? heading}) =>
      _locations.add(LiveLocation('trip-1', p, at ?? DateTime.now(), heading: heading));
  void message(ChatMessage m) => _messages.add(m);

  @override
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
    calls.add('book:${kind.name}:${vehicle.name}${parcel != null ? ':${parcel.receiverName}' : ''}'
        '${womenDriver.isOn ? ':${womenDriver.name}' : ''}${rider != null ? ':for ${rider.name}' : ''}'
        '${mode != null && mode.mode != RideMode.local ? ':${mode.mode.name}${mode.isLater ? ':later' : ''}' : ''}'
        '${shifting != null ? ':shifting:${shifting.items.length} items' : ''}');
    bookedParcel = parcel;
    return update((mode?.isLater ?? false) || shifting != null ? laterStatus : 'SEARCHING');
  }

  @override
  Stream<LiveTripUpdate> updates(String tripId) => _updates.stream;
  @override
  Stream<LiveLocation> locations(String tripId) => _locations.stream;
  @override
  Stream<ChatMessage> messages(String tripId) => _messages.stream;
  @override
  Future<List<ChatMessage>> chatHistory(String tripId) async => const [];
  @override
  Future<LiveTripUpdate> poll(String tripId) async => last;

  @override
  Future<ChatMessage> sendMessage(String tripId, String text) async {
    calls.add('send:$text');
    return ChatMessage(id: 'srv-${calls.length}', text: text, fromMe: true, sentAt: DateTime.now());
  }

  @override
  Future<LiveTripUpdate> cancel(String tripId, {CancelCode code = CancelCode.other, String? note}) async {
    calls.add('cancel:${code.api}');
    final u = update('CANCELLED');
    push(u);
    return u;
  }

  @override
  Future<void> rate(String tripId, int rating) async => calls.add('rate:$rating');
}


/// Counts fare requests; answers at once with the local engine.
class _CountingRides extends MockRideRepository {
  _CountingRides(super.db, super.settings);
  final asked = <String>[];

  @override
  Future<List<FareQuote>> quotes(Place from, Place to, {bool womenOnly = false}) async {
    asked.add('${from.id}>${to.id}');
    return FareEngine.quoteAll(rideVehicles, FareEngine.estimate(from, to));
  }
}

Future<void> _settle() async {
  for (var i = 0; i < 5; i++) {
    await Future<void>.delayed(Duration.zero);
  }
}

void main() {
  late ProviderContainer container;
  late _FakeTrips trips;
  late _FakeRealtime realtime;

  setUp(() async {
    RoadRouter.enabled = false;
    SharedPreferences.setMockInitialValues({});
    final api = ApiClient(baseUrl: 'http://localhost:0/v1', session: ApiSession(await SharedPreferences.getInstance()));
    realtime = _FakeRealtime(api);
    trips = _FakeTrips(api, realtime);
    container = ProviderContainer(
      overrides: [
        isLiveApiProvider.overrideWithValue(true),
        realtimeProvider.overrideWithValue(realtime),
        liveTripsProvider.overrideWithValue(trips),
      ],
    );
    addTearDown(container.dispose);
  });

  RideFlowState ride() => container.read(rideFlowProvider);
  RideFlowController flow() => container.read(rideFlowProvider.notifier);

  test('a ride follows the server from booking to rating', () async {
    flow().setDrop(Seed.brookefields);
    expect(await flow().book(), isNull);
    expect(trips.calls, ['book:ride:bike']);
    expect(ride().phase, RidePhase.searching);
    expect(ride().tripId, 'trip-1');
    expect(ride().otp, '5821', reason: 'the OTP comes from the server');
    expect(ride().quote.total, 49, reason: 'the fare is the server quote stored with the trip');

    trips.push(trips.update('DRIVER_ASSIGNED', driver: _driver));
    await _settle();
    expect(ride().phase, RidePhase.assigned);
    expect(ride().driver.name, 'Arun Kumar');

    // First GPS fix ~2 km from the pickup: approach leg built, ETA from the remaining distance at 20 km/h.
    trips.locate(offsetPoint(Seed.gandhipuram.location, 2000, 90));
    await _settle();
    expect(ride().approach, isNotEmpty);
    expect(flow().vehicle.value, isNotNull);
    expect(ride().etaMin, inInclusiveRange(5, 10));

    // Closer → shorter ETA.
    trips.locate(offsetPoint(Seed.gandhipuram.location, 300, 90));
    await _settle();
    expect(ride().etaMin, inInclusiveRange(1, 3));

    trips.push(trips.update('DRIVER_ARRIVED', driver: _driver));
    await _settle();
    expect(ride().phase, RidePhase.arrived);

    // An old poll answer arriving late must not move the ride backwards.
    trips.push(trips.update('DRIVER_ASSIGNED', driver: _driver));
    await _settle();
    expect(ride().phase, RidePhase.arrived);

    trips.push(trips.update('IN_PROGRESS', driver: _driver));
    await _settle();
    expect(ride().phase, RidePhase.inProgress);
    // At the pickup: nearly the whole quoted 20 minutes are left.
    expect(ride().etaMin, inInclusiveRange(17, 20));

    trips.push(trips.update('COMPLETED', driver: _driver));
    await _settle();
    expect(ride().phase, RidePhase.completed);

    await flow().finishRide(rating: 5);
    expect(trips.calls.last, 'rate:5');
    expect(ride().phase, RidePhase.planning);
  });

  test('a tapped notification for the ride being followed keeps its marker, route, chat and ETA', () async {
    flow().setDrop(Seed.brookefields);
    await flow().book();
    trips.push(trips.update('DRIVER_ASSIGNED', driver: _driver));
    await _settle();
    trips.locate(offsetPoint(Seed.gandhipuram.location, 2000, 90));
    trips.message(ChatMessage(id: 'srv-1', text: 'Coming', fromMe: false, sentAt: DateTime.now()));
    await _settle();
    final approach = ride().approach;
    final eta = ride().etaMin;
    expect(approach, isNotEmpty);

    // The push tap restores the active trip: the same one, so nothing is rebuilt.
    flow().restore(trips.update('DRIVER_ASSIGNED', driver: _driver));
    await _settle();
    expect(ride().approach, same(approach));
    expect(ride().chat.single.text, 'Coming');
    expect(ride().etaMin, eta);
    expect(flow().vehicle.value, isNotNull);

    // A newer status still moves it on.
    flow().restore(trips.update('DRIVER_ARRIVED', driver: _driver));
    expect(ride().phase, RidePhase.arrived);
  });

  test("reopening the app shows the driver's car at once from the trip read, before any socket fix", () async {
    flow().setDrop(Seed.brookefields);
    await flow().book();
    final near = offsetPoint(Seed.gandhipuram.location, 800, 90);
    final at = DateTime.now().subtract(const Duration(seconds: 2));
    // The restore / poll answer (GET /trips/:id) carries the driver's last fix.
    flow().restore(trips.update('DRIVER_ASSIGNED', driver: _driver, driverLocation: {
      'lat': near.latitude,
      'lng': near.longitude,
      'at': at.millisecondsSinceEpoch,
      'hdg': 270,
    }));
    await _settle();
    expect(ride().phase, RidePhase.assigned);
    expect(ride().approach, isNotEmpty, reason: 'the approach leg is built from that fix');
    final car = flow().vehicle.value!;
    expect(const Distance().as(LengthUnit.Meter, car.position, near), lessThan(60));
    expect(ride().etaMin, inInclusiveRange(1, 4));

    // A socket fix older than the one shown (a late delivery) is ignored.
    trips.locate(offsetPoint(Seed.gandhipuram.location, 2000, 90), at: at.subtract(const Duration(seconds: 30)));
    await _settle();
    expect(ride().etaMin, inInclusiveRange(1, 4));
  });

  test('a rental asks for no pickup → drop route; restored after a restart it is still a rental', () async {
    final asked = <String>[];
    RoadRouter.enabled = true;
    RoadRouter.backend = (a, b, mode) async {
      asked.add('$a > $b');
      return null;
    };
    addTearDown(() {
      RoadRouter.enabled = false;
      RoadRouter.backend = null;
    });
    trips.rideMode = RideMode.rental;
    flow().startMode(const ModeRequest(mode: RideMode.rental, packageId: '4h'));
    await _settle();
    asked.clear();
    expect(await flow().book(), isNull);
    await _settle();
    expect(asked, isEmpty, reason: 'no /maps/route call to a drop the rental does not have');
    expect(ride().routeOrDefault, isEmpty);

    // After a restart the booking mode is unknown; the trip's rental terms still make it a rental.
    final c = ProviderContainer(overrides: [
      isLiveApiProvider.overrideWithValue(true),
      realtimeProvider.overrideWithValue(realtime),
      liveTripsProvider.overrideWithValue(trips),
    ]);
    addTearDown(c.dispose);
    const terms = RentalTerms(packageId: '4h', hours: 4, km: 40, price: 849, extraKmRate: 14, extraMinRate: 2.5);
    c.read(rideFlowProvider.notifier).restore(trips.update('IN_PROGRESS', driver: _driver, quote: _quote.copyWith(modeTerms: terms)));
    await _settle();
    expect(c.read(rideFlowProvider).isRental, isTrue);
    expect(c.read(rideFlowProvider).routeOrDefault, isEmpty);
    expect(asked, isEmpty);
  });

  test('Butterfly: a woman rider books "women only"; the choice is ignored for anyone else', () async {
    ProviderContainer rider(PassengerProfile p) {
      final c = ProviderContainer(overrides: [
        isLiveApiProvider.overrideWithValue(true),
        realtimeProvider.overrideWithValue(realtime),
        liveTripsProvider.overrideWithValue(trips),
        currentProfileProvider.overrideWithValue(p),
      ]);
      addTearDown(c.dispose);
      return c;
    }

    final woman = rider(Seed.priya).read(rideFlowProvider.notifier);
    woman.setDrop(Seed.brookefields);
    woman.setWomenDriver(WomenDriverPref.only);
    expect(await woman.book(), isNull);
    expect(trips.calls, ['book:ride:bike:only']);

    final other = rider(Seed.priya.copyWith(gender: Gender.male));
    other.read(rideFlowProvider.notifier).setWomenDriver(WomenDriverPref.only);
    expect(other.read(rideFlowProvider.notifier).canUseButterfly, isFalse);
    expect(other.read(rideFlowProvider.notifier).womenDriver, WomenDriverPref.none);
  });

  test('"Who\'s riding?": a father books Butterfly for his daughter; the next ride is for him again', () async {
    final c = ProviderContainer(overrides: [
      isLiveApiProvider.overrideWithValue(true),
      realtimeProvider.overrideWithValue(realtime),
      liveTripsProvider.overrideWithValue(trips),
      currentProfileProvider.overrideWithValue(Seed.priya.copyWith(name: 'Ravi Kumar', gender: Gender.male)),
    ]);
    addTearDown(c.dispose);
    final f = c.read(rideFlowProvider.notifier);
    expect(f.canUseButterfly, isFalse);

    f.setRider(const OtherRider(name: 'Anjali', phone: '9876512345', isWoman: true));
    expect(f.canUseButterfly, isTrue);
    f.setWomenDriver(WomenDriverPref.only);
    f.setDrop(Seed.brookefields);
    expect(await f.book(), isNull);
    expect(trips.calls, ['book:ride:bike:only:for Anjali']);

    // Someone else who is not a woman: no Butterfly.
    f.setRider(const OtherRider(name: 'Arun', phone: '9876512346'));
    expect(f.womenDriver, WomenDriverPref.none);

    trips.push(trips.update('COMPLETED', driver: _driver));
    await _settle();
    await f.finishRide();
    expect(c.read(rideFlowProvider).rider, isNull);
  });

  test('"Who is riding" and the Butterfly choice reset after a cancellation, by me or by the server', () async {
    final c = ProviderContainer(overrides: [
      isLiveApiProvider.overrideWithValue(true),
      realtimeProvider.overrideWithValue(realtime),
      liveTripsProvider.overrideWithValue(trips),
      currentProfileProvider.overrideWithValue(Seed.priya),
    ]);
    addTearDown(c.dispose);
    final f = c.read(rideFlowProvider.notifier);
    const anjali = OtherRider(name: 'Anjali', phone: '9876512345', isWoman: true);

    f.setRider(anjali);
    f.setWomenDriver(WomenDriverPref.only);
    f.setDrop(Seed.brookefields);
    await f.book();
    expect(await f.cancelRide(code: CancelCode.changedMind), isNull);
    expect(c.read(rideFlowProvider).rider, isNull);
    expect(c.read(rideFlowProvider).womenDriver, isNull);

    f.setRider(anjali);
    f.setWomenDriver(WomenDriverPref.only);
    await f.book();
    trips.push(trips.update('DRIVER_ASSIGNED', driver: _driver));
    await _settle();
    trips.push(trips.update('CANCELLED'));
    await _settle();
    expect(c.read(rideFlowProvider).phase, RidePhase.planning);
    expect(c.read(rideFlowProvider).rider, isNull, reason: 'a driver cancel resets it too');
    expect(c.read(rideFlowProvider).womenDriver, isNull);

    f.setRider(anjali);
    await f.book();
    trips.push(trips.update('NO_DRIVERS'));
    await _settle();
    expect(c.read(rideFlowProvider).rider, anjali, reason: 'no drivers: still planning that ride (S-01 retries it)');
    await f.cancelSearch();
    expect(c.read(rideFlowProvider).rider, isNull);
  });

  test('P-10: changing a stop after fares loaded fetches them again (no endless "Getting fares…")', () async {
    late _CountingRides rides;
    final c = ProviderContainer(overrides: [
      isLiveApiProvider.overrideWithValue(true),
      realtimeProvider.overrideWithValue(realtime),
      liveTripsProvider.overrideWithValue(trips),
      rideRepositoryProvider.overrideWith((ref) => rides = _CountingRides(ref.watch(mockDatabaseProvider), () => ref.read(demoSettingsProvider))),
    ]);
    addTearDown(c.dispose);
    final f = c.read(rideFlowProvider.notifier);
    f.setDrop(Seed.brookefields);
    await f.loadQuotes();
    expect(c.read(rideFlowProvider).serverQuotes, isNotNull);

    // The pickup moves while P-10 is open (GPS resolved, or edited and back): fares reload by themselves.
    f.setPickup(Seed.rsPuram);
    expect(c.read(rideFlowProvider).serverQuotes, isNull);
    await _settle();
    expect(c.read(rideFlowProvider).serverQuotes, isNotNull);
    expect(rides.asked.last, '${Seed.rsPuram.id}>${Seed.brookefields.id}');

    // Same place again (only the name filled in): the fares stay, no new request.
    final n = rides.asked.length;
    f.setPickup(Seed.rsPuram);
    expect(c.read(rideFlowProvider).serverQuotes, isNotNull);
    expect(rides.asked.length, n);
  });

  test("until the driver's first fix, the assigned ETA is the quote's pickup ETA", () async {
    await flow().book();
    trips.push(trips.update('DRIVER_ASSIGNED', driver: _driver, quote: _quote.copyWith(pickupEtaMin: 7)));
    await _settle();
    expect(ride().etaMin, 7);

    trips.kind = TripKind.parcel;
    final parcel = container.read(parcelFlowProvider.notifier);
    parcel.setDrop(Seed.raceCourse);
    await parcel.book();
    trips.push(trips.update('DRIVER_ASSIGNED', driver: _driver, quote: _quote.copyWith(pickupEtaMin: 11)));
    await _settle();
    expect(container.read(parcelFlowProvider).etaMin, 11);
  });

  test('the phone location replaces the pickup only until the rider chooses one, and again after a ride', () async {
    final here = Seed.gandhipuram.copyWith(id: 'current', name: 'Current location');
    flow().useDeviceLocation(here);
    expect(ride().pickup.id, 'current');

    // Chosen by hand (P-08 / P-09): coming back to the app (a new GPS fix) keeps it.
    flow().setPickup(Seed.rsPuram);
    flow().useDeviceLocation(here.copyWith(location: Seed.peelamedu.location));
    expect(ride().pickup, Seed.rsPuram);

    // "Use current location" follows the phone again.
    flow().setPickup(here);
    flow().useDeviceLocation(here.copyWith(location: Seed.peelamedu.location));
    expect(ride().pickup.location, Seed.peelamedu.location);

    // After a ride, the next one starts where the rider is.
    flow().setPickup(Seed.rsPuram);
    flow().setDrop(Seed.brookefields);
    await flow().book();
    flow().useDeviceLocation(here);
    expect(ride().pickup, Seed.rsPuram, reason: 'no change during a ride');
    trips.push(trips.update('COMPLETED', driver: _driver));
    await _settle();
    await flow().finishRide();
    flow().useDeviceLocation(here.copyWith(location: Seed.raceCourse.location));
    expect(ride().pickup.location, Seed.raceCourse.location);
  });

  test('live: no drop is chosen for the rider (no seeded place)', () {
    expect(ride().dropSet, isFalse);
    expect(ride().drop.location, ride().pickup.location);
    flow().setDrop(Seed.brookefields);
    expect(ride().dropSet, isTrue);
  });

  test('before the phone is located the pickup is "Choose your pickup": no fares, no booking from it', () async {
    final api = ApiClient(baseUrl: 'http://localhost:0/v1', session: ApiSession(await SharedPreferences.getInstance()));
    final c = ProviderContainer(overrides: [
      isLiveApiProvider.overrideWithValue(true),
      realtimeProvider.overrideWithValue(realtime),
      liveTripsProvider.overrideWithValue(trips),
      placesRepositoryProvider.overrideWith((ref) => ApiPlacesRepository(api)),
    ]);
    addTearDown(c.dispose);
    final f = c.read(rideFlowProvider.notifier);
    expect(c.read(rideFlowProvider).pickup.isUnknownPickup, isTrue);
    expect(c.read(rideFlowProvider).pickup.name, 'Choose your pickup');
    f.setDrop(Seed.brookefields);
    await f.loadQuotes();
    expect(c.read(rideFlowProvider).quotesError, kChoosePickupForFares);
    expect(await f.book(), kChoosePickupFirst);
    expect(trips.calls, isEmpty, reason: 'nothing booked to the city centre');

    final parcel = c.read(parcelFlowProvider.notifier);
    expect(c.read(parcelFlowProvider).pickup.isUnknownPickup, isTrue);
    parcel.setDrop(Seed.raceCourse);
    expect(await parcel.book(), kChoosePickupFirst);

    final move = c.read(shiftingFlowProvider.notifier);
    move.setDrop(Seed.raceCourse);
    await move.refreshQuote();
    expect(c.read(shiftingFlowProvider).quoteError, kChooseMovePickup);
    expect((await move.book()).error, kChooseMovePickup);

    // The phone answers: every flow that hasn't been given a pickup takes it.
    final here = Seed.gandhipuram.copyWith(id: 'current', name: 'Current location');
    f.useDeviceLocation(here);
    parcel.useDeviceLocation(here);
    move.useDeviceLocation(here);
    expect(c.read(rideFlowProvider).pickup.id, 'current');
    expect(c.read(parcelFlowProvider).pickup.id, 'current');
    expect(c.read(shiftingFlowProvider).pickup.id, 'current');
    expect(await f.book(), isNull);
  });

  test('Skip on P-20 sends no rating', () async {
    await flow().book();
    trips.push(trips.update('COMPLETED', driver: _driver));
    await _settle();
    await flow().finishRide();
    expect(trips.calls.where((c) => c.startsWith('rate')), isEmpty);
  });

  test('the driver cancelling after accepting shows S-02 until someone new accepts', () async {
    await flow().book();
    trips.push(trips.update('DRIVER_ASSIGNED', driver: _driver));
    await _settle();
    trips.push(trips.update('SEARCHING'));
    await _settle();
    expect(ride().phase, RidePhase.driverCancelled);
    expect(ride().driverCancelledOnce, isTrue);
    trips.push(trips.update('DRIVER_ASSIGNED', driver: _driver));
    await _settle();
    expect(ride().phase, RidePhase.assigned);
  });

  test('"Book any": a slow search adds Auto and an auto driver takes it at the auto fare', () async {
    const autoQuote = FareQuote(
      vehicle: Seed.auto,
      distanceKm: 6.1,
      durationMin: 20,
      base: 25,
      distanceCharge: 54,
      timeCharge: 6,
      subtotal: 85,
      multiplier: 1.1,
      peakCharge: 8,
      total: 93,
    );
    await flow().book();
    trips.alternativesResult = const [
      VehicleAlternative(vehicle: VehicleKind.auto, quote: autoQuote, driversNearby: 2, nearestKm: 1.4),
    ];
    await flow().loadAlternatives();
    expect(ride().alternatives.single.vehicle, VehicleKind.auto);

    expect(await flow().addVehicle(VehicleKind.auto), isNull);
    expect(trips.calls.last, 'also:auto');
    expect(ride().alsoVehicles, [VehicleKind.auto]);
    expect(ride().alternatives, isEmpty, reason: 'an added vehicle is no longer offered');

    trips.push(trips.update('DRIVER_ASSIGNED', driver: _driver, vehicle: VehicleKind.auto, quote: autoQuote, also: ['AUTO']));
    await _settle();
    expect(ride().phase, RidePhase.assigned);
    expect(ride().vehicle, VehicleKind.auto);
    expect(ride().quote.total, 93, reason: 'the fare of the vehicle that came');
  });

  test('add extra while searching: the fare goes up by it; a refusal says why and changes nothing', () async {
    await flow().book();
    expect(await flow().addExtra(20), isNull);
    expect(trips.calls.last, 'extra:20');
    expect(ride().quote.total, 69);
    expect(ride().quote.extra, 20);
    trips.extraError = const ApiException(409, 'The search has already ended, or the fare just changed');
    expect(await flow().addExtra(30), 'The search has already ended, or the fare just changed');
    expect(ride().quote.total, 69);
    expect(ride().busy, isFalse);

    // A socket update while searching (the extra added from another phone) moves the fare too.
    trips.push(trips.update('SEARCHING', quote: _quote.copyWith(extra: 30, total: 79)));
    await _settle();
    expect(ride().quote.total, 79);
  });

  test('no drivers ends the search', () async {
    await flow().book();
    trips.push(trips.update('NO_DRIVERS'));
    await _settle();
    expect(ride().phase, RidePhase.noDrivers);
    expect(await flow().cancelSearch(), isNull);
    expect(ride().phase, RidePhase.planning);
    expect(trips.calls.where((c) => c.startsWith('cancel')), isEmpty, reason: 'nothing to cancel on the server');
  });

  test('passenger cancel goes to the API and shows no "cancelled" notice', () async {
    await flow().book();
    expect(await flow().cancelRide(code: CancelCode.changedMind), isNull);
    await _settle();
    expect(trips.calls.last, 'cancel:CHANGED_MIND');
    expect(ride().phase, RidePhase.planning);
    expect(container.read(appNoticeProvider), isNull);
  });

  test('a cancel from the server returns Home with a notice', () async {
    await flow().book();
    trips.push(trips.update('DRIVER_ASSIGNED', driver: _driver));
    await _settle();
    trips.push(trips.update('CANCELLED', cancelReason: 'Vehicle breakdown'));
    await _settle();
    expect(ride().phase, RidePhase.planning);
    final notice = container.read(appNoticeProvider);
    expect(notice?.message, 'Arun cancelled the ride (Vehicle breakdown). You can book again.');
    expect(notice?.goTo, Routes.ride);
  });

  test('chat: my message is sent once, the pushed copy does not duplicate it', () async {
    await flow().book();
    flow().sendChat('I am at the gate');
    expect(ride().chat.single.id, startsWith('local-'));
    await _settle();
    expect(trips.calls.last, 'send:I am at the gate');
    expect(ride().chat.single.id, startsWith('srv-'));
    trips.message(ride().chat.single);
    trips.message(ChatMessage(id: 'srv-99', text: 'Coming', fromMe: false, sentAt: DateTime.now()));
    await _settle();
    expect(ride().chat.map((m) => m.text), ['I am at the gate', 'Coming']);
  });

  test('a sender adds extra while searching for a goods driver', () async {
    trips.kind = TripKind.parcel;
    final parcel = container.read(parcelFlowProvider.notifier);
    parcel.updateDetails(kEmptyParcelDetails.copyWith(receiverName: 'Meena', senderName: 'Priya'));
    parcel.setDrop(Seed.raceCourse);
    expect(await parcel.book(), isNull);
    expect(await parcel.addExtra(10), isNull);
    expect(trips.calls.last, 'extra:10');
    expect(container.read(parcelFlowProvider).quote.extra, 10);
  });

  test('booked for later inside the dispatch lead: the search started, so the ride is followed', () async {
    trips.laterStatus = 'SEARCHING';
    flow().updateMode(ModeRequest(mode: RideMode.rental, packageId: '4h', leaveAt: DateTime.now().add(const Duration(minutes: 29))));
    final r = await flow().bookForLater();
    expect(r.error, isNull);
    expect(r.trip?.status, isNot(TripStatus.scheduled));
    expect(ride().phase, RidePhase.searching);
    expect(ride().tripId, r.trip?.id);
  });

  test('a parcel with no sender is booked with the rider as the sender', () async {
    final c = ProviderContainer(overrides: [
      isLiveApiProvider.overrideWithValue(true),
      realtimeProvider.overrideWithValue(realtime),
      liveTripsProvider.overrideWithValue(trips),
      passengerProfileProvider.overrideWith(_Me.new),
    ]);
    addTearDown(c.dispose);
    await c.read(passengerProfileProvider.future);
    trips.kind = TripKind.parcel;
    final parcel = c.read(parcelFlowProvider.notifier);
    parcel.updateDetails(kEmptyParcelDetails.copyWith(receiverName: 'Meena', receiverPhone: '+919843012345'));
    parcel.setDrop(Seed.raceCourse);
    expect(await parcel.book(), isNull);
    expect(trips.bookedParcel?.senderName, 'Priya Raman');
    expect(trips.bookedParcel?.senderPhone, '+919876543210');
  });

  test('a parcel books with its details and shows the server delivery OTP', () async {
    trips.kind = TripKind.parcel;
    final parcel = container.read(parcelFlowProvider.notifier);
    parcel.updateDetails(kEmptyParcelDetails.copyWith(receiverName: 'Meena', senderName: 'Priya'));
    parcel.setDrop(Seed.raceCourse);
    expect(await parcel.book(), isNull);
    // The bike is the default parcel vehicle (cheapest; PP-06 offers the rest).
    expect(trips.calls.single, 'book:parcel:goodsBike:Meena');
    expect(container.read(parcelFlowProvider).details.deliveryOtp, '5821');

    for (final (status, phase) in [
      ('DRIVER_ASSIGNED', ParcelPhase.assigned),
      ('DRIVER_ARRIVED', ParcelPhase.atPickup),
      ('PICKED_UP', ParcelPhase.inTransit),
      ('DELIVERED', ParcelPhase.delivered),
    ]) {
      trips.push(trips.update(status, driver: _driver));
      await _settle();
      expect(container.read(parcelFlowProvider).phase, phase, reason: status);
    }

    await parcel.finish();
    expect(trips.calls.where((c) => c.startsWith('rate')), isEmpty);
    expect(container.read(parcelFlowProvider).phase, ParcelPhase.planning);
    expect(container.read(parcelFlowProvider).details.senderName, 'Priya', reason: 'the sender is kept for next time');
  });
}

class _Me extends PassengerProfileController {
  @override
  Future<PassengerProfile> build() async =>
      const PassengerProfile(name: 'Priya Raman', phone: '+919876543210', gender: Gender.female);
}
