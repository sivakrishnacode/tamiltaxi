import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../common/async_view.dart';
import '../../common/device_location.dart';
import '../../common/map_insets.dart';
import '../../common/trip_routes.dart';
import '../../router/routes.dart';
import '../../state/nearby_vehicles.dart';
import '../../state/parcel_flow.dart';
import '../../state/passenger_session.dart';
import '../../state/pricing.dart';
import '../../state/ride_flow.dart';
import '../states/s05_location_denied_screen.dart';
import '../states/s07_loading_skeletons.dart';
import '../states/s08_service_unavailable_screen.dart';
import 'widgets/upcoming_trip_card.dart';

/// P-07 Home (Ride tab): full map around the pickup with nearby vehicles, a top pill with the greeting and where
/// the ride starts (tap to move the pickup), SOS, and a half-height sheet with search, saved places, recent destinations and a promo, ending in the
/// "#NammaOoru · Made in Coimbatore" line art.
/// P-07b: a "Trip in progress" banner while a ride or parcel is active.
class P07HomeScreen extends ConsumerStatefulWidget {
  const P07HomeScreen({super.key, this.showTripBanner = false, this.showcase = false});

  /// Forces the P-07b banner (Design gallery).
  final bool showTripBanner;

  /// Opened on its own from the Design gallery: render seed state, start no timers.
  final bool showcase;

  @override
  ConsumerState<P07HomeScreen> createState() => _P07HomeScreenState();
}

class _P07HomeScreenState extends ConsumerState<P07HomeScreen> {
  /// Live sheet height (fraction of the screen) so the locate button rides on top of it.
  final ValueNotifier<double?> _sheetExtent = ValueNotifier(null);

  /// Sheet size the map's padding follows, updated once a drag settles (the Google logo sits right above the
  /// sheet; re-padding the platform map on every drag frame would stutter).
  final ValueNotifier<double?> _paddedExtent = ValueNotifier(null);
  Timer? _padTimer;

  final _map = TtMapController();

  /// Re-reads the location when the passenger comes back (e.g. from the system settings after S-05).
  AppLifecycleListener? _lifecycle;

  /// Live API: the last located point was outside the service area (banner).
  bool _outsideArea = false;

  /// "Locate me" is waiting for the phone's position (the button spins).
  bool _locating = false;

  static final LatLng _pickup = Seed.gandhipuram.location;

  /// Camera centre sits south of the pickup so the pickup shows above the sheet. On the Google engine the
  /// map is padded by the sheet instead (keeps the Google logo visible), so it centres on the pickup itself.
  static LatLng _cameraFor(LatLng pickup) => TtMap.usesGoogle ? pickup : offsetPoint(pickup, 950, 180);
  static final LatLng _camera = _cameraFor(_pickup);
  static const double _zoom = 15;

  @override
  void dispose() {
    _lifecycle?.dispose();
    _sheetExtent.dispose();
    _paddedExtent.dispose();
    _padTimer?.cancel();
    _map.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    // Live: the pickup is always the phone's location, and the permission is asked on every visit until given
    // (on opening and when the passenger comes back to the app; not right after the dialog closes, which would
    // loop). The seeded demo only uses a permission already given.
    if (!widget.showcase) {
      final live = ref.read(isLiveApiProvider);
      WidgetsBinding.instance.addPostFrameCallback((_) => _locate(ask: live));
      _lifecycle = AppLifecycleListener(onRestart: () => _locate(ask: live));
    }
  }

  Future<void> _locate({required bool ask}) async {
    if (!mounted || ref.read(rideFlowProvider).isActive) return;
    final r = await ref.read(deviceLocationProvider.notifier).locate(askPermission: ask);
    _moveToPickup(r);
  }

  /// The location banner's button: ask again / open the right settings page, then locate.
  Future<void> _fixLocation() async {
    final r = await ref.read(deviceLocationProvider.notifier).fixAccess();
    _moveToPickup(r);
  }

  void _moveTo(LatLng centre) {
    _map.move(centre, _zoom);
  }

