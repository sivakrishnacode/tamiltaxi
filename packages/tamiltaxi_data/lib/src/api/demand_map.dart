import 'package:flutter/foundation.dart';
import 'package:latlong2/latlong.dart';

import '../geo/hex_grid.dart';
import '../models/vehicle.dart';
import '../seed.dart';
import 'api_mappers.dart';

/// How busy a demand hex is right now (`GET /v1/demand/hotspots`).
enum HotspotLevel { high, busy, some }

/// A res-8 hex (≈0.7 km²) inside a hotspot; [score] 0–1 relative to the busiest one in the same hotspot.
@immutable
class NestedHex {
  const NestedHex({required this.cell, required this.score, required this.boundary});
  final String cell;
  final double score;
  final List<LatLng> boundary;
}

/// A res-7 demand hex (≈5 km²) with its busy nested hexes.
@immutable
class Hotspot {
  const Hotspot({
    required this.cell,
    required this.level,
    required this.score,
    required this.multiplier,
    required this.centre,
    required this.boundary,
    this.nested = const [],
    this.name,
  });

  final String cell;
  final HotspotLevel level;

  /// 0–1, relative to the busiest hotspot shown.
  final double score;

  /// Live surge on this hex (1 = none).
  final double multiplier;
  final LatLng centre;
  final List<LatLng> boundary;
  final List<NestedHex> nested;

  /// Where most of its pickups are ("Gandhipuram"); null before the area has trips.
  final String? name;

  bool get isSurging => multiplier > 1.001;
}

/// What an admin zone does (Setup › Cities › Zones).
enum MapZoneKind { surge, demand, noService, pickupPoint }

/// An admin zone that counts right now, as the driver map shows it.
@immutable
class MapZone {
  const MapZone({
    required this.id,
    required this.name,
    required this.kind,
    required this.centre,
    required this.outline,
    this.multiplier = 1,
    this.vehicleKinds = const [],
    this.blocksPickups = false,
    this.blocksDrops = false,
    this.meetingPoint,
    this.startMinute,
    this.endMinute,
    this.days = const [],
    this.endsAt,
  });

  factory MapZone.fromJson(Map<String, dynamic> j) {
    LatLng point(Object? p) => LatLng(((p as List)[0] as num).toDouble(), (p[1] as num).toDouble());
    return MapZone(
      id: '${j['id']}',
      name: '${j['name'] ?? ''}'.trim(),
      kind: enumFromApi(MapZoneKind.values, j['kind'], MapZoneKind.demand),
      multiplier: (j['multiplier'] as num?)?.toDouble() ?? 1,
      // A vehicle this version doesn't know is left out (never read as a bike).
      vehicleKinds: [
        for (final v in (j['vehicleKinds'] as List? ?? const []))
          ...VehicleKind.values.where((k) => enumToApi(k) == v),
      ],
      blocksPickups: j['blocksPickups'] == true,
      blocksDrops: j['blocksDrops'] == true,
      meetingPoint: (j['meetingPoint'] as String?)?.trim().isEmpty ?? true ? null : (j['meetingPoint'] as String).trim(),
      startMinute: (j['startMinute'] as num?)?.toInt(),
      endMinute: (j['endMinute'] as num?)?.toInt(),
      days: [for (final d in (j['days'] as List? ?? const [])) (d as num).toInt()],
      endsAt: DateTime.tryParse('${j['endsAt']}')?.toLocal(),
      centre: point(j['centre']),
      outline: [
        for (final ring in (j['outline'] as List? ?? const [])) [for (final p in ring as List) point(p)],
      ],
    );
  }

  final String id;
  final String name;
  final MapZoneKind kind;

  /// Surge: the fare multiplier (1 = none).
  final double multiplier;

  /// Surge: only these vehicles (empty = all).
  final List<VehicleKind> vehicleKinds;

  /// No service: what it stops.
  final bool blocksPickups;
  final bool blocksDrops;

  /// Pickup point: where riders and drivers meet ("Gate 2, P1 parking").
  final String? meetingPoint;

  /// Daily hours (IST minutes of the day, [start, end); start > end runs past midnight). Null = all day.
  final int? startMinute;
  final int? endMinute;

  /// Days of the week it runs (0 = Sunday); empty = every day.
  final List<int> days;

  /// When it ends for good (a "Surge now", or a zone with an end date).
  final DateTime? endsAt;

  /// A point inside it, for its label.
  final LatLng centre;

  /// Outer ring of each separate piece.
  final List<List<LatLng>> outline;

  /// Whether a driver of [vehicle] is affected (a surge for some vehicles only isn't theirs).
  bool appliesTo(VehicleKind vehicle) => vehicleKinds.isEmpty || vehicleKinds.contains(vehicle);

  /// Whether [p] is inside one of its pieces.
  bool contains(LatLng p) => outline.any((ring) => pointInRing(p, ring));
}

