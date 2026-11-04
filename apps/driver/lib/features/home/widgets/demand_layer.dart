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
      for (final ring in drawnOutline(z))
        MapPolygon(
          points: ring,
          // A light tint, so the demand heat still reads underneath.
          fillColor: zoneColor(z.kind).withValues(alpha: z.kind == MapZoneKind.noService ? 0.16 : 0.12),
          strokeColor: zoneColor(z.kind).withValues(alpha: 0.9),
          strokeWidth: 2,
          zIndex: 3,
          minZoom: kHotspotMinZoom,
        ),
  ];
}

/// Most labels on the map at once.
const int kMaxLabels = 5;

/// [above]: the label sits on top of [at] (a small zone's top edge) instead of centred on it.
typedef _Label = ({LatLng at, bool above, String text, IconData icon, Color color});

/// A zone taller than this on screen (logical px) has its label in the middle: on its top edge it could be off screen.
const double _bigZoneHeight = 3 * _labelHeight;

_Label _zoneLabel(MapZone z, {required double zoom, required bool short}) {
  final top = _topOf(z);
  final above = (_world(z.centre, zoom).dy - _world(top, zoom).dy) * 2 < _bigZoneHeight;
  return (
    at: above ? top : z.centre,
    above: above,
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

/// The zone's northernmost drawn point: a small zone's label goes just above it, so the zone itself stays in view.
LatLng _topOf(MapZone z) {
  final points = [for (final ring in drawnOutline(z)) ...ring];
  return points.isEmpty ? z.centre : points.reduce((a, b) => b.latitude > a.latitude ? b : a);
}

/// Labels at [zoom] (the map camera's): the surge zones ("Surge 1.3x · Gandhipuram"), the hottest demand hexes
/// ("High demand", with their live surge), then no-service zones, pickup points and busy zones; none below
/// [kLabelMinZoom], short ones (the zone's name) below [kFullLabelZoom], at most [kMaxLabels], and a label that would
/// overlap one already placed is dropped.
List<Marker> demandLabels(DemandMap? map, {double zoom = 14.6, VehicleKind? vehicle}) {
  if (map == null || zoom < kLabelMinZoom) return const [];
  final short = zoom < kFullLabelZoom;
  final box = short ? _shortLabelBox : _labelBox;
  final zones = zonesFor(map, vehicle);
  List<MapZone> kind(MapZoneKind k) => [for (final z in zones) if (z.kind == k) z];
  final hot = map.hotspots.where((h) => h.level == HotspotLevel.high).toList()
    ..sort((a, b) => b.multiplier.compareTo(a.multiplier));
  _Label zone(MapZone z) => _zoneLabel(z, zoom: zoom, short: short);
  final candidates = <_Label>[
    for (final z in kind(MapZoneKind.surge)..sort((a, b) => b.multiplier.compareTo(a.multiplier))) zone(z),
    for (final h in hot)
      (
        at: h.centre,
        above: false,
        text: h.isSurging ? 'High demand · ${multiplierLabel(h.multiplier)}' : 'High demand',
        icon: Symbols.local_fire_department_rounded,
        color: TtColors.coral600,
      ),
    for (final z in kind(MapZoneKind.noService)) zone(z),
    for (final z in kind(MapZoneKind.pickupPoint)) zone(z),
    for (final z in kind(MapZoneKind.demand)) zone(z),
  ];
  final placed = <_Label>[];
  final spots = <Offset>[];
  for (final c in candidates) {
    if (placed.length == kMaxLabels) break;
    final p = _world(c.at, zoom) - Offset(0, c.above ? _labelHeight / 2 : 0);
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
        alignment: c.above ? Alignment.topCenter : Alignment.center,
        child: Center(child: DemandLabel(text: c.text, icon: c.icon, color: c.color, compact: short)),
      ),
  ];
}

/// Each zone's outline as drawn ([smoothOutline]), worked out once per zone.
final _drawn = Expando<List<List<LatLng>>>('drawn zone outline');

List<List<LatLng>> drawnOutline(MapZone z) => _drawn[z] ??= [for (final ring in z.outline) smoothOutline(ring)];

/// A zone outline as the map draws it. The admin builds zones from H3 hexagons, and their edge zig-zags hexagon by
/// hexagon, which reads as a scribble on the map: the steps (up to about a hexagon's edge) are taken out, the corners
/// rounded and the shape kept at the zone's area. A one-hexagon zone becomes a rounded hexagon. Taps still use the
/// zone's own outline.
List<LatLng> smoothOutline(List<LatLng> ring) {
  final points = ring.length > 3 && ring.first == ring.last ? ring.sublist(0, ring.length - 1) : ring;
  if (points.length < 3) return ring;
  // Metres east / north of the first point (equirectangular: plenty for a zone's size).
  final origin = points.first;
  final mx = 111320 * math.cos(origin.latitude * math.pi / 180);
  const my = 110574.0;
  final xy = [for (final p in points) Offset((p.longitude - origin.longitude) * mx, (p.latitude - origin.latitude) * my)];
  final edges = [for (var i = 0; i < xy.length; i++) (xy[(i + 1) % xy.length] - xy[i]).distance]..sort();
  final edge = edges[edges.length ~/ 2]; // the hexagons' edge length
  var shape = xy.length > 6 ? _simplifyRing(xy, 0.9 * edge) : xy;
  if (shape.length < 4) shape = xy;
  for (var i = 0; i < 3; i++) {
    shape = _chaikin(shape);
  }
  // Cutting corners shrinks the shape: grow it back to the zone's own area, around the zone's own centre.
  final (area: before, centre: c0) = _areaCentre(xy);
  final (area: after, centre: c1) = _areaCentre(shape);
  final k = after > 0 ? math.sqrt(before / after) : 1.0;
  return [
    for (final o in shape)
      LatLng(origin.latitude + (c0.dy + (o.dy - c1.dy) * k) / my, origin.longitude + (c0.dx + (o.dx - c1.dx) * k) / mx),
  ];
}

/// A ring's area and centroid (shoelace).
({double area, Offset centre}) _areaCentre(List<Offset> ring) {
  var a = 0.0, cx = 0.0, cy = 0.0;
  for (var i = 0; i < ring.length; i++) {
    final p = ring[i], q = ring[(i + 1) % ring.length];
    final cross = p.dx * q.dy - q.dx * p.dy;
    a += cross;
    cx += (p.dx + q.dx) * cross;
    cy += (p.dy + q.dy) * cross;
  }
  if (a == 0) return (area: 0, centre: ring.first);
  return (area: a.abs() / 2, centre: Offset(cx / (3 * a), cy / (3 * a)));
}

/// Douglas–Peucker on a closed ring: split at the point farthest from the first, simplify both halves.
List<Offset> _simplifyRing(List<Offset> ring, double tolerance) {
  var far = 1;
  for (var i = 2; i < ring.length; i++) {
    if ((ring[i] - ring[0]).distance > (ring[far] - ring[0]).distance) far = i;
  }
  final a = _simplify(ring.sublist(0, far + 1), tolerance);
  final b = _simplify([...ring.sublist(far), ring[0]], tolerance);
  return [...a.sublist(0, a.length - 1), ...b.sublist(0, b.length - 1)];
}

List<Offset> _simplify(List<Offset> line, double tolerance) {
  if (line.length < 3) return line;
  var index = 0;
  var most = 0.0;
  for (var i = 1; i < line.length - 1; i++) {
    final d = _toSegment(line[i], line.first, line.last);
    if (d > most) {
      most = d;
      index = i;
    }
  }
  if (most <= tolerance) return [line.first, line.last];
  final left = _simplify(line.sublist(0, index + 1), tolerance);
  return [...left.sublist(0, left.length - 1), ..._simplify(line.sublist(index), tolerance)];
}

double _toSegment(Offset p, Offset a, Offset b) {
  final ab = b - a;
  final length2 = ab.dx * ab.dx + ab.dy * ab.dy;
  if (length2 == 0) return (p - a).distance;
  final t = (((p.dx - a.dx) * ab.dx + (p.dy - a.dy) * ab.dy) / length2).clamp(0.0, 1.0);
  return (p - (a + ab * t)).distance;
}

/// Chaikin's corner cutting: each edge keeps its middle half, so corners round off.
List<Offset> _chaikin(List<Offset> ring) => [
      for (var i = 0; i < ring.length; i++) ...[
        Offset.lerp(ring[i], ring[(i + 1) % ring.length], 0.25)!,
        Offset.lerp(ring[i], ring[(i + 1) % ring.length], 0.75)!,
      ],
    ];

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
