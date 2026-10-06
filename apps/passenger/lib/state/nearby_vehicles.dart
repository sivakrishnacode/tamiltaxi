import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

/// Where to look: a pickup rounded to ~110 m (so GPS jitter doesn't restart the feed) and rides vs parcels.
typedef NearbyKey = ({double lat, double lng, bool parcels});

NearbyKey nearbyKey(LatLng at, {bool parcels = false}) => (
      lat: double.parse(at.latitude.toStringAsFixed(3)),
      lng: double.parse(at.longitude.toStringAsFixed(3)),
      parcels: parcels,
    );

/// Free vehicles around a pickup for the maps (P-07 Home, P-10, P-12), refreshed every 15 s while shown (live API:
/// `GET /drivers/nearby`; mock: a fixed mix). A failed refresh keeps the last list.
final nearbyVehiclesProvider = StreamProvider.autoDispose.family<List<NearbyVehicle>, NearbyKey>((ref, key) {
  final repo = ref.watch(rideRepositoryProvider);
  final live = ref.watch(isLiveApiProvider);
  final at = LatLng(key.lat, key.lng);
  final controller = StreamController<List<NearbyVehicle>>();
  var last = const <NearbyVehicle>[];
  Future<void> load() async {
    try {
      last = await repo.nearbyVehicles(at, parcels: key.parcels);
    } on Exception {
      // Offline or a server hiccup: keep showing the last vehicles.
    }
    if (!controller.isClosed) controller.add(last);
  }

  unawaited(load());
  // Refresh only while a screen listens: the timer stops with the last listener (before autoDispose runs).
  Timer? timer;
  void start() => timer ??= live ? Timer.periodic(const Duration(seconds: 15), (_) => load()) : null;
  start();
  ref.onCancel(() {
    timer?.cancel();
    timer = null;
  });
  ref.onResume(start);
  ref.onDispose(() {
    timer?.cancel();
    controller.close();
  });
  return controller.stream;
});

/// The [kinds] among the free vehicles near [at] as map markers (all of them when [kinds] is null). Each keeps the
/// server's marker id, so the map glides a car to its new place on each refresh instead of jumping.
List<MapVehicle> nearbyMarkers(WidgetRef ref, LatLng at, {Iterable<VehicleKind>? kinds, bool parcels = false}) {
  final wanted = kinds?.toSet();
  return [
    for (final v in ref.watch(nearbyVehiclesProvider(nearbyKey(at, parcels: parcels))).value ?? const <NearbyVehicle>[])
      if (wanted == null || wanted.contains(v.kind))
        MapVehicle(id: v.id, position: v.position, type: v.kind.mapType, heading: v.heading ?? 0),
  ];
}
