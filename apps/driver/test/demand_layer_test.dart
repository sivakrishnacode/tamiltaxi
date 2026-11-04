import 'package:flutter/widgets.dart';
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

  test('labels only on high-demand hexes, with the surge', () {
    final labels = demandLabels(_map());
    expect(labels, hasLength(1));
    expect(labels.single.point, const LatLng(11.05, 76.95));
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
    expect(demandLabels(map, zoom: 11.5), isEmpty, reason: 'whole-city view');
    final city = demandLabels(map, zoom: 13);
    expect(city.map((m) => m.point), [const LatLng(11.016, 76.963), const LatLng(11.06, 77.03)],
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

    test('multipliers read short', () {
      expect([multiplierLabel(1.3), multiplierLabel(1.25), multiplierLabel(1.5)], ['1.3x', '1.25x', '1.5x']);
    });
  });
}
