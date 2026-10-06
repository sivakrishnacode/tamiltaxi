import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart' show PhotoAttachment;

import '../router/routes.dart';
import 'app_notice.dart';
import 'live_trip.dart';
import 'passenger_session.dart';
import 'ride_flow.dart'
    show kChoosePickupFirst, kChoosePickupForFares, upcomingTripsProvider;

enum ParcelPhase {
  /// PP-01 … PP-06: filling in details.
  planning,
  searching,
  noDrivers,

  /// Driver assigned, driving to the pickup (PP-08, stepper at "Driver assigned").
  assigned,

  /// Driver is at the pickup (PP-08, stepper at "At pickup").
  atPickup,

  /// Picked up, on the way to the drop (PP-09).
  inTransit,
  delivered,
}

/// The parcel phase for an API trip [status], or null to ignore the update. A driver who cancels after
/// accepting sends the booking back to SEARCHING (PP-07 again).
ParcelPhase? parcelPhaseForStatus(String status) => switch (status) {
  'SEARCHING' => ParcelPhase.searching,
  'NO_DRIVERS' => ParcelPhase.noDrivers,
  'DRIVER_ASSIGNED' => ParcelPhase.assigned,
  'DRIVER_ARRIVED' => ParcelPhase.atPickup,
  'PICKED_UP' => ParcelPhase.inTransit,
  'DELIVERED' => ParcelPhase.delivered,
  'CANCELLED' => ParcelPhase.planning,
  _ => null,
};

const Object _keep = Object();

/// Parcel details for a new booking with the live API: nothing seeded, the sender comes from the profile.
const ParcelDetails kEmptyParcelDetails = ParcelDetails(
  category: ParcelCategory.other,
  weight: WeightBand.under5,
  senderName: '',
  senderPhone: '',
  receiverName: '',
  receiverPhone: '',
  deliveryOtp: '',
);

@immutable
class ParcelFlowState {
  const ParcelFlowState({
    this.pickup = Seed.peelamedu,
    this.drop = Seed.raceCourse,
    this.dropSet = false,
    this.vehicle = VehicleKind.threeWheeler,
    // Like a new booking: nothing said about the parcel yet (PP-04 is optional).
    this.details = const ParcelDetails(
      category: ParcelCategory.other,
      weight: WeightBand.under5,
      senderName: 'Priya Raman',
      senderPhone: '+91 98765 43210',
      receiverName: Seed.receiverName,
      receiverPhone: Seed.receiverPhone,
    ),
    this.detailsSet = false,
    this.phase = ParcelPhase.planning,
    this.driver = Seed.selvam,
    this.tripId = 'PC-DEMO',
    this.bookedAt,
    this.deliveredAt,
    this.route = const [],
    this.approach = const [],
    this.etaMin = 23,
    this.chat = const [],
    this.serverQuotes,
    this.quotesError,
    this.tripQuote,
    this.busy = false,
    this.outstation = false,
    this.leaveAt,
  });

  final Place pickup;
  final Place drop;

  /// False until the passenger fills in "Deliver to" (PP-01 shows "Tap to add").
  final bool dropSet;
  final VehicleKind vehicle;
  final ParcelDetails details;

  /// The passenger filled in "What are you sending?" (PP-04, optional). Until then PP-06 offers to add it and the
  /// parcel goes as "Other · Under 5 kg".
  final bool detailsSet;
  final ParcelPhase phase;
  final DriverProfile driver;
  final String tripId;
  final DateTime? bookedAt;
  final DateTime? deliveredAt;
  final List<LatLng> route;

  /// Live API: driver's first fix → pickup polyline (empty until the driver's GPS arrives).
  final List<LatLng> approach;
  final int etaMin;

  /// Live API: chat with the goods driver (mock mode chats through the ride flow).
  final List<ChatMessage> chat;

  /// Live API: goods fares quoted by the server (null while loading).
  final List<FareQuote>? serverQuotes;
  final String? quotesError;