  void _moveToPickup(LocateResult r) {
    if (!mounted) return;
    final live = ref.read(isLiveApiProvider);
    if (r == LocateResult.inArea || (live && r == LocateResult.outsideArea)) {
      _moveTo(_cameraFor(ref.read(rideFlowProvider).pickup.location));
    }
    if (live && (r == LocateResult.inArea || r == LocateResult.outsideArea)) {
      setState(() => _outsideArea = r == LocateResult.outsideArea);
    }
  }

  /// Locate me: the map moves at once to where the phone was last seen, then follows the fresh fix as it comes (GPS
  /// can take ~10 s indoors) while the button spins. Centres on the phone, not on a pickup chosen elsewhere. Asks for
  /// permission if needed and says so when the location can't be found.
  Future<void> _recentre() async {
    if (_locating) return;
    final live = ref.read(isLiveApiProvider);
    // Demo: the seeded pickup stands in for the phone outside the demo city.
    final known = live ? ref.read(deviceLocationProvider) : null;
    _moveTo(_cameraFor(known ?? ref.read(rideFlowProvider).pickup.location));
    setState(() => _locating = true);
    final follow = live
        ? ref.listenManual<LatLng?>(deviceLocationProvider, (_, next) {
            if (next != null && mounted) _moveTo(_cameraFor(next));
          })
        : null;
    final LocateResult r;
    try {
      r = await ref.read(deviceLocationProvider.notifier).locate();
    } finally {
      follow?.close();
      if (mounted) setState(() => _locating = false);
    }
    if (!mounted) return;
    switch (r) {
      case LocateResult.inArea:
        if (live) {
          setState(() => _outsideArea = false);
        } else {
          _moveTo(_cameraFor(ref.read(rideFlowProvider).pickup.location));
        }
      case LocateResult.outsideArea:
        if (live) {
          setState(() => _outsideArea = true);
        } else {
          _moveTo(_camera);
        }
        showTtSnack(
          context,
          live
              ? "Tamil Taxi isn't in your area yet. Choose a pickup in ${ref.read(serviceCitiesLabelProvider)}."
              : "You're outside ${Seed.demoCity.name}. The demo keeps ${Seed.gandhipuram.name} as pickup.",
        );
      case LocateResult.denied:
        // Live: the banner explains and its button fixes it; the demo keeps S-05.
        if (!live) context.push(Routes.locationDenied);
      case LocateResult.unavailable:
        showTtSnack(context, "Couldn't find your location right now. Check that location is on, then try again.");
    }
  }

