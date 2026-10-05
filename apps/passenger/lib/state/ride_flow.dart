import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';

import '../router/routes.dart';
import 'app_notice.dart';
import 'live_trip.dart';
import 'passenger_session.dart';

/// Where the current ride is. Screens listen and navigate when it changes.
enum RidePhase {
  /// Choosing pickup, drop and vehicle.
  planning,
  searching,
  noDrivers,
  assigned,

  /// The driver cancelled; Tamil Taxi is re-searching (S-02).
  driverCancelled,
  arrived,
  inProgress,

  /// Reached the drop; waiting for payment + rating.
  completed,
}

/// The ride phase for an API trip [status], or null to ignore the update.
///
/// Back to SEARCHING after a driver was assigned means that driver cancelled and dispatch is looking
/// again (S-02); it stays on S-02 until someone new accepts.
RidePhase? ridePhaseForStatus(String status, RidePhase current) => switch (status) {
  'SEARCHING' => switch (current) {
    RidePhase.assigned || RidePhase.arrived || RidePhase.driverCancelled => RidePhase.driverCancelled,
    _ => RidePhase.searching,
  },
  'NO_DRIVERS' => RidePhase.noDrivers,
  'DRIVER_ASSIGNED' => RidePhase.assigned,
  'DRIVER_ARRIVED' => RidePhase.arrived,
  'IN_PROGRESS' => RidePhase.inProgress,
  'COMPLETED' => RidePhase.completed,
  'CANCELLED' => RidePhase.planning,
  _ => null,
};

const Object _keep = Object();

/// Fares and booking wait for a real pickup (the phone's location, or one the rider chose).
const kChoosePickupForFares = 'Choose your pickup to see the fares';
const kChoosePickupFirst = 'Choose your pickup first';

@immutable
class RideFlowState {
  const RideFlowState({
    this.pickup = Seed.gandhipuram,
    this.drop = Seed.brookefields,
    this.dropSet = true,
    this.vehicle = VehicleKind.bike,
    this.womenDriver,
    this.rider,
    this.phase = RidePhase.planning,
    this.driver = Seed.karthik,
    this.tripId = 'RD-DEMO',
    this.bookedAt,
    this.route = const [],
    this.approach = const [],
    this.etaMin = 3,
    this.chat = const [],
    this.driverCancelledOnce = false,
    this.otp = Seed.rideOtp,
    this.serverQuotes,
    this.quotesError,
    this.tripQuote,
    this.busy = false,
    this.alsoVehicles = const [],
    this.alternatives = const [],
    this.arrivedAt,
    this.mode,
    this.bookAny = false,
  });

  /// Rental or outstation booking (P-34 / P-35); null for a local ride.
  final ModeRequest? mode;

  /// A rental: being booked ([mode]), or the booked trip's terms say so (also after an app restart, when [mode] is
  /// not known).
  bool get isRental => mode?.mode == RideMode.rental || tripQuote?.modeTerms is RentalTerms;
  bool get isOutstation => mode?.mode == RideMode.outstation;

  /// "Rental · 4 hrs · 40 km" for a rental (it has no drop), else the drop's name.
  String get dropTitle {
    final terms = quote.modeTerms;
    if (isRental || terms is RentalTerms) {
      final pkg = terms is RentalTerms ? terms.package : RideModeRates.package(mode?.packageId ?? '');
      return pkg == null ? 'Rental' : 'Rental · ${pkg.label}';
    }
    return drop.name;
  }

  final Place pickup;
  final Place drop;

  /// False until the rider chooses where to (live: nothing is chosen for them; [drop] then holds the pickup).
  final bool dropSet;
  final VehicleKind vehicle;
  /// Butterfly choice on P-10; null = the profile's default ("Prefer women driver" in Safety preferences).
  /// Use [RideFlowController.womenDriver] for the effective value.
  final WomenDriverPref? womenDriver;

  /// "Who's riding?": someone else takes this ride (null = the account holder).
  final OtherRider? rider;
  final RidePhase phase;
  final DriverProfile driver;
  final String tripId;
  final DateTime? bookedAt;

  /// Pickup → drop polyline.
  final List<LatLng> route;

  /// Driver start → pickup polyline.
  final List<LatLng> approach;

  /// Minutes to pickup (assigned) or to drop (in progress).
  final int etaMin;
  final List<ChatMessage> chat;
  final bool driverCancelledOnce;

  /// The 4-digit code the passenger tells the driver to start the ride (from the server when live).
  final String otp;

  /// Live API: fares quoted by the server for the current pickup / drop (null while loading).
  final List<FareQuote>? serverQuotes;

  /// Live API: why [serverQuotes] couldn't be loaded (user-facing).
  final String? quotesError;

  /// Live API: the fare stored with the booked trip.
  final FareQuote? tripQuote;

  /// A booking / cancel request is on its way to the server.
  final bool busy;

  /// Live API, "Book any": vehicles added to the search besides [vehicle] (the first driver of any takes it).
  final List<VehicleKind> alsoVehicles;

  /// Live API, while searching: other vehicles with drivers in range that could be added (cheapest first).
  final List<VehicleAlternative> alternatives;

  /// P-10 "Book Any" is chosen: the booking asks Auto, Mini, Sedan and SUV drivers at once ([vehicle] is the cheapest
  /// of them; the others go into [alsoVehicles] right after booking).
  final bool bookAny;

  /// When the driver marked "Arrived" (starts the free waiting minutes, P-15).
  final DateTime? arrivedAt;

