import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../common/go_online.dart';
import '../../common/showcase.dart';
import '../../common/job_routes.dart';
import '../../common/launch.dart';
import '../../common/measure_size.dart';
import '../../overlay/background_permissions.dart';
import '../../state/app_permissions.dart';
import '../../state/booking_prefs.dart';
import '../../router/routes.dart';
import '../../state/demand_map.dart';
import '../../state/driver_account.dart';
import '../../state/driver_location.dart';
import '../../state/driver_session.dart';
import '../jobs/widgets/job_map.dart';
import '../states/s10_account_on_hold_screen.dart';
import '../states/s11_missed_request_banner.dart';
import '../states/s16_gps_weak_banner.dart';
import 'widgets/demand_chip.dart';
import 'widgets/demand_layer.dart';
import 'widgets/direction_panel.dart';
import 'widgets/home_parts.dart';
import 'widgets/navy_header.dart';

/// Designed states of the home screen (D-13, D-14, D-14b, D-25a, D-25b, S-11, S-12, S-16).
enum HomeVariant { live, offline, online, tripBanner, grace, expired, missedRequest, quiet, gpsLost, cancelWarning }

/// D-13 Home. One screen for D-13 (offline), D-14 (online), D-14b (trip-in-progress banner),
/// D-25a / D-25b (plan grace / expired), S-11 (missed request), S-12 (online, quiet) and
/// S-16 (GPS lost). [HomeVariant.live] follows the real session; other variants force a look.
/// Live API: opening Home restores the session ([DriverSessionController.attach]); GPS lost, today's
/// figures and the plan come from the phone and the API instead of the demo controls.
class D13HomeScreen extends ConsumerStatefulWidget {
  const D13HomeScreen({super.key, this.variant = HomeVariant.live, this.showcase = false});

  /// Which designed state to show. [HomeVariant.live] follows the real session.
  final HomeVariant variant;

  /// Opened on its own from the Design gallery: render seed state, start no timers.
  final bool showcase;

  @override
  ConsumerState<D13HomeScreen> createState() => _D13HomeScreenState();
}

class _D13HomeScreenState extends ConsumerState<D13HomeScreen> {
  /// Showcase S-11: OK hides the toast locally.
  bool _missedDismissed = false;

  /// Height of the panels over the map (Google logo padding).
  double _panelHeight = 0;

  /// Map zoom in half steps: the "High demand" labels follow it without rebuilding Home on every camera frame.
  final _labelZoom = ValueNotifier<double>(14.5);

  HomeVariant get _v => widget.variant;
  bool get _live => _v == HomeVariant.live;
  bool get _showcase => widget.showcase || !_live;
  bool get _api => !_showcase && ref.read(isLiveApiProvider);

  /// Asks for location again whenever the driver comes back to the app (not after the dialog itself closes).
  AppLifecycleListener? _lifecycle;

