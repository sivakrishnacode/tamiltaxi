import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:latlong2/latlong.dart';

import 'trip_simulator.dart';

/// Metres per degree of latitude (and of longitude at the equator), close enough for a few hundred metres.
const double _metresPerDegree = 111195;

/// A polyline measured in metres, so a marker can be placed and moved along it.
class PathRuler {
  PathRuler(this.path) : _cumulative = _measure(path);

  final List<LatLng> path;

  /// Distance from the start to each vertex.
  final List<double> _cumulative;

  double get length => _cumulative.isEmpty ? 0 : _cumulative.last;

  /// At least one segment with a length.
  bool get isUsable => path.length >= 2 && length > 0;

  static List<double> _measure(List<LatLng> path) {
    final out = <double>[];
    var total = 0.0;
    for (var i = 0; i < path.length; i++) {
      if (i > 0) total += _metres(path[i - 1], path[i]);
      out.add(total);
    }
    return out;
  }

  /// Where [p] falls on the path ([along], metres from the start) and how far it is from it ([off], metres).
  ({double along, double off}) project(LatLng p) {
    if (path.isEmpty) return (along: 0, off: double.infinity);
    if (path.length == 1) return (along: 0, off: _metres(path.first, p));
    var best = (along: 0.0, off: double.infinity);
    for (var i = 0; i < path.length - 1; i++) {
      final a = path[i];
      final (bx, by) = _local(a, path[i + 1]);
      final (px, py) = _local(a, p);
      final len2 = bx * bx + by * by;
      final t = len2 == 0 ? 0.0 : ((px * bx + py * by) / len2).clamp(0.0, 1.0);
      final dx = px - t * bx, dy = py - t * by;
      final off = math.sqrt(dx * dx + dy * dy);
      if (off < best.off) best = (along: _cumulative[i] + t * (_cumulative[i + 1] - _cumulative[i]), off: off);
    }
    return best;
  }

  /// The point [along] metres from the start (clamped to the path).
  LatLng pointAt(double along) {
    if (path.isEmpty) return const LatLng(0, 0);
    final (i, r) = _segmentAt(along);
    if (i >= path.length - 1) return path.last;
    final a = path[i], b = path[i + 1];
    return LatLng(a.latitude + (b.latitude - a.latitude) * r, a.longitude + (b.longitude - a.longitude) * r);
  }

  /// Direction of the road [along] metres from the start (degrees from north).
  double headingAt(double along) {
    if (path.length < 2) return 0;
    var (i, _) = _segmentAt(along);
    i = i.clamp(0, path.length - 2);
    // Skip zero-length segments (repeated points) so the heading never falls back to north.
    while (i < path.length - 2 && _cumulative[i + 1] == _cumulative[i]) {
      i++;
    }
    return headingBetween(path[i], path[i + 1]);
  }

  /// [along] as the vertex fraction (0..1) that [pointAlong] and the trip screens' `remainingPath` use.
  double progressAt(double along) {
    if (path.length < 2) return 0;
    final (i, r) = _segmentAt(along);
    return ((i + r) / (path.length - 1)).clamp(0.0, 1.0);
  }

  /// Segment index and the fraction along it for [along] metres.
  (int, double) _segmentAt(double along) {
    if (along <= 0) return (0, 0);
    if (along >= length) return (path.length - 1, 0);
    var lo = 0, hi = _cumulative.length - 1;
    while (hi - lo > 1) {
      final mid = (lo + hi) >> 1;
      if (_cumulative[mid] <= along) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    final segment = _cumulative[lo + 1] - _cumulative[lo];
    return (lo, segment == 0 ? 0 : (along - _cumulative[lo]) / segment);
  }
}

/// [p] in metres east / north of [origin] (flat-earth approximation).
(double, double) _local(LatLng origin, LatLng p) => (
      (p.longitude - origin.longitude) * math.cos(origin.latitude * math.pi / 180) * _metresPerDegree,
      (p.latitude - origin.latitude) * _metresPerDegree,
    );

double _metres(LatLng a, LatLng b) {
  final (x, y) = _local(a, b);
  return math.sqrt(x * x + y * y);
}

/// One glide: along the road ([fromAlong] → [toAlong]) or, off it, straight ([fromPoint] → [toPoint]).
class _Motion {
  const _Motion.path(this.fromAlong, this.toAlong, this.start, this.duration, this.speed)
      : fromPoint = null,
        toPoint = null;

  const _Motion.straight(this.fromPoint, this.toPoint, this.start, this.duration)
      : fromAlong = null,
        toAlong = null,
        speed = 0;

  final double? fromAlong, toAlong;
  final LatLng? fromPoint, toPoint;
  final DateTime start;
  final Duration duration;

  /// Metres per second to keep going along the road once the glide is over (0: stop there).
  final double speed;