  /// The waiting timer at the pickup on the booked fare's terms (null before the driver arrives).
  WaitingTerms? get waiting => arrivedAt == null ? null : quote.waitingFrom(arrivedAt!);

  RouteEstimate get estimate {
    final q = tripQuote ?? (serverQuotes?.isNotEmpty ?? false ? serverQuotes!.first : null);
    if (q != null) return RouteEstimate(distanceKm: q.distanceKm, durationMin: q.durationMin, travelMin: q.travelMin);
    final m = mode;
    if (m != null && m.mode != RideMode.local) {
      final first = RideModeRates.quotesFor(pickup, drop, m).first;
      return RouteEstimate(distanceKm: first.distanceKm, durationMin: first.durationMin);
    }
    return FareEngine.estimate(pickup, drop);
  }

  /// Quotes on the current route: the server's when live, else the pure fare engine (every ride tier) or, for a
  /// rental / outstation booking, the cab tiers at their package or per-km rates.
  List<FareQuote> get quotes {
    final live = serverQuotes;
    if (live != null) return live;
    final m = mode;
    if (m != null && m.mode != RideMode.local) return RideModeRates.quotesFor(pickup, drop, m);
    return FareEngine.quoteAll(Seed.rideVehicles, estimate);
  }

  FareQuote get quote {
    final booked = tripQuote;
    if (booked != null) return booked;
    final all = quotes;
    return all.firstWhere((q) => q.vehicle.kind == vehicle, orElse: () => all.first);
  }

  /// True while a booked ride has not been paid and rated yet.
  bool get isActive => phase != RidePhase.planning && phase != RidePhase.noDrivers;

  /// Pickup → drop route, or a generated one if none has been built yet. A rental has no route (no drop).
  List<LatLng> get routeOrDefault {
    if (isRental) return const [];
    return route.isNotEmpty ? route : roadPath(pickup.location, drop.location, mode: travelModeFor(vehicle));
  }

  RideFlowState copyWith({
    Place? pickup,
    Place? drop,
    bool? dropSet,
    VehicleKind? vehicle,
    Object? womenDriver = _keep,
    Object? rider = _keep,
    RidePhase? phase,
    DriverProfile? driver,
    String? tripId,
    DateTime? bookedAt,
    List<LatLng>? route,
    List<LatLng>? approach,
    int? etaMin,
    List<ChatMessage>? chat,
    bool? driverCancelledOnce,
    String? otp,
    Object? serverQuotes = _keep,
    Object? quotesError = _keep,
    Object? tripQuote = _keep,
    bool? busy,
    List<VehicleKind>? alsoVehicles,
    List<VehicleAlternative>? alternatives,
    Object? arrivedAt = _keep,
    Object? mode = _keep,
    bool? bookAny,
  }) => RideFlowState(
    pickup: pickup ?? this.pickup,
    drop: drop ?? this.drop,
    dropSet: dropSet ?? (drop != null || this.dropSet),
    vehicle: vehicle ?? this.vehicle,
    womenDriver: identical(womenDriver, _keep) ? this.womenDriver : womenDriver as WomenDriverPref?,
    rider: identical(rider, _keep) ? this.rider : rider as OtherRider?,
    phase: phase ?? this.phase,
    driver: driver ?? this.driver,
    tripId: tripId ?? this.tripId,
    bookedAt: bookedAt ?? this.bookedAt,
    route: route ?? this.route,
    approach: approach ?? this.approach,
    etaMin: etaMin ?? this.etaMin,
    chat: chat ?? this.chat,
    driverCancelledOnce: driverCancelledOnce ?? this.driverCancelledOnce,
    otp: otp ?? this.otp,
    serverQuotes: identical(serverQuotes, _keep) ? this.serverQuotes : serverQuotes as List<FareQuote>?,
    quotesError: identical(quotesError, _keep) ? this.quotesError : quotesError as String?,
    tripQuote: identical(tripQuote, _keep) ? this.tripQuote : tripQuote as FareQuote?,
    busy: busy ?? this.busy,
    alsoVehicles: alsoVehicles ?? this.alsoVehicles,
    alternatives: alternatives ?? this.alternatives,
    arrivedAt: identical(arrivedAt, _keep) ? this.arrivedAt : arrivedAt as DateTime?,
    mode: identical(mode, _keep) ? this.mode : mode as ModeRequest?,
    bookAny: bookAny ?? this.bookAny,
  );
}

/// Runs a passenger ride end to end.
///
/// Mock mode (tests, design gallery): timers, like a backend pushing updates:
/// book → searching (3 s) → assigned (driver drives to pickup, 5 s) → arrived →
/// driver enters OTP (4 s) → in progress (vehicle moves along the route) → completed.
///
/// Live API mode ([isLiveApiProvider]): books with [LiveTrips], follows the trip's status, the driver's GPS
/// and chat over the socket (polling while it is down), and cancels / rates through the API.
///
/// Timers and subscriptions live here (not in screens) so the trip keeps going when the passenger leaves
/// P-16 and comes back from the Home "Trip in progress" banner.
class RideFlowController extends Notifier<RideFlowState> {
  final TripSimulator _sim = TripSimulator(tick: SimTimings.tick);

  /// Live API: the driver's last GPS fix on the current leg.
  final ValueNotifier<VehicleFix?> _liveFix = ValueNotifier<VehicleFix?>(null);
  LiveTripSession? _session;

  /// Last applied API status (drops late, older answers).
  String? _lastStatus;
  LatLng? _lastPoint;

