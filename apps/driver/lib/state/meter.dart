import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart' show AppLifecycleState, WidgetsBinding;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart' show Distance, LengthUnit;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';

import 'driver_account.dart';
import 'driver_location.dart';
import 'driver_session.dart';
import 'rate_card.dart';

/// What the meter charges this driver: their vehicle's in-town rates and the autos' night fare, plus the UPI ID for
/// the QR at the end. Saved on the phone each time it loads, so the meter also starts with no internet.
@immutable
class MeterRates {
  const MeterRates({
    required this.vehicle,
    required this.rule,
    this.night,
    this.upiId = '',
    this.payee = '',
    this.fresh = true,
  });

  final VehicleKind vehicle;
  final FareRule rule;
  final AutoNightFare? night;
  final String upiId;
  final String payee;

  /// False: no internet, so these are the rates saved last time (or the built-in ones for the vehicle).
  final bool fresh;

  /// The night fare for a meter started at [at] (autos at night), else 1.
  double nightAt(DateTime at) => night?.multiplierFor(vehicle, at) ?? 1;

  Map<String, Object?> toJson() => {
        'vehicle': vehicle.name,
        'rule': _ruleToJson(rule),
        if (night case final n?) 'night': {'multiplier': n.multiplier, 'startHour': n.startHour, 'endHour': n.endHour},
        'upiId': upiId,
        'payee': payee,
      };

  /// The saved rates (marked not [fresh]), or null when there are none or they can't be read.
  static MeterRates? tryParse(String? raw) {
    if (raw == null) return null;
    try {
      final j = jsonDecode(raw) as Map<String, dynamic>;
      return MeterRates(
        vehicle: VehicleKind.values.byName(j['vehicle'] as String),
        rule: _ruleFromJson(j['rule'] as Map),
        night: AutoNightFare.fromJson(j['night']),
        upiId: j['upiId'] as String? ?? '',
        payee: j['payee'] as String? ?? '',
        fresh: false,
      );
    } catch (_) {
      return null;
    }
  }
}

Map<String, Object?> _ruleToJson(FareRule r) =>
    {'base': r.base, 'perKm': r.perKm, 'perMin': r.perMin, 'minFare': r.minFare, 'waitPerMin': r.waitPerMin};

FareRule _ruleFromJson(Map<dynamic, dynamic> j) => FareRule(
      base: (j['base'] as num).round(),
      perKm: (j['perKm'] as num).toDouble(),
      perMin: (j['perMin'] as num).toDouble(),
      minFare: (j['minFare'] as num).round(),
      waitPerMin: (j['waitPerMin'] as num?)?.round() ?? 1,
    );

/// The meter can't start: the driver's vehicle isn't known yet (never loaded with internet on this phone).
class MeterUnavailable implements Exception {
  const MeterUnavailable();

  @override
  String toString() => 'Connect to the internet once to set up the meter.';
}

enum MeterStatus {
  idle,

  /// Counting (D-42b).
  running,

  /// Trip ended, collecting the fare (D-42c).
  ended,
}

/// A meter trip: the distance counted from the GPS and the fare at the rates it started with.
///
/// The fare is the fare engine's for that distance (a booked trip's formula: base + per km, at least the minimum fare,
/// cabs' time charge from the distance at 18 km/h, the autos' night fare), so it matches what the app would quote.
/// Waiting in traffic adds nothing.
@immutable
class MeterState {
  const MeterState({
    this.status = MeterStatus.idle,
    this.vehicle = VehicleKind.auto,
    this.rule,
    this.night = 1,
    this.startedAt,
    this.endedAt,
    this.metres = 0,
    this.anchor,
    this.anchorAt,
    this.lastFixAt,
    this.upiId = '',
    this.payee = '',
  });

  /// Fixes less accurate than this (metres) are skipped: indoors and under flyovers the position wanders.
  static const maxAccuracyM = 35.0;

  /// The meter moves on once the vehicle is this far from the last counted point, then counts the whole stretch:
  /// GPS drift while standing at a signal adds nothing.
  static const minStepM = 20.0;

  /// Faster than this between two points (m/s, about 140 km/h) is a GPS jump, not driving: skipped.
  static const maxSpeedMs = 39.0;

