import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';

void main() {
  const square = [[11.0, 76.9], [11.0, 77.0], [11.1, 77.0], [11.1, 76.9]];

  test('reads the zones of /demand/hotspots', () {
    final map = DemandMap.fromJson({
      'at': '2026-11-04T06:00:00.000Z',
      'hotspots': [],
      'serviceArea': [],
      'zones': [
        {
          'id': 'z1',
          'name': 'Gandhipuram',
          'kind': 'SURGE',
          'multiplier': 1.3,
          'vehicleKinds': ['AUTO', 'HOVERCRAFT'],
          'blocksPickups': false,
          'blocksDrops': false,
          'startMinute': 1080,
          'endMinute': 1320,
          'days': [5, 6],
          'endsAt': '2026-11-05T00:00:00.000Z',
          'centre': [11.05, 76.95],
          'outline': [square],
        },
        {'id': 'z2', 'name': 'Junction', 'kind': 'PICKUP_POINT', 'meetingPoint': ' Gate 2 ', 'days': [], 'centre': [11, 77], 'outline': []},
        {'id': 'z3', 'name': 'Bus stand', 'kind': 'NO_SERVICE', 'blocksPickups': true, 'blocksDrops': false, 'days': [], 'centre': [11, 77], 'outline': []},
      ],
    });
    final [surge, pickup, noPickup] = map.zones;
    expect((surge.kind, surge.multiplier, surge.startMinute, surge.endMinute), (MapZoneKind.surge, 1.3, 1080, 1320));
    expect(surge.days, [5, 6]);
    // An unknown vehicle is left out, never read as a bike.
    expect(surge.vehicleKinds, [VehicleKind.auto]);
    expect((surge.appliesTo(VehicleKind.auto), surge.appliesTo(VehicleKind.bike)), (true, false));
    expect(surge.endsAt, isNotNull);
    expect(surge.contains(const LatLng(11.05, 76.95)), isTrue);
    expect(surge.contains(const LatLng(11.2, 76.95)), isFalse);
    expect((pickup.kind, pickup.meetingPoint, pickup.appliesTo(VehicleKind.bike)), (MapZoneKind.pickupPoint, 'Gate 2', true));
    expect((noPickup.kind, noPickup.blocksPickups, noPickup.blocksDrops), (MapZoneKind.noService, true, false));
  });

  test('an older server without zones gives none', () {
    expect(DemandMap.fromJson({'at': '2026-11-04T06:00:00.000Z'}).zones, isEmpty);
  });

  test('the demo map has one zone of each kind a driver meets, none when quiet', () {
    expect(DemandMap.demo().zones.map((z) => z.kind), [MapZoneKind.surge, MapZoneKind.pickupPoint, MapZoneKind.noService]);
    expect(DemandMap.demo(quiet: true).zones, isEmpty);
    for (final z in DemandMap.demo().zones) {
      expect(z.contains(z.centre), isTrue, reason: z.name);
    }
  });
}