  /// Set while the passenger's own cancel is in flight, so the resulting CANCELLED push shows no notice.
  bool _cancelledByMe = false;

  /// The rider chose the pickup (searched or pinned it): the phone's location no longer replaces it until a ride ends.
  bool _pickupChosen = false;

  bool get _live => ref.read(isLiveApiProvider);

  /// Live vehicle marker position for map screens (simulated, or the driver's GPS when live).
  ValueListenable<VehicleFix?> get vehicle => _live ? _liveFix : _sim.vehicle;

  @override
  RideFlowState build() {
    ref.onDispose(() {
      _sim.cancelAll();
      _stopFollowing();
    });
    if (ref.read(isLiveApiProvider)) {
      // Live: the pickup is the phone's location; no drop until the rider chooses one (never a seeded place).
      final here = ref.read(placesRepositoryProvider).currentLocation;
      return RideFlowState(pickup: here, drop: here, dropSet: false, route: const []);
    }
    Future.microtask(_refreshRoute);
    final chat = ref.read(rideRepositoryProvider).chatSeed();
    return RideFlowState(chat: chat, route: roadPath(Seed.gandhipuram.location, Seed.brookefields.location));
  }

  Duration _t(Duration d) => ref.read(simTimingProvider)(d);

  RouteTravelMode get _mode => travelModeFor(state.vehicle);

  /// Swaps in the road-following route once the router answers (if the trip ends are unchanged).
  void _refreshRoute() {
    final a = state.pickup, b = state.drop;
    RoadRouter.fetch(a.location, b.location, mode: _mode).then((path) {
      if (path != null && state.pickup == a && state.drop == b) state = state.copyWith(route: path);
    });
  }

  DemoSettings get _demo => ref.read(demoSettingsProvider);

  // ---------------------------------------------------------------- planning
  /// The rider's pickup. "Use current location" (id `current`) keeps following the phone.
  void setPickup(Place p) {
    _pickupChosen = p.id != 'current';
    _setPickup(p);
  }

  /// The phone's location (first fix, back in the app): it becomes the pickup only while the rider hasn't chosen one
  /// and no ride is on.
  void useDeviceLocation(Place p) {
    if (_pickupChosen || state.isActive) return;
    _setPickup(p);
  }

  void _setPickup(Place p) {
    final before = state.pickup;
    final hadQuotes = state.serverQuotes != null || state.quotesError != null;
    if (_samePlace(before, p)) {
      state = state.copyWith(pickup: p);
      return;
    }
    state = state.copyWith(
      pickup: p,
      route: roadPath(p.location, state.drop.location, mode: _mode),
      serverQuotes: null,
      quotesError: null,
    );
    _refreshRoute();
    // Fares were on screen (or had failed): fetch them for the new stop, else the skeleton never ends.
    if (hadQuotes) unawaited(loadQuotes());
  }

  void setDrop(Place p) {
    final before = state.drop;
    final hadQuotes = state.serverQuotes != null || state.quotesError != null;
    if (_samePlace(before, p)) {
      state = state.copyWith(drop: p);
      return;
    }
    state = state.copyWith(
      drop: p,
      route: roadPath(state.pickup.location, p.location, mode: _mode),
      serverQuotes: null,
      quotesError: null,
    );
    _refreshRoute();
    // Fares were on screen (or had failed): fetch them for the new stop, else the skeleton never ends.
    if (hadQuotes) unawaited(loadQuotes());
  }

  void selectVehicle(VehicleKind v) => state = state.copyWith(vehicle: v, bookAny: false);

  /// "Book Any" (like Ola / Namma Yatri): the nearest Auto, Mini, Sedan or SUV driver takes the ride, at that
  /// vehicle's fare.
  static const bookAnyKinds = [VehicleKind.auto, VehicleKind.cab, VehicleKind.sedan, VehicleKind.suv];

  /// Book Any's vehicles with a fare on this route, cheapest first (empty for rentals and outstation).
  List<FareQuote> get bookAnyQuotes => state.mode != null
      ? const []
      : ([for (final q in state.quotes) if (bookAnyKinds.contains(q.vehicle.kind)) q]
        ..sort((a, b) => a.total.compareTo(b.total)));

  /// P-10: choose Book Any. The cheapest of its vehicles is the one booked; the others are added at once.
  void selectBookAny() {
    final quotes = bookAnyQuotes;
    if (quotes.length < 2) return;
    state = state.copyWith(vehicle: quotes.first.vehicle.kind, bookAny: true);
  }

  /// The Book Any vehicles besides the booked one.
  List<VehicleKind> get _bookAnyRest => state.bookAny
      ? [for (final q in bookAnyQuotes) if (q.vehicle.kind != state.vehicle) q.vehicle.kind]
      : const [];

  /// P-34 Rental / P-35 Outstation: books the cab tiers with [m] (a Sedan to start with); fares reload.
  void startMode(ModeRequest m) {
    final cab = RideModeRates.cabTiers.contains(state.vehicle) ? state.vehicle : VehicleKind.sedan;
    state = state.copyWith(mode: m, vehicle: cab, serverQuotes: null, quotesError: null, tripQuote: null);
    unawaited(loadQuotes());
  }

  /// The rider changed the package, trip type or times: new fares.
  void updateMode(ModeRequest m) {
    if (state.mode == null) return startMode(m);
    state = state.copyWith(mode: m, serverQuotes: null, quotesError: null);
    unawaited(loadQuotes());
  }

