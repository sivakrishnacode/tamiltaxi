import 'dart:math' as math;

import 'package:flutter/widgets.dart';
import 'package:flutter_map/flutter_map.dart' show Marker;
import 'package:latlong2/latlong.dart' show Distance, LengthUnit;
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

/// Zoom levels for the layers: the service area when zoomed out, demand hexes in the city view, their nested hexes
/// once zoomed in far enough to tell streets apart (like H3's hex-in-hex grid).
const double kServiceAreaMaxZoom = 12.8;
const double kHotspotMinZoom = 10.5;
const double kNestedMinZoom = 13.2;

/// Labels from the city view on: short ones (the zone's name) below [kFullLabelZoom], so they don't pile up, the full
/// ones ("Pickup point · Airport") from street level.
const double kLabelMinZoom = 11.5;
const double kFullLabelZoom = 13.5;

/// Room one label needs on screen (logical px); a label closer than this to a shown one is left out.
const Size _labelBox = Size(180, 44);
const Size _shortLabelBox = Size(130, 34);

/// Height of a label's marker box; a small zone's label sits on top of it, the box's bottom on its top edge.
const double _labelHeight = 40;

const _high = Color(0xFFE64A19); // coral-deep
const _busy = Color(0xFFF59E0B); // amber
const _some = Color(0xFFFBBF24); // yellow

Color _levelColor(HotspotLevel level) => switch (level) {
      HotspotLevel.high => _high,
      HotspotLevel.busy => _busy,
      HotspotLevel.some => _some,
    };

/// Each admin zone kind's colour (outline, label and details sheet) and icon.
Color zoneColor(MapZoneKind kind) => switch (kind) {
      MapZoneKind.surge => const Color(0xFF7C3AED), // violet: apart from the orange demand heat
      MapZoneKind.demand => TtColors.coral600, // the demand hexes' coral: both say "rides come from here"
      MapZoneKind.noService => TtColors.error,
      MapZoneKind.pickupPoint => const Color(0xFF2563EB), // blue
    };

IconData zoneIcon(MapZoneKind kind) => switch (kind) {
      MapZoneKind.surge => Symbols.trending_up_rounded,
      MapZoneKind.demand => Symbols.local_fire_department_rounded,
      MapZoneKind.noService => Symbols.block_rounded,
      MapZoneKind.pickupPoint => Symbols.hail_rounded,
    };

/// "1.3x", "1.25x".
String multiplierLabel(double m) {
  final s = m.toStringAsFixed(2);
  return '${s.endsWith('0') ? s.substring(0, s.length - 1) : s}x';
}

/// What a no-service zone stops, in a few words.
String noServiceLabel(MapZone z) => z.blocksPickups && z.blocksDrops
    ? 'No pickups or drops'
    : z.blocksPickups
        ? 'No pickups'
        : 'No drops';

/// The zone's kind in a few words, as its label and sheet title say it: "Surge 1.3x", "No pickups", "Pickup point".
String zoneTitle(MapZone z) => switch (z.kind) {
      MapZoneKind.surge => 'Surge ${multiplierLabel(z.multiplier)}',
      MapZoneKind.demand => 'Busy area',
      MapZoneKind.noService => noServiceLabel(z),
      MapZoneKind.pickupPoint => 'Pickup point',
    };

/// The admin zones that matter to a driver of [vehicle] (null: all): a surge for other vehicles only is left out.
List<MapZone> zonesFor(DemandMap? map, VehicleKind? vehicle) => [
      for (final z in map?.zones ?? const <MapZone>[])
        if (vehicle == null || z.appliesTo(vehicle)) z,
    ];

/// Polygons for [map]: the service-area edge, each demand hex filled by its level, and inside it the busy nested
/// hexes shaded by their own share of pickups; on top, the admin zones that matter to a driver of [vehicle], each
/// outlined in its kind's colour.
List<MapPolygon> demandPolygons(DemandMap? map, {VehicleKind? vehicle}) {
  if (map == null) return const [];
  return [
    for (final ring in map.serviceArea)
      MapPolygon(
        points: ring,
        fillColor: TtColors.navy900.withValues(alpha: 0.04),
        strokeColor: TtColors.navy900.withValues(alpha: 0.4),
        strokeWidth: 1,
        maxZoom: kServiceAreaMaxZoom,
      ),
    for (final h in map.hotspots) ...[
      MapPolygon(
        points: h.boundary,
        fillColor: _levelColor(h.level).withValues(alpha: h.level == HotspotLevel.high ? 0.18 : 0.12),
        strokeColor: _levelColor(h.level).withValues(alpha: 0.6),
        strokeWidth: 2,
        zIndex: 1,
        minZoom: kHotspotMinZoom,
      ),
      for (final n in h.nested)
        MapPolygon(
          points: n.boundary,
          fillColor: _levelColor(h.level).withValues(alpha: 0.08 + 0.34 * n.score),
          strokeColor: _levelColor(h.level).withValues(alpha: 0.45),
          strokeWidth: 1,
          zIndex: 2,
          minZoom: kNestedMinZoom,
        ),
    ],
    for (final z in zonesFor(map, vehicle))
      for (final ring in z.outline)
        MapPolygon(
          points: ring,
          // A light tint, so the demand heat still reads underneath.
          fillColor: zoneColor(z.kind).withValues(alpha: z.kind == MapZoneKind.noService ? 0.16 : 0.12),
          strokeColor: zoneColor(z.kind).withValues(alpha: 0.9),
          strokeWidth: 1,
          zIndex: 3,
          minZoom: kHotspotMinZoom,
        ),
  ];
}

