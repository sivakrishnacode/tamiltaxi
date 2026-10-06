part of 'tt_map.dart';

// Google Maps SDK engine for [TtMap]. Only built when [TtMap.usesGoogle] is true, so tests
// (tilesEnabled = false) and key-less builds never create a platform view.

gm.LatLng _g(LatLng p) => gm.LatLng(p.latitude, p.longitude);
LatLng _l(gm.LatLng p) => LatLng(p.latitude, p.longitude);

/// Web-Mercator maths in Google's world of 256 logical px at zoom 0 (same as flutter_map's
/// EPSG:3857), used to fit points before the map exists and to place widget overlays.
abstract final class _Mercator {
  static Offset world(LatLng p, double zoom) {
    final scale = 256 * math.pow(2, zoom).toDouble();
    final s = math.sin(p.latitude * math.pi / 180).clamp(-0.9999, 0.9999);
    return Offset((p.longitude + 180) / 360 * scale, (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * scale);
  }

  static LatLng unproject(Offset w, double zoom) {
    final scale = 256 * math.pow(2, zoom).toDouble();
    final n = math.pi - 2 * math.pi * w.dy / scale;
    final lat = 180 / math.pi * math.atan(0.5 * (math.exp(n) - math.exp(-n)));
    return LatLng(lat, w.dx / scale * 360 - 180);
  }

  /// Camera that fits [points] inside [size] minus [padding] (like flutter_map's CameraFit). A [pin] drawn
  /// [pinHeight] px above its point (the drop) gets room for the whole pin when it sits in the fitted box.
  static (LatLng, double) fit(
    List<LatLng> points,
    Size size,
    EdgeInsets padding, {
    LatLng? pin,
    double pinHeight = 0,
    double minZoom = 10,
    double maxZoom = 16,
  }) {
    var minX = double.infinity, minY = double.infinity, maxX = -double.infinity, maxY = -double.infinity;
    for (final p in points) {
      final w = world(p, 0);
      minX = math.min(minX, w.dx);
      maxX = math.max(maxX, w.dx);
      minY = math.min(minY, w.dy);
      maxY = math.max(maxY, w.dy);
    }
    final availW = math.max(1.0, size.width - padding.horizontal);
    final availH = math.max(1.0, size.height - padding.vertical);
    final p = pin == null ? null : world(pin, 0);
    // The pin's point counts when it is at the box (a road route ends a few metres from the place), not when the
    // screen leaves it out on purpose (far away).
    final near = math.max(maxX - minX, maxY - minY) * 0.1 + 1e-9;
    final pinInBox = p != null &&
        pinHeight > 0 &&
        p.dx >= minX - near &&
        p.dx <= maxX + near &&
        p.dy >= minY - near &&
        p.dy <= maxY + near;
    if (pinInBox) {
      minX = math.min(minX, p.dx);
      maxX = math.max(maxX, p.dx);
      minY = math.min(minY, p.dy);
      maxY = math.max(maxY, p.dy);
    }
    // The pin's height is fixed on screen, so its share of the box depends on the zoom: a few passes settle it.
    var top = minY;
    var zoom = maxZoom;
    for (var pass = 0; pass < 3; pass++) {
      final dx = maxX - minX, dy = maxY - top;
      final zx = dx > 0 ? math.log(availW / dx) / math.ln2 : maxZoom;
      final zy = dy > 0 ? math.log(availH / dy) / math.ln2 : maxZoom;
      zoom = math.min(zx, zy).clamp(minZoom, maxZoom).toDouble();
      if (!pinInBox) break;
      top = math.min(minY, p.dy - pinHeight / math.pow(2, zoom));
    }
    final scale = math.pow(2, zoom).toDouble();
    final centre = Offset((minX + maxX) / 2 * scale, (top + maxY) / 2 * scale);
    // Shift so the fitted box sits in the padded area, not the raw centre.
    final target = centre - Offset((padding.left - padding.right) / 2, (padding.top - padding.bottom) / 2);
    return (unproject(target, zoom), zoom);
  }
}

/// Marker bitmaps rendered once from the Tamil Taxi widgets and cached per kind / pixel ratio.
abstract final class _MarkerBitmaps {
  static const pad = 6.0;
  static final Map<String, Future<gm.BitmapDescriptor>> _cache = {};