  /// Back to a local ride (Home's search, P-10).
  void clearMode() {
    if (state.mode == null) return;
    state = state.copyWith(mode: null, serverQuotes: null, quotesError: null);
  }

  /// Books the rental / outstation trip for later ([ModeRequest.leaveAt]). Returns a user-facing error, or the
  /// scheduled trip (it searches for a driver shortly before its time; see P-36 and Upcoming). A pickup inside the
  /// server's dispatch lead starts searching at once: the trip then comes back not scheduled and is followed like a
  /// ride booked now (the caller opens P-12).
  Future<({String? error, Trip? trip})> bookForLater() async {
    final m = state.mode;
    if (m == null || !m.isLater) return (error: 'Choose a pickup time', trip: null);
    if (state.pickup.isUnknownPickup) return (error: kChoosePickupFirst, trip: null);
    if (state.busy) return (error: null, trip: null);
    state = state.copyWith(busy: true);
    try {
      Trip trip;
      if (_live) {
        final update = await ref.read(liveTripsProvider).book(
              kind: TripKind.ride,
              vehicle: state.vehicle,
              pickup: state.pickup,
              drop: state.isRental ? state.pickup : state.drop,
              womenDriver: womenDriver,
              rider: state.rider,
              mode: m,
            );
        trip = update.trip;
        if (update.status != 'SCHEDULED' && ref.mounted) {
          _startFollowing(update, restoring: false);
          return (error: null, trip: trip);
        }
      } else {
        final q = state.quote;
        trip = Trip(
          id: 'RD-L${DateTime.now().millisecondsSinceEpoch % 10000000}',
          kind: TripKind.ride,
          vehicle: state.vehicle,
          pickup: state.pickup,
          drop: state.isRental ? state.pickup : state.drop,
          fare: q.total,
          quote: q,
          status: TripStatus.scheduled,
          startedAt: DateTime.now(),
          distanceKm: q.distanceKm,
          durationMin: q.durationMin,
          rideMode: m.mode,
          modeTerms: q.modeTerms,
          scheduledAt: m.leaveAt,
        );
        ref.read(mockDatabaseProvider).upcoming.add(trip);
      }
      if (!ref.mounted) return (error: null, trip: trip);
      state = state.copyWith(busy: false);
      ref.invalidate(upcomingTripsProvider);
      return (error: null, trip: trip);
    } catch (e) {
      if (ref.mounted) state = state.copyWith(busy: false);
      return (error: apiErrorMessage(e), trip: null);
    }
  }

  /// Cancels a trip booked for later (free until its search starts).
  Future<String?> cancelUpcoming(String tripId) async {
    try {
      if (_live) {
        await ref.read(liveTripsProvider).cancel(tripId, code: CancelCode.changedMind);
      } else {
        ref.read(mockDatabaseProvider).upcoming.removeWhere((t) => t.id == tripId);
      }
      ref.invalidate(upcomingTripsProvider);
      return null;
    } catch (e) {
      return apiErrorMessage(e);
    }
  }

  /// Butterfly is offered to women riders only: the account holder (profile gender), or the woman they book for.
  bool get canUseButterfly {
    final rider = state.rider;
    return rider != null ? rider.isWoman : ref.read(currentProfileProvider).gender == Gender.female;
  }

  /// The Butterfly setting this ride books with: the P-10 choice, else the profile default.
  WomenDriverPref get womenDriver {
    if (!canUseButterfly) return WomenDriverPref.none;
    return state.womenDriver ??
        (ref.read(currentProfileProvider).preferWomenDriver ? WomenDriverPref.preferred : WomenDriverPref.none);
  }

  /// P-10 "Who's riding?": [rider] = someone else, null = me. Butterfly follows the rider, so "only" fares may change.
  void setRider(OtherRider? rider) {
    final wasOnly = womenDriver == WomenDriverPref.only;
    state = state.copyWith(rider: rider);
    if (wasOnly != (womenDriver == WomenDriverPref.only)) unawaited(loadQuotes());
  }

  /// P-10 Butterfly choice. "Only" changes whose ETAs count, so live fares are fetched again.
  void setWomenDriver(WomenDriverPref v) {
    final wasOnly = womenDriver == WomenDriverPref.only;
    state = state.copyWith(womenDriver: v);
    if (wasOnly != (v == WomenDriverPref.only)) unawaited(loadQuotes());
  }

  /// Live API: loads the server's fares for the current pickup / drop (P-10). No-op in mock mode.
  Future<void> loadQuotes() async {
    if (!_live) return;
    final a = state.pickup, b = state.drop;
    if (a.isUnknownPickup) {
      // No fares from a guessed point: they load once the pickup is set (setPickup asks again).
      state = state.copyWith(serverQuotes: null, quotesError: kChoosePickupForFares);
      return;
    }
    state = state.copyWith(serverQuotes: null, quotesError: null);
    final m = state.mode;
    try {
      final repo = ref.read(rideRepositoryProvider);
      final quotes = m != null && m.mode != RideMode.local
          ? await repo.modeQuotes(a, m.mode == RideMode.rental ? null : b, m)
          : await repo.quotes(a, b, womenOnly: womenDriver == WomenDriverPref.only);
      // The rider changed the package / dates meanwhile: their newer request answers instead.
      if (!identical(state.mode, m)) return;
      if (!ref.mounted) return; // Fares answered after the ride flow was disposed.
      // The pickup / drop moved meanwhile (e.g. GPS resolved): fetch fares for the new points instead of
      // leaving the screen on the loading skeleton.
      if (!_samePlace(state.pickup, a) || !_samePlace(state.drop, b)) return await loadQuotes();
      if (quotes.isEmpty) {
        state = state.copyWith(quotesError: "Couldn't get fares for this trip. Try again.");
        return;
      }
      final kinds = {for (final q in quotes) q.vehicle.kind};
      state = state.copyWith(
        serverQuotes: quotes,
        vehicle: kinds.contains(state.vehicle) ? null : quotes.first.vehicle.kind,
      );
    } catch (e) {
      if (!ref.mounted) return;
      if (_samePlace(state.pickup, a) && _samePlace(state.drop, b)) {
        state = state.copyWith(quotesError: apiErrorMessage(e));
      } else {
        return loadQuotes();
      }
    }
  }