  /// No usable fix for this long (GPS lost, the app closed): the straight line to the next one counts ×
  /// [FareEngine.roadFactor], as roads aren't straight.
  static const gapAfter = Duration(seconds: 30);

  final MeterStatus status;
  final VehicleKind vehicle;
  final FareRule? rule;

  /// The night fare multiplier (1 = none), fixed when the meter starts.
  final double night;
  final DateTime? startedAt;
  final DateTime? endedAt;

  /// Metres counted so far.
  final double metres;

  /// The last counted point and when the vehicle was there.
  final LatLng? anchor;
  final DateTime? anchorAt;

  /// The last usable fix (or the start): the "Weak GPS" note shows after [gapAfter] without one.
  final DateTime? lastFixAt;

  /// The driver's UPI ID and name for the QR (saved at the start, so the QR shows with no internet too).
  final String upiId;
  final String payee;

  bool get active => status != MeterStatus.idle;

  /// Kilometres charged: the metres rounded down to 100 m, as a meter clicks over.
  double get km => (metres / 100 + 1e-9).floor() / 10;

  Duration elapsed(DateTime now) {
    final from = startedAt;
    if (from == null) return Duration.zero;
    final d = (endedAt ?? now).difference(from);
    return d.isNegative ? Duration.zero : d;
  }

  bool gpsWeak(DateTime now) {
    final last = lastFixAt;
    return status == MeterStatus.running && last != null && now.difference(last) > gapAfter;
  }

  FareQuote? get quote {
    final r = rule;
    if (r == null) return null;
    final from = startedAt;
    final to = endedAt;
    return FareEngine.quoteRule(
      Seed.vehicle(vehicle).copyWith(fareRule: r),
      r,
      // The time charge is on the distance's minutes at 18 km/h; the trip's own minutes (once ended) let the fare
      // lines say so when they differ.
      RouteEstimate(
        distanceKm: km,
        durationMin: FareEngine.durationFor(km),
        travelMin: from != null && to != null ? to.difference(from).inMinutes : null,
      ),
      night: night,
    );
  }

  int get fare => quote?.total ?? 0;

  /// [fix] counted: skipped when mocked, too inaccurate, a jump, or within [minStepM] of the last counted point.
  MeterState withFix(GpsFix fix) {
    if (status != MeterStatus.running || fix.isMocked) return this;
    final accuracy = fix.accuracy;
    if (accuracy != null && accuracy > maxAccuracyM) return this;
    final at = fix.at;
    final from = anchor;
    final fromAt = anchorAt;
    if (from == null || fromAt == null) return _copy(anchor: fix.point, anchorAt: at, lastFixAt: at);
    final d = const Distance().as(LengthUnit.Meter, from, fix.point);
    if (d < minStepM) return _copy(lastFixAt: at);
    final seconds = at.difference(fromAt).inMilliseconds / 1000;
    if (seconds <= 0 || d / seconds > maxSpeedMs) return this;
    final last = lastFixAt;
    final gap = last == null || at.difference(last) > gapAfter;
    return _copy(metres: metres + (gap ? d * FareEngine.roadFactor : d), anchor: fix.point, anchorAt: at, lastFixAt: at);
  }

  MeterState _copy({
    MeterStatus? status,
    DateTime? endedAt,
    double? metres,
    LatLng? anchor,
    DateTime? anchorAt,
    DateTime? lastFixAt,
  }) =>
      MeterState(
        status: status ?? this.status,
        vehicle: vehicle,
        rule: rule,
        night: night,
        startedAt: startedAt,
        endedAt: endedAt ?? this.endedAt,
        metres: metres ?? this.metres,
        anchor: anchor ?? this.anchor,
        anchorAt: anchorAt ?? this.anchorAt,
        lastFixAt: lastFixAt ?? this.lastFixAt,
        upiId: upiId,
        payee: payee,
      );

  /// The meter ended at [at].
  MeterState endedAtTime(DateTime at) => _copy(status: MeterStatus.ended, endedAt: at);

  Map<String, Object?> toJson() => {
        'status': status.name,
        'vehicle': vehicle.name,
        if (rule case final r?) 'rule': _ruleToJson(r),
        'night': night,
        'startedAt': startedAt?.toUtc().toIso8601String(),
        'endedAt': endedAt?.toUtc().toIso8601String(),
        'metres': metres,
        if (anchor case final a?) 'anchor': [a.latitude, a.longitude],
        'anchorAt': anchorAt?.toUtc().toIso8601String(),
        'lastFixAt': lastFixAt?.toUtc().toIso8601String(),
        'upiId': upiId,
        'payee': payee,
      };