  static Future<gm.BitmapDescriptor> get(String key, Widget widget, Size size, double dpr, ui.FlutterView view) {
    final cacheKey = '$key@$dpr';
    return _cache[cacheKey] ??=
        renderWidgetToPng(
          Padding(padding: const EdgeInsets.all(pad), child: widget),
          size: Size(size.width + 2 * pad, size.height + 2 * pad),
          pixelRatio: dpr,
          view: view,
        ).then<gm.BitmapDescriptor>((Uint8List png) => gm.BytesMapBitmap(png, imagePixelRatio: dpr)).catchError((
          Object e,
        ) {
          _cache.remove(cacheKey);
          throw e;
        });
  }

  /// Anchor for a marker whose point sits at [inner] (0..1 of the unpadded widget).
  static Offset anchor(Size size, Offset inner) => Offset(
    (pad + inner.dx * size.width) / (size.width + 2 * pad),
    (pad + inner.dy * size.height) / (size.height + 2 * pad),
  );
}

class _GoogleTtMap extends StatefulWidget {
  const _GoogleTtMap({required this.map, required this.vehicles});
  final TtMap map;

  /// [TtMap.vehicles] as drawn this frame (gliding, [_VehicleGlider]).
  final List<MapVehicle> vehicles;

  @override
  State<_GoogleTtMap> createState() => _GoogleTtMapState();
}

class _GoogleTtMapState extends State<_GoogleTtMap> with WidgetsBindingObserver {
  static const _pickupSize = Size(28, 28);
  static const _dropSize = Size(40, 40);
  static const _eager = <Factory<OneSequenceGestureRecognizer>>{
    Factory<OneSequenceGestureRecognizer>(EagerGestureRecognizer.new),
  };

  gm.GoogleMapController? _controller;
  gm.CameraPosition? _initial;
  late gm.CameraPosition _camera;
  Size _size = Size.zero;
  final Map<String, gm.BitmapDescriptor> _icons = {};
  final Set<String> _requested = {};
  bool _programmaticMove = false;
  (LatLng, double)? _pendingMove;

  TtMap get m => widget.map;

  /// Bumped to create a fresh native map (see [didChangeAppLifecycleState]).
  int _generation = 0;
  DateTime? _awaySince;

  /// Away at least this long (another app, the permission dialog) → a fresh native map on return.
  static const _recreateAfter = Duration(milliseconds: 800);

  @override
  void initState() {
    super.initState();
    m.controller?._google = this;
    WidgetsBinding.instance.addObserver(this);
  }