  /// Live API: the fare stored with the booked parcel.
  final FareQuote? tripQuote;
  final bool busy;

  /// Goods to another town: the goods trucks one way by the km; the drop may be outside the service area.
  final bool outstation;

  /// Goods to another town booked for later (null: now).
  final DateTime? leaveAt;

  RouteEstimate get estimate {
    final q = tripQuote ?? (serverQuotes?.isNotEmpty ?? false ? serverQuotes!.first : null);
    return q != null
        ? RouteEstimate(distanceKm: q.distanceKm, durationMin: q.durationMin, travelMin: q.travelMin)
        : FareEngine.estimate(pickup, drop);
  }

  List<FareQuote> get quotes =>
      serverQuotes ??
      (outstation ? GoodsModeRates.outstationQuotes(pickup, drop) : FareEngine.quoteAll(Seed.goodsVehicles, estimate));

  FareQuote get quote {
    final booked = tripQuote;
    if (booked != null) return booked;
    final all = quotes;
    return all.firstWhere((q) => q.vehicle.kind == vehicle, orElse: () => all.first);
  }

  /// Whether [v] can carry the chosen weight band.
  bool fits(VehicleType v) => (v.capacityKg ?? 0) >= details.weight.maxKg;

  bool get isActive => phase != ParcelPhase.planning && phase != ParcelPhase.noDrivers;

  /// Stepper index: Driver assigned 0 · At pickup 1 · Picked up 2 · Delivered 3.
  int get stepIndex => switch (phase) {
    ParcelPhase.planning || ParcelPhase.searching || ParcelPhase.noDrivers || ParcelPhase.assigned => 0,
    ParcelPhase.atPickup => 1,
    ParcelPhase.inTransit => 2,
    ParcelPhase.delivered => 3,
  };

  List<LatLng> get routeOrDefault =>
      route.isNotEmpty ? route : roadPath(pickup.location, drop.location, mode: travelModeFor(vehicle));

  ParcelFlowState copyWith({
    Place? pickup,
    Place? drop,
    bool? dropSet,
    VehicleKind? vehicle,
    ParcelDetails? details,
    bool? detailsSet,
    ParcelPhase? phase,
    DriverProfile? driver,
    String? tripId,
    DateTime? bookedAt,
    DateTime? deliveredAt,
    List<LatLng>? route,
    List<LatLng>? approach,
    int? etaMin,
    List<ChatMessage>? chat,
    Object? serverQuotes = _keep,
    Object? quotesError = _keep,
    Object? tripQuote = _keep,
    bool? busy,
    bool? outstation,
    Object? leaveAt = _keep,
  }) => ParcelFlowState(
    pickup: pickup ?? this.pickup,
    drop: drop ?? this.drop,
    dropSet: dropSet ?? this.dropSet,
    vehicle: vehicle ?? this.vehicle,
    details: details ?? this.details,
    detailsSet: detailsSet ?? this.detailsSet,
    phase: phase ?? this.phase,
    driver: driver ?? this.driver,
    tripId: tripId ?? this.tripId,
    bookedAt: bookedAt ?? this.bookedAt,
    deliveredAt: deliveredAt ?? this.deliveredAt,
    route: route ?? this.route,
    approach: approach ?? this.approach,
    etaMin: etaMin ?? this.etaMin,
    chat: chat ?? this.chat,
    serverQuotes: identical(serverQuotes, _keep) ? this.serverQuotes : serverQuotes as List<FareQuote>?,
    quotesError: identical(quotesError, _keep) ? this.quotesError : quotesError as String?,
    tripQuote: identical(tripQuote, _keep) ? this.tripQuote : tripQuote as FareQuote?,
    busy: busy ?? this.busy,
    outstation: outstation ?? this.outstation,
    leaveAt: identical(leaveAt, _keep) ? this.leaveAt : leaveAt as DateTime?,
  );
}

