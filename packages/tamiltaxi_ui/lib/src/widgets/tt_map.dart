import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart' as gm;
import 'package:latlong2/latlong.dart';
import 'package:material_symbols_icons/symbols.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart' show CityDefaults, isGoogleMapsEnabled;

import '../theme/tt_colors.dart';
import '../theme/tt_tokens.dart';
import '../vehicle_ui.dart';
import 'location_markers.dart';
import 'map_bitmaps.dart';
import 'map_markers.dart';
import 'tt_map_style.dart';

part 'tt_map_google.dart';

/// Engine-neutral camera snapshot passed to [TtMap.onPositionChanged].
@immutable
class TtCamera {
  const TtCamera({required this.center, required this.zoom});
  final LatLng center;
  final double zoom;
}

/// Engine-neutral map controller: works with both the Google map and the flutter_map fallback.
class TtMapController {
  final MapController _flutterMap = MapController();
  _GoogleTtMapState? _google;

  /// Moves the camera (no animation). Does nothing if the map is not laid out yet.
  void move(LatLng center, double zoom) {
    final google = _google;
    if (google != null) {
      google._moveTo(center, zoom);
      return;
    }
    try {
      _flutterMap.move(center, zoom);
    } catch (_) {
      // Map not laid out yet.
    }
  }

  /// Like [move], but the Google map glides there (a place picked in search).
  void animateTo(LatLng center, double zoom) {
    final google = _google;
    if (google != null) {
      google._animateTo(center, zoom);
      return;
    }
    move(center, zoom);
  }

  void dispose() {
    _google = null;
    _flutterMap.dispose();
  }
}

/// A vehicle drawn on the map, rotated to [heading] degrees.
class MapVehicle {
  const MapVehicle({required this.position, required this.type, this.heading = 0, this.large = false, this.id});

  /// The same car from one list to the next (nearby cars: the server's hourly marker id). A car with an id glides
  /// to its new position when the list changes instead of jumping; without one it is drawn where it is given.
  final String? id;
  final LatLng position;
  final MapVehicleType type;
  final double heading;

  /// Larger marker with a white halo (the driver's own vehicle / assigned driver).
  final bool large;
}

/// Soft coral "busy area" circle, optionally labelled.
/// A filled / outlined polygon (e.g. an H3 hex or a service-area edge), drawn below markers. Shown only while the
/// camera zoom is within [minZoom]–[maxZoom].
@immutable
class MapPolygon {
  const MapPolygon({
    required this.points,
    this.fillColor = const Color(0x00000000),
    this.strokeColor = const Color(0x00000000),
    this.strokeWidth = 0,
    this.zIndex = 0,
    this.minZoom = 0,
    this.maxZoom = 30,
  });

  final List<LatLng> points;
  final Color fillColor;
  final Color strokeColor;
  final double strokeWidth;
  final int zIndex;
  final double minZoom;
  final double maxZoom;

  bool visibleAt(double zoom) => zoom >= minZoom && zoom <= maxZoom;
  bool get isZoomLimited => minZoom > 0 || maxZoom < 30;
}

/// Tamil Taxi map. With a Google Maps key ([isGoogleMapsEnabled]) and [tilesEnabled] it renders the
/// Google Maps SDK (styled light map, bitmap markers); otherwise flutter_map with CARTO
/// light-grey tiles and the required attribution (tests, no key).
///
/// Draws pickup (green pin), drop (red pin), optional name chips beside them, vehicles (navy top-down icons), a light
/// slate 4px route (a dark stretch runs along it on route previews, like RedTaxi and Ola), a pulse ring and hex polygons (no circles: areas are H3 hexes). If tiles fail (offline) the plain #F1F5F9
/// background shows; nothing throws.
class TtMap extends StatelessWidget {
  const TtMap({
    super.key,
    this.center,
    this.zoom = 14.5,
    this.pickup,
    this.drop,
    this.route = const [],
    this.vehicles = const [],
    this.pulseAt,
    this.pulseColor = TtColors.coral500,
    this.fitPoints,
    this.fitPadding = const EdgeInsets.fromLTRB(48, 96, 48, 48),
    this.interactive = true,
    this.controller,
    this.onPositionChanged,
    this.extraMarkers = const [],
    this.showAttribution = true,
    this.attributionAlignment = Alignment.bottomLeft,
    this.attributionPadding = EdgeInsets.zero,
    this.mapPadding = EdgeInsets.zero,
    this.polygons = const [],
    this.animateRoute = false,
    this.pickupLabel,
    this.dropLabel,
    this.onPickupLabel,
    this.onDropLabel,
  });

