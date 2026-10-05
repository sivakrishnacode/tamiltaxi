import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart' show AppLifecycleState, WidgetsBinding;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart' show Distance, LengthUnit;
import 'package:tamiltaxi_data/tamiltaxi_data.dart';

import 'driver_location.dart';
import 'driver_account.dart';
import '../router/routes.dart';
import 'live_helpers.dart';

/// Where the driver's current job is.
enum JobPhase {
  none,

  /// Accepted; driving to the pickup (D-16 / D-21 step 0).
  toPickup,

  /// Ride: at pickup, entering the ride OTP (D-17). Delivery: at pickup, loading (D-21 step 1).
  atPickup,

  /// Ride: in progress (D-18). Delivery: picked up, driving to the drop (D-21 step 2).
  toDrop,

  /// Delivery only: at the drop, entering the delivery OTP (D-22a).
  atDrop,

  /// Collecting payment (D-19 / D-22b).
  collect,
}

/// A one-off message from the session for a snack bar (live API), e.g. "The passenger cancelled".
@immutable
class SessionNotice {
  const SessionNotice(this.message, {this.jobEnded = false, this.goTo});
  final String? goTo;
  final String message;

  /// The job ended from the other side: the job screens close and Home shows.
  final bool jobEnded;
}

/// Another request open for the driver while they look at [DriverSessionState.incoming] (stacked on the card).
@immutable
class QueuedOffer {
  const QueuedOffer(this.request, this.expiresAt);
  final RideRequest request;
  final DateTime expiresAt;
}

/// Most requests shown at once: the one in focus plus this many queued (the server's `maxOpenOffers` is 3).
const kMaxQueuedOffers = 3;

@immutable
class DriverSessionState {
  const DriverSessionState({
    this.online = false,
    this.goingOnline = false,
    this.selfieDoneThisSession = false,
    this.incoming,
    this.incomingExpiresAt,
    this.queued = const [],
    this.missedRequest = false,
    this.job,
    this.phase = JobPhase.none,
    this.route = const [],
    this.etaMin = 0,
    this.todayEarnings = Seed.todayEarnings,
    this.todayRides = Seed.todayRides,
    this.gpsLost = false,
    this.notice,
    this.noShowAt,
    this.waiting,
  });

  final bool online;

  /// Live API: getting a GPS fix and asking the API to go online.
  final bool goingOnline;

  /// Mock mode: the simulated daily selfie check (S-13) is due the first time each app session. Live, the server
  /// decides (403 `SELFIE_CHECK_REQUIRED` from going online).
  final bool selfieDoneThisSession;

  /// A request waiting for Accept / Decline (D-15 / D-20).
  final RideRequest? incoming;

  /// Live API: when the server moves the offer to the next driver.
  final DateTime? incomingExpiresAt;

  /// Live API: other requests open at the same time, oldest first (the card shows them as chips to switch to).
  final List<QueuedOffer> queued;

  /// Show the S-11 "You missed a ride request" banner on D-14.
  final bool missedRequest;
  final RideRequest? job;
  final JobPhase phase;

  /// Polyline for the current leg (to pickup, then to drop).
  final List<LatLng> route;
  final int etaMin;
  final int todayEarnings;
  final int todayRides;

  /// Live API: no GPS fix for 30 s while online (S-16).
  final bool gpsLost;
  final SessionNotice? notice;

  /// At the pickup: from then the driver may cancel as "Passenger didn't come" (the server enforces the wait).
  final DateTime? noShowAt;

  /// At the pickup: the waiting timer (free minutes, then the waiting charge the server adds when the ride starts).
  final WaitingTerms? waiting;

  bool get onJob => job != null && phase != JobPhase.none;

  DriverSessionState copyWith({
    bool? online,
    bool? goingOnline,
    bool? selfieDoneThisSession,
    RideRequest? incoming,
    DateTime? incomingExpiresAt,
    bool clearIncoming = false,
    List<QueuedOffer>? queued,
    bool? missedRequest,
    RideRequest? job,
    bool clearJob = false,
    JobPhase? phase,
    List<LatLng>? route,
    int? etaMin,
    int? todayEarnings,
    int? todayRides,
    bool? gpsLost,
    SessionNotice? notice,
    DateTime? noShowAt,
    WaitingTerms? waiting,
  }) => DriverSessionState(
    online: online ?? this.online,
    goingOnline: goingOnline ?? this.goingOnline,
    selfieDoneThisSession: selfieDoneThisSession ?? this.selfieDoneThisSession,
    incoming: clearIncoming ? null : (incoming ?? this.incoming),
    incomingExpiresAt: clearIncoming
        ? null
        : (incomingExpiresAt ?? this.incomingExpiresAt),
    queued: queued ?? (clearIncoming ? const [] : this.queued),
    missedRequest: missedRequest ?? this.missedRequest,
    job: clearJob ? null : (job ?? this.job),
    phase: phase ?? this.phase,
    route: route ?? this.route,
    etaMin: etaMin ?? this.etaMin,
    todayEarnings: todayEarnings ?? this.todayEarnings,
    todayRides: todayRides ?? this.todayRides,
    gpsLost: gpsLost ?? this.gpsLost,
    notice: notice ?? this.notice,
    noShowAt: clearJob ? null : (noShowAt ?? this.noShowAt),
    waiting: clearJob ? null : (waiting ?? this.waiting),
  );
}

/// The driver's session: online / offline, incoming requests and the current job's phases.
///
/// Mock mode (seed data, widget tests, design gallery): requests arrive on a timer (5 s after going
/// online, 8 s after each decline, timeout or completed job) and the vehicle marker moves along each leg.
///
/// Live API ([isLiveApiProvider]): going online needs a GPS fix; offers come from dispatch over the socket
/// ([LiveJobs.offers], plus [LiveJobs.currentOffer] after a reconnect or resume); every job step is an API
/// call; the phone's GPS moves the marker and is uploaded about every 5 s / 20 m over the socket. While the socket
/// is down those fixes are kept on the phone ([FixBuffer], up to 500) and sent in one batch: over HTTP every 30 s
/// while requests get through (else a plain heartbeat), and over the socket as soon as it reconnects. ETA comes
/// from progress along the stored route, never from a routing call on a timer.
class DriverSessionController extends Notifier<DriverSessionState> {
  final TripSimulator _sim = TripSimulator(tick: SimTimings.tick);