  factory MeterState.fromJson(Map<String, dynamic> j) {
    DateTime? time(Object? v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;
    final a = j['anchor'];
    return MeterState(
      status: MeterStatus.values.byName(j['status'] as String),
      vehicle: VehicleKind.values.byName(j['vehicle'] as String),
      rule: j['rule'] is Map ? _ruleFromJson(j['rule'] as Map) : null,
      night: (j['night'] as num?)?.toDouble() ?? 1,
      startedAt: time(j['startedAt']),
      endedAt: time(j['endedAt']),
      metres: (j['metres'] as num?)?.toDouble() ?? 0,
      anchor: a is List && a.length == 2 ? LatLng((a[0] as num).toDouble(), (a[1] as num).toDouble()) : null,
      anchorAt: time(j['anchorAt']),
      lastFixAt: time(j['lastFixAt']),
      upiId: j['upiId'] as String? ?? '',
      payee: j['payee'] as String? ?? '',
    );
  }
}

/// SharedPreferences, or null where there are none (widget tests without the mock): the meter still works, it just
/// isn't kept across app starts.
Future<T?> _withPrefs<T>(Future<T> Function(SharedPreferences prefs) use) async {
  try {
    return await use(await SharedPreferences.getInstance());
  } catch (_) {
    return null;
  }
}

const _tripKey = 'meter.trip';
const _ratesKey = 'meter.rates';

/// The trip meter (D-42) for passengers picked up off the app. The driver starts it; it counts the distance from the
/// phone's GPS and prices it with the fare engine at their vehicle's rates, with no server and no internet. The driver
/// is offline while it runs (no requests mid-trip; the app has one GPS stream, which the meter then owns). Saved on
/// the phone after every counted stretch, so it carries on after the app is closed or the phone restarts ([restore]).
class MeterController extends Notifier<MeterState> {
  StreamSubscription<GpsFix>? _gps;
  Timer? _watchdog;
  DateTime? _listenedAt;
  bool _restored = false;

  /// Without a usable fix for this long the GPS stream restarts (see [_heal]).
  static const _healAfter = Duration(seconds: 20);

  @override
  MeterState build() {
    ref.onDispose(_closeGps);
    return const MeterState();
  }

  /// Home opens: a meter left running or waiting for payment comes back (once per app start).
  Future<void> restore() async {
    if (_restored) return;
    _restored = true;
    final raw = await _withPrefs((p) async => p.getString(_tripKey));
    if (raw == null || !ref.mounted || state.active) return;
    final MeterState saved;
    try {
      saved = MeterState.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return;
    }
    if (saved.rule == null) return;
    state = saved;
    if (saved.status == MeterStatus.running) await _openGps();
  }

  /// Start meter, from now at [rates]. Throws [LocationProblem] when the GPS can't be used.
  Future<void> start(MeterRates rates) async {
    if (state.active) return;
    final locator = ref.read(driverLocatorProvider);
    await locator.ensureReady();
    await locator.requestNotificationPermission();
    if (!ref.mounted || state.active) return;
    final now = DateTime.now();
    state = MeterState(
      status: MeterStatus.running,
      vehicle: rates.vehicle,
      rule: rates.rule,
      night: rates.nightAt(now),
      startedAt: now,
      lastFixAt: now,
      upiId: rates.upiId,
      payee: rates.payee,
    );
    await _save();
    await _openGps();
  }

  /// End trip: the fare stays at what the meter shows; the GPS goes back to Home.
  Future<void> end() async {
    if (state.status != MeterStatus.running) return;
    _stopGps();
    state = state.endedAtTime(DateTime.now());
    await _save();
  }

  /// Done (paid) or Cancel meter: the meter clears.
  Future<void> clear() async {
    _stopGps();
    state = const MeterState();
    await _withPrefs((p) => p.remove(_tripKey));
  }

  /// Log out: the meter and the saved rates go (they are this driver's).
  Future<void> forget() async {
    await clear();
    await _withPrefs((p) => p.remove(_ratesKey));
  }