/// Runs a parcel booking.
///
/// Mock mode: PP-07 search (3 s) → PP-08 driver drives to pickup (4 s) → at pickup → "Picked up" (2 s) →
/// PP-09 in transit → PP-10 delivered.
///
/// Live API mode: books with [LiveTrips] (`kind: parcel`, details + payer), follows SEARCHING → DRIVER_ASSIGNED →
/// DRIVER_ARRIVED → PICKED_UP → DELIVERED with the driver's GPS, and shows the delivery OTP from the server.
class ParcelFlowController extends Notifier<ParcelFlowState> {
  final TripSimulator _sim = TripSimulator(tick: SimTimings.tick);
  /// Live API: the driver's car, gliding between their GPS fixes along the current leg (SD-1).
  final VehicleGlide _glide = VehicleGlide();
  LiveTripSession? _session;

  /// Last applied API status (drops late, older answers).
  String? _lastStatus;
  LatLng? _lastPoint;

  /// When the newest applied fix was taken: an older one (a poll answer after a socket fix) is ignored.
  DateTime? _lastFixAt;
  bool _cancelledByMe = false;

  /// The passenger chose the pickup themselves (the device location no longer replaces it).
  bool _pickupChosen = false;

  bool get _live => ref.read(isLiveApiProvider);

  ValueListenable<VehicleFix?> get vehicle => _live ? _glide.vehicle : _sim.vehicle;

  @override
  ParcelFlowState build() {
    ref.onDispose(() {
      _sim.cancelAll();
      _stopFollowing();
      _glide.dispose();
    });
    if (ref.read(isLiveApiProvider)) return _freshLive();
    Future.microtask(_refreshRoute);
    return ParcelFlowState(route: roadPath(Seed.peelamedu.location, Seed.raceCourse.location));
  }

  ParcelFlowState _freshLive() => ParcelFlowState(
    pickup: ref.read(placesRepositoryProvider).currentLocation,
    // The bike carries most parcels and costs least; PP-06 offers the others.
    vehicle: VehicleKind.goodsBike,
    details: kEmptyParcelDetails,
    driver: Seed.selvam,
    tripId: '',
  );

  Duration _t(Duration d) => ref.read(simTimingProvider)(d);

  RouteTravelMode get _mode => travelModeFor(state.vehicle);

  /// Swaps in the road-following route once the router answers (if the trip ends are unchanged).
  void _refreshRoute() {
    final a = state.pickup, b = state.drop;
    RoadRouter.fetch(a.location, b.location, mode: _mode).then((path) {
      if (path != null && state.pickup == a && state.drop == b) state = state.copyWith(route: path);
    });
  }

  void setPickup(Place p) {
    _pickupChosen = true;
    _setPickup(p);
  }