  // Live API only.
  StreamSubscription<GpsFix>? _gps;
  StreamSubscription<LiveOffer>? _offerSub;
  StreamSubscription<String>? _closedSub;
  StreamSubscription<DateTime>? _pauseSub;
  StreamSubscription<bool>? _connectionSub;
  StreamSubscription<LiveTripUpdate>? _jobSub;
  StreamSubscription<TripNudge>? _nudgeSub;
  DateTime? _pendingPause;
  String? _pendingStatusRoute;
  StreamSubscription<Map<String, dynamic>>? _statusSub;

  /// The driver's own cancel is in flight: its SEARCHING / CANCELLED push is not "the server ended your job".
  bool _cancelling = false;
  Timer? _ticker;
  LatLng? _position;
  double _heading = 0;
  DateTime? _lastFixAt;
  LatLng? _lastSent;
  DateTime? _lastSentAt;
  DateTime? _lastHeartbeat;
  GpsFix? _lastFix;
  final FixBuffer _buffer = FixBuffer();
  bool _flushing = false;
  DateTime? _gpsRestartedAt;
  bool _fixInFlight = false;
  int _legMin = 0;
  String? _legKey;
  bool _attached = false;
  final Set<String> _closedOffers = {};

  /// Declined trips and the fare they were declined at: the same offer again is ignored (a late copy), unless the
  /// rider has since added extra, when the server offers it to every driver again.
  final Map<String, int> _declinedFares = {};

  static const _gpsStaleAfter = Duration(seconds: 30);

  /// No fix for this long while online: ask for a one-shot fix and restart the stream (see [_healGps]).
  static const _gpsHealAfter = Duration(seconds: 20);
  static const _heartbeatEvery = Duration(seconds: 30);

  /// Socket down: how often the job / open offers are checked over HTTP instead.
  static const _pollEvery = Duration(seconds: 15);
  DateTime? _lastPoll;

  /// Live position of the driver's vehicle.
  ValueListenable<VehicleFix?> get vehicle => _sim.vehicle;

  /// Latest GPS fix (live API), or null before the first one.
  LatLng? get position => _position;

  /// Metres from the latest GPS fix to [point] (null without a fix or in mock mode), for the early
  /// "you're far" hint on the Arrived / End buttons. The API decides.
  int? metresTo(LatLng point) {
    final p = _position;
    if (!_live || p == null) return null;
    return const Distance().as(LengthUnit.Meter, p, point).round();
  }

  bool get _live => ref.read(isLiveApiProvider);
  LiveJobs get _jobs => ref.read(liveJobsProvider);

  @override
  DriverSessionState build() {
    ref.onDispose(_sim.cancelAll);
    ref.watch(mockDatabaseProvider);
    // The seeded demo parks the car at its home point; the live app shows only the real GPS position.
    if (!_live) _sim.place(Seed.driverHome);
    if (_live) {
      // A rebuild (log out / log in) starts a fresh session.
      _attached = false;
      _pendingPause = null;
      _pendingStatusRoute = null;
      _statusSub?.cancel();
      _closedOffers.clear();
      _declinedFares.clear();
      _legKey = null;
      ref.onDispose(() {
        _statusSub?.cancel();
        _stopTracking();
        _stopPreview();
        _unwatchJob();
      });
      return const DriverSessionState(todayEarnings: 0, todayRides: 0);
    }
    return const DriverSessionState();
  }

  Duration _t(Duration d) => ref.read(simTimingProvider)(d);
  WorkType get workType => ref.read(demoSettingsProvider).workType;

  // ------------------------------------------------------------ online state
  void markSelfieDone() => state = state.copyWith(selfieDoneThisSession: true);

  /// Live API: throws [LocationProblem] (GPS off / denied) or [ApiException] (not approved, plan expired)
  /// with a message to show; the driver stays offline.
  Future<void> goOnline() async {
    if (state.online || state.goingOnline) return;
    if (!_live) {
      state = state.copyWith(online: true, missedRequest: false);
      _scheduleRequest(_t(SimTimings.firstRequest));
      return;
    }
    state = state.copyWith(goingOnline: true, missedRequest: false);
    try {
      final locator = ref.read(driverLocatorProvider);
      // A recent position (offline preview) is enough to go online right away, also indoors; the online GPS
      // stream refines it within seconds. A fresh fix is only needed when there's none.
      final at = _lastFixAt;
      final recent =
          _position != null &&
              at != null &&
              DateTime.now().difference(at) < const Duration(minutes: 2)
          ? GpsFix(_position!, heading: _heading, at: at)
          : null;
      // Always checked (fast): also catches approximate-only location, which delivers a fix every 10 minutes.
      await locator.ensureReady();
      final fix = recent ?? await locator.currentFix();
      await locator.requestNotificationPermission();
      await _jobs.goOnline(fix.point);
      if (!ref.mounted) return;
      _onFix(fix, upload: false);
      state = state.copyWith(online: true, goingOnline: false, gpsLost: false);
      _startTracking();
      unawaited(_recoverOffer());
    } catch (_) {
      if (ref.mounted) state = state.copyWith(goingOnline: false);
      rethrow;
    }
  }

  /// [tellServer] false: offline on the phone only (signing out: the log-out call tells dispatch once).
  Future<void> goOffline({bool tellServer = true}) async {
    _sim.cancelAll();
    if (!_live) {
      state = state.copyWith(
        online: false,
        clearIncoming: true,
        missedRequest: false,
      );
      return;
    }
    final pending = [?state.incoming, for (final q in state.queued) q.request];
    _stopTracking();
    // Kept only while online or on a job.
    if (!state.onJob) _buffer.clear();
    state = state.copyWith(
      online: false,
      clearIncoming: true,
      missedRequest: false,
      gpsLost: false,
    );
    for (final r in pending) {
      _quiet(_jobs.decline(r.id));
    }
    if (!tellServer) return;
    // Keep showing where the driver is (offline preview, nothing uploaded).
    unawaited(locateHere(ask: false));
    try {
      await _jobs.goOffline();
    } catch (_) {
      // Dispatch also drops drivers whose heartbeat stops.
    }
  }

  void _scheduleRequest(Duration delay) {
    if (_live) return;
    _sim.after(delay, () {
      if (!state.online || state.onJob || state.incoming != null) return;
      state = state.copyWith(
        incoming: ref.read(driverRepositoryProvider).nextRequest(workType),
        missedRequest: false,
      );
    });
  }

