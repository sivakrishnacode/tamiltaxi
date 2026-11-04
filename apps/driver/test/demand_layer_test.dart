import 'package:flutter/widgets.dart';
import 'package:flutter_map/flutter_map.dart' show Marker;
import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_driver/features/home/widgets/demand_layer.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

const _ring = [LatLng(11, 76.9), LatLng(11.1, 76.9), LatLng(11.1, 77)];

DemandMap _map() => DemandMap(
      at: DateTime(2026, 9, 26),
      serviceArea: const [_ring],
      hotspots: const [
        Hotspot(
          cell: 'a',
          level: HotspotLevel.high,
          score: 1,
          multiplier: 1.2,
          centre: LatLng(11.05, 76.95),
          boundary: _ring,
          nested: [NestedHex(cell: 'a1', score: 1, boundary: _ring), NestedHex(cell: 'a2', score: 0.2, boundary: _ring)],
        ),
        Hotspot(cell: 'b', level: HotspotLevel.some, score: 0.2, multiplier: 1, centre: LatLng(11, 77), boundary: _ring),
      ],
    );

void main() {
  test('zoomed out: only the service area; city zoom: demand hexes; zoomed in: nested hexes too', () {
    final polys = demandPolygons(_map());
    int visibleAt(double z) => polys.where((p) => p.visibleAt(z)).length;
    expect(visibleAt(10), 1, reason: 'service area only');
    expect(visibleAt(12), 3, reason: 'service area + 2 demand hexes');
    expect(visibleAt(14.6), 4, reason: '2 demand hexes + 2 nested hexes (Home default zoom)');
  });

  test('busier nested hexes are shaded darker', () {
    final nested = demandPolygons(_map()).where((p) => p.zIndex == 2).toList();
    expect(nested.first.fillColor.a, greaterThan(nested.last.fillColor.a));
  });

  test("labels only on high-demand hexes, with the surge, on the hex's top edge above its centre", () {
    final labels = demandLabels(_map());
    expect(labels, hasLength(1));
    expect(labels.single.point, const LatLng(11.1, 76.95));
    expect(labels.single.alignment, Alignment.topCenter);
  });

  test('labels: none zoomed out to the city; neighbouring ones never overlap', () {
    Hotspot high(String id, LatLng c, double m) => Hotspot(
        cell: id, level: HotspotLevel.high, score: 1, multiplier: m, centre: c, boundary: _ring);
    // Two hexes ~900 m apart (res 8 neighbours) and one across town.
    final map = DemandMap(at: DateTime(2026, 9, 26), serviceArea: const [], hotspots: [
      high('a', const LatLng(11.016, 76.955), 1.0),
      high('b', const LatLng(11.016, 76.963), 1.3),
      high('c', const LatLng(11.06, 77.03), 1.0),
    ]);
    expect(demandLabels(map, zoom: 11), isEmpty, reason: 'zoomed out past the city');
    final city = demandLabels(map, zoom: 13);
    expect(city.map((m) => m.point), [const LatLng(11.1, 76.963), const LatLng(11.1, 77.03)],
        reason: 'the surging one of the close pair wins');
    expect(demandLabels(map, zoom: 16), hasLength(3), reason: 'far enough apart once zoomed in');
  });

  test('no data yet: nothing drawn', () {
    expect(demandPolygons(null), isEmpty);
    expect(demandLabels(null), isEmpty);
  });

  group('admin zones', () {
    const big = [LatLng(11.0, 76.9), LatLng(11.0, 77.0), LatLng(11.1, 77.0), LatLng(11.1, 76.9)];
    const small = [LatLng(11.04, 76.94), LatLng(11.04, 76.96), LatLng(11.06, 76.96), LatLng(11.06, 76.94)];
    final map = DemandMap(at: DateTime(2026, 11, 4), zones: const [
      MapZone(id: 'city', name: 'Surge now', kind: MapZoneKind.surge, multiplier: 1.2, centre: LatLng(11.08, 76.98), outline: [big]),
      MapZone(id: 'autos', name: 'Peelamedu', kind: MapZoneKind.surge, multiplier: 1.5, vehicleKinds: [VehicleKind.auto], centre: LatLng(11.02, 76.92), outline: [big]),
      MapZone(id: 'stand', name: 'Bus stand', kind: MapZoneKind.noService, blocksPickups: true, centre: LatLng(11.05, 76.95), outline: [small]),
    ]);

    test('drawn on top in their colour; a surge for other vehicles only is left out', () {
      final zones = demandPolygons(map, vehicle: VehicleKind.bike).where((p) => p.zIndex == 3).toList();
      expect(zones, hasLength(2));
      expect(demandPolygons(map, vehicle: VehicleKind.auto).where((p) => p.zIndex == 3), hasLength(3));
      expect(zones.first.strokeColor.toARGB32() & 0xFFFFFF, zoneColor(MapZoneKind.surge).toARGB32() & 0xFFFFFF);
    });

    test('labelled by what they mean, surges first', () {
      final texts = [for (final m in demandLabels(map, zoom: 16, vehicle: VehicleKind.bike)) ((m.child as Center).child! as DemandLabel).text];
      expect(texts, ['Surge 1.2x · Surge now', 'No pickups · Bus stand']);
    });

    test('a tap opens the smallest zone it fell in, else the demand hex', () {
      expect(zoneAt(map, const LatLng(11.05, 76.95), vehicle: VehicleKind.bike)?.id, 'stand');
      expect(zoneAt(map, const LatLng(11.09, 76.99), vehicle: VehicleKind.bike)?.id, 'city');
      expect(zoneAt(map, const LatLng(11.3, 76.99), vehicle: VehicleKind.bike), isNull);
      expect(hotspotAt(_map(), const LatLng(11.05, 76.92))?.cell, 'a');
      expect(hotspotAt(_map(), const LatLng(11.5, 76.92)), isNull);
    });

    test("zoomed out to the city: short labels, the zone's name", () {
      final texts = [for (final m in demandLabels(map, zoom: 12, vehicle: VehicleKind.bike)) ((m.child as Center).child! as DemandLabel)];
      expect(texts.map((l) => l.text), contains('1.2x · Surge now'));
      expect(texts.every((l) => l.compact), isTrue);
    });

    test("a zone's label sits on its top edge; when that is out of view, as high as is in view, inside the zone", () {
      final pickup = MapZone(id: 'gate', name: 'Airport', kind: MapZoneKind.pickupPoint, centre: const LatLng(11.03, 77.04),
          outline: [hexDiskOutline(const LatLng(11.03, 77.04), 76, 1)]);
      final labels = demandLabels(DemandMap(at: DateTime(2026, 11, 4), zones: [pickup]), zoom: 14, near: pickup.centre);
      expect(labels.single.alignment, Alignment.topCenter);
      expect(labels.single.point.latitude, greaterThan(pickup.centre.latitude));
      // The big surge zone's top edge is ~2 km above the camera: at zoom 16, far off screen.
      const camera = LatLng(11.08, 76.98);
      final big = demandLabels(map, zoom: 16, near: camera, vehicle: VehicleKind.bike);
      expect(big.first.alignment, Alignment.topCenter);
      expect(big.first.point.longitude, closeTo(76.98, 1e-9), reason: 'above the zone centre');
      expect(big.first.point.latitude, inExclusiveRange(camera.latitude, 11.1), reason: 'inside the zone');
      expect(screenDistance(big.first.point, camera, 16), closeTo(150, 0.5), reason: 'as high as is surely in view');
    });

    test('only labels in view take the places: the zone under the camera is never left out', () {
      MapZone pickup(int i) => MapZone(id: 'p$i', name: 'Gate $i', kind: MapZoneKind.pickupPoint,
          centre: LatLng(11.3, 76.9 + i * 0.05), outline: [hexDiskOutline(LatLng(11.3, 76.9 + i * 0.05), 76, 1)]);
      const here = LatLng(11.0165, 76.969);
      final busy = MapZone(id: 'busy', name: 'Gandhipuram', kind: MapZoneKind.demand, centre: here,
          outline: [hexDiskOutline(here, 531, 0)]);
      final crowded = DemandMap(at: DateTime(2026, 11, 4), zones: [for (var i = 0; i < 5; i++) pickup(i), busy]);
      String text(Marker m) => ((m.child as Center).child! as DemandLabel).text;
      expect(demandLabels(crowded, zoom: 14.6).map(text), isNot(contains('Busy · Gandhipuram')),
          reason: 'without the camera, five pickup points far away fill the places');
      expect(demandLabels(crowded, zoom: 14.6, near: here).map(text), ['Busy · Gandhipuram']);
    });

    test('zoomed out, a label never hides a zone: one over a small zone just north of it is left out', () {
      const gate = LatLng(11.0, 76.95);
      final airport = MapZone(id: 'gate', name: 'Airport', kind: MapZoneKind.pickupPoint, centre: gate,
          outline: [hexDiskOutline(gate, 76, 1)]);
      // About 700 m north of the airport zone's top edge: where its label goes when zoomed out to the city.
      const north = LatLng(11.008, 76.95);
      final busy = MapZone(id: 'busy', name: 'Gandhipuram', kind: MapZoneKind.demand, centre: north,
          outline: [hexDiskOutline(north, 76, 1)]);
      final pair = DemandMap(at: DateTime(2026, 11, 4), zones: [airport, busy]);
      String text(Marker m) => ((m.child as Center).child! as DemandLabel).text;
      expect(demandLabels(pair, zoom: 12).map(text), ['Gandhipuram']);
      expect(demandLabels(pair, zoom: 16).map(text), ['Pickup point · Airport', 'Busy · Gandhipuram'],
          reason: 'zoomed in, the zones are far apart on screen');
    });

    test('multipliers read short', () {
      expect([multiplierLabel(1.3), multiplierLabel(1.25), multiplierLabel(1.5)], ['1.3x', '1.25x', '1.5x']);
    });
  });
}