  // ----------------------------------------------------------------- booking
  /// Books the selected vehicle. Returns a user-facing error, or null once the request is searching.
  Future<String?> book() async {
    if (_live) return _bookLive();
    _sim.cancelAll();
    final now = TtClock.now();
    state = state.copyWith(
      phase: RidePhase.searching,
      tripId: 'RD-${now.millisecondsSinceEpoch % 100000000}',
      bookedAt: now,
      // A rental has no drop: the demo drives a short loop near the pickup.
      route: state.isRental
          ? roadPath(state.pickup.location, offsetPoint(state.pickup.location, 2200, 60))
          : roadPath(state.pickup.location, state.drop.location),
      driverCancelledOnce: false,
      chat: ref.read(rideRepositoryProvider).chatSeed(),
      arrivedAt: null,
      alsoVehicles: _bookAnyRest,
    );
    _search(_t(SimTimings.findDriver));
    return null;
  }

  void _search(Duration delay) {
    _sim.after(delay, () async {
      final driver = await ref.read(rideRepositoryProvider).findDriver(state.vehicle);
      if (state.phase != RidePhase.searching && state.phase != RidePhase.driverCancelled) return;
      if (driver == null) {
        state = state.copyWith(phase: RidePhase.noDrivers);
        return;
      }
      _assign(driver);
    });
  }

  void _assign(DriverProfile driver) {
    final start = offsetPoint(state.pickup.location, 900, 35);
    final approach = roadPath(start, state.pickup.location, bend: -0.2);
    state = state.copyWith(phase: RidePhase.assigned, driver: driver, approach: approach, etaMin: 3, arrivedAt: null);
    final arriveIn = _t(SimTimings.driverArrives);

    if (_demo.driverCancels && !state.driverCancelledOnce) {
      // Driver starts moving, then cancels part-way; Tamil Taxi re-searches automatically.
      _sim.animateAlong(approach, arriveIn);
      _sim.after(Duration(milliseconds: arriveIn.inMilliseconds * 2 ~/ 5), () {
        _sim.cancelAll();
        state = state.copyWith(phase: RidePhase.driverCancelled, driverCancelledOnce: true);
        _search(_t(SimTimings.reSearchAfterCancel));
      });
      return;
    }

    _sim.animateAlong(
      approach,
      arriveIn,
      onProgress: (p) => _setEta((3 * (1 - p)).ceil().clamp(1, 3)),
      onDone: _arrive,
    );
  }

  void _arrive() {
    state = state.copyWith(phase: RidePhase.arrived, etaMin: 0, arrivedAt: DateTime.now());
    _sim.after(_t(SimTimings.driverEntersOtp), _startRide);
  }

  void _startRide() {
    final total = state.estimate.tripMin;
    state = state.copyWith(phase: RidePhase.inProgress, etaMin: total);
    _sim.animateAlong(
      state.route,
      _t(SimTimings.rideDuration),
      onProgress: (p) => _setEta((total * (1 - p)).ceil()),
      onDone: () => state = state.copyWith(phase: RidePhase.completed, etaMin: 0),
    );
  }

  void _setEta(int eta) {
    if (eta != state.etaMin) state = state.copyWith(etaMin: eta);
  }

  /// S-01 "Try Auto · ₹72": switch vehicle and search again (a new booking when live).
  Future<String?> retryWith(VehicleKind v) {
    state = state.copyWith(vehicle: v);
    return book();
  }

  // ------------------------------------------------------------- live trips
  Future<String?> _bookLive() async {
    if (state.pickup.isUnknownPickup) return kChoosePickupFirst;
    if (state.busy) return null;
    state = state.copyWith(busy: true);
    try {
      final update = await ref
          .read(liveTripsProvider)
          .book(
            kind: TripKind.ride,
            vehicle: state.vehicle,
            pickup: state.pickup,
            drop: state.isRental ? state.pickup : state.drop,
            womenDriver: womenDriver,
            rider: state.rider,
            mode: state.mode,
          );
      final rest = _bookAnyRest;
      _startFollowing(update, restoring: false);
      if (rest.isNotEmpty) unawaited(_addBookAny(update.trip.id, rest));
      return null;
    } catch (e) {
      state = state.copyWith(busy: false);
      return apiErrorMessage(e);
    }
  }

  /// Picks up an unfinished ride from the server (app restart, a tapped notification). The phase tells the screen to
  /// open. A ride already followed keeps its marker, routes, chat and ETA: the update only moves its status on.
  void restore(LiveTripUpdate update) {
    if (isFollowing(update.trip.id)) return _apply(update);
    _startFollowing(update, restoring: true);
  }

  /// True while this controller follows trip [tripId] (live, not finished).
  bool isFollowing(String tripId) => _session != null && state.tripId == tripId && state.isActive;