  void dismissMissedBanner() => state = state.copyWith(missedRequest: false);

  // ---------------------------------------------------------------- requests
  /// How long the request card stays open: the server's offer time (live) or the 15 s demo countdown.
  Duration get incomingCountdown {
    final expires = state.incomingExpiresAt;
    if (expires == null) return _t(SimTimings.requestCountdown);
    final left = expires.difference(DateTime.now());
    return left < const Duration(seconds: 1)
        ? const Duration(seconds: 1)
        : left;
  }

  void declineRequest() {
    final r = state.incoming;
    if (_live) {
      _promoteNext();
      if (r != null) {
        _declinedFares[r.id] = r.fare;
        _quiet(_jobs.decline(r.id));
      }
      return;
    }
    state = state.copyWith(clearIncoming: true);
    _scheduleRequest(_t(SimTimings.nextRequest));
  }

  /// The countdown ran out: the next stacked request, else the S-11 banner on D-14. (Live: the server moves the
  /// offer on, and may offer it to this driver again when nobody else is around, so a timed-out trip is *not* added
  /// to [_closedOffers] or [_declinedFares].)
  void requestTimedOut() {
    if (_promoteNext()) return;
    state = state.copyWith(clearIncoming: true, missedRequest: true);
    _scheduleRequest(_t(SimTimings.nextRequest));
  }

  /// The driver tapped a stacked request: it comes into focus; the one they were looking at waits in the stack.
  void focusQueued(String tripId) {
    final pick = state.queued.where((q) => q.request.id == tripId).firstOrNull;
    final current = state.incoming;
    if (pick == null || current == null) return;
    state = state.copyWith(
      incoming: pick.request,
      incomingExpiresAt: pick.expiresAt,
      queued: [
        QueuedOffer(
          current,
          state.incomingExpiresAt ?? DateTime.now().add(incomingCountdown),
        ),
        for (final q in state.queued)
          if (q.request.id != tripId) q,
      ],
    );
  }

  /// Declines [tripId], in focus or stacked ([timedOut]: its ring ran out, nothing is sent; the server moves it on).
  void declineOffer(String tripId, {bool timedOut = false}) {
    if (state.incoming?.id == tripId) {
      timedOut ? requestTimedOut() : declineRequest();
      return;
    }
    final declined = state.queued
        .where((q) => q.request.id == tripId)
        .firstOrNull;
    if (declined == null) return;
    state = state.copyWith(
      queued: [
        for (final q in state.queued)
          if (q.request.id != tripId) q,
      ],
    );
    if (timedOut || !_live) return;
    _declinedFares[tripId] = declined.request.fare;
    _quiet(_jobs.decline(tripId));
  }

  /// Accepts [tripId] from the list of open requests (brought into focus first).
  Future<void> acceptOffer(String tripId) {
    if (state.incoming?.id != tripId) focusQueued(tripId);
    if (state.incoming?.id != tripId) return Future.value();
    return acceptRequest();
  }

  /// The oldest stacked request (not yet expired) comes into focus; false (and nothing in focus) when none is left.
  bool _promoteNext() {
    final now = DateTime.now().add(const Duration(seconds: 1));
    final left = [
      for (final q in state.queued)
        if (q.expiresAt.isAfter(now)) q,
    ];
    if (left.isEmpty) {
      state = state.copyWith(clearIncoming: true);
      return false;
    }
    state = state.copyWith(
      incoming: left.first.request,
      incomingExpiresAt: left.first.expiresAt,
      queued: left.sublist(1),
    );
    return true;
  }

  /// Live: the accept call in flight (its own `trip.offer_closed` must not switch the card meanwhile).
  String? _acceptingId;

  /// Live API: throws [ApiException] ("This request is no longer available") when another driver got it
  /// or the offer expired; the request is cleared either way.
  Future<void> acceptRequest() async {
    final r = state.incoming;
    if (r == null) return;
    if (!_live) {
      final start = Seed.driverHome;
      final leg = roadPath(
        start,
        r.pickup.location,
        bend: -0.2,
        mode: travelModeFor(r.vehicle),
      );
      state = state.copyWith(
        clearIncoming: true,
        job: r,
        phase: JobPhase.toPickup,
        route: leg,
        etaMin: r.pickupEtaMin,
      );
      _sim.animateAlong(
        leg,
        _t(SimTimings.driverLegDuration),
        onProgress: (p) => _eta(r.pickupEtaMin, p),
      );
      return;
    }
    _closedOffers.add(r.id);
    _acceptingId = r.id;
    try {
      final update = await _jobs.accept(r.id);
      if (!ref.mounted) return;
      final job = rideRequestFromUpdate(update, offer: r);
      state = state.copyWith(
        clearIncoming: true,
        job: job,
        phase: JobPhase.toPickup,
        missedRequest: false,
      );
      _setLeg(
        _position ?? job.pickup.location,
        job.pickup.location,
        job.vehicle,
        job.pickupEtaMin,
      );
      _watchJob(job.id);
    } on ApiException catch (e) {
      // A server error may come after the trip was assigned: check before giving up.
      if (e.status >= 500 && await _recoverAccepted(r)) return;
      // Gone (someone else took it, or it was cancelled): the next stacked request, if any.
      if (ref.mounted && state.incoming?.id == r.id) _promoteNext();
      if (e.status == 404 || e.status == 409) {
        throw const ApiException(409, 'This request is no longer available');
      }
      rethrow;
    } catch (_) {
      // The answer was lost (timeout, dropped connection; the POST is not retried) while the server may have assigned
      // the trip: if it is this driver's job now, carry on with it.
      if (await _recoverAccepted(r)) return;
      if (ref.mounted && state.incoming?.id == r.id) _promoteNext();
      rethrow;
    } finally {
      _acceptingId = null;
    }
  }

  /// After a failed accept: true (and the job restored) when the server says the driver is on [offer]'s trip.
  Future<bool> _recoverAccepted(RideRequest offer) async {
    try {
      final active = await _jobs.active();
      if (!ref.mounted || active == null || active.trip.id != offer.id) {
        return false;
      }
      final phase = jobPhaseForStatus(active.status);
      if (phase == JobPhase.none) return false;
      final job = rideRequestFromUpdate(active, offer: offer);
      state = state.copyWith(
        clearIncoming: true,
        job: job,
        phase: phase,
        missedRequest: false,
        noShowAt: active.noShowAt,
        waiting: waitingOf(active),
      );
      _setLeg(
        _position ?? job.pickup.location,
        phase == JobPhase.toPickup ? job.pickup.location : job.drop.location,
        job.vehicle,
        phase == JobPhase.toPickup ? job.pickupEtaMin : job.tripMin,
      );
      _watchJob(job.id);
      return true;
    } catch (_) {
      return false;
    }
  }