  @override
  void initState() {
    super.initState();
    if (_api) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        final session = ref.read(driverSessionProvider.notifier);
        session.attach();
        // The car shows the real position from the start; the permission is asked on every visit until given.
        session.locateHere();
        ref.read(missingPermissionsProvider.notifier).refresh();
      });
      _lifecycle = AppLifecycleListener(
        onRestart: () {
          if (mounted) ref.read(driverSessionProvider.notifier).locateHere();
        },
        // Back from a settings page (or anywhere): the permission banner follows what's allowed now.
        onResume: () {
          if (mounted) ref.read(missingPermissionsProvider.notifier).refresh();
        },
      );
    }
  }

  @override
  void dispose() {
    _lifecycle?.dispose();
    _labelZoom.dispose();
    super.dispose();
  }

  /// The location banner's button: ask again while Android still shows the prompt, else the right settings page.
  Future<void> _fixLocation(LocationAccess access) async {
    final locator = ref.read(driverLocatorProvider);
    switch (access) {
      case LocationAccess.serviceOff:
        await locator.openSettings(LocationFix.locationSettings);
      case LocationAccess.deniedForever:
        await locator.openSettings(LocationFix.appSettings);
      case LocationAccess.approximate:
        // Android shows "Change to precise location"; once refused twice only the settings page can.
        await ref.read(driverSessionProvider.notifier).locateHere();
        if (mounted && ref.read(locationAccessProvider) == LocationAccess.approximate) {
          await locator.openSettings(LocationFix.appSettings);
        }
      case LocationAccess.denied || LocationAccess.unknown || LocationAccess.granted:
        await ref.read(driverSessionProvider.notifier).locateHere();
    }
  }

  /// S-16 "Fix now": Location settings when it's off, else restart the GPS (no need to go offline and online).
  Future<void> _fixGps() async {
    final access = await ref.read(driverLocatorProvider).access();
    if (!mounted) return;
    if (access == LocationAccess.serviceOff) {
      await ref.read(driverLocatorProvider).openSettings(LocationFix.locationSettings);
    } else {
      ref.read(driverSessionProvider.notifier).restartGps();
    }
  }

  /// Design gallery frames: buttons show a note instead of going online, paying or leaving the gallery.
  VoidCallback? _act(VoidCallback action) => unlessShowcase(context, _showcase, action);

  String _greeting() {
    final h = TtClock.now().hour;
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  Future<void> _goOnline() async {
    if (_showcase) return showTtSnack(context, kPreviewNote);
    final demo = ref.read(demoSettingsProvider);
    if (!_api && demo.accountOnHold) {
      context.push(Routes.accountOnHold);
      return;
    }
    // Mock: the simulated daily selfie once per app session. Live: the server says when it is due (a 403
    // SELFIE_CHECK_REQUIRED opens S-13).
    if (!_api && !ref.read(driverSessionProvider).selfieDoneThisSession) {
      context.push(Routes.selfieCheck);
      return;
    }
    await goOnlineOrExplain(context, ref);
  }

  void _goOffline() {
    ref.read(driverSessionProvider.notifier).goOffline();
    showTtSnack(context, "You're offline. No new requests.");
  }

  Future<void> _resumePlan() async {
    if (_showcase) return showTtSnack(context, kPreviewNote);
    try {
      await ref.read(planProvider.notifier).resume();
      if (mounted) showTtSnack(context, 'Plan resumed. You can go online.', success: true);
    } on OfflineException {
      if (mounted) showTtSnack(context, "You're offline. Try again.");
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_api) {
      // First time online: ask for the bubble / full-screen request permissions (each once).
      ref.listen(driverSessionProvider.select((s) => s.online), (prev, next) {
        if (next && prev == false && mounted) {
          explainBackgroundPermissions(context).whenComplete(() {
            if (mounted) ref.read(missingPermissionsProvider.notifier).refresh();
          });
        }
      });
    }
    if (!_showcase) {
      ref.listen(driverSessionProvider.select((s) => s.incoming), (prev, next) {
        // Only when a request appears: the card itself follows the next stacked one.
        if (next != null && prev == null) context.push(requestRoute(next));
      });
    }

    final session = ref.watch(driverSessionProvider);
    final plan = ref.watch(planProvider).value;
    // Free app (plans off): never a plan state, strip or renew button.
    final plansOn = ref.watch(driverPlansEnabledProvider);
    final demo = ref.watch(demoSettingsProvider);
    final profile = ref.watch(driverProfileProvider).value ?? Seed.karthik;
    final prefs = _showcase ? null : ref.watch(bookingPrefsProvider).value;

    // ------------------------------------------------------------ view state
    final online = _live
        ? session.online
        : const {
            HomeVariant.online,
            HomeVariant.tripBanner,
            HomeVariant.missedRequest,
            HomeVariant.quiet,
            HomeVariant.gpsLost,
          }.contains(_v);
    final status = _live
        ? (plansOn ? (plan?.status ?? PlanStatus.trial) : PlanStatus.active)
        : switch (_v) {
            HomeVariant.grace => PlanStatus.grace,
            HomeVariant.expired => PlanStatus.expired,
            _ => PlanStatus.active,
          };
    final job = _live ? (session.onJob ? session.job : null) : (_v == HomeVariant.tripBanner ? Seed.rideRequest : null);
    final gpsLost = _live ? (_api ? session.gpsLost : demo.gpsLost) && online : _v == HomeVariant.gpsLost;
    final missed = _live
        ? session.missedRequest && online && job == null
        : _v == HomeVariant.missedRequest && !_missedDismissed;
    final quiet = _v == HomeVariant.quiet;
    final delivery = _live ? (_api ? profile.vehicleKind.isGoods : demo.workType == WorkType.deliveries) : false;
    // Bikes, scooters and autos get parcels too while that service is on (Services).
    final parcelsToo = !delivery &&
        DriverService.availableFor(profile.vehicleKind).contains(DriverService.parcels) &&
        (prefs ?? const BookingPrefs()).isOn(DriverService.parcels, profile.vehicleKind, DateTime.now());
    final earnings = _v == HomeVariant.offline ? 0 : (_live ? session.todayEarnings : Seed.todayEarnings);
    final rides = _v == HomeVariant.offline ? 0 : (_live ? session.todayRides : Seed.todayRides);
    final eta = _live ? session.etaMin : 9;
    final price = plan?.monthlyPrice ?? 2000;
    final planEnd = plan?.nextDebit ?? Seed.nextDebit;
    final vehicleType = (job?.vehicle ?? profile.vehicleKind).mapType;
    final cancelRate = _live
        ? (_api ? ref.watch(cancelRateProvider).value : null)
        : (_v == HomeVariant.cancelWarning ? _demoCancelRate : null);
    final pausedUntil = cancelRate != null && cancelRate.isPausedAt(DateTime.now()) ? cancelRate.blockedUntil : null;

    // ---------------------------------------------------------------- header
    final String subtitle;
    if (job != null) {
      subtitle = job.isDelivery ? 'On a delivery' : 'On a ride';
    } else if (gpsLost) {
      subtitle = 'Online · hidden from riders';
    } else if (quiet) {
      subtitle = 'Online for 18 min';
    } else if (online) {
      // Short: the subtitle shares the header with the status pills ("Looking for rides and parcels..." was cut).
      subtitle = delivery ? 'Finding deliveries…' : (parcelsToo ? 'Finding rides, parcels' : 'Finding rides…');
    } else {
      subtitle = _greeting();
    }
    final Widget pill;
    if (gpsLost) {
      pill = const StatusPill(StatusKind.grace, label: 'Online', large: true);
    } else if (online) {
      pill = const StatusPill(StatusKind.online, large: true);
    } else if (status == PlanStatus.grace) {
      pill = const StatusPill(StatusKind.grace, large: true);
    } else if (status == PlanStatus.expired) {
      pill = const StatusPill(StatusKind.expired, large: true);
    } else if (status == PlanStatus.paused) {
      pill = const StatusPill(StatusKind.paused, large: true);
    } else {
      pill = const OfflineHeaderPill();
    }

    // ------------------------------------------------------------- top card
    Widget? topCard;
    final access = _api ? ref.watch(locationAccessProvider) : LocationAccess.granted;
    // Location has its own banner above (it covers the phone's Location switch too).
    final missing = _api
        ? [for (final p in ref.watch(missingPermissionsProvider)) if (p != AppPermission.location) p]
        : const <AppPermission>[];
    if (access == LocationAccess.serviceOff ||
        access == LocationAccess.denied ||
        access == LocationAccess.deniedForever ||
        access == LocationAccess.approximate) {
      // Nothing works without location: shown above everything else until it's allowed.
      topCard = TtBanner(
        type: TtBannerType.warning,
        icon: Symbols.location_off_rounded,
        title: switch (access) {
          LocationAccess.serviceOff => 'Turn on location',
          LocationAccess.deniedForever => 'Location is off for Tamil Taxi Driver',
          LocationAccess.approximate => 'Turn on precise location',
          _ => 'Allow location access',
        },
        message: switch (access) {
          LocationAccess.deniedForever => 'Open Settings → Permissions → Location and choose "Allow while using the app". '
              'Tamil Taxi needs it to send you requests and share live tracking with riders.',
          LocationAccess.approximate => 'Tamil Taxi Driver only has your approximate location, so your GPS stops updating '
              'after going online. Choose "Precise", or turn on "Use precise location" in Settings → Permissions → Location.',
          _ => 'Tamil Taxi needs your location to send you ride requests nearby and share live tracking with riders.',
        },
        actionLabel: switch (access) {
          LocationAccess.serviceOff => 'Turn on',
          LocationAccess.deniedForever => 'Open settings',
          LocationAccess.approximate => 'Fix',
          _ => 'Allow',
        },
        onAction: () => _fixLocation(access),
      );
    } else if (missing.isNotEmpty) {
      // Shown (online too) until allowed; one at a time, most important first.
      final p = missing.first;
      topCard = TtBanner(
        type: TtBannerType.warning,
        icon: switch (p) {
          AppPermission.notifications => Symbols.notifications_off_rounded,
          AppPermission.overlay => Symbols.picture_in_picture_alt_rounded,
          AppPermission.fullScreen => Symbols.notifications_active_rounded,
          AppPermission.battery => Symbols.battery_saver_rounded,
          AppPermission.location => Symbols.location_off_rounded,
        },
        title: switch (p) {
          AppPermission.notifications => 'Allow notifications',
          AppPermission.overlay => 'Allow "Display over other apps"',
          AppPermission.fullScreen => 'Allow full-screen notifications',
          AppPermission.battery => 'Remove battery limits',
          AppPermission.location => 'Allow location access',
        },
        message: switch (p) {
          AppPermission.notifications =>
            "Without notifications you won't hear new ride requests while Tamil Taxi is in the background or closed.",
          AppPermission.overlay =>
            'So new requests pop up over maps, music or WhatsApp and you can accept in time. '
                'Find Tamil Taxi Driver on the next screen and turn it on.',
          AppPermission.fullScreen => 'So a new request lights up the screen when the phone is locked.',
          AppPermission.battery => "So the phone's battery saver doesn't pause ride requests while you're online.",
          AppPermission.location => 'Tamil Taxi needs your location to send you ride requests nearby.',
        } +
            (missing.length > 1 ? ' (${missing.length - 1} more after this)' : ''),
        actionLabel: 'Allow',
        onAction: () => ref.read(missingPermissionsProvider.notifier).fix(p),
      );
    } else if (pausedUntil != null && !online) {
      topCard = TtBanner(
        type: TtBannerType.error,
        icon: Symbols.pause_circle_rounded,
        title: "You're paused ${pausedUntilLabel(pausedUntil, DateTime.now())}",
        message: 'You cancelled too many rides this week. You can go online again after that.',
        actionLabel: 'Details',
        onAction: _act(() => context.push(Routes.accountPaused(pausedUntil))),
      );
    } else if (cancelRate != null && cancelRate.shouldWarn && job == null) {
      topCard = TtBanner(
        type: TtBannerType.warning,
        icon: Symbols.warning_rounded,
        title: cancelRate.title!,
        message: cancelRate.body,
      );
    } else if (!online && status == PlanStatus.grace) {
      topCard = GraceBanner(
        daysLeft: plan?.graceDaysLeft ?? 2,
        amount: price,
        onPay: _act(() => context.push(Routes.autopay(purpose: 'pay')))!,
      );
    } else if (!online && status == PlanStatus.expired) {
      topCard = const DecoratedBox(
        decoration: BoxDecoration(borderRadius: TtRadii.cardRadius, boxShadow: TtShadows.soft),
        child: TtBanner(
          type: TtBannerType.error,
          title: 'Plan expired',
          message: 'Renew to go online again. Your ratings and documents are saved.',
        ),
      );
    } else if (!online && status == PlanStatus.paused) {
      topCard = const TtBanner(
        type: TtBannerType.info,
        icon: Symbols.pause_circle_rounded,
        title: 'Plan paused',
        message: "You can't go online until you resume.",
      );
    } else if (!gpsLost && !missed && !quiet) {
      topCard = TodayCard(
        earnings: earnings,
        rides: rides,
        online: online,
        onEarnings: _act(() => context.go(Routes.earnings))!,
      );
    }

    // ------------------------------------------------------------------ map
    // Where orders come from (demand hexes, nested hexes when zoomed in) and the service area when zoomed out;
    // hidden during a job. Live: the API's H3 hexes. Mock and gallery: the seeded busy areas as hexes, while online.
    final demand = job != null
        ? null
        : _api
            ? ref.watch(demandMapProvider)
            : (online && !gpsLost ? DemandMap.demo(quiet: quiet) : null);
    final polygons = demandPolygons(demand);
    final map = ValueListenableBuilder<double>(
      valueListenable: _labelZoom,
      builder: (context, labelZoom, _) => LiveVehicleMap(
        key: ValueKey('home-map-$quiet'),
        polygons: polygons,
        labels: gpsLost ? const [] : demandLabels(demand, zoom: labelZoom),
        onZoom: demand == null ? null : (z) => _labelZoom.value = (z * 2).floor() / 2,
        vehicleType: vehicleType,
        fixedPosition: _showcase ? Seed.driverHome : null,
        pulse: online && job == null,
        gpsLost: gpsLost,
        zoom: quiet ? 13.4 : 14.6,
        mapPadding: EdgeInsets.only(bottom: _panelHeight),
      ),
    );

    // ---------------------------------------------------------- bottom panel
    final Widget basePanel;
    if (job != null) {
      basePanel = OnlineStatusRow(
        icon: Symbols.pause_circle_rounded,
        title: 'New requests paused',
        subtitle: 'They resume when this ${job.isDelivery ? 'delivery' : 'ride'} ends.',
      );
    } else if (gpsLost) {
      basePanel = _GpsTips(onGoOffline: _goOfflineOrShowcase);
    } else if (quiet) {
      basePanel = _QuietPanel(onGoOffline: _goOfflineOrShowcase);
    } else if (online) {
      basePanel = Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
        OnlineStatusRow(
          title: "You're online",
          subtitle: missed
              ? 'Keep the app open and volume up.'
              : (_api ? 'Keep the app open. Requests pop up here.' : 'Move towards Gandhipuram for faster requests.'),
        ),
        // Go To / Stay In: two buttons, or the one that is on (with Change / Off).
        if (!_showcase) ...[
          const SizedBox(height: TtSpacing.m),
          const DirectionRow(),
        ],
        // Filters on: say so, or a quiet evening looks like the app is broken.
        if (prefs != null && prefs.hasTripFilters) ...[
          const SizedBox(height: TtSpacing.m),
          FiltersOnRow(summary: prefs.tripFilterSummary, onEdit: _act(() => context.push(Routes.bookingPreferences))!),
        ],
        const SizedBox(height: TtSpacing.l),
        TtButton.secondary(label: 'Go offline', onPressed: _goOfflineOrShowcase),
      ]);
    } else {
      basePanel = _OfflinePanel(
        status: status,
        delivery: delivery,
        showPlan: plansOn,
        planLabel: '${(plan?.vehicle ?? profile.vehicleKind).label} plan',
        planEnd: planEnd,
        graceDays: plan?.graceDaysLeft ?? 2,
        price: price,
        onGoOnline: _goOnline,
        goingOnline: session.goingOnline,
        onRenew: _act(() => context.push(Routes.autopay(purpose: 'pay')))!,
        onResume: _resumePlan,
        onPlan: _act(() => context.go(Routes.plan))!,
      );
    }

    // Live: the nearest busy area with a directions button, online or off (not during a job or with no GPS).
    final panel = demand == null || gpsLost || job != null
        ? basePanel
        : ValueListenableBuilder<VehicleFix?>(
            valueListenable: ref.read(driverSessionProvider.notifier).vehicle,
            builder: (context, fix, child) {
              final near = nearestHotspot(demand, fix?.position);
              if (near == null) return child!;
              return Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
                NearestDemandChip(
                  hotspot: near.hotspot,
                  km: near.km,
                  onDirections: () => openNavigation(context, near.hotspot.centre),
                ),
                const Divider(height: TtSpacing.xl),
                child!,
              ]);
            },
            child: basePanel,
          );

    return Scaffold(
      backgroundColor: TtColors.background,
      body: Column(
        children: [
          HomeHeader(
            initials: profile.initials,
            photo: ref.watch(driverPhotoProvider(profile.photoPath)),
            firstName: profile.firstName,
            subtitle: subtitle,
            pill: pill,
            onlineRing: online && !gpsLost,
          ),
          if (job != null)
            TripInProgressBanner(
              title: _jobBannerTitle(job, _live ? session.phase : JobPhase.toDrop, eta),
              // Heading to the pickup: where to go and whom to meet; after that: the drop.
              subtitle: _live && session.phase == JobPhase.toPickup
                  ? '${job.customerName} · ${job.pickup.name}'
                  : '${job.customerName} → ${job.drop.name}',
              onOpen: _act(() {
                final route = routeForJob(_live ? session.phase : JobPhase.toDrop, delivery: job.isDelivery);
                if (route != null) context.push(route);
              })!,
            ),
          if (gpsLost)
            S16GpsWeakBanner(
              onFix: _api ? _fixGps : null,
            ),
          Expanded(
            child: Stack(
              children: [
                Positioned.fill(child: map),
                if (topCard != null)
                  Positioned(left: TtSpacing.gutter, right: TtSpacing.gutter, top: TtSpacing.l, child: topCard),
                Align(
                  alignment: Alignment.bottomCenter,
                  child: MeasureSize(
                    onChange: (size) {
                      if (mounted && size.height != _panelHeight) setState(() => _panelHeight = size.height);
                    },
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (missed)
                          Padding(
                            padding: const EdgeInsets.fromLTRB(TtSpacing.gutter, 0, TtSpacing.gutter, TtSpacing.l),
                            child: S11MissedRequestBanner(
                              showcase: _showcase,
                              delivery: delivery,
                              onDismiss: _live ? null : () => setState(() => _missedDismissed = true),
                            ),
                          ),
                        BottomPanel(child: panel),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _goOfflineOrShowcase() {
    if (_live) {
      _goOffline();
    } else {
      showTtSnack(context, "You're offline. No new requests.");
    }
  }
}

class _OfflinePanel extends StatelessWidget {
  const _OfflinePanel({
    required this.status,
    required this.delivery,
    required this.showPlan,
    required this.planLabel,
    required this.planEnd,
    required this.graceDays,
    required this.price,
    required this.onGoOnline,
    this.goingOnline = false,
    required this.onRenew,
    required this.onResume,
    required this.onPlan,
  });

  final PlanStatus status;
  final bool delivery;

  /// False in the free app: no "plan active till" strip under GO ONLINE.
  final bool showPlan;
  final String planLabel;
  final DateTime planEnd;
  final int graceDays;
  final int price;
  final VoidCallback onGoOnline;
  final bool goingOnline;
  final VoidCallback onRenew;
  final VoidCallback onResume;
  final VoidCallback onPlan;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final children = <Widget>[];
    switch (status) {
      case PlanStatus.expired:
        children.addAll([
          const GoOnlineButton(onPressed: null),
          const SizedBox(height: TtSpacing.xl),
          TtButton(label: 'Renew ${formatInr(price)}', onPressed: onRenew),
        ]);
      case PlanStatus.paused:
        children.addAll([
          const GoOnlineButton(onPressed: null),
          const SizedBox(height: TtSpacing.xl),
          TtButton(label: 'Resume plan', icon: Symbols.play_circle_rounded, onPressed: onResume),
        ]);
      case PlanStatus.grace:
        children.addAll([
          GoOnlineButton(onPressed: onGoOnline, loading: goingOnline),
          const SizedBox(height: TtSpacing.xl),
          PlanStrip(
            warning: true,
            text: 'Grace ends ${formatDate(planEnd.add(Duration(days: graceDays)))}, 11:59 PM',
            onTap: onPlan,
          ),
        ]);
      case PlanStatus.trial || PlanStatus.active || PlanStatus.cancelled:
        children.addAll([
          Text(
            "You're offline. Go online to get ${delivery ? 'delivery' : 'ride'} requests.",
            textAlign: TextAlign.center,
            style: t.body.copyWith(color: TtColors.navy700),
          ),
          const SizedBox(height: TtSpacing.l),
          GoOnlineButton(onPressed: onGoOnline, loading: goingOnline),
          if (showPlan) ...[
            const SizedBox(height: TtSpacing.l),
            PlanStrip(
              text: status == PlanStatus.cancelled
                  ? 'Plan cancelled · active till ${formatDate(planEnd)}'
                  : '$planLabel active till ${formatDate(planEnd)}',
              onTap: onPlan,
            ),
          ],
        ]);
    }
    return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: children);
  }
}

class _QuietPanel extends StatelessWidget {
  const _QuietPanel({required this.onGoOffline});
  final VoidCallback onGoOffline;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text('Waiting for rides…', style: t.display),
      const SizedBox(height: TtSpacing.l),
      Container(
        padding: const EdgeInsets.all(TtSpacing.l),
        decoration: const BoxDecoration(color: TtColors.coral50, borderRadius: TtRadii.cardRadius),
        child: Row(children: [
          const Icon(Symbols.emoji_objects_rounded, color: TtColors.coral600, fill: 1, size: 28),
          const SizedBox(width: TtSpacing.m),
          Expanded(
            child: Text.rich(TextSpan(children: [
              const TextSpan(text: 'Busy areas right now:\n'),
              TextSpan(text: 'Gandhipuram, Peelamedu', style: t.bodySemibold),
            ])),
          ),
        ]),
      ),
      const SizedBox(height: TtSpacing.l),
      TtButton.secondary(label: 'Go offline', onPressed: onGoOffline),
    ]);
  }
}

class _GpsTips extends StatelessWidget {
  const _GpsTips({required this.onGoOffline});
  final VoidCallback onGoOffline;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    Widget tip(IconData icon, String text) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Row(children: [
            Icon(icon, color: TtColors.navy700, size: 24),
            const SizedBox(width: TtSpacing.m),
            Expanded(child: Text(text, style: t.body)),
          ]),
        );
    return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text('TRY THIS', style: t.overline),
      const SizedBox(height: TtSpacing.s),
      tip(Symbols.location_on_rounded, 'Turn on Location · High accuracy'),
      tip(Symbols.battery_saver_rounded, 'Turn off battery saver for Tamil Taxi Driver'),
      tip(Symbols.light_mode_rounded, 'Move out from under a flyover or building'),
      Align(
        alignment: Alignment.centerLeft,
        child: TtButton.text(label: 'Go offline', onPressed: onGoOffline),
      ),
    ]);
  }
}

/// The Home banner for the current job, by step: "Going to pickup" / "At pickup" before the trip starts.
String _jobBannerTitle(RideRequest job, JobPhase phase, int eta) {
  final kind = job.isDelivery ? 'Delivery' : 'Ride';
  final minutes = eta > 0 ? ' · $eta min' : '';
  return switch (phase) {
    JobPhase.toPickup => 'Going to pickup$minutes',
    JobPhase.atPickup => 'At pickup',
    JobPhase.atDrop => 'At drop',
    JobPhase.collect => 'Collect payment',
    // "Ride in progress · 9 min" was cut beside Return; with an ETA, "To drop · 9 min" says the same.
    JobPhase.toDrop || JobPhase.none => eta > 0 ? 'To drop$minutes' : '$kind in progress',
  };
}

/// S-17 (design gallery): 2 of the last 5 rides cancelled.
const _demoCancelRate = DriverCancelRate(
  cancelled: 2,
  assigned: 5,
  rate: 0.4,
  level: CancelRateLevel.nudge,
  title: "You've cancelled 2 of your last 5 rides",
  body: "If you cancel 50% of your rides, you can't go online for 24 h. Only accept rides you can reach",
);
