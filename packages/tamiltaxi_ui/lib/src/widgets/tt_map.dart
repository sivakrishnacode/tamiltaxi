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
/// Draws pickup (green dot) and drop (red pin), or Ola-style name chips in their place, vehicles (navy top-down icons),
/// a light slate 3px route (a soft darker glow glides along it on route previews, like Ola's), a pulse ring and hex polygons (no circles: areas are H3 hexes). If tiles fail (offline) the plain #F1F5F9
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

  /// Name chips that mark the pickup / drop instead of the dot and pin (like Ola's); tapping one calls
  /// [onPickupLabel] / [onDropLabel] (a ⟩ shows when set).
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

/// The drop pin's size on a map without the drop's name chip (it stands on its point).
const double _dropPinSize = 32;

/// [TtMap.fitPadding] plus room for what stands beside the points: the drop pin above its point, and the name chip
/// of the point further east, which runs to its right past the fitted box (Ola's chips run off screen there).
EdgeInsets _fitPaddingOf(TtMap m, BuildContext context) {
  var p = m.fitPadding;
  if (m.drop != null && m.dropLabel == null) p += const EdgeInsets.only(top: _dropPinSize);
  final chips = [
    if (m.pickup != null && m.pickupLabel != null) (at: m.pickup!, text: m.pickupLabel!, tap: m.onPickupLabel != null),
    if (m.drop != null && m.dropLabel != null) (at: m.drop!, text: m.dropLabel!, tap: m.onDropLabel != null),
  ];
  if (chips.isNotEmpty) {
    final east = chips.reduce((a, b) => a.at.longitude >= b.at.longitude ? a : b);
    final size = _PlaceChip.sizeFor(east.text, _PlaceChip.styleOf(context), tappable: east.tap);
    p = p.copyWith(right: math.max(p.right, size.width - _PlaceChip.markCentre.dx + 8));
  }
  return p;
}

/// The name chips ([TtMap.pickupLabel], [TtMap.dropLabel]) as flutter_map markers, the mark on the point.
List<Marker> _chipMarkers(TtMap m, BuildContext context) {
  final style = _PlaceChip.styleOf(context);
  Marker chip(LatLng at, String text, bool drop, VoidCallback? onTap) {
    final size = _PlaceChip.sizeFor(text, style, tappable: onTap != null);
    return Marker(
      point: at,
      width: size.width,
      height: size.height,
      // flutter_map puts the box's centre at the point + alignment × half its size: this puts the mark on the point.
      alignment: Alignment(1 - 2 * _PlaceChip.markCentre.dx / size.width, 0),
      child: GestureDetector(
        onTap: onTap,
        child: _PlaceChip(text: text, drop: drop, tappable: onTap != null, style: style),
      ),
    );
  }

  return [
    if (m.pickup != null && m.pickupLabel != null) chip(m.pickup!, m.pickupLabel!, false, m.onPickupLabel),
    if (m.drop != null && m.dropLabel != null) chip(m.drop!, m.dropLabel!, true, m.onDropLabel),
  ];
}

/// A pickup / drop name chip, like Ola's: a white pill with the place's mark (green dot or red pin) on the point,
/// the name on one line and a ⟩ when it can be tapped. Takes an explicit [style] (it is also drawn into a Google
/// marker bitmap, where there is no theme) and keeps its size whatever the system text size.
class _PlaceChip extends StatelessWidget {
  const _PlaceChip({required this.text, required this.drop, required this.tappable, required this.style});

  final String text;
  final bool drop;
  final bool tappable;
  final TextStyle style;

  static const double height = 34;
  static const double _padLeft = 6;
  static const double _padRight = 12;
  static const double _mark = 22;
  static const double _maxText = 150;

  /// Where the place is: the middle of the mark.
  static const Offset markCentre = Offset(_padLeft + _mark / 2, height / 2);

  /// The full style, merged with the screen's default text style (its letter spacing and so on) as a [Text] would
  /// be, so [sizeFor] measures exactly what [build] draws, on the map and in the marker bitmap alike.
  static TextStyle styleOf(BuildContext context) => DefaultTextStyle.of(context)
      .style
      .merge(context.type.bodySmallMedium.copyWith(color: TtColors.navy900, height: 1.2));

  /// The chip's size for [text], laid out as [build] lays it out. Measured every time, not kept: a size measured
  /// before the font has loaded is too narrow and would cut the name short for good.
  static Size sizeFor(String text, TextStyle style, {required bool tappable}) {
    final tp = TextPainter(
      text: TextSpan(text: text, style: style),
      maxLines: 1,
      ellipsis: '…',
      textDirection: TextDirection.ltr,
      textScaler: TextScaler.noScaling,
    )..layout(maxWidth: _maxText);
    // 2 px spare so rounding never ellipsises the name.
    final w = _padLeft + _mark + 6 + tp.width + 2 + (tappable ? 2 + 18 : 0) + _padRight;
    tp.dispose();
    return Size(w.ceilToDouble(), height);
  }