  /// A job step was refused as if the trip moved on (400 / 404 / 409): it may have been cancelled while the socket
  /// was down. Checks with the server (the error still shows); [_syncJob] ends the job if it's gone.
  void _checkAfterRefusal(Object error) {
    if (error is ApiException &&
        error.tooFar == null &&
        const {400, 404, 409}.contains(error.status)) {
      unawaited(_syncJob());
    }
  }

  /// The current job. Live API: throws when it's gone (cancelled meanwhile), so a job screen never carries on
  /// without one; mock mode keeps returning null (the design gallery opens job screens with no job).
  RideRequest? _jobOrGone() {
    final job = state.job;
    if (job == null && _live) {
      throw const ApiException(409, 'This trip was cancelled');
    }
    return job;
  }

  void _eta(int total, double p) {
    final eta = (total * (1 - p)).ceil();
    if (eta != state.etaMin) state = state.copyWith(etaMin: eta);
  }

  // -------------------------------------------------------------------- ride
  /// D-16 "Arrived at pickup" (rides) / D-21 "Reached pickup" (deliveries). Live API: sends the GPS fix;
  /// farther than the pickup radius the API refuses with [ApiException.tooFar] until [farReason] is given.
  Future<void> arrivedAtPickup({String? farReason}) async {
    final job = _jobOrGone();
    if (job == null) return;
    if (_live) {
      final LiveTripUpdate update;
      try {
        update = await _jobs.arrived(
          job.id,
          at: _position,
          farReason: farReason,
        );
      } catch (e) {
        _checkAfterRefusal(e);
        rethrow;
      }
      if (ref.mounted) {
        state = state.copyWith(
          phase: JobPhase.atPickup,
          etaMin: 0,
          noShowAt: update.noShowAt ?? _defaultNoShowAt(),
          waiting: waitingOf(update) ?? _defaultWaiting(job),
        );
      }
      return;
    }
    _sim.cancelAll();
    _sim.place(job.pickup.location);
    state = state.copyWith(
      phase: JobPhase.atPickup,
      etaMin: 0,
      noShowAt: _defaultNoShowAt(),
      waiting: _defaultWaiting(job),
    );
  }

  /// D-17 (mock only): true if [code] matches the ride OTP (4829). With the live API the server checks it
  /// in [startTrip].
  bool verifyRideOtp(String code) => code == (state.job?.otp ?? Seed.rideOtp);

  /// D-17 "Start ride" with the passenger's [otp] / D-21 "Picked up". Live API: throws [ApiException]
  /// ("Wrong OTP, please try again") when the server rejects the code.
  Future<void> startTrip({String? otp}) async {
    final job = _jobOrGone();
    if (job == null) return;
    if (_live) {
      final LiveTripUpdate update;
      try {
        update = await _jobs.start(job.id, otp: job.isDelivery ? null : otp);
      } catch (e) {
        _checkAfterRefusal(e);
        rethrow;
      }
      if (!ref.mounted) return;
      // The fare now includes any waiting charge; a rental's clock runs from the server's start time.
      final started = update.json['startedAt'] is String
          ? DateTime.tryParse(update.json['startedAt'] as String)?.toLocal()
          : null;
      state = state.copyWith(
        phase: JobPhase.toDrop,
        job: job.copyWith(
          fare: update.trip.fare,
          quote: update.trip.quote,
          rideStartedAt: started ?? DateTime.now(),
        ),
      );
      _setLeg(job.pickup.location, job.drop.location, job.vehicle, job.tripMin);
      return;
    }
    final leg = roadPath(
      job.pickup.location,
      job.drop.location,
      mode: travelModeFor(job.vehicle),
    );
    state = state.copyWith(
      phase: JobPhase.toDrop,
      route: leg,
      etaMin: job.tripMin,
      job: job.copyWith(rideStartedAt: DateTime.now()),
    );
    _sim.animateAlong(
      leg,
      _t(SimTimings.rideDuration),
      onProgress: (p) => _eta(job.tripMin, p),
    );
  }

  /// D-18 "Swipe to end ride" → collect payment. Live API: completes the trip (the fare is recorded); far from
  /// the drop it needs [farReason] ([ApiException.tooFar]).
  Future<void> endRide({String? farReason}) async {
    final job = _jobOrGone();
    if (job == null) return;
    if (_live) {
      final LiveTripUpdate update;
      try {
        update = await _jobs.complete(
          job.id,
          at: _position,
          farReason: farReason,
        );
      } catch (e) {
        _checkAfterRefusal(e);
        rethrow;
      }
      if (!ref.mounted) return;
      _unwatchJob();
      // The final fare (it may include the passenger's earlier cancellation fee, a rental's extra km and minutes):
      // D-19 collects this and lists its lines.
      state = state.copyWith(
        phase: JobPhase.collect,
        etaMin: 0,
        job: job.copyWith(fare: update.trip.fare, quote: update.trip.quote),
      );
      return;
    }
    _sim.cancelAll();
    _sim.place(job.drop.location);
    state = state.copyWith(phase: JobPhase.collect, etaMin: 0);
  }

  // ---------------------------------------------------------------- delivery
  /// D-21 "Reached drop location" → D-22a (a local step in both modes).
  void reachedDrop() {
    final job = state.job;
    if (job == null) return;
    if (!_live) {
      _sim.cancelAll();
      _sim.place(job.drop.location);
    }
    state = state.copyWith(phase: JobPhase.atDrop, etaMin: 0);
  }

  /// D-22a (mock only): true if [code] matches the delivery OTP (7153).
  bool verifyDeliveryOtp(String code) =>
      code == (state.job?.parcel?.deliveryOtp ?? Seed.deliveryOtp);

  /// D-22a "Complete delivery" → collect view. Live API: the server checks the receiver's [otp] and
  /// throws [ApiException] when it is wrong.
  Future<void> completeDelivery({String? otp, String? farReason}) async {
    final job = _jobOrGone();
    if (job == null) return;
    if (_live) {
      try {
        await _jobs.complete(
          job.id,
          otp: otp,
          at: _position,
          farReason: farReason,
        );
      } catch (e) {
        _checkAfterRefusal(e);
        rethrow;
      }
      if (!ref.mounted) return;
      _unwatchJob();
    }
    state = state.copyWith(phase: JobPhase.collect);
  }

