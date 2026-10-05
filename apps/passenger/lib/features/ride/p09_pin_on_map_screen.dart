import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../common/device_location.dart';
import '../../router/routes.dart';
import '../../state/ride_flow.dart';

/// P-09 Pin on map: move the map under a fixed coral pin; the address card follows
/// (reverse geocoded). "Confirm drop" → P-10, or S-08 when the pin is outside Coimbatore.
class P09PinOnMapScreen extends ConsumerStatefulWidget {
  const P09PinOnMapScreen({super.key, this.forPickup = false, this.pickOnly = false, this.showcase = false});

  /// Just pick a point and return it with `context.pop(place)` (used by the saved-place editor).
  final bool pickOnly;

  /// Pin the pickup instead of the drop (opened from the P-08 pickup field).
  final bool forPickup;

  /// Opened on its own from the Design gallery: render seed state, start no timers.
  final bool showcase;

  @override
  ConsumerState<P09PinOnMapScreen> createState() => _P09PinOnMapScreenState();
}

class _P09PinOnMapScreenState extends ConsumerState<P09PinOnMapScreen> {
  static const double _zoom = 16;
  final _map = TtMapController();
  late final Place _initial = widget.showcase ? Seed.brookefields : _start();
  late Place _place = _initial;
  late LatLng _centre = _initial.location;
  bool _locating = false;

  /// "Locate me" is waiting for the phone's position (the button spins).
  bool _findingMe = false;
  Timer? _debounce;
  int _request = 0;

  /// Where the pin starts: the pickup, or the drop when one is chosen. With no drop yet (and for a saved place) it
  /// starts on the pickup as a new pin, never on a place nobody chose.
  Place _start() {
    final ride = ref.read(rideFlowProvider);
    if (widget.forPickup) return ride.pickup;
    if (!widget.pickOnly && ride.dropSet) return ride.drop;
    final at = ride.pickup.location;
    return Place(id: 'pin-${at.latitude},${at.longitude}', name: 'Pinned location', address: '', location: at);
  }