  String _greeting() {
    if (widget.showcase) return 'Good afternoon';
    final h = TtClock.now().hour;
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  void _chooseDrop(Place place) {
    ref.read(rideFlowProvider.notifier)
      ..clearMode()
      ..setDrop(place);
    context.push(Routes.chooseVehicle);
  }

  @override
  Widget build(BuildContext context) {
    // A ride just ended: the next one starts where the rider is now.
    ref.listen(rideFlowProvider.select((r) => r.phase), (prev, next) {
      if (!widget.showcase && prev == RidePhase.completed && next == RidePhase.planning) _locate(ask: false);
    });
    final demo = ref.watch(demoSettingsProvider);
    final ride = ref.watch(rideFlowProvider);
    final parcel = ref.watch(parcelFlowProvider);
    final profile = ref.watch(currentProfileProvider);

    if (!widget.showcase && demo.outsideServiceArea) {
      return const Scaffold(backgroundColor: TtColors.surface, body: S08ServiceUnavailableView());
    }
    if (!widget.showcase && demo.locationDenied) {
      return const Scaffold(
        backgroundColor: TtColors.surface,
        body: SafeArea(child: S05LocationDeniedView()),
      );
    }

    final tripActive = widget.showTripBanner || ride.isActive || parcel.isActive;
    final sheetSize = tripActive ? 0.42 : 0.58;
    // Before the phone is located the pickup is a stand-in: no pin and no vehicles around a guessed point.
    final noPickup = ride.pickup.isUnknownPickup && !widget.showcase;
    // Free vehicles of every kind around the pickup (live: `GET /drivers/nearby`, every 15 s), like RedTaxi's map.
    final showNearby = !tripActive && !noPickup;

    return Scaffold(
      backgroundColor: TtColors.surface,
      body: LayoutBuilder(
        builder: (context, c) {
          // Follows the sheet while it is dragged (see the NotificationListener below).
          return Stack(
            children: [
              Positioned.fill(
                child: ValueListenableBuilder<double?>(
                  valueListenable: _paddedExtent,
                  builder: (context, padded, _) => TtMap(
                    controller: _map,
                    center: tripActive
                        ? (TtMap.usesGoogle ? ride.pickup.location : offsetPoint(ride.pickup.location, 600, 180))
                        : _cameraFor(ride.pickup.location),
                    zoom: _zoom,
                    mapPadding: sheetMapPadding(c.maxHeight * (padded ?? sheetSize)),
                    pickup: noPickup ? null : ride.pickup.location,
                    vehicles: showNearby
                        ? nearbyMarkers(ref, ref.watch(rideFlowProvider.select((r) => r.pickup.location)))
                        : const [],
                    // Just above the sheet (and the trip banner), like the Google logo: the top of the map is
                    // under the status bar and the greeting / SOS header.
                    attributionPadding: EdgeInsets.only(
                      bottom: c.maxHeight * (padded ?? sheetSize) + (tripActive ? 88 : 0),
                    ),
                  ),
                ),
              ),
              SafeArea(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(TtSpacing.l, TtSpacing.m, TtSpacing.l, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Align(
                              alignment: Alignment.centerLeft,
                              child: _PickupPill(
                                greeting: _greeting(),
                                name: profile.name == kPlaceholderName ? '' : profile.firstName,
                                // During a trip the pickup is the trip's, so it isn't offered for change here.
                                pickup: tripActive ? null : ride.pickup,
                                onPickup: tripActive || widget.showcase ? null : () => context.push(Routes.pinPickupOnMap),
                              ),
                            ),
                          ),
                          const SizedBox(width: TtSpacing.s),
                          // A quiet white map button before a trip; the trip screens keep the big red SOS.
                          SosButton(size: 44, quiet: true, onPressed: () => context.push(Routes.sos)),
                        ],
                      ),
                      if (!widget.showcase) _LocationBanners(outsideArea: _outsideArea, onFix: _fixLocation),
                    ],
                  ),
                ),
              ),
              // Only this button rebuilds while the sheet is dragged (not the map or sheet).
              if (!tripActive)
                ValueListenableBuilder<double?>(
                  valueListenable: _sheetExtent,
                  builder: (context, extent, child) {
                    final e = extent ?? sheetSize;
                    if (e >= 0.8) return const SizedBox.shrink();
                    return Positioned(right: TtSpacing.l, top: c.maxHeight * (1 - e) - 64, child: child!);
                  },
                  child: MapCircleButton(
                    icon: Symbols.my_location_rounded,
                    tooltip: 'Recentre map',
                    busy: _locating,
                    onPressed: _recentre,
                  ),
                ),
              if (tripActive)
                Positioned(
                  left: TtSpacing.m,
                  right: TtSpacing.m,
                  top: c.maxHeight * (1 - sheetSize) - 84,
                  child: _TripBanner(ride: ride, parcel: parcel, showcase: widget.showcase || widget.showTripBanner),
                ),
              NotificationListener<DraggableScrollableNotification>(
                onNotification: (n) {
                  _sheetExtent.value = n.extent;
                  _padTimer?.cancel();
                  _padTimer = Timer(const Duration(milliseconds: 180), () {
                    if (mounted) _paddedExtent.value = (n.extent * 100).round() / 100;
                  });
                  return false;
                },
                child: MapBottomSheet(
                  key: ValueKey(tripActive),
                  initialSize: sheetSize,
                  minSize: tripActive ? 0.3 : 0.34,
                  footer: tripActive ? null : const HomeFooter(),
                  builder: (context) => tripActive ? _activeSheet(profile) : _bookingSheet(profile),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  // ------------------------------------------------------------------ sheets
  List<Widget> _bookingSheet(PassengerProfile profile) {
    final recent = widget.showcase
        ? const AsyncData<List<Place>>(Seed.recentDestinations)
        : ref.watch(recentDestinationsProvider);
    return [
      AsyncView<List<Place>>(
        value: recent.hasError ? const AsyncData<List<Place>>([]) : recent,
        onRetry: () => ref.invalidate(recentDestinationsProvider),
        loading: const S07aHomeSheetSkeleton(),
        data: (places) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SearchField(
              hint: 'Where are you going?',
              large: true,
              readOnly: true,
              onTap: () => context.push(Routes.search),
            ),
            const SizedBox(height: TtSpacing.m),
            _SavedPlacesRow(
              places: profile.savedPlaces,
              onPlace: (p) => _chooseDrop(p.place),
              onAdd: () => context.push(Routes.savedPlaceEditor()),
            ),
            const SizedBox(height: TtSpacing.xs),
            // The last few places first, in view when Home opens: one tap to the fares (P-10). Search has the rest.
            for (var i = 0; i < places.length && i < 3; i++) ...[
              if (i > 0) const Divider(height: 1, indent: 38),
              LocationRow(
                kind: LocationRowKind.recent,
                title: places[i].name,
                subtitle: places[i].address,
                onTap: () => _chooseDrop(places[i]),
              ),
            ],
            const SizedBox(height: TtSpacing.l),
            if (!widget.showcase) ...[
              const _UpcomingOnHome(),
            ],
            _MoreWaysRow(
              onRental: () => context.push(Routes.rental),
              onOutstation: () => context.push(Routes.outstation),
              onParcel: () => context.go(Routes.parcel),
              onMovers: () => context.go(Routes.shifting),
            ),
            const SizedBox(height: TtSpacing.s),
          ],
        ),
      ),
    ];
  }

  List<Widget> _activeSheet(PassengerProfile profile) {
    void blocked() => showTtSnack(context, 'You can book another ride after this trip ends.');
    return [
      SearchField(hint: 'Where are you going?', large: true, readOnly: true, showMic: false, onTap: blocked),
      const SizedBox(height: TtSpacing.m),
      _SavedPlacesRow(places: profile.savedPlaces, onPlace: (_) => blocked()),
      const SizedBox(height: TtSpacing.l),
      Container(
        padding: const EdgeInsets.symmetric(horizontal: TtSpacing.l, vertical: TtSpacing.m),
        decoration: const BoxDecoration(color: TtColors.inputBg, borderRadius: TtRadii.cardRadius),
        child: Row(
          children: [
            const Icon(Symbols.info_rounded, size: 20, color: TtColors.navy700),
            const SizedBox(width: TtSpacing.m),
            Expanded(
              child: Text(
                'You can book another ride after this trip ends.',
                style: context.type.bodySmall.copyWith(color: TtColors.navy700),
              ),
            ),
          ],
        ),
      ),
    ];
  }
}

/// Top pill: where the ride starts ("Mahaganapathi Nagar, Vellalore") with a green pin, one line and only as wide as
/// its text; tap to move the pickup on the map (P-09). During a trip ([pickup] null) it shows the greeting instead
/// ("Good evening, Priya"). Screen readers hear the greeting too.
class _PickupPill extends StatelessWidget {
  const _PickupPill({required this.greeting, required this.name, required this.pickup, this.onPickup});

  /// "Good morning".
  final String greeting;

  /// First name; empty until the rider has given one.
  final String name;
  final Place? pickup;
  final VoidCallback? onPickup;

  /// The phone's location reads "Current location" with the geocoded address: show its area instead ("Mahaganapathi
  /// Nagar, Vellalore - Pattanam Rd"), skipping a door number.
  static String pickupLabel(Place p) {
    if (p.id != 'current' || p.address.trim().isEmpty) return p.name;
    final parts = [
      for (final part in p.address.split(','))
        if (part.trim().isNotEmpty && !RegExp(r'^\d').hasMatch(part.trim())) part.trim(),
    ];
    return parts.isEmpty ? p.name : parts.take(2).join(', ');
  }

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final hello = name.isEmpty ? greeting : '$greeting, $name';
    final p = pickup;
    final where = p == null ? null : pickupLabel(p);
    return Semantics(
      button: onPickup != null,
      label: where == null ? hello : '$hello. Pickup: $where${onPickup == null ? '' : '. Change pickup'}',
      excludeSemantics: true,
      child: Material(
        color: TtColors.surface,
        shape: const StadiumBorder(),
        elevation: 3,
        shadowColor: TtColors.shadow,
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: onPickup,
          child: Container(
            height: 44,
            padding: EdgeInsets.only(left: 14, right: onPickup == null ? 16 : 10),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (where != null) ...[
                  const Icon(Symbols.location_on_rounded, fill: 1, size: 18, color: TtColors.success),
                  const SizedBox(width: 6),
                ],
                Flexible(
                  child: Text(where ?? hello, style: t.listTitle, maxLines: 1, overflow: TextOverflow.ellipsis),
                ),
                if (onPickup != null) ...[
                  const SizedBox(width: 2),
                  const Icon(Symbols.expand_more_rounded, size: 20, color: TtColors.navy500),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Saved places as one-line pills ("Home", "Work", "Shop") and "+ Add", scrolling sideways when there are many.
class _SavedPlacesRow extends StatelessWidget {
  const _SavedPlacesRow({required this.places, required this.onPlace, this.onAdd});
  final List<SavedPlace> places;
  final ValueChanged<SavedPlace> onPlace;

  /// Null hides the "+ Add" pill (P-07b).
  final VoidCallback? onAdd;

  @override
  Widget build(BuildContext context) {
    if (places.isEmpty && onAdd == null) return const SizedBox.shrink();
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      clipBehavior: Clip.none,
      child: Row(
        children: [
          for (final p in places) ...[
            _Pill(
              icon: switch (p.kind) {
                SavedPlaceKind.home => Symbols.home_rounded,
                SavedPlaceKind.work => Symbols.work_rounded,
                SavedPlaceKind.other => Symbols.star_rounded,
              },
              label: p.label,
              semantics: '${p.label}, ${p.place.name}',
              onTap: () => onPlace(p),
            ),
            const SizedBox(width: TtSpacing.s),
          ],
          if (onAdd != null) _Pill(icon: Symbols.add_rounded, label: 'Add', semantics: 'Add a saved place', onTap: onAdd!, accent: true),
        ],
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.icon, required this.label, required this.semantics, required this.onTap, this.accent = false});
  final IconData icon;
  final String label;
  final String semantics;
  final VoidCallback onTap;

  /// "+ Add": coral text.
  final bool accent;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Semantics(
      button: true,
      label: semantics,
      excludeSemantics: true,
      child: Material(
        color: TtColors.surface,
        shape: const StadiumBorder(side: BorderSide(color: TtColors.divider)),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Container(
            height: 36,
            padding: const EdgeInsets.only(left: 10, right: 14),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 18, color: TtColors.coral600, fill: accent ? 0 : 1),
                const SizedBox(width: 6),
                Text(label, style: t.bodySmallMedium.copyWith(color: accent ? TtColors.coral600 : TtColors.navy900)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// P-07b navy "Trip in progress" banner with a Return button that reopens the trip.
class _TripBanner extends StatelessWidget {
  const _TripBanner({required this.ride, required this.parcel, required this.showcase});
  final RideFlowState ride;
  final ParcelFlowState parcel;
  final bool showcase;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final isParcel = !ride.isActive && parcel.isActive;
    final driver = ride.driver.firstName;
    final (IconData icon, String subtitle) = isParcel
        ? (parcel.vehicle.icon, _parcelText(parcel.phase))
        : !ride.isActive
        ? (Symbols.two_wheeler_rounded, 'Karthik · arriving 3:42 PM')
        : (
            ride.vehicle.icon,
            switch (ride.phase) {
              RidePhase.searching || RidePhase.driverCancelled => 'Finding your driver…',
              RidePhase.assigned => '$driver · at pickup in ${ride.etaMin} min',
              RidePhase.arrived => '$driver is at your pickup',
              RidePhase.inProgress =>
                '$driver · arriving ${formatTime(TtClock.now().add(Duration(minutes: ride.etaMin)))}',
              RidePhase.completed => 'Pay $driver ${formatInr(ride.quote.total)}',
              _ => 'Trip in progress',
            },
          );

    void open() {
      if (isParcel) {
        final route = routeForParcelPhase(parcel.phase);
        if (route != null) context.go(route);
        return;
      }
      final route = routeForRidePhase(ride.phase);
      if (route != null) {
        context.push(route);
      } else {
        showTtSnack(context, 'Your live trip opens here while a ride is on');
      }
    }

    return Semantics(
      button: true,
      label: 'Trip in progress, $subtitle. Return to trip',
      child: Material(
        color: TtColors.navy900,
        borderRadius: const BorderRadius.all(Radius.circular(TtRadii.sheet)),
        elevation: 4,
        shadowColor: TtColors.shadow,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: open,
          child: Padding(
            padding: const EdgeInsets.all(TtSpacing.m),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: const BoxDecoration(color: TtColors.coral500, borderRadius: TtRadii.cardRadius),
                  child: Icon(icon, color: TtColors.surface, fill: 1),
                ),
                const SizedBox(width: TtSpacing.m),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        isParcel ? 'Parcel in progress' : 'Trip in progress',
                        style: t.bodySemibold.copyWith(color: TtColors.surface),
                        maxLines: 1,
                      ),
                      Text(
                        subtitle,
                        style: t.bodySmall.copyWith(color: TtColors.divider),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: TtSpacing.s),
                Container(
                  height: 40,
                  padding: const EdgeInsets.only(left: TtSpacing.m, right: TtSpacing.s),
                  decoration: const BoxDecoration(color: TtColors.surface, borderRadius: TtRadii.pillRadius),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('Return', style: t.bodySemibold),
                      const Icon(Symbols.chevron_right_rounded, size: 20, color: TtColors.navy900),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  static String _parcelText(ParcelPhase p) => switch (p) {
    ParcelPhase.searching || ParcelPhase.noDrivers => 'Finding a goods driver…',
    ParcelPhase.assigned => 'Driver on the way to pickup',
    ParcelPhase.atPickup => 'Driver at pickup',
    ParcelPhase.inTransit => 'On the way to the drop',
    ParcelPhase.delivered => 'Delivered',
    ParcelPhase.planning => 'Parcel',
  };
}

/// Live: "Turn on location" while the app can't use it (with the right action), else "not in your area yet".
class _LocationBanners extends ConsumerWidget {
  const _LocationBanners({required this.outsideArea, required this.onFix});
  final bool outsideArea;
  final VoidCallback onFix;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(isLiveApiProvider)) return const SizedBox.shrink();
    final access = ref.watch(locationAccessProvider);
    final Widget? banner = switch (access) {
      LocationAccess.serviceOff => TtBanner(
          type: TtBannerType.warning,
          icon: Symbols.location_off_rounded,
          title: 'Turn on location',
          message: 'Tamil Taxi needs your location to set your pickup and find drivers near you.',
          actionLabel: 'Turn on',
          onAction: onFix,
        ),
      LocationAccess.denied => TtBanner(
          type: TtBannerType.warning,
          icon: Symbols.location_off_rounded,
          title: 'Allow location access',
          message: 'Tamil Taxi uses your location to set your pickup and show drivers near you. The app works best with it.',
          actionLabel: 'Allow',
          onAction: onFix,
        ),
      LocationAccess.deniedForever => TtBanner(
          type: TtBannerType.warning,
          icon: Symbols.location_off_rounded,
          title: 'Location is off for Tamil Taxi',
          message: 'Open Settings → Permissions → Location and choose "Allow while using the app".',
          actionLabel: 'Open settings',
          onAction: onFix,
        ),
      LocationAccess.granted || LocationAccess.unknown => outsideArea
          ? TtBanner(
              type: TtBannerType.info,
              icon: Symbols.wrong_location_rounded,
              title: "Tamil Taxi isn't in your area yet",
              message:
                  'You can still book a trip inside ${ref.watch(serviceCitiesLabelProvider)} by choosing the pickup yourself.',
            )
          : null,
    };
    if (banner == null) return const SizedBox.shrink();
    return Padding(padding: const EdgeInsets.only(top: TtSpacing.s), child: banner);
  }
}

/// "More ways to travel": four tiles like Rapido's Explore row: a cab by the hour (P-34), to another town (P-35),
/// a parcel (PP-01) and Packers & Movers (PH-01).
class _MoreWaysRow extends ConsumerWidget {
  const _MoreWaysRow({required this.onRental, required this.onOutstation, required this.onParcel, required this.onMovers});
  final VoidCallback onRental;
  final VoidCallback onOutstation;
  final VoidCallback onParcel;
  final VoidCallback onMovers;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // The pickup city's cheapest rental (its own prices, else the built-in ones), for screen readers.
    final pricing = watchPricing(ref, ref.watch(rideFlowProvider.select((s) => s.pickup.location)));
    final from = RideModeRates.rentalTerms(VehicleKind.cab, '1h', pricing: pricing)?.price;
    final t = context.type;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('MORE WAYS TO TRAVEL', style: t.overline),
        const SizedBox(height: TtSpacing.s),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: _WayTile(
                title: 'Rental',
                hint: from == null ? 'By the hour' : 'By the hour, from ${formatInr(from)}',
                kind: VehicleKind.sedan,
                onTap: onRental,
              ),
            ),
            const SizedBox(width: TtSpacing.s),
            Expanded(
              child: _WayTile(title: 'Outstation', hint: 'One way or round trip', kind: VehicleKind.suv, onTap: onOutstation),
            ),
            const SizedBox(width: TtSpacing.s),
            Expanded(
              child: _WayTile(title: 'Parcel', hint: 'Send goods across town', kind: VehicleKind.goodsBike, onTap: onParcel),
            ),
            const SizedBox(width: TtSpacing.s),
            Expanded(
              child: _WayTile(title: 'Packers & Movers', hint: 'House shifting', kind: VehicleKind.truck, onTap: onMovers),
            ),
          ],
        ),
      ],
    );
  }
}

/// A grey tile with the vehicle's miniature and the name under it.
class _WayTile extends StatelessWidget {
  const _WayTile({required this.title, required this.hint, required this.kind, required this.onTap});
  final String title;

  /// What it is, for screen readers ("By the hour, from ₹249").
  final String hint;
  final VehicleKind kind;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Semantics(
      button: true,
      label: '$title, $hint',
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: TtRadii.cardRadius,
        child: Column(
          children: [
            Container(
              height: 64,
              alignment: Alignment.center,
              decoration: const BoxDecoration(color: TtColors.inputBg, borderRadius: TtRadii.cardRadius),
              child: VehicleArt(kind),
            ),
            const SizedBox(height: 6),
            Text(
              title,
              style: t.caption.copyWith(color: TtColors.navy900, fontWeight: FontWeight.w500),
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}

/// The next trip booked for later, if any: tap → Activity (details and Cancel).
class _UpcomingOnHome extends ConsumerWidget {
  const _UpcomingOnHome();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final trips = ref.watch(upcomingTripsProvider).value ?? const <Trip>[];
    if (trips.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: TtSpacing.l),
      child: UpcomingTripCard(trip: trips.first, compact: true, onTap: () => context.go(Routes.activity)),
    );
  }
}