  // ------------------------------------------------------------------ finish
  /// D-19 / D-22b "Received cash" / "Received on UPI": today's earnings and rides go up by the fare and
  /// the driver is back online (mock: the next request arrives in 8 s; live: the API already recorded
  /// the fare, so earnings are reloaded). Live, [mode] is stored on the trip first (the rider's receipt
  /// and the earnings list show it): offline, this throws and the driver taps again; a refusal from the
  /// API (the trip changed meanwhile) can't be fixed by tapping again, so the driver moves on.
  Future<void> collectPayment(PaymentMode mode) async {
    final job = state.job;
    if (job == null) return;
    if (_live) {
      try {
        await _jobs.recordPayment(job.id, mode);
      } on ApiException {
        // Nothing to retry.
      }
      if (!ref.mounted || state.job?.id != job.id) return;
      _unwatchJob();
      ref.read(realtimeProvider).leaveTrip(job.id);
      state = state.copyWith(
        clearJob: true,
        phase: JobPhase.none,
        route: const [],
        etaMin: 0,
        todayEarnings: state.todayEarnings + job.fare,
        todayRides: state.todayRides + 1,
      );
      ref.invalidate(earningsProvider);
      unawaited(refreshToday());
      _applyPendingRestrictions();
      if (state.online) unawaited(_recoverOffer());
      return;
    }
    final now = TtClock.now();
    await ref
        .read(driverRepositoryProvider)
        .recordCompletedJob(
          EarningsTrip(
            id: 'e${now.millisecondsSinceEpoch}',
            time: now,
            from: job.pickup.name.split(' ').first,
            to: job.drop.name.split(' ').first,
            fare: job.fare,
            paymentMode: mode,
            distanceKm: job.tripKm,
            durationMin: job.tripMin,
            passengerName: job.customerName,
            isDelivery: job.isDelivery,
          ),
        );
    state = state.copyWith(
      clearJob: true,
      phase: JobPhase.none,
      route: const [],
      todayEarnings: state.todayEarnings + job.fare,
      todayRides: state.todayRides + 1,
      online: true,
    );
    ref.invalidate(earningsProvider);
    _scheduleRequest(_t(SimTimings.nextRequest));
  }

  /// Mock mode and an older API without waiting terms: the default free minutes and cap, the vehicle's rate.
  /// None for rentals, outstation trips and house shifts (no waiting charge there).
  WaitingTerms? _defaultWaiting(RideRequest job) =>
      job.rideMode != RideMode.local || job.isShifting
      ? null
      : WaitingTerms(
          arrivedAt: DateTime.now(),
          perMin: Seed.vehicle(job.vehicle).fareRule.waitPerMin,
        );

  /// The API's default no-show wait (5 min), for mock mode and an older API without `noShowAt`.
  DateTime _defaultNoShowAt() => DateTime.now().add(const Duration(minutes: 5));

  /// D-16 overflow → Cancel ride → reason [code]. Back to D-14 online. Live API: throws when the API refuses.
  Future<void> cancelJob({
    CancelCode code = CancelCode.other,
    String? note,
  }) async {
    final job = state.job;
    if (_live) {
      _cancelling = true;
      try {
        if (job != null) await _jobs.cancel(job.id, code: code, note: note);
      } on ApiException catch (e) {
        // 403 / 404: the trip is no longer this driver's (cancelled meanwhile, or the first answer was lost): ended.
        if (e.status != 403 && e.status != 404) {
          _cancelling = false;
          unawaited(_syncJob());
          rethrow;
        }
      } catch (_) {
        // Lost answer: the server may have cancelled it; the check ends the job if so.
        _cancelling = false;
        unawaited(_syncJob());
        rethrow;
      } finally {
        _cancelling = false;
      }
      if (!ref.mounted) return;
      _endJob();
      return;
    }
    _sim.cancelAll();
    state = state.copyWith(
      clearJob: true,
      phase: JobPhase.none,
      route: const [],
    );
    _scheduleRequest(_t(SimTimings.nextRequest));
  }

  // ------------------------------------------------------------- live API only
  /// Restores the session when Home opens (live API): today's earnings and the job the driver was on (after an app
  /// restart; the driver stays online to finish it). Otherwise the app always starts **offline**: only the driver
  /// goes online, so if the API still has them online (the app was killed while online) it is told they're offline.
  Future<void> attach() async {
    if (!_live || _attached) return;
    if (!ref.read(driverRepositoryProvider).isLoggedIn) return;
    _attached = true;
    unawaited(refreshToday());
    try {
      _listenStatus();
      ref.read(realtimeProvider).connect();
      final active = await _jobs.active();
      if (!ref.mounted) return;
      if (active != null && jobPhaseForStatus(active.status) != JobPhase.none) {
        await _restoreJob(active);
        return;
      }
      final me = await ref.read(apiClientProvider).get('/drivers/me');
      if (!ref.mounted || state.online) return;
      if (me is Map && me['isOnline'] == true) _quiet(_jobs.goOffline());
    } catch (_) {
      _attached = false; // Try again the next time Home opens.
    }
  }

  /// Offline preview of the driver's position (see [locateHere]); replaced by the online stream.
  StreamSubscription<GpsFix>? _preview;

  /// Live: shows where the driver is while offline too (the car marker follows the phone, nothing is uploaded).
  /// Asks for the permission when [ask] (Home asks on every visit until it's given) and records the access for the
  /// banner. The last known fix shows at once, then a light position stream keeps it current until going online.
  Future<void> locateHere({bool ask = true}) async {
    if (!_live) return;
    final locator = ref.read(driverLocatorProvider);
    final access = await locator.access(ask: ask);
    if (!ref.mounted) return;
    ref.read(locationAccessProvider.notifier).set(access);
    // Approximate is enough to show the car offline; going online asks for the precise location.
    if ((access != LocationAccess.granted &&
            access != LocationAccess.approximate) ||
        state.online) {
      return;
    }
    final last = await locator.lastKnownFix();
    if (last != null && ref.mounted && !state.online) {
      _onFix(last, upload: false);
    }
    if (!ref.mounted || state.online) return;
    await _preview?.cancel();
    _preview = locator.previewPositions().listen((fix) {
      if (ref.mounted && !state.online) _onFix(fix, upload: false);
    }, onError: (Object _) {});
  }