  Future<void> _openGps() async {
    await ref.read(driverSessionProvider.notifier).handGpsToMeter();
    if (!ref.mounted || state.status != MeterStatus.running) return;
    _listen();
    _watchdog?.cancel();
    _watchdog = Timer.periodic(const Duration(seconds: 10), (_) => _heal());
  }

  void _listen() {
    _gps?.cancel();
    _listenedAt = DateTime.now();
    _gps = ref.read(driverLocatorProvider).meterPositions().listen(
          _onFix,
          onError: (Object _) => _listenedAt = null,
          onDone: () => _listenedAt = null,
        );
  }

  /// Every 10 s while running: no usable fix for [_healAfter] (location briefly off, a battery saver stopped the
  /// stream) restarts the stream, at most that often and only in the foreground (Android gives a location service
  /// started from the background no location).
  void _heal() {
    if (!ref.mounted || state.status != MeterStatus.running || !_appInForeground) return;
    final now = DateTime.now();
    final last = state.lastFixAt;
    final listened = _listenedAt;
    if (last != null && now.difference(last) < _healAfter) return;
    if (listened == null || now.difference(listened) >= _healAfter) _listen();
  }

  void _onFix(GpsFix fix) {
    if (!ref.mounted || state.status != MeterStatus.running) return;
    ref.read(driverSessionProvider.notifier).showMeterFix(fix);
    final next = state.withFix(fix);
    if (identical(next, state)) return;
    final counted = next.anchor != state.anchor;
    state = next;
    if (counted) unawaited(_save());
  }

  void _closeGps() {
    _gps?.cancel();
    _gps = null;
    _watchdog?.cancel();
    _watchdog = null;
  }

  /// Also when the stream never opened: the session gets the GPS back whenever it handed it over.
  void _stopGps() {
    _closeGps();
    ref.read(driverSessionProvider.notifier).takeGpsBack();
  }

  Future<void> _save() async {
    final json = jsonEncode(state.toJson());
    await _withPrefs((p) => p.setString(_tripKey, json));
  }

  static bool get _appInForeground {
    try {
      final s = WidgetsBinding.instance.lifecycleState;
      return s == null || s == AppLifecycleState.resumed;
    } catch (_) {
      return true; // No binding (plain Dart tests).
    }
  }
}

final meterProvider = NotifierProvider<MeterController, MeterState>(MeterController.new);

/// The meter's rates for this driver (D-42): their vehicle's from the city's Rate card, saved on the phone each time
/// they load; with no internet the saved ones, else the built-in rates for the vehicle. Throws [MeterUnavailable]
/// when the vehicle isn't known (the profile never loaded on this phone).
final meterRatesProvider = FutureProvider.autoDispose<MeterRates>((ref) async {
  // Both start now and are always awaited, so neither fails unheard.
  final profileFuture = ref.watch(driverProfileProvider.future);
  final cardFuture = ref.watch(rateCardProvider.future);
  final saved = MeterRates.tryParse(await _withPrefs<String?>((p) async => p.getString(_ratesKey)));
  DriverProfile? profile;
  try {
    profile = await profileFuture.timeout(const Duration(seconds: 6));
  } catch (_) {
    profile = null;
  }
  RateCard? card;
  try {
    card = await cardFuture.timeout(const Duration(seconds: 6));
  } catch (_) {
    card = null;
  }
  final kind = profile?.vehicleKind ?? saved?.vehicle;
  if (kind == null) throw const MeterUnavailable();
  final sameDriver = saved != null && saved.vehicle == kind;
  final upiId = (profile?.upiId ?? (sameDriver ? saved.upiId : '')).trim();
  final payee = profile?.name ?? (sameDriver ? saved.payee : '');
  if (card != null) {
    final rates = MeterRates(vehicle: kind, rule: card.ruleFor(kind), night: card.autoNight, upiId: upiId, payee: payee);
    final json = jsonEncode(rates.toJson());
    await _withPrefs((p) => p.setString(_ratesKey, json));
    return rates;
  }
  if (sameDriver) {
    return MeterRates(vehicle: kind, rule: saved.rule, night: saved.night, upiId: upiId, payee: payee, fresh: false);
  }
  return MeterRates(vehicle: kind, rule: RateCard.demo.ruleFor(kind), upiId: upiId, payee: payee, fresh: false);
});
