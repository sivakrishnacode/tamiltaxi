import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../common/map_insets.dart';
import '../../common/trip_routes.dart';
import '../../router/routes.dart';
import '../../state/passenger_session.dart';
import '../../state/ride_flow.dart';
import '../../state/trip_safety.dart';
import 'p18_share_trip_sheet.dart';
import 'widgets/trip_widgets.dart';

/// P-16 Ride in progress: the bike moves along the coral route to the drop, an arrival chip,
/// a big SOS button above the collapsed sheet (driver, plate, drop, fare) and "Share trip" on top.
/// Back asks "Leave this screen? Your trip continues." and returns to Home.
class P16RideInProgressScreen extends ConsumerStatefulWidget {
  const P16RideInProgressScreen({super.key, this.showcase = false});

  /// Opened on its own from the Design gallery: render seed state, start no timers.
  final bool showcase;

  @override
  ConsumerState<P16RideInProgressScreen> createState() => _P16RideInProgressScreenState();
}

class _P16RideInProgressScreenState extends ConsumerState<P16RideInProgressScreen> {
  bool _expanded = false;

  @override
  void initState() {
    super.initState();
    if (!widget.showcase) WidgetsBinding.instance.addPostFrameCallback((_) => _maybeAutoShare());
  }

  /// "Auto-share trips" (Account › Safety): the share sheet opens once, when the ride has started (live API).
  void _maybeAutoShare() {
    if (!mounted || !ref.read(isLiveApiProvider)) return;
    final ride = ref.read(rideFlowProvider);
    if (ride.phase != RidePhase.inProgress || !ref.read(currentProfileProvider).autoShareTrips) return;
    if (!ref.read(autoSharePromptedProvider.notifier).claim(ride.tripId)) return;
    P18ShareTripSheet.show(context);
  }