  void _startFollowing(LiveTripUpdate update, {required bool restoring}) {
    _stopFollowing();
    final trip = update.trip;
    // A rental has no drop (the server stores the pickup there): no pickup → drop route to draw or fetch.
    final rental = trip.rideMode == RideMode.rental;
    _cancelledByMe = false;
    _lastStatus = null;
    _lastPoint = null;
    _liveFix.value = null;
    state = state.copyWith(
      phase: RidePhase.searching,
      tripId: trip.id,
      bookedAt: trip.startedAt,
      pickup: restoring ? trip.pickup : null,
      drop: restoring ? trip.drop : null,
      vehicle: trip.vehicle,
      route: rental ? const [] : roadPath(trip.pickup.location, trip.drop.location, mode: travelModeFor(trip.vehicle)),
      approach: const [],
      driverCancelledOnce: false,
      chat: const [],
      otp: trip.otp,
      tripQuote: trip.quote,
      busy: false,
      alsoVehicles: update.alsoVehicles,
      alternatives: const [],
    );
    if (!rental) _refreshRoute();
    final session = LiveTripSession(
      trips: ref.read(liveTripsProvider),
      realtime: ref.read(realtimeProvider),
      tripId: trip.id,
      onUpdate: _apply,
      onLocation: _onLocation,
      onMessage: (m) => state = state.copyWith(chat: mergeChat(state.chat, m)),
      onReconnect: _loadChat,
    )..start();
    _session = session;
    _apply(update);
    _loadChat();
  }

  void _stopFollowing() {
    _session?.dispose();
    _session = null;
  }

  Future<void> _loadChat() async {
    final id = state.tripId;
    try {
      final history = await ref.read(liveTripsProvider).chatHistory(id);
      if (state.tripId != id) return;
      state = state.copyWith(chat: chatWithHistory(state.chat, history));
    } catch (e) {
      debugPrint('Chat history: $e');
    }
  }

  void _apply(LiveTripUpdate u) {
    if (u.trip.id != state.tripId) return;
    if (isStaleStatus(u.status, _lastStatus)) return;
    _lastStatus = u.status;
    final next = ridePhaseForStatus(u.status, state.phase);
    if (next == null) return;
    final driver = u.trip.driver ?? state.driver;
    final otp = u.trip.otp.isNotEmpty ? u.trip.otp : null;

    switch (next) {
      case RidePhase.planning:
        _stopFollowing();
        final byMe = _cancelledByMe;
        // The API cancels the trip when the driver drops it; say who, when a driver was on the way.
        final hadDriver = state.phase == RidePhase.assigned || state.phase == RidePhase.arrived;
        final who = hadDriver ? '${state.driver.firstName} cancelled the ride' : 'Your ride was cancelled';
        state = _planningAgain(state.copyWith(busy: false, tripQuote: null));
        ref.invalidate(tripHistoryProvider);
        if (!byMe) {
          ref.read(appNoticeProvider.notifier).show(cancelledNotice(u, who: who, bookAgain: 'You can book again.'), goTo: Routes.ride);
        }
      case RidePhase.noDrivers:
        _stopFollowing();
        state = state.copyWith(phase: RidePhase.noDrivers, busy: false);
      case RidePhase.searching:
        // The fare can change while searching (the rider added extra, maybe from another phone).
        state = state.copyWith(
          phase: RidePhase.searching,
          otp: otp,
          alsoVehicles: u.alsoVehicles,
          arrivedAt: null,
          tripQuote: u.trip.quote ?? state.tripQuote,
        );
      case RidePhase.driverCancelled:
        _liveFix.value = null;
        _lastPoint = null;
        state = state.copyWith(phase: RidePhase.driverCancelled, driverCancelledOnce: true, approach: const [], arrivedAt: null);
      case RidePhase.assigned:
        // Coming from any other phase starts a new approach leg (built from the driver's first fix).
        final fresh = state.phase != RidePhase.assigned;
        // "Book any": a driver of an added vehicle took it, at that vehicle's fare.
        final vehicle = u.trip.vehicle;
        state = state.copyWith(
          phase: RidePhase.assigned,
          driver: driver,
          otp: otp,
          vehicle: vehicle,
          tripQuote: u.trip.quote ?? state.tripQuote,
          alternatives: const [],
          arrivedAt: null,
          approach: fresh ? const [] : null,
          // Until the driver's first fix: the pickup ETA the fare was quoted with (a built-in guess only without one).
          etaMin: fresh ? (u.trip.quote?.pickupEtaMin ?? state.tripQuote?.pickupEtaMin ?? Seed.vehicle(vehicle).etaMin) : null,
        );
      case RidePhase.arrived:
        final at = u.json['arrivedAt'] is String ? DateTime.tryParse(u.json['arrivedAt'] as String)?.toLocal() : null;
        state = state.copyWith(
          phase: RidePhase.arrived,
          driver: driver,
          otp: otp,
          etaMin: 0,
          arrivedAt: at ?? state.arrivedAt ?? DateTime.now(),
          tripQuote: u.trip.quote ?? state.tripQuote,
        );
      case RidePhase.inProgress:
        final entering = state.phase != RidePhase.inProgress;
        state = state.copyWith(
          phase: RidePhase.inProgress,
          driver: driver,
          etaMin: entering ? state.estimate.tripMin : null,
          // The fare now carries the waiting charge (set when the ride started).
          tripQuote: u.trip.quote ?? state.tripQuote,
        );
        if (entering && _lastPoint != null) _track(_lastPoint!);
      case RidePhase.completed:
        state = state.copyWith(phase: RidePhase.completed, driver: driver, etaMin: 0, tripQuote: u.trip.quote ?? state.tripQuote);
        ref.invalidate(tripHistoryProvider);
    }
  }