  /// Global switch; tests set this to false so no network tiles are requested and no Google
  /// platform view is ever created.
  static bool tilesEnabled = true;

  /// True when this build renders the Google Maps SDK instead of flutter_map.
  static bool get usesGoogle => tilesEnabled && isGoogleMapsEnabled;

  /// CARTO basemaps key (sent as `?key=`; without it CARTO watermarks tiles "API KEY REQUIRED").
  /// Override at build time with --dart-define=CARTO_KEY=...
  static const cartoKey = String.fromEnvironment('CARTO_KEY', defaultValue: 'cb1_3wmx_1_05c6b460c2cfe8447648257d');

  static const tileUrl = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=$cartoKey';

  final LatLng? center;
  final double zoom;
  final LatLng? pickup;
  final LatLng? drop;
  final List<LatLng> route;
  final List<MapVehicle> vehicles;
  final LatLng? pulseAt;
  final Color pulseColor;

  /// When set, the camera fits these points on first build, and again whenever they (or the paddings) change.
  final List<LatLng>? fitPoints;
  final EdgeInsets fitPadding;
  final bool interactive;
  final TtMapController? controller;
  final void Function(TtCamera camera, bool hasGesture)? onPositionChanged;
  final List<Marker> extraMarkers;
  final bool showAttribution;
  final Alignment attributionAlignment;

  /// flutter_map engine: keeps the CARTO / OSM attribution clear of what covers the map (a bottom sheet, a
  /// header). The Google engine places its logo with [mapPadding] instead.
  final EdgeInsets attributionPadding;

  /// Google engine: insets for the logo / attribution and controls (`GoogleMap.padding`). Screens with a bottom
  /// sheet over the map pass the sheet height so the Google logo stays visible (required by the Maps terms).
  /// The camera centre, [fitPoints] and overlays then use the area inside this padding ([fitPadding] is relative
  /// to it).
  final EdgeInsets mapPadding;

  /// Polygons under the markers (H3 hexes, service-area edge), each shown within its zoom range.
  final List<MapPolygon> polygons;

  /// Route previews (before booking): a dark stretch keeps running along [route] from pickup to drop.
  final bool animateRoute;

  /// Name chips beside the pickup / drop pins (like RedTaxi's); tapping one calls [onPickupLabel] / [onDropLabel]
  /// (a ⟩ shows when set).
  final String? pickupLabel;
  final String? dropLabel;
  final VoidCallback? onPickupLabel;
  final VoidCallback? onDropLabel;

  @override
  Widget build(BuildContext context) => _VehicleGlider(
        vehicles: vehicles,
        builder: (drawn) => _RouteRunner(
          route: route,
          enabled: animateRoute,
          builder: (run) => usesGoogle
              ? _GoogleTtMap(map: this, vehicles: drawn, run: run)
              : _FlutterTtMap(map: this, vehicles: drawn, run: run),
        ),
      );
}

/// [TtMap.fitPadding] plus room for the pins, which stand above their points.
EdgeInsets _fitPaddingOf(TtMap m) =>
    m.pickup != null || m.drop != null ? m.fitPadding + const EdgeInsets.only(top: MapPin.height) : m.fitPadding;

/// The pickup / drop name chips ([TtMap.pickupLabel], [TtMap.dropLabel]) as markers, level with the pin's head on
/// the side facing the other point (as RedTaxi places them), which keeps them on screen.
List<Marker> _placeLabels(TtMap m) {
  Marker chip(LatLng at, String text, VoidCallback? onTap, LatLng? other) {
    final right = other == null || at.longitude <= other.longitude;
    return Marker(
      point: at,
      width: _PlaceChip.boxWidth,
      height: _PlaceChip.boxHeight,
      // The box's edge on the point, its middle level with the pin's head.
      alignment: Alignment(right ? 1 : -1, -2 * MapPin.headAbove / _PlaceChip.boxHeight),
      child: _PlaceChip(text: text, onTap: onTap, right: right),
    );
  }

  return [
    if (m.pickup != null && m.pickupLabel != null) chip(m.pickup!, m.pickupLabel!, m.onPickupLabel, m.drop),
    if (m.drop != null && m.dropLabel != null) chip(m.drop!, m.dropLabel!, m.onDropLabel, m.pickup),
  ];
}