  Future<void> _confirmLeave() async {
    if (widget.showcase) {
      Navigator.of(context).maybePop();
      return;
    }
    final leave = await showTtConfirm(
      context,
      title: 'Leave this screen?',
      message: 'Your trip continues.',
      icon: Symbols.two_wheeler_rounded,
      confirmLabel: 'Leave',
      cancelLabel: 'Stay',
    );
    if (leave && mounted) context.go(Routes.ride);
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(rideFlowProvider.select((s) => s.phase), (prev, next) {
      if (widget.showcase) return;
      if (next == RidePhase.completed) goForTrip(context, Routes.rideCompleted);
      if (next == RidePhase.inProgress) _maybeAutoShare();
    });

    final t = context.type;
    final ride = ref.watch(rideFlowProvider);
    final driver = ride.driver;
    final route = ride.routeOrDefault;
    final eta = widget.showcase
        ? 9
        : ride.phase == RidePhase.inProgress
            ? ride.etaMin
            : ride.estimate.tripMin;
    final arrival = widget.showcase ? DateTime(2026, 9, 24, 15, 42) : TtClock.now().add(Duration(minutes: eta));
    final vehicle = ref.read(rideFlowProvider.notifier).vehicle;

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _confirmLeave();
      },
      child: TripSheetScaffold(
        maxSheetFraction: 0.6,
        aboveSheet: Align(
          alignment: Alignment.centerRight,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(0, 0, 16, 16),
            child: DecoratedBox(
              decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
              child: Padding(
                padding: const EdgeInsets.all(4),
                child: SosButton(size: 72, onPressed: () => context.push(Routes.sos)),
              ),
            ),
          ),
        ),
        appBar: AppBar(
          toolbarHeight: 72,
          automaticallyImplyLeading: false,
          titleSpacing: 16,
          title: Row(
            children: [
              IconButton(
                tooltip: 'Back',
                onPressed: _confirmLeave,
                icon: const Icon(Symbols.arrow_back_rounded),
              ),
              const SizedBox(width: 4),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // A rental has no drop: the package instead.
                    Text(ride.isRental ? 'Your rental' : 'On the way to', style: t.bodySmall.copyWith(color: TtColors.navy500)),
                    Text(ride.dropTitle, style: t.h2, maxLines: 1, overflow: TextOverflow.ellipsis),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              OutlinedButton.icon(
                onPressed: () => P18ShareTripSheet.show(context),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size(48, 44),
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                  textStyle: t.bodySmallMedium.copyWith(fontWeight: FontWeight.w600, fontSize: 15),
                ),
                icon: const Icon(Symbols.share_location_rounded, size: 20),
                label: const Text('Share trip'),
              ),
            ],
          ),
          bottom: const PreferredSize(preferredSize: Size.fromHeight(1), child: Divider(height: 1)),
        ),
        map: (context, h) => ValueListenableBuilder<VehicleFix?>(
          valueListenable: vehicle,
          builder: (context, live, _) {
            final fix = widget.showcase || ride.phase != RidePhase.inProgress ? null : live;
            final progress = fix?.progress ?? (widget.showcase ? 0.35 : 0.0);
            // A rental has no route: until the driver's first fix the car waits at the pickup (not at 0, 0).
            final pos = fix?.position ?? (route.isEmpty ? ride.pickup.location : pointAlong(route, progress));
            final ahead = route.isEmpty ? pos : pointAlong(route, (progress + 0.02).clamp(0.0, 1.0));
            final insets = sheetMapInsets(EdgeInsets.fromLTRB(40, 88, 40, h * 0.34), h * 0.34);
            return TtMap(
              // A rental (no route) follows the car: to each new GPS fix, not to every frame of its glide.
              center: route.isEmpty ? (fix?.target ?? pos) : null,
              zoom: 15,
              drop: ride.isRental ? null : ride.drop.location,
              route: remainingPath(route, pos, progress),
              vehicles: [
                MapVehicle(
                  position: pos,
                  type: ride.vehicle.mapType,
                  heading: fix?.heading ?? headingBetween(pos, ahead),
                  large: true,
                ),
              ],
              fitPoints: route.isEmpty ? null : route,
              fitPadding: insets.fit,
              mapPadding: insets.map,
              attributionAlignment: Alignment.topRight,
            );
          },
        ),
        overlays: [
          Positioned(
            left: 16,
            top: 16,
            right: 16,
            child: Align(
              alignment: Alignment.centerLeft,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                decoration: const BoxDecoration(
                  color: TtColors.navy900,
                  borderRadius: TtRadii.pillRadius,
                  boxShadow: TtShadows.soft,
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Symbols.schedule_rounded, color: Colors.white, size: 20),
                    const SizedBox(width: 8),
                    Flexible(
                      child: Text(
                        'Arriving at ${formatTime(arrival)} · $eta min',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TtTextStyles.tabular(t.bodySemibold.copyWith(color: Colors.white)),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
        sheet: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            CompactDriverRow(
              driver: driver,
              showRating: false,
              trailing: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(formatInr(ride.quote.total), style: TtTextStyles.tabular(t.h1)),
                  Text('Cash / UPI', style: t.bodySmall.copyWith(color: TtColors.navy500)),
                ],
              ),
            ),
            const SizedBox(height: 16),
            TtCard(
              color: TtColors.inputBg,
              borderColor: null,
              padding: const EdgeInsets.fromLTRB(16, 12, 12, 12),
              onTap: () => setState(() => _expanded = !_expanded),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      const DropPin(size: 26),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(ride.dropTitle, style: t.bodyMedium, maxLines: 1, overflow: TextOverflow.ellipsis),
                            Text(ride.isRental ? 'Stop anywhere on the way; tell your driver where to go' : ride.drop.address,
                                style: t.bodySmall.copyWith(color: TtColors.navy500),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis),
                          ],
                        ),
                      ),
                      Icon(
                        _expanded ? Symbols.keyboard_arrow_down_rounded : Symbols.keyboard_arrow_up_rounded,
                        color: TtColors.navy700,
                        semanticLabel: _expanded ? 'Hide trip details' : 'Show trip details',
                      ),
                    ],
                  ),
                  if (_expanded) ...[
                    const Divider(height: 24),
                    _DetailRow(label: 'From', value: ride.pickup.name),
                    _DetailRow(label: 'Vehicle', value: '${ride.vehicle.label} · ${driver.vehicleLabel}'),
                    _DetailRow(label: 'Distance', value: ride.estimate.label),
                    _DetailRow(label: 'Payment', value: 'Pay ${driver.firstName} directly · Cash or UPI'),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 80, child: Text(label, style: t.bodySmall.copyWith(color: TtColors.navy500))),
          Expanded(child: Text(value, style: t.bodySmallMedium)),
        ],
      ),
    );
  }
}