  @override
  Widget build(BuildContext context) => Semantics(
        button: tappable,
        label: text,
        excludeSemantics: true,
        child: Container(
          height: height,
          padding: const EdgeInsets.only(left: _padLeft, right: _padRight),
          decoration: const BoxDecoration(
            color: TtColors.surface,
            borderRadius: BorderRadius.all(Radius.circular(height / 2)),
            boxShadow: [BoxShadow(color: Color(0x2E1E293B), blurRadius: 4, offset: Offset(0, 1))],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                width: _mark,
                height: _mark,
                child: drop
                    ? const Icon(Symbols.location_on_rounded, fill: 1, size: _mark, color: TtColors.drop)
                    : const PickupHalo(),
              ),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  text,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: style,
                  textScaler: TextScaler.noScaling,
                ),
              ),
              if (tappable) ...[
                const SizedBox(width: 2),
                const Icon(Symbols.chevron_right_rounded, size: 18, color: TtColors.navy700),
              ],
            ],
          ),
        ),
      );
}

/// One piece of the gliding stretch and how opaque it is (the stretch fades from tail to head).
typedef _RunPiece = ({List<LatLng> points, double alpha});

/// Route previews ([TtMap.animateRoute]), like Ola's: a soft darker glow (a fifth of the route, fading in from its
/// tail) glides slowly along the light route from pickup to drop, a short rest, again (4 s). Hands the engines the
/// glow's pieces to draw ([_RunPiece]). Off in tests and screenshots (no tiles) and when the phone asks for fewer
/// animations.
class _RouteRunner extends StatefulWidget {
  const _RouteRunner({required this.route, required this.enabled, required this.builder});

  final List<LatLng> route;
  final bool enabled;
  final Widget Function(List<_RunPiece> run) builder;

  @override
  State<_RouteRunner> createState() => _RouteRunnerState();
}

class _RouteRunnerState extends State<_RouteRunner> with SingleTickerProviderStateMixin {
  /// Redraw at most this often (the Google map's polylines go over the platform channel on every rebuild).
  static const _frameMs = 24;

  late final AnimationController _run = AnimationController(vsync: this, duration: const Duration(milliseconds: 4000))
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
    // The glow's head runs from the pickup to past the drop (gently eased) in 85 % of the loop, then a short rest. The
    // glow is five pieces, faint at the tail and solid at the head.
    const length = 0.2, pieces = 5;
    final t = _run.value;
    final head = t < 0.85 ? Curves.easeInOutSine.transform(t / 0.85) * (1 + length) : 1 + length;
    final run = <_RunPiece>[
      for (var k = 0; k < pieces; k++)
        (
          points: _slice(
            (head - length + length * k / pieces).clamp(0.0, 1.0),
            (head - length + length * (k + 1) / pieces).clamp(0.0, 1.0),
          ),
          alpha: (k + 1) / pieces,
        ),
    ];
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

  /// The pieces of the glow gliding along the route this frame ([_RouteRunner]); empty when still.
  final List<_RunPiece> run;

  @override
  State<_FlutterTtMap> createState() => _FlutterTtMapState();
}

class _FlutterTtMapState extends State<_FlutterTtMap> {
  MapController? _own;

  @override
  void initState() {
    super.initState();
    PaintingBinding.instance.systemFonts.addListener(_fontsLoaded);
  }

  /// A font finished loading: measure the name chips again ([_PlaceChip.sizeFor]).
  void _fontsLoaded() {
    if (mounted && (m.pickupLabel != null || m.dropLabel != null)) setState(() {});
  }

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
          _mapController.fitCamera(CameraFit.coordinates(coordinates: fit, padding: _fitPaddingOf(m, context), maxZoom: 16));
        } catch (_) {
          // Map not laid out yet.
        }
      });
    }
  }

  @override
  void dispose() {
    PaintingBinding.instance.systemFonts.removeListener(_fontsLoaded);
    _own?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final m = this.m;
    final fit = m.fitPoints != null && m.fitPoints!.length >= 2
        ? CameraFit.coordinates(coordinates: m.fitPoints!, padding: _fitPaddingOf(m, context), maxZoom: 16)
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
                Polyline(points: m.route, color: TtColors.route, strokeWidth: 3, strokeCap: StrokeCap.round, strokeJoin: StrokeJoin.round),
                // Flat ends, so the pieces meet without darker overlaps.
                for (final piece in widget.run)
                  if (piece.points.length >= 2)
                    Polyline(
                      points: piece.points,
                      color: TtColors.routeRun.withValues(alpha: piece.alpha),
                      strokeWidth: 3,
                      strokeCap: StrokeCap.butt,
                      strokeJoin: StrokeJoin.round,
                    ),
              ],
            ),
          MarkerLayer(
            markers: [
              if (m.pulseAt != null)
                Marker(point: m.pulseAt!, width: 180, height: 180, child: PulseRing(color: m.pulseColor)),
              // With a name chip the chip marks the place (below); otherwise the dot / pin does.
              if (m.pickup != null && m.pickupLabel == null)
                Marker(point: m.pickup!, width: PickupHalo.size, height: PickupHalo.size, child: const PickupHalo()),
              if (m.drop != null && m.dropLabel == null)
                Marker(
                  point: m.drop!,
                  width: _dropPinSize,
                  height: _dropPinSize,
                  alignment: Alignment.topCenter,
                  child: const DropPin(size: _dropPinSize),
                ),
              for (final v in widget.vehicles)
                Marker(
                  point: v.position,
                  width: v.large ? 56 : 36,
                  height: v.large ? 56 : 36,
                  child: VehicleMarker(type: v.type, heading: v.heading, large: v.large),
                ),
              ..._chipMarkers(m, context),
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