  /// Device location resolved: use it as the pickup unless the passenger already chose one.
  void useDeviceLocation(Place p) {
    if (_pickupChosen || state.phase != ParcelPhase.planning) return;
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
      state = state.copyWith(drop: p, dropSet: true);
      return;
    }
    state = state.copyWith(
      drop: p,
      dropSet: true,
      route: roadPath(state.pickup.location, p.location, mode: _mode),
      serverQuotes: null,
      quotesError: null,
    );
    _refreshRoute();
    // Fares were on screen (or had failed): fetch them for the new stop, else the skeleton never ends.
    if (hadQuotes) unawaited(loadQuotes());
  }

  void updateDetails(ParcelDetails d) {
    state = state.copyWith(details: d);
    // If the chosen vehicle no longer fits the weight, pick the smallest one that does.
    final current = Seed.vehicle(state.vehicle);
    if (!state.fits(current)) {
      final fit = Seed.goodsVehicles.firstWhere(state.fits, orElse: () => Seed.truck);
      state = state.copyWith(vehicle: fit.kind);
    }
  }

  /// PP-04 Save: the parcel's category / weight are the passenger's own choice now.
  void markDetailsSet() => state = state.copyWith(detailsSet: true);

  /// PP-01 Switch: pickup and drop change places, and so do the sender and the receiver (a parcel coming to you).
  /// An empty sender is the rider first, so after the switch the rider is the receiver.
  void swapStops() {
    final d = _detailsToSend;
    _pickupChosen = true;
    state = state.copyWith(
      pickup: state.drop,
      drop: state.pickup,
      dropSet: true,
      details: d.copyWith(
        senderName: d.receiverName,
        senderPhone: d.receiverPhone,
        receiverName: d.senderName,
        receiverPhone: d.senderPhone,
        pickupNote: d.dropNote,
        dropNote: d.pickupNote,
      ),
      route: roadPath(state.drop.location, state.pickup.location, mode: _mode),
      serverQuotes: null,
      quotesError: null,
    );
    _refreshRoute();
  }

  void selectVehicle(VehicleKind v) => state = state.copyWith(vehicle: v);

  /// PP-01 "In town" / "To another town". Another town: goods trucks only (no goods bike), the fares reload; back in
  /// town the later time goes.
  void setOutstation(bool v) {
    if (v == state.outstation) return;
    final hadQuotes = state.serverQuotes != null || state.quotesError != null;
    state = state.copyWith(
      outstation: v,
      serverQuotes: null,
      quotesError: null,
      leaveAt: v ? state.leaveAt : null,
      vehicle: v && !GoodsModeRates.isGoodsTruck(state.vehicle) ? VehicleKind.threeWheeler : null,
    );
    if (hadQuotes) unawaited(loadQuotes());
  }

  /// PP-06 (another town): now (null) or a pickup time up to 7 days ahead.
  void setLeaveAt(DateTime? at) => state = state.copyWith(leaveAt: at);

  void setPayer(ParcelPayer p) => updateDetails(state.details.copyWith(payer: p));

  /// Live API: loads the server's goods fares for the current pickup / drop (PP-06). No-op in mock mode.
  Future<void> loadQuotes() async {
    if (!_live) return;
    final a = state.pickup, b = state.drop;
    if (a.isUnknownPickup) {
      state = state.copyWith(serverQuotes: null, quotesError: kChoosePickupForFares);
      return;
    }
    state = state.copyWith(serverQuotes: null, quotesError: null);
    try {
      final quotes = await ref.read(parcelRepositoryProvider).quotes(a, b, outstation: state.outstation);
      // The pickup / drop moved meanwhile (e.g. GPS resolved): fetch fares for the new points instead of
      // leaving the screen on the loading skeleton.
      if (!_samePlace(state.pickup, a) || !_samePlace(state.drop, b)) return await loadQuotes();
      state = quotes.isEmpty
          ? state.copyWith(quotesError: "Couldn't get fares for this delivery. Try again.")
          : state.copyWith(serverQuotes: quotes);
    } catch (e) {
      if (_samePlace(state.pickup, a) && _samePlace(state.drop, b)) {
        state = state.copyWith(quotesError: apiErrorMessage(e));
      } else {
        return loadQuotes();
      }
    }
  }

  /// The details as booked: a sender left empty (the "Deliver to" path never asks) is the rider, so the driver has
  /// someone to call at the pickup.
  ParcelDetails get _detailsToSend {
    final d = state.details;
    final me = ref.read(passengerProfileProvider).value;
    if (me == null) return d;
    return d.copyWith(
      senderName: d.senderName.trim().isEmpty && me.name != kPlaceholderName ? me.name : d.senderName,
      senderPhone: d.senderPhone.trim().isEmpty ? me.phone : d.senderPhone,
    );
  }

  /// Books the parcel. Returns a user-facing error, or null once the request is searching.
  Future<String?> book() async {
    if (_live) return _bookLive();
    _sim.cancelAll();
    final now = TtClock.now();
    state = state.copyWith(
      phase: ParcelPhase.searching,
      tripId: 'PC-${now.millisecondsSinceEpoch % 100000000}',
      bookedAt: now,
      route: roadPath(state.pickup.location, state.drop.location),
    );
    _sim.after(_t(SimTimings.findGoodsDriver), () async {
      final driver = await ref.read(rideRepositoryProvider).findDriver(state.vehicle);
      if (state.phase != ParcelPhase.searching) return;
      if (driver == null) {
        state = state.copyWith(phase: ParcelPhase.noDrivers);
        return;
      }
      _assign(driver);
    });
    return null;
  }

  void _assign(DriverProfile driver) {
    final start = offsetPoint(state.pickup.location, 1100, 210);
    state = state.copyWith(phase: ParcelPhase.assigned, driver: driver, etaMin: 4);
    _sim.animateAlong(
      roadPath(start, state.pickup.location, bend: 0.2),
      _t(SimTimings.goodsDriverReachesPickup),
      onProgress: (p) {
        final eta = (4 * (1 - p)).ceil().clamp(1, 4);
        if (eta != state.etaMin) state = state.copyWith(etaMin: eta);
      },
      onDone: () {
        state = state.copyWith(phase: ParcelPhase.atPickup, etaMin: 0);
        _sim.after(_t(SimTimings.pickupHandover), _pickedUp);
      },
    );
  }

  void _pickedUp() {
    final total = state.estimate.tripMin;
    state = state.copyWith(phase: ParcelPhase.inTransit, etaMin: total);
    _sim.animateAlong(
      state.route,
      _t(SimTimings.parcelTransit),
      onProgress: (p) {
        final eta = (total * (1 - p)).ceil();
        if (eta != state.etaMin) state = state.copyWith(etaMin: eta);
      },
      onDone: () => state = state.copyWith(
        phase: ParcelPhase.delivered,
        etaMin: 0,
        deliveredAt: TtClock.now(),
      ),
    );
  }

  PhotoAttachment? photo;
  void setPhoto(PhotoAttachment? value) {
    photo = value;
    updateDetails(state.details.copyWith(hasPhoto: value != null));
  }

  Future<void> _uploadPhoto(String tripId) async {
    final value = photo;
    if (value == null) return;
    try {
      await ref
          .read(apiClientProvider)
          .upload(
            '/trips/$tripId/parcel-photo',
            field: 'file',
            bytes: value.bytes,
            filename: value.name,
          );
      photo = null;
    } catch (_) {
      if (ref.mounted) {
        ref
            .read(appNoticeProvider.notifier)
            .show('Your parcel is booked, but the photo could not upload.');
      }
    }
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
            kind: TripKind.parcel,
            vehicle: state.vehicle,
            pickup: state.pickup,
            drop: state.drop,
            parcel: _detailsToSend,
            mode: state.outstation
                ? const ModeRequest(mode: RideMode.outstation)
                : null,
          );
      _startFollowing(update, restoring: false);
      await _uploadPhoto(update.trip.id);
      return null;
    } catch (e) {
      state = state.copyWith(busy: false);
      return apiErrorMessage(e);
    }
  }

  /// Goods to another town booked for [ParcelFlowState.leaveAt]: it waits as scheduled (Activity › Upcoming) and the
  /// form resets for the next parcel. Returns the booked trip for P-36, or a user-facing error.
  Future<({String? error, Trip? trip})> bookForLater() async {
    final at = state.leaveAt;
    if (!state.outstation || at == null) return (error: 'Choose a pickup time', trip: null);
    if (state.pickup.isUnknownPickup) return (error: kChoosePickupFirst, trip: null);
    if (state.busy) return (error: null, trip: null);
    state = state.copyWith(busy: true);
    try {
      Trip trip;
      if (_live) {
        final update = await ref.read(liveTripsProvider).book(
              kind: TripKind.parcel,
              vehicle: state.vehicle,
              pickup: state.pickup,
              drop: state.drop,
              parcel: _detailsToSend,
              mode: ModeRequest(mode: RideMode.outstation, leaveAt: at),
            );
        trip = update.trip;
        await _uploadPhoto(trip.id);
        // Inside the server's dispatch lead it searches at once: follow it like a parcel booked now (PP-07).
        if (update.status != 'SCHEDULED' && ref.mounted) {
          _startFollowing(update, restoring: false);
          return (error: null, trip: trip);
        }
      } else {
        final q = state.quote;
        trip = Trip(
          id: 'PC-L${DateTime.now().millisecondsSinceEpoch % 10000000}',
          kind: TripKind.parcel,
          vehicle: state.vehicle,
          pickup: state.pickup,
          drop: state.drop,
          fare: q.total,
          quote: q,
          status: TripStatus.scheduled,
          startedAt: DateTime.now(),
          distanceKm: q.distanceKm,
          durationMin: q.durationMin,
          parcel: state.details,
          rideMode: RideMode.outstation,
          modeTerms: q.modeTerms,
          scheduledAt: at,
        );
        ref.read(mockDatabaseProvider).upcoming.add(trip);
      }
      if (!ref.mounted) return (error: null, trip: trip);
      state = state.copyWith(busy: false, leaveAt: null);
      ref.invalidate(upcomingTripsProvider);
      return (error: null, trip: trip);
    } catch (e) {
      if (ref.mounted) state = state.copyWith(busy: false);
      return (error: apiErrorMessage(e), trip: null);
    }
  }

  /// Picks up an unfinished parcel from the server (app restart, a tapped notification). A parcel already followed
  /// keeps its marker, routes and chat: the update only moves its status on.
  void restore(LiveTripUpdate update) {
    if (isFollowing(update.trip.id)) return _apply(update);
    _startFollowing(update, restoring: true);
  }

  /// True while this controller follows trip [tripId] (live, not finished).
  bool isFollowing(String tripId) => _session != null && state.tripId == tripId && state.isActive;

  void _startFollowing(LiveTripUpdate update, {required bool restoring}) {
    _stopFollowing();
    final trip = update.trip;
    _cancelledByMe = false;
    _lastStatus = null;
    _lastPoint = null;
    _lastFixAt = null;
    _glide.clear();
    final details = (restoring ? trip.parcel : null) ?? state.details;
    state = state.copyWith(
      phase: ParcelPhase.searching,
      tripId: trip.id,
      bookedAt: trip.startedAt,
      pickup: restoring ? trip.pickup : null,
      drop: restoring ? trip.drop : null,
      dropSet: true,
      vehicle: trip.vehicle,
      details: details.copyWith(deliveryOtp: trip.otp),
      route: roadPath(trip.pickup.location, trip.drop.location, mode: travelModeFor(trip.vehicle)),
      approach: const [],
      chat: const [],
      tripQuote: trip.quote,
      busy: false,
    );
    _refreshRoute();
    _session = LiveTripSession(
      trips: ref.read(liveTripsProvider),
      realtime: ref.read(realtimeProvider),
      tripId: trip.id,
      onUpdate: _apply,
      onLocation: _onLocation,
      onMessage: (m) => state = state.copyWith(chat: mergeChat(state.chat, m)),
      onReconnect: _loadChat,
    )..start();
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
      if (state.tripId == id) state = state.copyWith(chat: chatWithHistory(state.chat, history));
    } catch (e) {
      debugPrint('Chat history: $e');
    }
  }

  void _apply(LiveTripUpdate u) {
    if (u.trip.id != state.tripId) return;
    if (isStaleStatus(u.status, _lastStatus)) return;
    _lastStatus = u.status;
    final next = parcelPhaseForStatus(u.status);
    if (next == null) return;
    final driver = u.trip.driver ?? state.driver;
    final otp = u.trip.otp;
    final details = otp.isNotEmpty && otp != state.details.deliveryOtp
        ? state.details.copyWith(deliveryOtp: otp)
        : null;

    switch (next) {
      case ParcelPhase.planning:
        _stopFollowing();
        final byMe = _cancelledByMe;
        state = state.copyWith(phase: ParcelPhase.planning, busy: false, tripQuote: null);
        ref.invalidate(tripHistoryProvider);
        if (!byMe) {
          ref.read(appNoticeProvider.notifier).show(cancelledNotice(u, who: 'Your delivery was cancelled', bookAgain: 'You can book again.'), goTo: Routes.parcel);
        }
      case ParcelPhase.noDrivers:
        _stopFollowing();
        state = state.copyWith(phase: ParcelPhase.noDrivers, busy: false);
      case ParcelPhase.searching:
        if (state.phase == ParcelPhase.assigned || state.phase == ParcelPhase.atPickup) {
          ref.read(appNoticeProvider.notifier).show('${state.driver.firstName} had to cancel. Finding another driver…');
        }
        _glide.clear();
        _lastPoint = null;
        _lastFixAt = null;
        state = state.copyWith(
          phase: ParcelPhase.searching,
          approach: const [],
          details: details,
          // The fare can change while searching (the sender added extra).
          tripQuote: u.trip.quote ?? state.tripQuote,
        );
      case ParcelPhase.assigned:
        final fresh = state.phase != ParcelPhase.assigned;
        state = state.copyWith(
          phase: ParcelPhase.assigned,
          driver: driver,
          details: details,
          approach: fresh ? const [] : null,
          // Until the driver's first fix: the pickup ETA the fare was quoted with (a built-in guess only without one).
          etaMin: fresh ? (u.trip.quote?.pickupEtaMin ?? state.tripQuote?.pickupEtaMin ?? Seed.vehicle(state.vehicle).etaMin) : null,
        );
      case ParcelPhase.atPickup:
        state = state.copyWith(phase: ParcelPhase.atPickup, driver: driver, details: details, etaMin: 0);
      case ParcelPhase.inTransit:
        final entering = state.phase != ParcelPhase.inTransit;
        state = state.copyWith(
          phase: ParcelPhase.inTransit,
          driver: driver,
          details: details,
          etaMin: entering ? state.estimate.tripMin : null,
        );
        if (entering && _lastPoint != null) _track(_lastPoint!);
      case ParcelPhase.delivered:
        state = state.copyWith(phase: ParcelPhase.delivered, driver: driver, etaMin: 0, deliveredAt: TtClock.now());
        ref.invalidate(tripHistoryProvider);
    }
    // A read of the trip (restore, a poll while the socket is down) carries the driver's last fix: show the car
    // now instead of after the next `trip.location`.
    final at = u.driverLocation;
    if (at != null) _onLocation(at);
  }

  void _onLocation(LiveLocation l) {
    if (l.tripId != state.tripId) return;
    final last = _lastFixAt;
    if (last != null && (l.at.isBefore(last) || (l.at == last && l.point == _lastPoint))) return;
    _lastFixAt = l.at;
    if (state.phase == ParcelPhase.assigned && state.approach.isEmpty) {
      final from = l.point, to = state.pickup.location, mode = _mode;
      state = state.copyWith(approach: roadPath(from, to, mode: mode));
      RoadRouter.fetch(from, to, mode: mode).then((path) {
        if (path != null && state.phase == ParcelPhase.assigned && state.approach.isNotEmpty) {
          state = state.copyWith(approach: path);
          if (_lastPoint != null) _track(_lastPoint!);
        }
      });
    }
    _track(l.point, heading: l.heading);
  }

  /// Moves the car to [point] (gliding there along the leg) and updates the ETA from what is left of the leg.
  void _track(LatLng point, {double? heading}) {
    _lastPoint = point;
    final phase = state.phase;
    final leg = phase == ParcelPhase.inTransit ? state.routeOrDefault : state.approach;
    final track = leg.isEmpty ? (progress: 0.0, remainingKm: 0.0, totalKm: 0.0) : trackOnPath(leg, point);
    _glide.addFix(point, heading: heading, path: leg);
    final eta = switch (phase) {
      ParcelPhase.assigned when leg.isNotEmpty => etaMinutes(track.remainingKm, kApproachSpeedKmh),
      ParcelPhase.inTransit => remainingTripMinutes(track, state.estimate.tripMin),
      _ => null,
    };
    if (eta != null && eta != state.etaMin) state = state.copyWith(etaMin: eta);
  }

  /// Live API: chat with the goods driver (PP-08 Chat). Mock mode chats through the ride flow.
  void sendChat(String text) => unawaited(_sendLive(text));

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
      ref.read(appNoticeProvider.notifier).show('Message not sent. ${apiErrorMessage(e)}');
    }
  }

  /// Live, while searching: the sender's extra in all becomes [amount]. Returns an error to show, or null.
  Future<String?> addExtra(int amount) async {
    if (!_live || state.phase != ParcelPhase.searching || state.busy) return null;
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

  /// Cancel from PP-07 / PP-08. Mock: a cancelled parcel is not recorded before pickup. Live: cancels on the
  /// server (a request that ended with no drivers just closes). Returns a user-facing error, or null.
  Future<String?> cancel() async {
    if (!_live) {
      _sim.cancelAll();
      state = state.copyWith(phase: ParcelPhase.planning);
      return null;
    }
    if (!state.isActive) {
      _stopFollowing();
      state = state.copyWith(phase: ParcelPhase.planning, tripQuote: null);
      return null;
    }
    _cancelledByMe = true;
    state = state.copyWith(busy: true);
    try {
      await ref.read(liveTripsProvider).cancel(state.tripId, code: CancelCode.changedMind, note: 'Cancelled by sender');
    } catch (e) {
      _cancelledByMe = false;
      state = state.copyWith(busy: false);
      return apiErrorMessage(e);
    }
    _stopFollowing();
    state = state.copyWith(phase: ParcelPhase.planning, busy: false, tripQuote: null);
    ref.invalidate(tripHistoryProvider);
    return null;
  }

  /// PP-10 Done. Mock: adds the parcel to Activity as Delivered and resets the form. Live: sends the rating
  /// (none when not rated) and resets the form; the server already recorded the delivery.
  Future<void> finish({int? rating}) async {
    if (_live) {
      final id = state.tripId;
      _stopFollowing();
      if (rating != null) {
        try {
          await ref.read(liveTripsProvider).rate(id, rating);
        } on ApiException catch (e) {
          if (e.status != 409) ref.read(appNoticeProvider.notifier).show(e.message);
        } catch (e) {
          ref.read(appNoticeProvider.notifier).show("Couldn't send your rating. ${apiErrorMessage(e)}");
        }
      }
      ref.invalidate(tripHistoryProvider);
      _pickupChosen = false;
      final keepSender = state.details;
      state = _freshLive().copyWith(
        details: kEmptyParcelDetails.copyWith(senderName: keepSender.senderName, senderPhone: keepSender.senderPhone),
      );
      return;
    }
    _sim.cancelAll();
    final q = state.quote;
    await ref
        .read(rideRepositoryProvider)
        .addTrip(
          Trip(
            id: state.tripId,
            kind: TripKind.parcel,
            vehicle: state.vehicle,
            pickup: state.pickup,
            drop: state.drop,
            fare: q.total,
            quote: q,
            status: TripStatus.delivered,
            startedAt: state.bookedAt ?? TtClock.now(),
            driver: state.driver,
            distanceKm: q.distanceKm,
            durationMin: q.durationMin,
            otp: state.details.deliveryOtp,
            parcel: state.details,
            rating: rating,
          ),
        );
    ref.invalidate(tripHistoryProvider);
    state = ParcelFlowState(route: roadPath(Seed.peelamedu.location, Seed.raceCourse.location));
  }
}

final parcelFlowProvider = NotifierProvider<ParcelFlowController, ParcelFlowState>(ParcelFlowController.new);

/// Same place for fares: `Place ==` only compares ids, and the current location keeps its id as it moves.
bool _samePlace(Place a, Place b) => a.id == b.id && a.location == b.location;