  void _stopPreview() {
    _preview?.cancel();
    _preview = null;
  }

  /// App back in the foreground: reconnect, pick up an offer missed meanwhile and check the job.
  void onAppResumed() {
    if (!_live || !state.online) return;
    ref.read(realtimeProvider).connect();
    final at = _lastFixAt;
    if (at == null || DateTime.now().difference(at) >= _gpsHealAfter) {
      _healGps(force: true);
    }
    unawaited(_recoverOffer());
    unawaited(_syncJob());
  }

  /// Today's earnings and rides for the Home card.
  Future<void> refreshToday() async {
    if (!_live) return;
    try {
      final s = await ref
          .read(driverRepositoryProvider)
          .earnings(EarningsPeriod.today);
      if (ref.mounted) {
        state = state.copyWith(todayEarnings: s.total, todayRides: s.rides);
      }
    } catch (_) {
      // Keep the last numbers.
    }
  }

  Future<void> _restoreJob(LiveTripUpdate update) async {
    final phase = jobPhaseForStatus(update.status);
    final job = rideRequestFromUpdate(update);
    state = state.copyWith(
      online: true,
      job: job,
      phase: phase,
      selfieDoneThisSession: true,
      noShowAt: update.noShowAt,
      waiting: waitingOf(update),
    );
    _watchJob(job.id);
    try {
      _onFix(await ref.read(driverLocatorProvider).currentFix(), upload: false);
    } catch (_) {
      // The stream below retries; the job screens still work without a fix.
    }
    if (!ref.mounted) return;
    _startTracking();
    switch (phase) {
      case JobPhase.toPickup:
        _setLeg(
          _position ?? job.pickup.location,
          job.pickup.location,
          job.vehicle,
          0,
        );
      case JobPhase.toDrop || JobPhase.atDrop:
        _setLeg(
          job.pickup.location,
          job.drop.location,
          job.vehicle,
          job.tripMin,
        );
      case JobPhase.none || JobPhase.atPickup || JobPhase.collect:
        break;
    }
  }

  void _listenStatus() {
    _statusSub?.cancel();
    _statusSub = ref.read(realtimeProvider).on('driver.status').listen((data) {
      if (!ref.mounted) return;
      ref.invalidate(driverProfileProvider);
      ref.invalidate(kycProvider);
      final status = data['status'];
      if (status is String) {
        unawaited(ref.read(apiClientProvider).session.saveDriverStatus(status));
      }
      if (status == 'APPROVED' && data['isOnline'] != false) {
        _pendingStatusRoute = null;
        return;
      }
      final route = status == 'PENDING'
          ? Routes.documents
          : status == 'ON_HOLD'
          ? Routes.accountOnHold
          : null;
      _pendingStatusRoute = state.onJob ? route : null;
      state = state.copyWith(
        online: false,
        clearIncoming: true,
        missedRequest: false,
        notice: SessionNotice(
          status == 'APPROVED'
              ? 'You have been taken offline.'
              : status == 'ON_HOLD'
              ? 'Your account is on hold. Contact support for help.'
              : 'Your documents need review.',
          goTo: state.onJob ? null : route,
        ),
      );
      if (!state.onJob) _stopTracking();
    }, onError: (Object _) {});
  }

  void _startTracking() {
    _listenStatus();
    _stopTracking();
    _stopPreview();
    _listenGps();
    _offerSub = _jobs.offers().listen(_onOffer, onError: (Object _) {});
    _closedSub = _jobs.closedOffers().listen(
      _onOfferClosed,
      onError: (Object _) {},
    );
    _pauseSub = _jobs.pauses().listen(_onPaused, onError: (Object _) {});
    _connectionSub = ref.read(realtimeProvider).connection.listen((up) {
      if (!up) return;
      unawaited(_flushBuffered(overSocket: true));
      unawaited(_recoverOffer());
      unawaited(_syncJob());
    });
    _ticker = Timer.periodic(const Duration(seconds: 10), (_) => _tick());
  }

  /// The online GPS stream. The native side can stop delivering (location briefly off, OEM battery savers, the
  /// plugin's shared foreground service); an error or end of the stream restarts it on the next tick.
  void _listenGps() {
    _gps?.cancel();
    _gpsRestartedAt = DateTime.now();
    _gps = ref
        .read(driverLocatorProvider)
        .positions()
        .listen(
          _onFix,
          onError: (Object _) => _gpsRestartedAt = null,
          onDone: () => _gpsRestartedAt = null,
        );
  }

  /// Online with no fix for [_gpsHealAfter]: going offline and online used to be the only cure.
  /// A one-shot fix clears the banner at once; the stream restarts (at most every [_gpsHealAfter]) only with the
  /// app in the foreground: a location service started from the background gets no while-in-use access.
  void _healGps({bool force = false}) {
    if (!_live || !state.online) return;
    final now = DateTime.now();
    final restartedAt = _gpsRestartedAt;
    if (_appInForeground &&
        (force ||
            restartedAt == null ||
            now.difference(restartedAt) >= _gpsHealAfter)) {
      _listenGps();
    }
    if (_fixInFlight) return;
    _fixInFlight = true;
    unawaited(
      ref
          .read(driverLocatorProvider)
          .currentFix()
          .then((fix) {
            // currentFix falls back to the last known position: an old one must not hide the banner.
            final fresh = DateTime.now().difference(fix.at) < _gpsStaleAfter;
            if (fresh && ref.mounted && state.online) _onFix(fix);
          })
          .catchError((Object _) {
            // Still no fix: the banner stays and the next tick tries again.
          })
          .whenComplete(() => _fixInFlight = false),
    );
  }

  static bool get _appInForeground {
    try {
      final s = WidgetsBinding.instance.lifecycleState;
      return s == null || s == AppLifecycleState.resumed;
    } catch (_) {
      return true; // No binding (plain Dart tests).
    }
  }

  /// `driver.blocked`: paused for too many cancellations. The server already took the driver offline; the app
  /// follows (Home shows the pause from [cancelRateProvider]).
  void _onPaused(DateTime until) {
    if (!ref.mounted) return;
    if (state.onJob) {
      _pendingPause = until;
      return;
    }
    _sim.cancelAll();
    _stopTracking();
    _buffer.clear();
    state = state.copyWith(
      online: false,
      clearIncoming: true,
      missedRequest: false,
      gpsLost: false,
      notice: SessionNotice(
        "You cancelled too many rides, so you're paused for a while",
      ),
    );
    ref.invalidate(cancelRateProvider);
  }