/// Even-odd point-in-polygon test on [ring] (lat, lng), good enough for city-sized shapes.
bool pointInRing(LatLng p, List<LatLng> ring) {
  var inside = false;
  for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    final a = ring[i], b = ring[j];
    if ((a.latitude > p.latitude) != (b.latitude > p.latitude) &&
        p.longitude < (b.longitude - a.longitude) * (p.latitude - a.latitude) / (b.latitude - a.latitude) + a.longitude) {
      inside = !inside;
    }
  }
  return inside;
}

/// The driver's demand map: hotspots, the service-area outline and the admin zones live now.
@immutable
class DemandMap {
  const DemandMap({required this.at, this.hotspots = const [], this.serviceArea = const [], this.zones = const []});
  final DateTime at;
  final List<Hotspot> hotspots;
  final List<List<LatLng>> serviceArea;

  /// Largest first, so small zones draw on top.
  final List<MapZone> zones;

  factory DemandMap.fromJson(Map<String, dynamic> j) {
    List<LatLng> ring(Object? raw) => [
          for (final p in (raw as List? ?? const []))
            LatLng(((p as List)[0] as num).toDouble(), (p[1] as num).toDouble()),
        ];
    return DemandMap(
      at: DateTime.tryParse('${j['at']}') ?? DateTime.now(),
      hotspots: [
        for (final h in (j['hotspots'] as List? ?? const []))
          Hotspot(
            cell: '${(h as Map)['cell']}',
            level: HotspotLevel.values.firstWhere((l) => l.name == h['level'], orElse: () => HotspotLevel.some),
            score: (h['score'] as num?)?.toDouble() ?? 0,
            multiplier: (h['multiplier'] as num?)?.toDouble() ?? 1,
            centre: ring([h['centre']]).first,
            name: (h['name'] as String?)?.trim().isEmpty ?? true ? null : (h['name'] as String).trim(),
            boundary: ring(h['boundary']),
            nested: [
              for (final n in (h['nested'] as List? ?? const []))
                NestedHex(cell: '${(n as Map)['cell']}', score: (n['score'] as num?)?.toDouble() ?? 0, boundary: ring(n['boundary'])),
            ],
          ),
      ],
      serviceArea: [for (final r in (j['serviceArea'] as List? ?? const [])) ring(r)],
      zones: [for (final z in (j['zones'] as List? ?? const [])) MapZone.fromJson(z as Map<String, dynamic>)],
    );
  }

  /// Mock mode and the Design gallery: what `/demand/hotspots` returns, without the API. Each seeded busy area is
  /// a res-7-sized hex with its seven res-8-sized children, the service area is a hex outline, and three zones show
  /// each kind a driver meets: a surge, a pickup point and a no-pickup zone. [quiet] (S-12): busy, nothing "high",
  /// no zones.
  factory DemandMap.demo({bool quiet = false}) {
    const levels = [HotspotLevel.high, HotspotLevel.busy, HotspotLevel.some];
    const childScores = [1.0, 0.7, 0.45, 0.3, 0.2, 0.55, 0.15];
    return DemandMap(
      at: DateTime.now(),
      hotspots: [
        for (final (i, z) in Seed.demandZones.indexed)
          Hotspot(
            cell: 'demo-${z.name}',
            level: quiet ? HotspotLevel.busy : levels[i % levels.length],
            score: 1 - i * 0.3,
            multiplier: 1,
            centre: z.centre,
            name: z.name,
            boundary: hexagonAround(z.centre, HexRes.r7),
            nested: [
              for (final (j, c) in hexDisk(z.centre, HexRes.r8, 1, rotation: HexRes.childRotation).indexed)
                NestedHex(
                  cell: 'demo-${z.name}-$j',
                  score: childScores[j],
                  boundary: hexagonAround(c, HexRes.r8, rotation: HexRes.childRotation),
                ),
            ],
          ),
      ],
      serviceArea: [
        hexDiskOutline(Seed.cityCentre, HexRes.r7, hexRingsFor(Seed.serviceRadiusKm * 1000, HexRes.r7)),
      ],
      zones: quiet
          ? const []
          : [
              MapZone(
                id: 'demo-surge',
                name: 'Gandhipuram',
                kind: MapZoneKind.surge,
                multiplier: 1.3,
                startMinute: 17 * 60,
                endMinute: 21 * 60,
                centre: Seed.demandZones.first.centre,
                outline: [hexDiskOutline(Seed.demandZones.first.centre, HexRes.r8, 1, rotation: HexRes.childRotation)],
              ),
              MapZone(
                id: 'demo-pickup',
                name: 'Coimbatore Junction',
                kind: MapZoneKind.pickupPoint,
                meetingPoint: 'Main entrance, near the auto stand',
                centre: Seed.junction.location,
                outline: [hexagonAround(Seed.junction.location, HexRes.r8, rotation: HexRes.childRotation)],
              ),
              MapZone(
                id: 'demo-no-pickup',
                name: 'Ukkadam bus stand',
                kind: MapZoneKind.noService,
                blocksPickups: true,
                centre: const LatLng(10.9855, 76.9605),
                outline: [hexagonAround(const LatLng(10.9855, 76.9605), HexRes.r8, rotation: HexRes.childRotation)],
              ),
            ],
    );
  }
}