  bool get onPath => fromAlong != null;
}

/// Moves the live vehicle marker smoothly between the driver's GPS fixes, which arrive about every 5 s, like Uber's
/// dead reckoning (docs/tech-docs/system-design-notes.md, SD-1):
///
/// - Near the leg's road line the car **glides along the road** from where it is shown to the new fix, at an even
///   speed over the time the next fix should take (the gap between the last two, 1–6 s), so it follows curves instead
///   of cutting corners, and the route line ahead shrinks with it.
/// - When the glide ends before the next fix, it **keeps going at the last speed** for a moment (at most
///   [maxCoast] and [maxCoastMetres]), then waits. A fix slightly behind the shown car (it coasted too far) holds the
///   car instead of sliding it back.
/// - Off the road line (a detour, or no route yet) it glides straight; a jump of more than [jumpMetres] is shown at
///   once.
/// - The icon turns towards the road's direction (the phone's GPS heading off the road) smoothly, never snapping.
///
/// [vehicle] is updated every [frame] while something moves and not at all when the car stands still.
class VehicleGlide {
  VehicleGlide({
    this.frame = const Duration(milliseconds: 80),
    this.autoTick = true,
    DateTime Function()? now,
  }) : _now = now ?? DateTime.now;

  final Duration frame;

  /// Run the frame timer (tests sample by hand with [sample]).
  final bool autoTick;
  final DateTime Function() _now;

  /// Further from the road line than this, a fix is "off the road" and the car goes straight.
  static const double offPathMetres = 60;

  /// A fix this far behind the shown car (it coasted ahead) holds the car rather than sliding it back.
  static const double holdBackMetres = 30;

  /// Bigger moves (a long gap, a reconnect) are shown at once instead of gliding across the city.
  static const double jumpMetres = 1500;
  static const Duration maxCoast = Duration(seconds: 3);
  static const double maxCoastMetres = 40;
  static const Duration minGlide = Duration(seconds: 1);
  static const Duration maxGlide = Duration(seconds: 6);

  /// What the map draws; null before the first fix and after [clear].
  final ValueNotifier<VehicleFix?> vehicle = ValueNotifier<VehicleFix?>(null);

  PathRuler? _ruler;
  _Motion? _motion;
  LatLng? _lastFix;
  DateTime? _lastFixAt;
  Duration _interval = const Duration(seconds: 5);
  double? _lastAlong;
  double _speed = 0;
  double? _gpsHeading;
  double? _heading;
  Timer? _timer;
  bool _disposed = false;

  /// A new GPS fix [point] (with the phone's [heading] while moving) on the leg drawn as [path] (the road line the
  /// screen shows; empty while there is none). The same point again with another path only moves the car onto it.
  void addFix(LatLng point, {double? heading, List<LatLng> path = const []}) {
    if (_disposed) return;
    final now = _now();
    final shown = _sampleAt(now);
    if (!identical(path, _ruler?.path)) _ruler = path.length >= 2 ? PathRuler(path) : null;
    final ruler = _ruler != null && _ruler!.isUsable ? _ruler : null;
    final target = ruler?.project(point);
    final onPath = target != null && target.off <= offPathMetres;

    if (shown != null && point == _lastFix) {
      // Only the road line changed (e.g. the real route replaced the first guess): carry on to the same fix.
      final left = _motion == null ? Duration.zero : _motion!.duration - now.difference(_motion!.start);
      _glide(shown.position, point, target, onPath, ruler, now, left < minGlide ~/ 4 ? minGlide ~/ 4 : left, _speed);
      return;
    }

    final lastAt = _lastFixAt;
    if (lastAt != null) {
      final gap = now.difference(lastAt);
      _interval = gap < minGlide ? minGlide : (gap > maxGlide ? maxGlide : gap);
      final seconds = gap.inMilliseconds / 1000;
      final along = target?.along;
      if (onPath && _lastAlong != null && along != null && seconds > 0) {
        final v = (along - _lastAlong!) / seconds;
        // Ignore nonsense (backwards, > 160 km/h); smooth the rest.
        _speed = v < 0 || v > 45 ? 0 : (_speed == 0 ? v : 0.5 * _speed + 0.5 * v);
      } else {
        _speed = 0;
      }
    }
    _lastFix = point;
    _lastFixAt = now;
    _lastAlong = onPath ? target.along : null;
    _gpsHeading = heading;

    if (shown == null || _metres(shown.position, point) > jumpMetres) {
      // First fix (or a long jump): show it where it is, on the road when close to it.
      final at = onPath ? target.along : null;
      _motion = at != null ? _Motion.path(at, at, now, Duration.zero, 0) : _Motion.straight(point, point, now, Duration.zero);
      _heading = null;
      _emit(now);
      return;
    }
    _glide(shown.position, point, target, onPath, ruler, now, _interval, _speed);
  }