  /// S-16 "Fix now" with Location on: get GPS going again without going offline.
  void restartGps() => _healGps(force: true);

  void _stopTracking() {
    _gps?.cancel();
    _offerSub?.cancel();
    _closedSub?.cancel();
    _closedSub = null;
    _pauseSub?.cancel();
    _connectionSub?.cancel();
    _ticker?.cancel();
    _gps = null;
    _offerSub = null;
    _pauseSub = null;
    _connectionSub = null;
    _ticker = null;
  }

  void _onFix(GpsFix fix, {bool upload = true}) {
    final prev = _position;
    final p = fix.point;
    _position = p;
    _lastFix = fix;
    _lastFixAt = DateTime.now();
    if (fix.heading != null) {
      _heading = fix.heading!;
    } else if (prev != null &&
        const Distance().as(LengthUnit.Meter, prev, p) > 5) {
      _heading = const Distance().bearing(prev, p);
    }
    _sim.place(p, heading: _heading);
    if (!ref.mounted) return;
    if (state.gpsLost) state = state.copyWith(gpsLost: false);
    final now = DateTime.now();
    if (upload &&
        shouldSendFix(
          last: _lastSent,
          lastAt: _lastSentAt,
          next: p,
          now: now,
        )) {
      // Socket down: kept for the batch upload, so the trip's path has no hole.
      if (ref.read(realtimeProvider).isConnected) {
        _jobs.sendLocation(fix.toUpload());
      } else {
        _buffer.add(fix.toUpload());
      }
      _lastSent = p;
      _lastSentAt = now;
    }
    _updateEta();
  }

  void _updateEta() {
    final p = _position;
    if (p == null || !state.onJob || state.route.length < 2) return;
    if (state.phase != JobPhase.toPickup && state.phase != JobPhase.toDrop) {
      return;
    }
    final eta = etaAlong(state.route, p, _legMin);
    if (eta != state.etaMin) state = state.copyWith(etaMin: eta);
  }

  /// Every 10 s while online: GPS-lost flag (S-16) and the HTTP heartbeat while the socket is down.
  void _tick() {
    if (!ref.mounted || !state.online) return;
    final now = DateTime.now();
    final since = _lastFixAt == null ? null : now.difference(_lastFixAt!);
    final stale = since == null || since > _gpsStaleAfter;
    if (stale != state.gpsLost) state = state.copyWith(gpsLost: stale);
    if (since == null || since >= _gpsHealAfter) _healGps();
    final realtime = ref.read(realtimeProvider);
    if (realtime.isConnected) return;
    realtime.connect();
    // No socket, so no `trip.updated` / `trip.offer`: ask over HTTP now and then (a passenger cancel, offers).
    if (_lastPoll == null || now.difference(_lastPoll!) >= _pollEvery) {
      _lastPoll = now;
      unawaited(state.onJob ? _syncJob() : _recoverOffer());
    }
    final last = _lastFix;
    if (last != null &&
        (_lastHeartbeat == null ||
            now.difference(_lastHeartbeat!) >= _heartbeatEvery)) {
      _lastHeartbeat = now;
      // The buffered fixes end with the latest one, so they double as the heartbeat.
      if (_buffer.isEmpty) {
        _quiet(_jobs.heartbeat(last.toUpload()));
      } else {
        unawaited(_flushBuffered(overSocket: false));
      }
    }
  }

  /// Sends the fixes kept while the socket was down in one batch (socket after a reconnect, else HTTP); they go
  /// back into the buffer when the upload fails.
  Future<void> _flushBuffered({required bool overSocket}) async {
    if (_flushing || _buffer.isEmpty) return;
    _flushing = true;
    final fixes = _buffer.drain();
    try {
      final ok = overSocket
          ? await _jobs.sendBufferedLocations(fixes)
          : await _jobs.uploadLocations(fixes).then((_) => true);
      if (!ok) _buffer.restore(fixes);
    } catch (_) {
      _buffer.restore(fixes);
    } finally {
      _flushing = false;
    }
  }

  /// A new request: in focus when none is, else stacked behind it (a driver can hold a few at once). One already on
  /// screen coming again (the rider added extra) updates its card, keeping its countdown.
  void _onOffer(LiveOffer offer) {
    if (!ref.mounted) return;
    final id = offer.request.id;
    if (!state.online || state.onJob || _closedOffers.contains(id)) return;
    final declinedFare = _declinedFares[id];
    if (declinedFare != null) {
      if (offer.request.fare <= declinedFare) return;
      _declinedFares.remove(id);
    }
    if (state.incoming?.id == id) {
      if (state.incoming!.fare != offer.request.fare) {
        state = state.copyWith(incoming: offer.request);
      }
      return;
    }
    if (state.queued.any((q) => q.request.id == id)) {
      state = state.copyWith(
        queued: [
          for (final q in state.queued)
            q.request.id == id ? QueuedOffer(offer.request, q.expiresAt) : q,
        ],
      );
      return;
    }
    final expiresAt = DateTime.now().add(
      Duration(seconds: offer.expiresInSeconds),
    );
    if (state.incoming == null) {
      state = state.copyWith(
        incoming: offer.request,
        incomingExpiresAt: expiresAt,
        missedRequest: false,
      );
      return;
    }
    if (state.queued.length >= kMaxQueuedOffers) return;
    state = state.copyWith(
      queued: [...state.queued, QueuedOffer(offer.request, expiresAt)],
    );
  }

  /// `trip.offer_closed`: the request went elsewhere (cancelled, timed out, released): drop its card.
  void _onOfferClosed(String tripId) {
    if (!ref.mounted || tripId == _acceptingId) return;
    if (state.incoming?.id == tripId) {
      if (!_promoteNext()) state = state.copyWith(clearIncoming: true);
    } else if (state.queued.any((q) => q.request.id == tripId)) {
      state = state.copyWith(
        queued: [
          for (final q in state.queued)
            if (q.request.id != tripId) q,
        ],
      );
    }
  }

