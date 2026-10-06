import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:latlong2/latlong.dart';

/// A slightly curved path between two points (quadratic Bézier). No routing API needed.
///
/// [bend] is the sideways offset of the control point as a fraction of the straight distance.
List<LatLng> curvedPath(LatLng from, LatLng to, {int segments = 48, double bend = 0.18}) {
  final midLat = (from.latitude + to.latitude) / 2;
  final midLng = (from.longitude + to.longitude) / 2;
  final dLat = to.latitude - from.latitude;
  final dLng = to.longitude - from.longitude;
  // Perpendicular offset.
  final ctrl = LatLng(midLat - dLng * bend, midLng + dLat * bend);
  return [
    for (var i = 0; i <= segments; i++)
      () {
        final t = i / segments;
        final a = (1 - t) * (1 - t);
        final b = 2 * (1 - t) * t;
        final c = t * t;
        return LatLng(
          a * from.latitude + b * ctrl.latitude + c * to.latitude,
          a * from.longitude + b * ctrl.longitude + c * to.longitude,
        );
      }(),
  ];
}

/// A point near [origin], offset by [metres] towards [bearingDeg]. Used to place a driver
/// "a few minutes away" from the pickup.
LatLng offsetPoint(LatLng origin, double metres, double bearingDeg) =>
    const Distance().offset(origin, metres, bearingDeg);

/// Position at fraction [t] (0..1) along [path], by equal segment steps.
LatLng pointAlong(List<LatLng> path, double t) {
  if (path.isEmpty) return const LatLng(0, 0);
  if (path.length == 1 || t <= 0) return path.first;
  if (t >= 1) return path.last;
  final f = t * (path.length - 1);
  final i = f.floor();
  final r = f - i;
  final a = path[i];
  final b = path[i + 1];
  return LatLng(a.latitude + (b.latitude - a.latitude) * r, a.longitude + (b.longitude - a.longitude) * r);
}

/// Heading in degrees from [a] to [b] (0 = north), for rotating vehicle markers.
double headingBetween(LatLng a, LatLng b) {
  final dy = b.latitude - a.latitude;
  final dx = (b.longitude - a.longitude) * math.cos(a.latitude * math.pi / 180);
  return (math.atan2(dx, dy) * 180 / math.pi + 360) % 360;
}

/// Snapshot of the simulated vehicle.
@immutable
class VehicleFix {
  const VehicleFix({required this.position, required this.heading, required this.progress, this.target});

  final LatLng position;
  final double heading;

  /// 0..1 along the current leg.
  final double progress;

  /// Live: the driver's newest GPS fix, which [position] glides towards ([VehicleGlide]); a map that follows the car
  /// moves its camera to this once per fix instead of every frame. Null in the simulation.
  final LatLng? target;
}

/// Drives a trip forward with timers, the way a backend would push updates, and moves the
/// vehicle marker along a polyline.
///
/// All timers are tracked, so [cancelAll] / [dispose] never leaves a callback behind.
class TripSimulator {
  TripSimulator({this.tick = const Duration(milliseconds: 200)});

  final Duration tick;

  /// Current vehicle position; null before the first leg starts.
  final ValueNotifier<VehicleFix?> vehicle = ValueNotifier<VehicleFix?>(null);

  final List<Timer> _timers = [];
  Timer? _mover;
  bool _disposed = false;

  bool get isMoving => _mover?.isActive ?? false;

  /// Runs [callback] once after [delay]. Cancelled by [cancelAll].
  void after(Duration delay, VoidCallback callback) {
    if (_disposed) return;
    late final Timer timer;
    timer = Timer(delay, () {
      _timers.remove(timer);
      if (!_disposed) callback();
    });
    _timers.add(timer);
  }

  /// Places the vehicle at [position] without animating.
  void place(LatLng position, {double heading = 0}) {
    if (_disposed) return;
    vehicle.value = VehicleFix(position: position, heading: heading, progress: 0);
  }

  /// Moves the vehicle along [path] over [duration], then calls [onDone].
  /// [onProgress] receives 0..1 on every tick (for ETA chips).
  void animateAlong(
    List<LatLng> path,
    Duration duration, {
    VoidCallback? onDone,
    ValueChanged<double>? onProgress,
  }) {
    if (_disposed || path.isEmpty) return;
    _mover?.cancel();
    final totalMs = math.max(1, duration.inMilliseconds);
    var elapsed = 0;
    place(path.first, heading: path.length > 1 ? headingBetween(path[0], path[1]) : 0);
    _mover = Timer.periodic(tick, (t) {
      if (_disposed) {
        t.cancel();
        return;
      }
      elapsed += tick.inMilliseconds;
      final p = (elapsed / totalMs).clamp(0.0, 1.0);
      final pos = pointAlong(path, p);
      final ahead = pointAlong(path, math.min(1, p + 0.02));
      vehicle.value = VehicleFix(
        position: pos,
        heading: p < 1 ? headingBetween(pos, ahead) : (vehicle.value?.heading ?? 0),
        progress: p,
      );
      onProgress?.call(p);
      if (p >= 1) {
        t.cancel();
        onDone?.call();
      }
    });
  }

  /// Stops movement and pending callbacks; the simulator can be reused afterwards.
  void cancelAll() {
    _mover?.cancel();
    _mover = null;
    for (final t in _timers) {
      t.cancel();
    }
    _timers.clear();
  }

  void dispose() {
    cancelAll();
    _disposed = true;
    vehicle.dispose();
  }
}