  /// Android (texture layer platform view): after the app was in the background (Google Maps navigation, a
  /// permission dialog) the native map can stop drawing: logo only, no tiles or markers, camera frozen. A fresh
  /// map at the same camera fixes it; a quick glance at the notification shade doesn't count.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      final since = _awaySince;
      _awaySince = null;
      if (since != null && DateTime.now().difference(since) >= _recreateAfter && mounted) _recreate();
    } else {
      _awaySince ??= DateTime.now();
    }
  }

  void _recreate() {
    setState(() {
      _generation++;
      _controller = null;
      _initial = _camera; // Same place and zoom as before.
      _programmaticMove = false;
      final centre = m.center;
      if (centre != null && !_userMovedRecently) _pendingMove = (centre, _camera.zoom);
    });
  }

  @override
  void didUpdateWidget(covariant _GoogleTtMap old) {
    super.didUpdateWidget(old);
    if (old.map.controller != m.controller) {
      if (old.map.controller?._google == this) old.map.controller!._google = null;
      m.controller?._google = this;
    }
    // New [TtMap.fitPoints] (the road route arrived, the driver's first GPS fix, the next trip phase) or a new
    // visible area (the sheet grew) re-fits the camera, so the map always shows what the screen is about.
    // Otherwise a new [TtMap.center] (e.g. the driver's GPS) moves the camera, keeping the user's zoom. GoogleMap
    // only reads its initial camera, so without this the map stayed on the first view. Both pause for a while
    // after the user pans / zooms, so the camera doesn't fight their finger.
    final centre = m.center;
    if (_fitKey(m) != _fitKey(old.map)) {
      if (!_userMovedRecently) _refit();
    } else if (centre != null && centre != old.map.center && !_userMovedRecently) {
      _followTo(centre);
    }
  }

  /// Animates to [TtMap.fitPoints] inside the area left by `mapPadding`.
  void _refit() {
    final fit = m.fitPoints;
    if (fit == null || fit.length < 2 || _size.isEmpty) return;
    final (centre, zoom) = _fitCamera(fit, _size);
    final c = _controller;
    if (c == null) {
      _pendingMove = (centre, zoom);
      return;
    }
    _programmaticMove = true;
    unawaited(c.animateCamera(gm.CameraUpdate.newLatLngZoom(_g(centre), zoom)).catchError((Object _) {}));
  }

  /// When the user last moved the map by hand, and how many fingers are on it now. GoogleMap also reports camera
  /// moves it makes itself (first layout, padding changes), so only moves while touching count as the user's.
  DateTime? _userMovedAt;
  int _pointers = 0;
  static const _followPause = Duration(seconds: 15);

  bool get _userMovedRecently {
    final at = _userMovedAt;
    return at != null && DateTime.now().difference(at) < _followPause;
  }

  void _followTo(LatLng centre) {
    final c = _controller;
    if (c == null) {
      _pendingMove = (centre, m.zoom);
      return;
    }
    _programmaticMove = true;
    unawaited(c.animateCamera(gm.CameraUpdate.newLatLng(_g(centre))).catchError((Object _) {}));
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    if (m.controller?._google == this) m.controller!._google = null;
    super.dispose();
  }

  void _moveTo(LatLng center, double zoom) {
    final c = _controller;
    if (c == null) {
      _pendingMove = (center, zoom);
      return;
    }
    _programmaticMove = true;
    unawaited(c.moveCamera(gm.CameraUpdate.newLatLngZoom(_g(center), zoom)).catchError((Object _) {}));
  }

  void _animateTo(LatLng center, double zoom) {
    final c = _controller;
    if (c == null) {
      _pendingMove = (center, zoom);
      return;
    }
    _programmaticMove = true;
    unawaited(c.animateCamera(gm.CameraUpdate.newLatLngZoom(_g(center), zoom)).catchError((Object _) {}));
  }

  void _onCreated(gm.GoogleMapController c) {
    _controller = c;
    final pending = _pendingMove;
    _pendingMove = null;
    final initial = _initial;
    if (pending != null) {
      _moveTo(pending.$1, pending.$2);
    } else if (initial != null && m.mapPadding != EdgeInsets.zero) {
      // Android takes the initial camera before `mapPadding` and keeps the view when the padding comes, so the
      // camera aimed at the padded area (the route above the sheet) showed it in the middle of the whole map,
      // behind the sheet. Placing it again now that the padding is set puts it where it was meant to be.
      _moveTo(_l(initial.target), initial.zoom);
    }
  }

  bool get _hasOverlays =>
      m.pulseAt != null ||
      m.extraMarkers.isNotEmpty ||
      m.polygons.any((p) => p.isZoomLimited);

  void _onCameraMove(gm.CameraPosition pos) {
    _camera = pos;
    if (_pointers > 0) _userMovedAt = DateTime.now();
    if (_hasOverlays) setState(() {});
    m.onPositionChanged?.call(TtCamera(center: _l(pos.target), zoom: pos.zoom), !_programmaticMove);
  }

  /// Fits [fit] inside the area left by `mapPadding`, keeping the whole drop pin (drawn above its point) in view.
  (LatLng, double) _fitCamera(List<LatLng> fit, Size size) => _Mercator.fit(
        fit,
        m.mapPadding.deflateSize(size),
        m.fitPadding,
        pin: m.drop,
        pinHeight: _dropSize.height,
      );

  gm.CameraPosition _initialCamera(Size size) {
    final fit = m.fitPoints;
    if (fit != null && fit.length >= 2) {
      // GoogleMap centres the camera in the area left by `mapPadding`, so fit inside that area.
      final (centre, zoom) = _fitCamera(fit, size);
      return gm.CameraPosition(target: _g(centre), zoom: zoom);
    }
    return gm.CameraPosition(target: _g(m.center ?? m.pickup ?? CityDefaults.center), zoom: m.zoom);
  }

  // ---- markers ----

  static String _vehicleKey(MapVehicle v) => 'vehicle-${v.type.name}-${v.large}';
  static Size _vehicleSize(MapVehicle v) => Size.square(v.large ? 56 : 36);

  void _ensureIcons(double dpr) {
    final view = View.of(context);
    void need(String key, Widget w, Size size) {
      if (_requested.contains(key)) return;
      _requested.add(key);
      _MarkerBitmaps.get(key, w, size, dpr, view).then(
        (icon) {
          if (mounted) setState(() => _icons[key] = icon);
        },
        onError: (Object e) {
          _requested.remove(key);
          debugPrint('TtMap: marker bitmap failed: $e');
        },
      );
    }

    if (m.pickup != null) need('pickup', const PickupDot(), _pickupSize);
    if (m.drop != null) need('drop', const DropPin(size: 40), _dropSize);
    for (final v in widget.vehicles) {
      need(_vehicleKey(v), VehicleMarker(type: v.type, large: v.large), _vehicleSize(v));
    }
  }

  Set<gm.Marker> _markers() {
    final out = <gm.Marker>{};
    final pickupIcon = _icons['pickup'];
    if (m.pickup != null && pickupIcon != null) {
      out.add(
        gm.Marker(
          markerId: const gm.MarkerId('pickup'),
          position: _g(m.pickup!),
          icon: pickupIcon,
          anchor: const Offset(0.5, 0.5),
          consumeTapEvents: true,
          zIndexInt: 2,
        ),
      );
    }
    final dropIcon = _icons['drop'];
    if (m.drop != null && dropIcon != null) {
      out.add(
        gm.Marker(
          markerId: const gm.MarkerId('drop'),
          position: _g(m.drop!),
          icon: dropIcon,
          // flutter_map path draws the 40 px pin above the point (Alignment.topCenter).
          anchor: _MarkerBitmaps.anchor(_dropSize, const Offset(0.5, 1)),
          consumeTapEvents: true,
          zIndexInt: 3,
        ),
      );
    }
    for (var i = 0; i < widget.vehicles.length; i++) {
      final v = widget.vehicles[i];
      final icon = _icons[_vehicleKey(v)];
      if (icon == null) continue;
      out.add(
        gm.Marker(
          // Keyed by the car (nearby cars' marker id) so a glide moves one marker rather than handing it on.
          markerId: gm.MarkerId(v.id == null ? 'vehicle-$i' : 'car-${v.id}'),
          position: _g(v.position),
          icon: icon,
          rotation: v.heading,
          flat: true,
          anchor: const Offset(0.5, 0.5),
          consumeTapEvents: true,
          zIndexInt: v.large ? 4 : 1,
        ),
      );
    }
    return out;
  }

  // ---- widget overlays (pulse ring, zone labels, extra markers) ----

  /// Screen position of [p]. The camera target sits at the centre of the area left by `mapPadding` (not of the
  /// widget), otherwise overlays such as the pulse ring drift away from their point as the zoom changes.
  Offset _screen(LatLng p) {
    final z = _camera.zoom;
    final pad = m.mapPadding;
    final centre = Offset(pad.left + (_size.width - pad.horizontal) / 2, pad.top + (_size.height - pad.vertical) / 2);
    return _Mercator.world(p, z) - _Mercator.world(_l(_camera.target), z) + centre;
  }

  Widget? _overlay(LatLng point, double width, double height, Alignment alignment, Widget child) {
    final s = _screen(point);
    final left = 0.5 * width * (alignment.x + 1);
    final top = 0.5 * height * (alignment.y + 1);
    final x = s.dx - (width - left);
    final y = s.dy - (height - top);
    if (x > _size.width || y > _size.height || x + width < 0 || y + height < 0) return null;
    return Positioned(
      left: x,
      top: y,
      width: width,
      height: height,
      child: IgnorePointer(child: child),
    );
  }

  List<Widget> _overlays() => [
    if (m.pulseAt != null) _overlay(m.pulseAt!, 180, 180, Alignment.center, PulseRing(color: m.pulseColor)),
    for (final mk in m.extraMarkers)
      _overlay(mk.point, mk.width, mk.height, mk.alignment ?? Alignment.center, mk.child),
  ].nonNulls.toList();

  @override
  Widget build(BuildContext context) {
    final dpr = MediaQuery.devicePixelRatioOf(context);
    _ensureIcons(dpr);
    return LayoutBuilder(
      builder: (context, constraints) {
        final size = constraints.biggest;
        final laidOut = size.isFinite ? size : const Size(360, 640);
        // A new map size (the panel above or below it resized) changes what fits.
        if (_initial != null && laidOut != _size) {
          _size = laidOut;
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted && !_userMovedRecently) _refit();
          });
        }
        _size = laidOut;
        final initial = _initial ??= _camera = _initialCamera(_size);
        return ClipRect(
          child: ColoredBox(
            color: TtColors.inputBg,
            child: Stack(
              children: [
                Positioned.fill(
                  child: Listener(
                    onPointerDown: (_) => _pointers++,
                    onPointerUp: (_) => _pointers = _pointers > 0 ? _pointers - 1 : 0,
                    onPointerCancel: (_) => _pointers = _pointers > 0 ? _pointers - 1 : 0,
                    child: gm.GoogleMap(
                      key: ValueKey('google-map-$_generation'),
                      initialCameraPosition: initial,
                      padding: m.mapPadding,
                      style: ttGoogleMapStyle,
                      onMapCreated: _onCreated,
                      onCameraMove: _onCameraMove,
                      onCameraIdle: () => _programmaticMove = false,
                      markers: _markers(),
                      polylines: {
                        if (m.route.length >= 2)
                          gm.Polyline(
                            polylineId: const gm.PolylineId('route'),
                            points: [for (final p in m.route) _g(p)],
                            color: TtColors.coral500,
                            width: 5,
                            startCap: gm.Cap.roundCap,
                            endCap: gm.Cap.roundCap,
                            jointType: gm.JointType.round,
                          ),
                      },
                      polygons: {
                        for (var i = 0; i < m.polygons.length; i++)
                          if (m.polygons[i].visibleAt(_camera.zoom))
                            gm.Polygon(
                              polygonId: gm.PolygonId('poly-$i'),
                              points: [for (final p in m.polygons[i].points) _g(p)],
                              fillColor: m.polygons[i].fillColor,
                              strokeColor: m.polygons[i].strokeColor,
                              strokeWidth: m.polygons[i].strokeWidth.round(),
                              zIndex: m.polygons[i].zIndex,
                            ),
                      },
                      minMaxZoomPreference: const gm.MinMaxZoomPreference(10, 18),
                      compassEnabled: false,
                      mapToolbarEnabled: false,
                      zoomControlsEnabled: false,
                      myLocationButtonEnabled: false,
                      rotateGesturesEnabled: false,
                      tiltGesturesEnabled: false,
                      scrollGesturesEnabled: m.interactive,
                      zoomGesturesEnabled: m.interactive,
                      buildingsEnabled: false,
                      indoorViewEnabled: false,
                      trafficEnabled: false,
                      gestureRecognizers: m.interactive ? _eager : const {},
                    ),
                  ),
                ),
                ..._overlays(),
              ],
            ),
          ),
        );
      },
    );
  }
}