  @override
  void initState() {
    super.initState();
    // A new pin: its address now, before the map is moved.
    if (!widget.showcase && _initial.id.startsWith('pin-')) {
      _locating = true;
      WidgetsBinding.instance.addPostFrameCallback((_) => _geocode());
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _map.dispose();
    super.dispose();
  }

  void _onMove(TtCamera camera, bool hasGesture) => _lookUp(camera.center);

  /// The pin's address, once the map has stopped at [centre] for a moment.
  void _lookUp(LatLng centre) {
    _centre = centre;
    _debounce?.cancel();
    if (!_locating) setState(() => _locating = true);
    _debounce = Timer(const Duration(milliseconds: 350), _geocode);
  }

  Future<void> _geocode() async {
    final id = ++_request;
    final centre = _centre;
    Place place;
    try {
      place = await ref.read(placesRepositoryProvider).reverseGeocode(centre);
    } catch (_) {
      // Offline / API error: keep the exact pin without an address.
      place = Place(id: 'pin-${centre.latitude},${centre.longitude}', name: 'Pinned location', address: '', location: centre);
    }
    if (!mounted || id != _request) return;
    setState(() {
      _place = place;
      _locating = false;
    });
  }

  /// Locate me: the pin jumps to where the phone was last seen, then to the fresh fix as it comes (GPS can take ~10 s
  /// indoors) while the button spins; the address card follows. It used to go back to where the pin started, so
  /// after a drag it went to the old pickup, and on an untouched map it did nothing.
  Future<void> _recentre() async {
    if (_findingMe) return;
    final known = ref.read(deviceLocationProvider);
    if (known != null) _pinAt(known);
    setState(() => _findingMe = true);
    final follow = ref.listenManual<LatLng?>(deviceLocationProvider, (_, next) {
      if (next != null && mounted) _pinAt(next);
    });
    final LocateResult r;
    try {
      r = await ref.read(deviceLocationProvider.notifier).locate();
    } finally {
      follow.close();
      if (mounted) setState(() => _findingMe = false);
    }
    if (!mounted) return;
    switch (r) {
      case LocateResult.denied:
        showTtSnack(context, 'Allow location access for Tamil Taxi to find where you are.');
      case LocateResult.unavailable:
        showTtSnack(context, "Couldn't find your location right now. Check that location is on, then try again.");
      case LocateResult.inArea || LocateResult.outsideArea:
        break;
    }
  }

  /// Moves the map, and with it the pin, to [at] and looks up its address.
  void _pinAt(LatLng at) {
    _map.move(at, _zoom);
    _lookUp(at);
  }

  void _confirm() {
    final places = ref.read(placesRepositoryProvider);
    final demo = ref.read(demoSettingsProvider);
    if (demo.outsideServiceArea || !places.isInServiceArea(_place.location)) {
      context.push(Routes.serviceUnavailable, extra: demo.outsideServiceArea ? null : _place.location);
      return;
    }
    if (widget.pickOnly) {
      context.pop(_place);
      return;
    }
    if (widget.forPickup) {
      ref.read(rideFlowProvider.notifier).setPickup(_place);
      showTtSnack(context, 'Pickup set to ${_place.name}');
      context.pop();
      return;
    }
    ref.read(rideFlowProvider.notifier).setDrop(_place);
    context.push(Routes.chooseVehicle);
  }

  void _change() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(Routes.search);
    }
  }

  /// Green for the pickup (as on every map and list), the coral drop pin otherwise.
  Widget _pin(double size) => widget.forPickup
      ? Icon(Symbols.location_on_rounded, fill: 1, color: TtColors.success, size: size)
      : DropPin(size: size);

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Scaffold(
      backgroundColor: TtColors.surface,
      body: Column(
        children: [
          Expanded(
            child: Stack(
              children: [
                Positioned.fill(
                  child: TtMap(controller: _map, center: _initial.location, zoom: _zoom, onPositionChanged: _onMove),
                ),
                // Fixed centre pin: its tip sits exactly on the map centre.
                IgnorePointer(
                  child: Center(
                    child: Padding(
                      padding: const EdgeInsets.only(bottom: 96),
                      child: SizedBox(
                        height: 96,
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: TtSpacing.m, vertical: 6),
                              decoration: const BoxDecoration(
                                color: TtColors.navy900,
                                borderRadius: TtRadii.pillRadius,
                              ),
                              child: Text(
                                widget.forPickup ? 'Pickup here' : 'Drop here',
                                style: t.bodySmallMedium.copyWith(color: TtColors.surface),
                              ),
                            ),
                            _pin(56),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
                SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(TtSpacing.l, TtSpacing.m, TtSpacing.l, 0),
                    child: Row(
                      children: [
                        MapCircleButton(icon: Symbols.arrow_back_rounded, tooltip: 'Back', onPressed: _change),
                        const SizedBox(width: TtSpacing.s),
                        Expanded(
                          child: Container(
                            height: 44,
                            padding: const EdgeInsets.symmetric(horizontal: TtSpacing.l),
                            decoration: const BoxDecoration(
                              color: TtColors.navy900,
                              borderRadius: TtRadii.pillRadius,
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                const Icon(Symbols.pan_tool_rounded, size: 20, color: TtColors.surface),
                                const SizedBox(width: TtSpacing.s),
                                Flexible(
                                  child: Text(
                                    widget.forPickup
                                        ? 'Move the map to set your pickup'
                                        : 'Move the map to set your drop',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: t.bodySmallMedium.copyWith(color: TtColors.surface),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                Positioned(
                  right: TtSpacing.l,
                  bottom: TtSpacing.xl,
                  child: MapCircleButton(
                    icon: Symbols.my_location_rounded,
                    tooltip: 'Locate me',
                    busy: _findingMe,
                    onPressed: _recentre,
                  ),
                ),
              ],
            ),
          ),
          FixedBottomSheet(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(padding: const EdgeInsets.only(top: 2), child: _pin(26)),
                    const SizedBox(width: TtSpacing.m),
                    Expanded(
                      child: _locating
                          ? const SkeletonShimmer(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  SizedBox(height: 4),
                                  FractionallySizedBox(widthFactor: 0.7, child: SkeletonBox(height: 16)),
                                  SizedBox(height: TtSpacing.s),
                                  FractionallySizedBox(widthFactor: 0.9, child: SkeletonBox(height: 12)),
                                  SizedBox(height: 22),
                                ],
                              ),
                            )
                          : Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(_place.name, style: t.h2, maxLines: 1, overflow: TextOverflow.ellipsis),
                                // "Near KG Hospital": where the driver will look for the rider.
                                if (_place.landmark != null)
                                  Padding(
                                    padding: const EdgeInsets.only(top: 2),
                                    child: Row(children: [
                                      const Icon(Symbols.location_on_rounded, size: 16, color: TtColors.coral600, fill: 1),
                                      const SizedBox(width: 4),
                                      Expanded(
                                        child: Text(
                                          _place.landmark!,
                                          key: const ValueKey('pin-landmark'),
                                          style: t.bodySemibold.copyWith(color: TtColors.coral600),
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ),
                                    ]),
                                  ),
                                const SizedBox(height: 2),
                                Text(
                                  _place.address,
                                  style: t.bodySmall.copyWith(color: TtColors.navy700),
                                  maxLines: 2,
                                ),
                              ],
                            ),
                    ),
                    TextButton(
                      onPressed: _change,
                      style: TextButton.styleFrom(
                        foregroundColor: TtColors.coral600,
                        minimumSize: const Size(48, 48),
                      ),
                      child: Text('Change', style: t.bodySemibold.copyWith(color: TtColors.coral600)),
                    ),
                  ],
                ),
                const SizedBox(height: TtSpacing.l),
                TtButton(
                  label: widget.forPickup ? 'Confirm pickup' : 'Confirm drop',
                  onPressed: _locating ? null : _confirm,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