  void _onLocation(LiveLocation l) {
    if (l.tripId != state.tripId) return;
    final phase = state.phase;
    if (phase == RidePhase.assigned && state.approach.isEmpty) {
      // First fix of this driver: build the approach leg once (one route call per leg).
      final from = l.point, to = state.pickup.location, mode = _mode;
      state = state.copyWith(approach: roadPath(from, to, mode: mode));
      RoadRouter.fetch(from, to, mode: mode).then((path) {
        if (path != null && state.phase == RidePhase.assigned && state.approach.isNotEmpty) {
          state = state.copyWith(approach: path);
          if (_lastPoint != null) _track(_lastPoint!);
        }
      });
    }
    _track(l.point);
  }

  /// Moves the marker to [point] and updates the ETA from what is left of the current leg.
  void _track(LatLng point) {
    final previous = _lastPoint;
    _lastPoint = point;
    final phase = state.phase;
    final leg = phase == RidePhase.inProgress ? state.routeOrDefault : state.approach;
    final track = leg.isEmpty ? (progress: 0.0, remainingKm: 0.0, totalKm: 0.0) : trackOnPath(leg, point);
    _liveFix.value = VehicleFix(
      position: point,
      heading: headingFor(previous, point, _liveFix.value?.heading ?? 0),
      progress: track.progress,
    );
    switch (phase) {
      case RidePhase.assigned when leg.isNotEmpty:
        _setEta(etaMinutes(track.remainingKm, kApproachSpeedKmh));
      case RidePhase.inProgress:
        _setEta(remainingTripMinutes(track, state.estimate.tripMin));
      default:
        break;
    }
  }

  // ------------------------------------------------------------------- chat
  void sendChat(String text) {
    if (_live) {
      unawaited(_sendLive(text));
      return;
    }
    final now = TtClock.now();
    final mine = ChatMessage(id: 'c${now.microsecondsSinceEpoch}', text: text, fromMe: true, sentAt: now);
    state = state.copyWith(chat: [...state.chat, mine]);
    final replies = Seed.driverReplies;
    final sentByMe = state.chat.where((m) => m.fromMe).length;
    _sim.after(_t(SimTimings.chatReply), () {
      final reply = ChatMessage(
        id: 'r${DateTime.now().microsecondsSinceEpoch}',
        text: replies[(sentByMe - 1) % replies.length],
        fromMe: false,
        sentAt: TtClock.now(),
      );
      state = state.copyWith(chat: [...state.chat, reply]);
    });
  }

  Future<void> _sendLive(String text) async {
    final id = state.tripId;
    final now = TtClock.now();
    final local = ChatMessage(id: 'local-${now.microsecondsSinceEpoch}', text: text, fromMe: true, sentAt: now);
    state = state.copyWith(chat: [...state.chat, local]);
    try {
      final sent = await ref.read(liveTripsProvider).sendMessage(id, text);
      if (state.tripId != id) return;
      final hasSent = state.chat.any((m) => m.id == sent.id);
      state = state.copyWith(
        chat: [
          for (final m in state.chat)
            if (m.id == local.id) ...[if (!hasSent) sent] else m,
        ],
      );
    } catch (e) {
      if (state.tripId != id) return;
      state = state.copyWith(chat: state.chat.where((m) => m.id != local.id).toList());
      ref.read(appNoticeProvider.notifier).show("Message not sent. ${apiErrorMessage(e)}");
    }
  }

  // ----------------------------------------------------------------- ending
  /// Passenger cancelled (S-03). Mock: adds a Cancelled trip to Activity. Live: cancels on the server.
  /// Returns a user-facing error (the ride goes on), or null.
  Future<String?> cancelRide({CancelCode code = CancelCode.other, String? note}) async {
    if (_live) return _cancelLive(code, note: note);
    _sim.cancelAll();
    if (state.phase != RidePhase.planning) {
      await ref.read(rideRepositoryProvider).addTrip(_trip(TripStatus.cancelled));
      ref.invalidate(tripHistoryProvider);
    }
    state = _planningAgain(state);
    return null;
  }

  /// Live, while searching: refreshes the vehicles that could be added ("Book any"). Quiet on errors.
  Future<void> loadAlternatives() async {
    if (!_live || state.phase != RidePhase.searching) return;
    final id = state.tripId;
    try {
      final list = await ref.read(liveTripsProvider).alternatives(id);
      if (state.tripId != id || state.phase != RidePhase.searching) return;
      state = state.copyWith(alternatives: [for (final a in list) if (!state.alsoVehicles.contains(a.vehicle)) a]);
    } catch (e) {
      debugPrint('Alternatives: $e');
    }
  }

  /// Book Any, right after booking: the other vehicles join the search one by one (the API caps a trip at three
  /// extra). Quiet on errors: the booked vehicle's search goes on regardless.
  Future<void> _addBookAny(String tripId, List<VehicleKind> kinds) async {
    for (final k in kinds) {
      if (state.tripId != tripId || state.phase != RidePhase.searching) return;
      try {
        final update = await ref.read(liveTripsProvider).addVehicle(tripId, k);
        if (state.tripId == tripId) state = state.copyWith(alsoVehicles: update.alsoVehicles);
      } catch (e) {
        debugPrint('Book Any: $e');
      }
    }
  }

