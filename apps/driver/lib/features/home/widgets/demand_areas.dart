import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:latlong2/latlong.dart' show Distance, LengthUnit;
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import 'demand_layer.dart';

/// The two lists of D-14c: where fares are higher, and where riders book a lot.
enum AreaView { surge, busy }

/// One place on D-14c: an admin zone or a live demand hex.
@immutable
class DemandArea {
  const DemandArea({
    required this.id,
    required this.name,
    required this.detail,
    required this.multiplier,
    required this.centre,
    required this.top,
    required this.outline,
    this.km,
    this.here = false,
  });

  final String id;

  /// "Gandhipuram"; "Surge area" or "Busy area" while it has no name.
  final String name;

  /// "1.3x fare · ends in 1 h 54 min", "High demand now".
  final String detail;

  /// Its fare multiplier (1 = none).
  final double multiplier;
  final LatLng centre;

  /// Its top edge, where its map pin sits (so the pin hides neither the area nor the car inside).
  final LatLng top;

  /// Outer ring of each piece.
  final List<List<LatLng>> outline;

  /// Straight-line km from the driver to its centre; null without a position.
  final double? km;

  /// The driver is inside it.
  final bool here;
}

/// When a zone that is live now stops: "ends in 1 h 54 min" within a day (its daily hours, or a Surge now ending),
/// "until 12 Nov" (an end date further away), else "all day".
String zoneEnds(MapZone z, DateTime now) {
  Duration? left;
  final ends = z.endsAt;
  if (ends != null && ends.isAfter(now)) left = ends.difference(now);
  final end = z.endMinute;
  if (end != null) {
    var minutes = (end - (now.hour * 60 + now.minute)) % (24 * 60);
    if (minutes == 0) minutes = 24 * 60;
    final today = Duration(minutes: minutes);
    if (left == null || today < left) left = today;
  }
  if (left != null && left < const Duration(hours: 24)) return 'ends in ${formatMinutes(math.max(1, left.inMinutes))}';
  if (ends != null && ends.isAfter(now)) return 'until ${formatShortDate(ends)}';
  return 'all day';
}

/// [view]'s areas for a driver of [vehicle] at [from]: nearest first (the one they are in first of all); without a
/// position, the highest surge or the busiest first.
///
/// Surge: the surge zones that apply to [vehicle] and the demand hexes with a live surge. High demand: the "high" and
/// "busy" demand hexes, then the busy zones (quiet hexes are never suggested).
List<DemandArea> areasFor(AreaView view, DemandMap? map, {VehicleKind? vehicle, LatLng? from, required DateTime now}) {
  if (map == null) return const [];
  const distance = Distance();
  double? km(LatLng c) => from == null ? null : distance.as(LengthUnit.Meter, from, c) / 1000;
  DemandArea zone(MapZone z, String fallback, String detail) => DemandArea(
    id: 'zone-${z.id}',
    name: z.name.isEmpty ? fallback : z.name,
    detail: detail,
    multiplier: z.multiplier,
    centre: z.centre,
    top: zoneTop(z),
    outline: z.outline,
    km: km(z.centre),
    here: from != null && z.contains(from),
  );
  DemandArea hex(Hotspot h, String fallback, String detail) => DemandArea(
    id: 'hex-${h.cell}',
    name: h.name ?? fallback,
    detail: detail,
    multiplier: h.multiplier,
    centre: h.centre,
    top: hexTop(h),
    outline: [h.boundary],
    km: km(h.centre),
    here: from != null && pointInRing(from, h.boundary),
  );
  final zones = zonesFor(map, vehicle);
  final hexes = [...map.hotspots]..sort((a, b) => b.score.compareTo(a.score));
  final areas = switch (view) {
    AreaView.surge => [
      for (final z in zones)
        if (z.kind == MapZoneKind.surge)
          zone(z, 'Surge area', '${multiplierLabel(z.multiplier)} fare · ${zoneEnds(z, now)}'),
      for (final h in hexes)
        if (h.isSurging) hex(h, 'Surge area', '${multiplierLabel(h.multiplier)} fare · live now'),
    ]..sort((a, b) => b.multiplier.compareTo(a.multiplier)),
    AreaView.busy => [
      for (final level in const [HotspotLevel.high, HotspotLevel.busy])
        for (final h in hexes)
          if (h.level == level)
            hex(
              h,
              'Busy area',
              [
                level == HotspotLevel.high ? 'High demand now' : 'Busy now',
                if (h.isSurging) '${multiplierLabel(h.multiplier)} fare',
              ].join(' · '),
            ),
      for (final z in zones)
        if (z.kind == MapZoneKind.demand) zone(z, 'Busy area', 'Busy · ${zoneEnds(z, now)}'),
    ],
  };
  if (from == null) return areas;
  // Stable: equally near areas keep the order above.
  return _stableSorted(areas, compare: (a, b) => (a.here ? 0 : a.km!).compareTo(b.here ? 0 : b.km!));
}

/// The list sorted by [compare], keeping the order of equal ones.
List<T> _stableSorted<T>(List<T> list, {required int Function(T, T) compare}) {
  final indexed = [...list.indexed]
    ..sort((a, b) {
      final c = compare(a.$2, b.$2);
      return c != 0 ? c : a.$1.compareTo(b.$1);
    });
  return [for (final (_, v) in indexed) v];
}