  /// Offers that arrived while the socket was reconnecting (or the app was in the background).
  Future<void> _recoverOffer() async {
    if (!_live || !state.online || state.onJob) return;
    try {
      for (final offer in await _jobs.currentOffers()) {
        _onOffer(offer);
      }
    } on ApiException catch (e) {
      // An older API without GET /trips/offers.
      if (e.status != 404) return;
      try {
        final offer = await _jobs.currentOffer();
        if (offer != null) _onOffer(offer);
      } catch (_) {}
    } catch (_) {
      // The socket delivers the next one.
    }
  }

  /// After a reconnect: the job may have been cancelled while the socket was down.
  Future<void> _syncJob() async {
    final job = state.job;
    if (job == null || state.phase == JobPhase.collect) {
      return;
    }
    try {
      final active = await _jobs.active();
      if (!ref.mounted ||
          state.job?.id != job.id ||
          state.phase == JobPhase.collect) {
        return;
      }
      if (active != null &&
          active.trip.id == job.id &&
          active.status == 'CANCELLED') {
        _endJob(notice: jobEndedNotice(active, job));
      } else if (active == null || active.trip.id != job.id) {
        _endJob(
          notice: SessionNotice(
            'This ride was cancelled or given to another driver',
            jobEnded: true,
          ),
        );
      }
    } catch (_) {
      // Checked again on the next reconnect.
    }
  }

  void _watchJob(String tripId) {
    _jobSub?.cancel();
    _nudgeSub?.cancel();
    _jobSub = _jobs.updates(tripId).listen((u) {
      final job = state.job;
      if (!ref.mounted ||
          job == null ||
          u.trip.id != job.id ||
          state.phase == JobPhase.collect ||
          _cancelling) {
        return;
      }
      // CANCELLED, or back to SEARCHING without this driver (the server gave the ride to another driver).
      if (u.status == 'CANCELLED' || u.status == 'SEARCHING') {
        _endJob(notice: jobEndedNotice(u, job));
      }
    }, onError: (Object _) {});
    _nudgeSub = _jobs.nudges(tripId).listen((n) {
      if (!ref.mounted || state.job?.id != n.tripId) return;
      // Ending nudges come with a trip update, which closes the job with its own notice.
      if (n.kind == 'REASSIGNED' || n.kind == 'CANCELLED') return;
      final sep = RegExp(r'[.?!]$').hasMatch(n.title) ? ' ' : '. ';
      state = state.copyWith(
        notice: SessionNotice(
          n.message.isEmpty ? n.title : '${n.title}$sep${n.message}',
        ),
      );
    }, onError: (Object _) {});
  }

  void _unwatchJob() {
    _jobSub?.cancel();
    _jobSub = null;
    _nudgeSub?.cancel();
    _nudgeSub = null;
  }

  void _endJob({SessionNotice? notice}) {
    final job = state.job;
    _unwatchJob();
    if (job != null) ref.read(realtimeProvider).leaveTrip(job.id);
    _legKey = null;
    state = state.copyWith(
      clearJob: true,
      phase: JobPhase.none,
      route: const [],
      etaMin: 0,
      notice: notice,
    );
    _applyPendingRestrictions();
    if (state.online) unawaited(_recoverOffer());
    // A cancel (theirs, or the ride taken off them) may have moved their cancellation rate (Home banner).
    ref.invalidate(cancelRateProvider);
  }

  void _applyPendingRestrictions() {
    final route = _pendingStatusRoute;
    _pendingStatusRoute = null;
    if (route != null) {
      state = state.copyWith(
        online: false,
        notice: SessionNotice('Your account needs attention.', goTo: route),
      );
      _stopTracking();
    }
    final pause = _pendingPause;
    _pendingPause = null;
    if (pause != null && pause.isAfter(DateTime.now())) _onPaused(pause);
  }

  /// Draws the leg [from] → [to] now (curved stand-in or cached road) and swaps in the road route once
  /// it arrives. One routing call per leg (cost rule).
  void _setLeg(LatLng from, LatLng to, VehicleKind vehicle, int minutes) {
    final mode = travelModeFor(vehicle);
    final key =
        '${from.latitude},${from.longitude}|${to.latitude},${to.longitude}';
    _legKey = key;
    final route = roadPath(from, to, mode: mode);
    _legMin = minutes > 0 ? minutes : estimateMinutes(routeKm(route));
    state = state.copyWith(route: route, etaMin: _legMin);
    _updateEta();
    RoadRouter.fetch(from, to, mode: mode).then((road) {
      if (road == null || road.length < 2 || !ref.mounted || _legKey != key) {
        return;
      }
      state = state.copyWith(route: road);
      _updateEta();
    }, onError: (Object _) {});
  }

  static void _quiet(Future<void> f) => f.then((_) {}, onError: (Object _) {});
}

final driverSessionProvider =
    NotifierProvider<DriverSessionController, DriverSessionState>(
      DriverSessionController.new,
    );

/// D-13 banner: the driver's cancellation rate and pause (live API only; null in mock mode or when it can't load).
final cancelRateProvider = FutureProvider<DriverCancelRate?>((ref) async {
  if (!ref.watch(isLiveApiProvider)) return null;
  try {
    return await ref.watch(liveJobsProvider).cancelRate();
  } on Exception {
    return null;
  }
});

/// Earnings for the Today / Week / Month tabs.
final earningsProvider = FutureProvider.family<EarningsSummary, EarningsPeriod>(
  (ref, period) {
    ref.watch(mockDatabaseProvider);
    ref.watch(
      demoSettingsProvider.select(
        (s) => (s.emptyEarnings, s.offline, s.slowLoading),
      ),
    );
    return ref.watch(driverRepositoryProvider).earnings(period);
  },
);

/// What the driver is told when their job ends from the server's side: the passenger cancelled, the system cancelled
/// (it never started), or it went back to searching without them (they weren't moving to the pickup).
SessionNotice jobEndedNotice(LiveTripUpdate u, RideRequest job) {
  if (u.status == 'SEARCHING') {
    return SessionNotice(
      "You weren't moving towards the pickup, so the ride went to another driver",
      jobEnded: true,
    );
  }
  if (u.cancelledBy == CancelledBy.system) {
    return SessionNotice(
      u.cancelCode == CancelCode.stuck
          ? "The ride didn't start in time, so it was cancelled"
          : 'This ride was cancelled',
      jobEnded: true,
    );
  }
  return SessionNotice(
    job.isDelivery
        ? 'The sender cancelled this delivery'
        : '${job.customerName.split(' ').first} cancelled the ride',
    jobEnded: true,
  );
}