  void _glide(
    LatLng from,
    LatLng to,
    ({double along, double off})? target,
    bool onPath,
    PathRuler? ruler,
    DateTime now,
    Duration duration,
    double speed,
  ) {
    final fromOnRoad = ruler?.project(from);
    if (onPath && ruler != null && target != null && fromOnRoad != null && fromOnRoad.off <= offPathMetres) {
      final start = fromOnRoad.along;
      if (target.along >= start - holdBackMetres) {
        // Ahead, or a little behind after coasting: never slide back, wait there instead.
        final end = math.max(target.along, start);
        _motion = _Motion.path(start, end, now, duration, end > start ? speed : 0);
        _ensureTicking();
        return;
      }
    }
    _motion = _Motion.straight(from, to, now, duration);
    _ensureTicking();
  }

  /// The car as it should be drawn now (without moving the icon's turn on).
  @visibleForTesting
  VehicleFix? sample() => _sampleAt(_now());

  VehicleFix? _sampleAt(DateTime now) {
    final m = _motion;
    if (m == null) return null;
    final elapsed = now.difference(m.start);
    final t = m.duration <= Duration.zero ? 1.0 : (elapsed.inMicroseconds / m.duration.inMicroseconds).clamp(0.0, 1.0);
    final ruler = _ruler;
    if (m.onPath && ruler != null) {
      var along = m.fromAlong! + (m.toAlong! - m.fromAlong!) * t;
      if (t >= 1 && m.speed > 0) {
        final coastMs = math.min(elapsed.inMilliseconds - m.duration.inMilliseconds, maxCoast.inMilliseconds);
        along += math.min(m.speed * coastMs / 1000, maxCoastMetres);
      }
      along = along.clamp(0.0, ruler.length);
      final moving = m.toAlong! > m.fromAlong! || (t >= 1 && m.speed > 0);
      return VehicleFix(
        position: ruler.pointAt(along),
        heading: moving ? ruler.headingAt(along) : (_heading ?? ruler.headingAt(along)),
        progress: ruler.progressAt(along),
        target: _lastFix,
      );
    }
    final a = m.fromPoint!, b = m.toPoint!;
    final position = LatLng(a.latitude + (b.latitude - a.latitude) * t, a.longitude + (b.longitude - a.longitude) * t);
    final heading = _gpsHeading ?? (_metres(a, b) > 3 ? headingBetween(a, b) : (_heading ?? 0));
    return VehicleFix(
      position: position,
      heading: heading,
      progress: ruler == null ? 0 : ruler.progressAt(ruler.project(position).along),
      target: _lastFix,
    );
  }

  /// Still gliding, coasting or turning towards [aim] (the heading the car should end up with) at [now].
  bool _isBusy(DateTime now, VehicleFix aim) {
    final m = _motion;
    if (m == null) return false;
    final elapsed = now.difference(m.start);
    final coast = m.speed > 0 ? maxCoast : Duration.zero;
    return elapsed < m.duration + coast || (_heading != null && _turnLeft(_heading!, aim.heading).abs() > 0.5);
  }

  /// Draws the car for [now]; returns where it is aiming (its heading not smoothed), or null with no car.
  VehicleFix? _emit(DateTime now) {
    if (_disposed) return null;
    final aim = _sampleAt(now);
    if (aim == null) return null;
    // Turn the icon a share of the way each frame (~90 % in under a second), the shortest way round.
    final h = _heading;
    final turn = h == null ? 0.0 : _turnLeft(h, aim.heading);
    _heading = h == null || turn.abs() < 0.5 ? aim.heading : (h + turn * 0.35) % 360;
    vehicle.value = VehicleFix(position: aim.position, heading: _heading!, progress: aim.progress, target: aim.target);
    return aim;
  }

  void _ensureTicking() {
    if (!autoTick) {
      _emit(_now());
      return;
    }
    _timer ??= Timer.periodic(frame, (_) {
      final now = _now();
      final aim = _emit(now);
      if (aim == null || !_isBusy(now, aim)) {
        _timer?.cancel();
        _timer = null;
      }
    });
    _emit(_now());
  }

  /// One frame by hand (tests, with [autoTick] off).
  @visibleForTesting
  void tick() => _emit(_now());

  /// The icon's turn is still catching up, or the car still moves (the frame timer would keep running).
  @visibleForTesting
  bool get isBusy {
    final aim = _sampleAt(_now());
    return aim != null && _isBusy(_now(), aim);
  }

  /// No vehicle (a new driver, the trip ended).
  void clear() {
    if (_disposed) return;
    _timer?.cancel();
    _timer = null;
    _motion = null;
    _lastFix = null;
    _lastFixAt = null;
    _lastAlong = null;
    _speed = 0;
    _heading = null;
    _gpsHeading = null;
    _interval = const Duration(seconds: 5);
    vehicle.value = null;
  }

  /// Stops for good; a late fix after this is ignored.
  void dispose() {
    _disposed = true;
    _timer?.cancel();
    _timer = null;
    vehicle.dispose();
  }
}

/// Signed degrees to turn from [from] to [to] the shortest way (−180..180).
double _turnLeft(double from, double to) => ((to - from + 540) % 360) - 180;