/// A white name chip beside a pin (to its [right] or left), with a dark ⟩ when it can be tapped, like RedTaxi's.
class _PlaceChip extends StatelessWidget {
  const _PlaceChip({required this.text, required this.onTap, required this.right});

  static const double boxWidth = 180;
  static const double boxHeight = 56;

  final String text;
  final VoidCallback? onTap;
  final bool right;

  @override
  Widget build(BuildContext context) {
    const radius = BorderRadius.all(Radius.circular(10));
    const clear = MapPin.width / 2 + 6; // clear of the pin's head
    return Align(
      alignment: right ? Alignment.centerLeft : Alignment.centerRight,
      child: Padding(
        padding: EdgeInsets.only(left: right ? clear : 0, right: right ? 0 : clear),
        child: Semantics(
          button: onTap != null,
          label: text,
          excludeSemantics: true,
          child: DecoratedBox(
            decoration: const BoxDecoration(color: TtColors.surface, borderRadius: radius, boxShadow: TtShadows.soft),
            child: Material(
              type: MaterialType.transparency,
              child: InkWell(
                onTap: onTap,
                borderRadius: radius,
                child: Padding(
                  padding: EdgeInsets.fromLTRB(10, 6, onTap == null ? 10 : 6, 6),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Flexible(
                        child: Text(
                          text,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: context.type.caption.copyWith(color: TtColors.navy900, fontWeight: FontWeight.w500, height: 1.25),
                        ),
                      ),
                      if (onTap != null) ...[
                        const SizedBox(width: 6),
                        Container(
                          width: 18,
                          height: 18,
                          decoration: const BoxDecoration(color: TtColors.navy900, shape: BoxShape.circle),
                          child: const Icon(Symbols.chevron_right_rounded, size: 14, color: Colors.white),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Route previews ([TtMap.animateRoute]), like Ola's and RedTaxi's: a dark stretch draws itself along the light route
/// from pickup to drop, its tail follows, a short pause, again (2.6 s). Hands the engine the stretch to draw ([run]).
/// Off in tests and screenshots (no tiles) and when the phone asks for fewer animations.
class _RouteRunner extends StatefulWidget {
  const _RouteRunner({required this.route, required this.enabled, required this.builder});

  final List<LatLng> route;
  final bool enabled;
  final Widget Function(List<LatLng> run) builder;

  @override
  State<_RouteRunner> createState() => _RouteRunnerState();
}

class _RouteRunnerState extends State<_RouteRunner> with SingleTickerProviderStateMixin {
  /// Redraw at most this often (the Google map's polylines go over the platform channel on every rebuild).
  static const _frameMs = 40;

  late final AnimationController _run = AnimationController(vsync: this, duration: const Duration(milliseconds: 2600))
    ..addListener(_onTick);
  int _lastBuildMs = 0;

  /// Distance along [_RouteRunner.route] to each of its points (degrees, longitude scaled to the latitude).
  List<double> _along = const [];
  List<LatLng>? _measured;

  void _onTick() {
    final ms = _run.lastElapsedDuration?.inMilliseconds ?? 0;
    if ((ms - _lastBuildMs).abs() < _frameMs) return;
    _lastBuildMs = ms;
    setState(() {});
  }

  void _sync() {
    final on = widget.enabled &&
        widget.route.length >= 2 &&
        TtMap.tilesEnabled &&
        !(MediaQuery.maybeDisableAnimationsOf(context) ?? false);
    if (on && !_run.isAnimating) {
      _run.repeat();
    } else if (!on && _run.isAnimating) {
      _run.stop();
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _sync();
  }

  @override
  void didUpdateWidget(covariant _RouteRunner old) {
    super.didUpdateWidget(old);
    _sync();
  }

  @override
  void dispose() {
    _run.dispose();
    super.dispose();
  }

  /// The part of the route between fractions [a] and [b] of its length.
  List<LatLng> _slice(double a, double b) {
    final route = widget.route;
    if (!identical(route, _measured)) {
      _measured = route;
      var sum = 0.0;
      _along = [
        0,
        for (var i = 1; i < route.length; i++)
          sum += math.sqrt(
            math.pow(route[i].latitude - route[i - 1].latitude, 2) +
                math.pow((route[i].longitude - route[i - 1].longitude) * math.cos(route[i].latitude * math.pi / 180), 2),
          ),
      ];
    }
    final total = _along.last;
    if (total <= 0 || b <= a) return const [];
    LatLng at(double d) {
      var i = 1;
      while (i < _along.length - 1 && _along[i] < d) {
        i++;
      }
      final seg = _along[i] - _along[i - 1];
      final f = seg <= 0 ? 0.0 : ((d - _along[i - 1]) / seg).clamp(0.0, 1.0);
      final p = route[i - 1], q = route[i];
      return LatLng(p.latitude + (q.latitude - p.latitude) * f, p.longitude + (q.longitude - p.longitude) * f);
    }

    final from = a * total, to = b * total;
    return [
      at(from),
      for (var i = 0; i < route.length; i++)
        if (_along[i] > from && _along[i] < to) route[i],
      at(to),
    ];
  }

  @override
  Widget build(BuildContext context) {
    if (!_run.isAnimating) return widget.builder(const []);
    // Head runs to the drop (0–46 %), the tail follows (46–85 %), then a pause.
    final t = _run.value;
    const ease = Curves.easeInOut;
    final run = t < 0.46
        ? _slice(0, ease.transform(t / 0.46))
        : t < 0.85
            ? _slice(ease.transform((t - 0.46) / 0.39), 1)
            : const <LatLng>[];
    return widget.builder(run);
  }
}

/// Glides the vehicles that keep their [MapVehicle.id] from where they are drawn to where the new list puts them
/// (position and heading, ~1.8 s, eased), so nearby cars move on each refresh instead of jumping (SD-3 in
/// docs/tech-docs/system-design-notes.md). Only the map rebuilds while they move, at most 20 times a second. Vehicles
/// without an id, new ones and moves over 1.5 km are drawn as given (the live trip car glides itself:
/// `VehicleGlide`).
class _VehicleGlider extends StatefulWidget {
  const _VehicleGlider({required this.vehicles, required this.builder});

  final List<MapVehicle> vehicles;
  final Widget Function(List<MapVehicle> drawn) builder;

  @override
  State<_VehicleGlider> createState() => _VehicleGliderState();
}

class _VehicleGliderState extends State<_VehicleGlider> with SingleTickerProviderStateMixin {
  static const _duration = Duration(milliseconds: 1800);

  /// Rebuild the map at most this often while cars glide (Google markers are redrawn on every rebuild).
  static const _frameMs = 50;
  static const _maxGlideMetres = 1500.0;

  late final AnimationController _glide = AnimationController(vsync: this, duration: _duration, value: 1)
    ..addListener(_onTick);
  int _lastBuildMs = 0;

  /// Where each car was drawn when the current glide started.
  Map<String, MapVehicle> _from = const {};
  List<MapVehicle> _drawn = const [];

  void _onTick() {
    final ms = _glide.lastElapsedDuration?.inMilliseconds ?? 0;
    if (_glide.isAnimating && ms - _lastBuildMs < _frameMs) return;
    _lastBuildMs = ms;
    setState(() {});
  }

  @override
  void didUpdateWidget(covariant _VehicleGlider old) {
    super.didUpdateWidget(old);
    if (_sameCars(old.vehicles, widget.vehicles)) return;
    _from = {for (final v in _drawn) if (v.id != null) v.id!: v};
    _lastBuildMs = 0;
    _glide.forward(from: 0);
  }

  /// Same cars with the same positions and headings (a parent rebuilt with an equal list).
  static bool _sameCars(List<MapVehicle> a, List<MapVehicle> b) {
    final before = {for (final v in a) if (v.id != null) v.id!: v};
    final after = b.where((v) => v.id != null).toList();
    if (before.length != after.length) return false;
    for (final v in after) {
      final w = before[v.id];
      if (w == null || w.position != v.position || w.heading != v.heading) return false;
    }
    return true;
  }

  @override
  void dispose() {
    _glide.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = Curves.easeInOutCubic.transform(_glide.value);
    _drawn = [
      for (final v in widget.vehicles)
        if (_from[v.id] case final from? when t < 1 && _metres(from.position, v.position) <= _maxGlideMetres)
          MapVehicle(
            id: v.id,
            type: v.type,
            large: v.large,
            position: LatLng(
              from.position.latitude + (v.position.latitude - from.position.latitude) * t,
              from.position.longitude + (v.position.longitude - from.position.longitude) * t,
            ),
            heading: (from.heading + (((v.heading - from.heading + 540) % 360) - 180) * t) % 360,
          )
        else
          v,
    ];
    return widget.builder(_drawn);
  }

  static double _metres(LatLng a, LatLng b) => const Distance().as(LengthUnit.Meter, a, b);
}

/// What the camera fit depends on: the bounds of [TtMap.fitPoints] (to about a metre) and both paddings. Equal keys
/// mean the same view, so a rebuild with a fresh but equal list doesn't move the camera.
Object? _fitKey(TtMap m) {
  final pts = m.fitPoints;
  if (pts == null || pts.length < 2) return null;
  var minLat = 90.0, maxLat = -90.0, minLng = 180.0, maxLng = -180.0;
  for (final p in pts) {
    minLat = math.min(minLat, p.latitude);
    maxLat = math.max(maxLat, p.latitude);
    minLng = math.min(minLng, p.longitude);
    maxLng = math.max(maxLng, p.longitude);
  }
  int r(double v) => (v * 1e5).round();
  return (r(minLat), r(maxLat), r(minLng), r(maxLng), m.fitPadding, m.mapPadding);
}

/// flutter_map engine (tests, no Google key): CARTO tiles. Re-fits the camera when [TtMap.fitPoints] change, like
/// the Google engine.
class _FlutterTtMap extends StatefulWidget {
  const _FlutterTtMap({required this.map, required this.vehicles, required this.run});
  final TtMap map;

  /// [TtMap.vehicles] as drawn this frame (gliding, [_VehicleGlider]).
  final List<MapVehicle> vehicles;

  /// The dark stretch running along the route this frame ([_RouteRunner]); empty when still.
  final List<LatLng> run;

  @override
  State<_FlutterTtMap> createState() => _FlutterTtMapState();
}

class _FlutterTtMapState extends State<_FlutterTtMap> {
  MapController? _own;

  TtMap get m => widget.map;
  MapController get _mapController => m.controller?._flutterMap ?? (_own ??= MapController());

  @override
  void didUpdateWidget(covariant _FlutterTtMap old) {
    super.didUpdateWidget(old);
    if (_fitKey(m) != _fitKey(old.map)) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        final fit = m.fitPoints;
        if (fit == null || fit.length < 2) return;
        try {
          _mapController.fitCamera(CameraFit.coordinates(coordinates: fit, padding: _fitPaddingOf(m), maxZoom: 16));
        } catch (_) {
          // Map not laid out yet.
        }
      });
    }
  }

  @override
  void dispose() {
    _own?.dispose();
    super.dispose();
  }

  /// A pin standing on its point (the tip).
  static Marker _pin(LatLng at, MapPin pin) =>
      Marker(point: at, width: MapPin.width, height: MapPin.height, alignment: Alignment.topCenter, child: pin);

  @override
  Widget build(BuildContext context) {
    final m = this.m;
    final fit = m.fitPoints != null && m.fitPoints!.length >= 2
        ? CameraFit.coordinates(coordinates: m.fitPoints!, padding: _fitPaddingOf(m), maxZoom: 16)
        : null;
    return ClipRect(
      child: FlutterMap(
        mapController: _mapController,
        options: MapOptions(
          initialCenter: m.center ?? m.pickup ?? CityDefaults.center,
          initialZoom: m.zoom,
          initialCameraFit: fit,
          backgroundColor: TtColors.inputBg,
          minZoom: 10,
          maxZoom: 18,
          onPositionChanged: m.onPositionChanged == null
              ? null
              : (camera, hasGesture) =>
                  m.onPositionChanged!(TtCamera(center: camera.center, zoom: camera.zoom), hasGesture),
          interactionOptions: InteractionOptions(
            flags: m.interactive ? InteractiveFlag.all & ~InteractiveFlag.rotate : InteractiveFlag.none,
          ),
        ),
        children: [
          if (TtMap.tilesEnabled)
            TileLayer(
              urlTemplate: TtMap.tileUrl,
              // A real app user-agent: some CDN edges reject the default "flutter_map (unknown)".
              tileProvider: NetworkTileProvider(
                headers: {'User-Agent': 'TtApp/0.1 (Android; com.tamiltaxi)'},
                // No disk cache, so an error image is never shown again from cache.
                cachingProvider: const DisabledMapCachingProvider(),
              ),
              subdomains: const ['a', 'b', 'c', 'd'],
              retinaMode: RetinaMode.isHighDensity(context),
              maxNativeZoom: 19,
              evictErrorTileStrategy: EvictErrorTileStrategy.dispose,
              errorTileCallback: (tile, error, stack) {},
            ),
          if (m.polygons.isNotEmpty) _ZoomedPolygons(polygons: m.polygons),
          if (m.route.length >= 2)
            PolylineLayer(
              polylines: [
                Polyline(points: m.route, color: TtColors.route, strokeWidth: 4, strokeCap: StrokeCap.round, strokeJoin: StrokeJoin.round),
                if (widget.run.length >= 2)
                  Polyline(points: widget.run, color: TtColors.routeRun, strokeWidth: 4, strokeCap: StrokeCap.round, strokeJoin: StrokeJoin.round),
              ],
            ),
          MarkerLayer(
            markers: [
              if (m.pulseAt != null)
                Marker(point: m.pulseAt!, width: 180, height: 180, child: PulseRing(color: m.pulseColor)),
              if (m.pickup != null) _pin(m.pickup!, const MapPin.pickup()),
              if (m.drop != null) _pin(m.drop!, const MapPin.drop()),
              for (final v in widget.vehicles)
                Marker(
                  point: v.position,
                  width: v.large ? 56 : 36,
                  height: v.large ? 56 : 36,
                  child: VehicleMarker(type: v.type, heading: v.heading, large: v.large),
                ),
              ..._placeLabels(m),
              ...m.extraMarkers,
            ],
          ),
          if (m.showAttribution)
            Align(
              alignment: m.attributionAlignment,
              child: Container(
                margin: m.attributionPadding + const EdgeInsets.all(4),
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.8), borderRadius: BorderRadius.circular(4)),
                child: Text(
                  '© OpenStreetMap contributors © CARTO',
                  style: context.type.caption.copyWith(fontSize: 9, color: TtColors.navy500),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// "High demand: Gandhipuram" chip shown under a demand zone.
class DemandLabel extends StatelessWidget {
  const DemandLabel({super.key, required this.text});
  final String text;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: const BoxDecoration(color: Colors.white, borderRadius: TtRadii.pillRadius, boxShadow: TtShadows.soft),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Symbols.local_fire_department_rounded, size: 16, color: TtColors.coral600, fill: 1),
            const SizedBox(width: 4),
            Flexible(
              child: Text(text,
                  overflow: TextOverflow.ellipsis,
                  style: context.type.bodySmallMedium.copyWith(color: TtColors.coral600, fontWeight: FontWeight.w600)),
            ),
          ],
        ),
      );
}

/// Round white floating button used over maps (back, recentre, share). [busy] swaps the icon for a small spinner
/// (e.g. while "Locate me" waits for a GPS fix).
class MapCircleButton extends StatelessWidget {
  const MapCircleButton({
    super.key,
    required this.icon,
    required this.onPressed,
    required this.tooltip,
    this.size = 48,
    this.busy = false,
  });

  final IconData icon;
  final VoidCallback onPressed;
  final String tooltip;
  final double size;
  final bool busy;

  @override
  Widget build(BuildContext context) => Tooltip(
        message: tooltip,
        child: Material(
          color: Colors.white,
          shape: const CircleBorder(),
          elevation: 3,
          shadowColor: TtColors.shadow,
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: onPressed,
            child: SizedBox(
              width: size,
              height: size,
              child: busy
                  ? const Center(
                      child: SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2.4, color: TtColors.coral600),
                      ),
                    )
                  : Icon(icon, color: TtColors.navy900),
            ),
          ),
        ),
      );
}

/// flutter_map: [MapPolygon]s visible at the current zoom (rebuilds with the camera).
class _ZoomedPolygons extends StatelessWidget {
  const _ZoomedPolygons({required this.polygons});
  final List<MapPolygon> polygons;

  @override
  Widget build(BuildContext context) {
    final zoom = MapCamera.of(context).zoom;
    final visible = [...polygons.where((p) => p.visibleAt(zoom))]..sort((a, b) => a.zIndex.compareTo(b.zIndex));
    return PolygonLayer(
      polygons: [
        for (final p in visible)
          Polygon(points: p.points, color: p.fillColor, borderColor: p.strokeColor, borderStrokeWidth: p.strokeWidth),
      ],
    );
  }
}
