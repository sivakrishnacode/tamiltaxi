
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../../state/driver_session.dart';

/// [TtMap] showing the driver's own vehicle. The marker follows the session's live
/// position unless [fixedPosition] is given (gallery showcase).
class LiveVehicleMap extends ConsumerWidget {
  const LiveVehicleMap({
    super.key,
    required this.vehicleType,
    this.fixedPosition,
    this.pickup,
    this.drop,
    this.route = const [],
    this.fitPoints,
    this.fitPadding = const EdgeInsets.fromLTRB(48, 96, 48, 48),
    this.pulse = false,
    this.zoom = 14.5,
    this.gpsLost = false,
    this.centerOnVehicle = true,
    this.mapPadding = EdgeInsets.zero,
    this.polygons = const [],
    this.labels = const [],
    this.onCamera,
    this.onTap,
    this.controller,
  });

  final MapVehicleType vehicleType;
  final LatLng? fixedPosition;
  final LatLng? pickup;
  final LatLng? drop;
  final List<LatLng> route;
  final List<LatLng>? fitPoints;
  final EdgeInsets fitPadding;

  /// Green pulse ring around the vehicle (online, waiting for rides).
  final bool pulse;
  final double zoom;

  /// S-16: draw a dashed red "location lost" hexagon instead of the vehicle.
  final bool gpsLost;
  final bool centerOnVehicle;

  /// Google engine: keeps the logo clear of panels drawn over the map (Maps terms).
  final EdgeInsets mapPadding;

  /// Demand hexes / service-area edge (see `demand_layer.dart`).
  final List<MapPolygon> polygons;

  /// Extra labels on the map (e.g. "High demand" on the hottest hexes).
  final List<Marker> labels;

  /// The camera whenever it moves (e.g. to place labels by zoom and what is in view).
  final ValueChanged<TtCamera>? onCamera;

  /// A tap on the map (not on a marker), with the point: e.g. to open the zone it fell in.
  final ValueChanged<LatLng>? onTap;

  /// Moves the camera from outside, e.g. to an area picked in a list ([TtMapController.fitTo]).
  final TtMapController? controller;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (fixedPosition != null) return _map(fixedPosition!, 0);
    final notifier = ref.read(driverSessionProvider.notifier);
    return ValueListenableBuilder<VehicleFix?>(
      valueListenable: notifier.vehicle,
      builder: (context, fix, _) => fix == null && ref.read(isLiveApiProvider)
          // Live, no GPS fix yet: the service city without a made-up car position.
          ? _map(CityDefaults.center, 0, showVehicle: false)
          : _map(fix?.position ?? Seed.driverHome, fix?.heading ?? 0),
    );
  }

  Widget _map(LatLng pos, double heading, {bool showVehicle = true}) => TtMap(
        center: centerOnVehicle ? pos : null,
        zoom: zoom,
        pickup: pickup,
        drop: drop,
        route: route,
        fitPoints: fitPoints,
        fitPadding: fitPadding,
        mapPadding: mapPadding,
        pulseAt: pulse && !gpsLost && showVehicle ? pos : null,
        pulseColor: TtColors.success,
        vehicles: gpsLost || !showVehicle
            ? const []
            : [MapVehicle(position: pos, type: vehicleType, heading: heading, large: true)],
        polygons: polygons,
        onPositionChanged: onCamera == null ? null : (camera, _) => onCamera!(camera),
        onTap: onTap,
        controller: controller,
        extraMarkers: [
          ...labels,
          if (gpsLost) Marker(point: pos, width: 128, height: 128, child: const _GpsLostMarker()),
        ],
      );
}

class _GpsLostMarker extends StatelessWidget {
  const _GpsLostMarker();

  @override
  Widget build(BuildContext context) => Semantics(
        label: 'Location lost',
        child: CustomPaint(
          painter: _DashedHexPainter(),
          child: Center(
            child: Container(
              width: 44,
              height: 44,
              decoration: const BoxDecoration(color: TtColors.surface, shape: BoxShape.circle, boxShadow: TtShadows.soft),
              child: const Icon(Symbols.location_disabled_rounded, color: TtColors.error, size: 24),
            ),
          ),
        ),
      );
}

/// Dashed red hexagon (the H3 cell shape; maps never draw circles).
class _DashedHexPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final r = size.width / 2 - 2;
    canvas.drawPath(hexagonPath(c, r), Paint()..color = TtColors.error.withValues(alpha: 0.08));
    drawDashedHexagon(
      canvas,
      c,
      r,
      Paint()
        ..color = TtColors.error
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.5
        ..strokeCap = StrokeCap.round,
      dashes: 28,
    );
  }

  @override
  bool shouldRepaint(covariant _DashedHexPainter oldDelegate) => false;
}