/// Most labels on the map at once.
const int kMaxLabels = 5;

/// How far from the camera's centre (logical px) a label still counts as on screen, about half a phone's map and a
/// little more; one farther out doesn't take one of the [kMaxLabels] places.
const Size _inView = Size(230, 360);

/// A label sits on top of [at]: its area's top edge, or the highest point of the area still in view.
typedef _Label = ({LatLng at, String text, IconData icon, Color color});

/// How far above the camera's centre (logical px) Home's map is surely in view, under its top card (about 190 px
/// on a phone): a label sits no higher.
const double _topInView = 150;

/// Where an area's label goes: on [top] (its top edge) when that is in view; else as high as is still in view, above
/// the area's [centre] (inside the area, clear of the car and the top card), unless the area is mostly out of view.
LatLng _spot(LatLng top, LatLng centre, double zoom, LatLng? near) {
  if (near == null) return top;
  final limit = _world(near, zoom).dy - _topInView;
  final t = _world(top, zoom), c = _world(centre, zoom);
  if (t.dy >= limit || c.dy <= limit) return top;
  return _unworld(Offset(c.dx, limit), zoom);
}

_Label _zoneLabel(MapZone z, {required double zoom, required bool short, LatLng? near}) {
  return (
    at: _spot(zoneTop(z), z.centre, zoom, near),
    text: short
        ? switch (z) {
            MapZone(kind: MapZoneKind.surge, name: '') => zoneTitle(z),
            MapZone(kind: MapZoneKind.surge) => '${multiplierLabel(z.multiplier)} · ${z.name}',
            MapZone(name: '') => zoneTitle(z),
            _ => z.name,
          }
        : [z.kind == MapZoneKind.demand ? 'Busy' : zoneTitle(z), if (z.name.isNotEmpty) z.name].join(' · '),
    icon: zoneIcon(z.kind),
    color: zoneColor(z.kind),
  );
}

/// A high-demand hex's label, on its top edge: "High demand", with its live surge.
_Label _hotLabel(Hotspot h, {required double zoom, LatLng? near}) {
  return (
    at: _spot(hexTop(h), h.centre, zoom, near),
    text: h.isSurging ? 'High demand · ${multiplierLabel(h.multiplier)}' : 'High demand',
    icon: Symbols.local_fire_department_rounded,
    color: TtColors.coral600,
  );
}

/// The zone's northernmost point: the label goes just above it, so it hides neither the zone nor the car inside.
LatLng zoneTop(MapZone z) {
  final points = [for (final ring in z.outline) ...ring];
  return points.isEmpty ? z.centre : points.reduce((a, b) => b.latitude > a.latitude ? b : a);
}

/// About how much room a label's pill takes on screen (logical px), from [DemandLabel]'s padding and type.
Size _pillSize(String text, {required bool short}) =>
    short ? Size(28 + 6.0 * text.length, 20) : Size(44 + 7.2 * text.length, 30);

/// [ring]'s bounding box on screen at [zoom] (world px).
Rect _screenBox(List<LatLng> ring, double zoom) {
  var box = Rect.zero;
  for (final (i, p) in ring.indexed) {
    final w = _world(p, zoom);
    box = i == 0 ? Rect.fromPoints(w, w) : box.expandToInclude(Rect.fromPoints(w, w));
  }
  return box;
}

/// A label may cover at most this share of a zone or demand hex: zoomed out, where they are small, it would hide them.
const double _maxCover = 0.2;