  /// Live, while searching: also look for [v] ("Book any"). Returns an error to show, or null.
  Future<String?> addVehicle(VehicleKind v) async {
    if (!_live || state.phase != RidePhase.searching || state.busy) return null;
    state = state.copyWith(busy: true);
    try {
      final update = await ref.read(liveTripsProvider).addVehicle(state.tripId, v);
      state = state.copyWith(
        busy: false,
        alsoVehicles: update.alsoVehicles,
        alternatives: [for (final a in state.alternatives) if (a.vehicle != v) a],
      );
      return null;
    } catch (e) {
      state = state.copyWith(busy: false);
      return apiErrorMessage(e);
    }
  }

  /// Live, while searching: the rider's extra in all becomes [amount] ("+₹10", then "+₹20" more → ₹30). Returns an
  /// error to show, or null.
  Future<String?> addExtra(int amount) async {
    if (!_live || state.phase != RidePhase.searching || state.busy) return null;
    state = state.copyWith(busy: true);
    try {
      final update = await ref.read(liveTripsProvider).addExtra(state.tripId, amount);
      state = state.copyWith(busy: false, tripQuote: update.trip.quote ?? state.tripQuote);
      return null;
    } catch (e) {
      state = state.copyWith(busy: false);
      return apiErrorMessage(e);
    }
  }

  /// Cancel while still searching / no drivers: nothing is recorded (mock). Live: a searching request is
  /// cancelled on the server; a request that already ended with no drivers just closes.
  Future<String?> cancelSearch() async {
    if (_live) {
      if (state.phase == RidePhase.noDrivers || state.phase == RidePhase.planning) {
        _stopFollowing();
        state = _planningAgain(state.copyWith(tripQuote: null));
        return null;
      }
      return _cancelLive(CancelCode.changedMind, note: 'Cancelled while searching');
    }
    _sim.cancelAll();
    state = _planningAgain(state);
    return null;
  }

  Future<String?> _cancelLive(CancelCode code, {String? note}) async {
    if (!state.isActive) {
      state = _planningAgain(state);
      return null;
    }
    _cancelledByMe = true;
    state = state.copyWith(busy: true);
    try {
      await ref.read(liveTripsProvider).cancel(state.tripId, code: code, note: note);
    } catch (e) {
      _cancelledByMe = false;
      state = state.copyWith(busy: false);
      return apiErrorMessage(e);
    }
    _stopFollowing();
    state = _planningAgain(state.copyWith(busy: false, tripQuote: null));
    ref.invalidate(tripHistoryProvider);
    return null;
  }

  /// P-20 Submit / Skip. Mock: adds the trip to the top of Activity as Completed. Live: sends the rating
  /// (Skip sends nothing); the server already recorded the trip.
  Future<void> finishRide({int? rating}) async {
    if (_live) {
      final id = state.tripId;
      _stopFollowing();
      if (rating != null) {
        try {
          await ref.read(liveTripsProvider).rate(id, rating);
        } on ApiException catch (e) {
          // Already rated (409) is fine; anything else is worth telling.
          if (e.status != 409) ref.read(appNoticeProvider.notifier).show(e.message);
        } catch (e) {
          ref.read(appNoticeProvider.notifier).show("Couldn't send your rating. ${apiErrorMessage(e)}");
        }
      }
      ref.invalidate(tripHistoryProvider);
      ref.invalidate(recentDestinationsProvider);
      // The next ride starts where the rider is now (Home locates again), not at this ride's pickup.
      _pickupChosen = false;
      state = _planningAgain(state.copyWith(tripQuote: null, busy: false));
      return;
    }
    _sim.cancelAll();
    await ref.read(rideRepositoryProvider).addTrip(_trip(TripStatus.completed, rating: rating));
    ref.invalidate(tripHistoryProvider);
    _pickupChosen = false;
    state = _planningAgain(state);
  }

  /// Back to planning after a ride ended or was cancelled (by anyone): the next ride is for "me" again with the
  /// profile's Butterfly default (booking for someone else, and the P-10 Butterfly choice, are chosen each time).
  RideFlowState _planningAgain(RideFlowState s) =>
      s.copyWith(phase: RidePhase.planning, rider: null, womenDriver: null);

  Trip _trip(TripStatus status, {int? rating}) {
    final q = state.quote;
    return Trip(
      id: state.tripId,
      kind: TripKind.ride,
      vehicle: state.vehicle,
      pickup: state.pickup,
      drop: state.drop,
      fare: q.total,
      quote: q,
      status: status,
      startedAt: state.bookedAt ?? TtClock.now(),
      driver: state.driver,
      distanceKm: q.distanceKm,
      durationMin: q.durationMin,
      rating: rating,
    );
  }
}

final rideFlowProvider = NotifierProvider<RideFlowController, RideFlowState>(RideFlowController.new);

/// Same place for fares: `Place ==` only compares ids, and the current location keeps its id as it moves.
bool _samePlace(Place a, Place b) => a.id == b.id && a.location == b.location;

/// The passenger's trips booked for later (Home's Upcoming card, Activity).
final upcomingTripsProvider = FutureProvider.autoDispose<List<Trip>>((ref) {
  ref.watch(mockDatabaseProvider);
  return ref.watch(rideRepositoryProvider).upcomingTrips();
});

/// Popular outstation drops around a pickup (P-35b).
final outstationDestinationsProvider = FutureProvider.autoDispose.family<List<Place>, LatLng>(
  (ref, at) => ref.watch(rideRepositoryProvider).outstationDestinations(at),
);