/// Labels at [zoom] (the map camera's): the surge zones ("Surge 1.3x · Gandhipuram"), the hottest demand hexes
/// ("High demand", with their live surge), then no-service zones, pickup points and busy zones; none below
/// [kLabelMinZoom], short ones (the zone's name) below [kFullLabelZoom], at most [kMaxLabels]. Each sits on its area's
/// top edge; one that would overlap a label already placed, or hide more than a fifth of a zone or demand hex, is
/// dropped. With [near] (the camera's centre), only labels in view count.
List<Marker> demandLabels(DemandMap? map, {double zoom = 14.6, LatLng? near, VehicleKind? vehicle}) {
  if (map == null || zoom < kLabelMinZoom) return const [];
  final short = zoom < kFullLabelZoom;
  final box = short ? _shortLabelBox : _labelBox;
  final zones = zonesFor(map, vehicle);
  List<MapZone> kind(MapZoneKind k) => [for (final z in zones) if (z.kind == k) z];
  final hot = map.hotspots.where((h) => h.level == HotspotLevel.high).toList()
    ..sort((a, b) => b.multiplier.compareTo(a.multiplier));
  _Label zone(MapZone z) => _zoneLabel(z, zoom: zoom, short: short, near: near);
  final candidates = <_Label>[
    for (final z in kind(MapZoneKind.surge)..sort((a, b) => b.multiplier.compareTo(a.multiplier))) zone(z),
    for (final h in hot) _hotLabel(h, zoom: zoom, near: near),
    for (final z in kind(MapZoneKind.noService)) zone(z),
    for (final z in kind(MapZoneKind.pickupPoint)) zone(z),
    for (final z in kind(MapZoneKind.demand)) zone(z),
  ];
  final centre = near == null ? null : _world(near, zoom);
  // What a label must not hide: the zones on the map and the demand hexes.
  final areas = [
    for (final z in zones)
      for (final ring in z.outline) _screenBox(ring, zoom),
    for (final h in map.hotspots) _screenBox(h.boundary, zoom),
  ];
  bool hides(Rect label) => areas.any((a) {
        final cut = a.intersect(label);
        return cut.width > 0 && cut.height > 0 && cut.width * cut.height > _maxCover * a.width * a.height;
      });
  final placed = <_Label>[];
  final spots = <Offset>[];
  for (final c in candidates) {
    if (placed.length == kMaxLabels) break;
    final p = _world(c.at, zoom) - const Offset(0, _labelHeight / 2);
    if (centre != null && ((p.dx - centre.dx).abs() > _inView.width || (p.dy - centre.dy).abs() > _inView.height)) {
      continue;
    }
    final pill = _pillSize(c.text, short: short);
    if (hides(Rect.fromCenter(center: p, width: pill.width, height: pill.height))) continue;
    if (spots.every((q) => (p.dx - q.dx).abs() >= box.width || (p.dy - q.dy).abs() >= box.height)) {
      placed.add(c);
      spots.add(p);
    }
  }
  return [
    for (final c in placed)
      Marker(
        point: c.at,
        width: 280,
        height: _labelHeight,
        alignment: Alignment.topCenter,
        child: Center(child: DemandLabel(text: c.text, icon: c.icon, color: c.color, compact: short)),
      ),
  ];
}

/// [_world]'s inverse.
LatLng _unworld(Offset w, double zoom) {
  final scale = 256 * math.pow(2, zoom).toDouble();
  final n = math.pi * (1 - 2 * w.dy / scale);
  return LatLng(math.atan((math.exp(n) - math.exp(-n)) / 2) * 180 / math.pi, w.dx / scale * 360 - 180);
}

/// A demand hex's top edge, straight above its centre.
LatLng hexTop(Hotspot h) => h.boundary.isEmpty
    ? h.centre
    : LatLng(h.boundary.map((p) => p.latitude).reduce(math.max), h.centre.longitude);

/// Distance between [a] and [b] on screen at [zoom], in logical px.
double screenDistance(LatLng a, LatLng b, double zoom) => (_world(a, zoom) - _world(b, zoom)).distance;

/// The zone a tap at [p] fell in: the smallest one (they draw on top), among those that matter to [vehicle].
MapZone? zoneAt(DemandMap? map, LatLng p, {VehicleKind? vehicle}) =>
    zonesFor(map, vehicle).reversed.where((z) => z.contains(p)).firstOrNull;

/// The demand hex a tap at [p] fell in.
Hotspot? hotspotAt(DemandMap? map, LatLng p) =>
    map?.hotspots.where((h) => pointInRing(p, h.boundary)).firstOrNull;

/// Web-Mercator position in logical px (256 px world at zoom 0, as Google and flutter_map use).
Offset _world(LatLng p, double zoom) {
  final scale = 256 * math.pow(2, zoom).toDouble();
  final s = math.sin(p.latitude * math.pi / 180);
  return Offset((p.longitude + 180) / 360 * scale, (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * scale);
}

/// The hotspot worth driving to from [from]: the nearest "high" one, else the nearest "busy" one; null without a
/// map, a position or any busy area. Quiet ("some") hexes are never suggested.
({Hotspot hotspot, double km})? nearestHotspot(DemandMap? map, LatLng? from) {
  if (map == null || from == null) return null;
  const distance = Distance();
  for (final level in const [HotspotLevel.high, HotspotLevel.busy]) {
    ({Hotspot hotspot, double km})? best;
    for (final h in map.hotspots.where((h) => h.level == level)) {
      final km = distance.as(LengthUnit.Meter, from, h.centre) / 1000;
      if (best == null || km < best.km) best = (hotspot: h, km: km);
    }
    if (best != null) return best;
  }
  return null;
}
