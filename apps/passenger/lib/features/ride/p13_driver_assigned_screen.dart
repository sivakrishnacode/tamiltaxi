import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart' show Marker;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../common/launch.dart';
import '../../common/map_insets.dart';
import '../../common/trip_routes.dart';
import '../../router/routes.dart';
import '../../state/ride_flow.dart';
import '../states/s03_cancel_ride_dialog.dart';
import 'p18_share_trip_sheet.dart';
import 'widgets/trip_widgets.dart';

/// P-13 Driver assigned: the driver's bike approaches the pickup on the map; the sheet shows
/// the driver, the ride OTP, Call / Chat / Share trip / Cancel and the trip summary.
class P13DriverAssignedScreen extends ConsumerWidget {
  const P13DriverAssignedScreen({super.key, this.showcase = false});

  /// Opened on its own from the Design gallery: render seed state, start no timers.
  final bool showcase;

  void _back(BuildContext context) {
    if (showcase) {
      Navigator.of(context).maybePop();
    } else {
      // The trip continues; Home shows the "Trip in progress" banner.
      context.go(Routes.ride);
    }
  }

  Future<void> _cancel(BuildContext context, WidgetRef ref) async {
    final reason = await S03CancelRideDialog.show(context);
    if (reason == null || !context.mounted) return;
    final error = await ref.read(rideFlowProvider.notifier).cancelRide(code: reason);
    if (!context.mounted) return;
    if (error != null) {
      showTtSnack(context, error);
      return;
    }
    showTtSnack(context, 'Ride cancelled');
    context.go(Routes.ride);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.listen(rideFlowProvider.select((s) => s.phase), (prev, next) {
      if (showcase) return;
      // Arrived, driver cancelled (S-02), or further along when a poll skipped steps.
      if (next == RidePhase.assigned) return;
      final route = routeForRidePhase(next);
      if (route != null) goForTrip(context, route);
    });

    final t = context.type;
    final ride = ref.watch(rideFlowProvider);
    final driver = ride.driver;
    final eta = showcase ? 3 : ride.etaMin.clamp(1, 99);
    // Live API: until the driver's first GPS fix there is no leg to draw (no made-up start point).
    final waitingForGps = !showcase && ride.approach.isEmpty && ref.watch(isLiveApiProvider);
    final approach = ride.approach.isNotEmpty ? ride.approach : fallbackApproach(ride.pickup);
    final vehicle = ref.read(rideFlowProvider.notifier).vehicle;

    return PopScope(
      canPop: showcase,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _back(context);
      },
      child: TripSheetScaffold(
        maxSheetFraction: 0.7,
        map: (context, h) => ValueListenableBuilder<VehicleFix?>(
          valueListenable: vehicle,
          builder: (context, live, _) {
            final fix = showcase ? null : live;
            final pos = fix?.position ?? approach.first;
            final insets = sheetMapInsets(EdgeInsets.fromLTRB(56, 96, 56, h * 0.66), h * 0.66);
            if (waitingForGps) {
              return TtMap(
                pickup: ride.pickup.location,
                pulseAt: ride.pickup.location,
                fitPoints: [offsetPoint(ride.pickup.location, 600, 0), offsetPoint(ride.pickup.location, 600, 180)],
                fitPadding: insets.fit,
                mapPadding: insets.map,
                attributionAlignment: Alignment.topCenter,
                attributionPadding: EdgeInsets.only(top: MediaQuery.paddingOf(context).top),
              );
            }
            return TtMap(
              pickup: ride.pickup.location,
              route: remainingPath(approach, pos, fix?.progress ?? 0),
              vehicles: [
                MapVehicle(
                  position: pos,
                  type: ride.vehicle.mapType,
                  heading: fix?.heading ?? (approach.length > 1 ? headingBetween(approach.first, approach[1]) : 0),
                  large: true,
                ),
              ],
              fitPoints: [...approach, offsetPoint(ride.pickup.location, 250, 0)],
              fitPadding: insets.fit,
              mapPadding: insets.map,
              attributionAlignment: Alignment.topCenter,
              attributionPadding: EdgeInsets.only(top: MediaQuery.paddingOf(context).top),
              extraMarkers: [
                Marker(
                  point: ride.pickup.location,
                  width: 96,
                  height: 44,
                  alignment: const Alignment(0, -1.7),
                  child: Center(child: EtaBubble(text: '$eta min')),
                ),
              ],
            );
          },
        ),
        overlays: [
          TripMapTopBar(onBack: () => _back(context), onSos: () => context.push(Routes.sos)),
        ],
        sheet: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('${driver.firstName} is on the way', style: t.h1),
            Text(
              'Arriving in $eta min',
              style: TtTextStyles.tabular(t.bodyMedium.copyWith(color: TtColors.success)),
            ),
            const SizedBox(height: 16),
            TripDriverRow(driver: driver),
            const SizedBox(height: 16),
            RideOtpCard(
              code: showcase ? Seed.rideOtp : ride.otp,
              caption: 'Share this with your driver to start the ride',
            ),
            const SizedBox(height: 12),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: TripActionButton(
                    icon: Symbols.call_rounded,
                    label: 'Call',
                    background: TtColors.coral600,
                    foreground: Colors.white,
                    onPressed: () => callNumber(context, driver.phone, name: driver.firstName),
                  ),
                ),
                Expanded(
                  child: TripActionButton(
                    icon: Symbols.chat_rounded,
                    label: 'Chat',
                    onPressed: () => context.push(Routes.chat),
                  ),
                ),
                Expanded(
                  child: TripActionButton(
                    icon: Symbols.share_location_rounded,
                    label: 'Share trip',
                    background: TtColors.inputBg,
                    foreground: TtColors.navy900,
                    onPressed: () => P18ShareTripSheet.show(context),
                  ),
                ),
                Expanded(
                  child: TripActionButton(
                    icon: Symbols.close_rounded,
                    label: 'Cancel',
                    background: TtColors.errorTint,
                    foreground: TtColors.error,
                    labelColor: TtColors.error,
                    onPressed: () => _cancel(context, ref),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            const Divider(height: 1),
            const SizedBox(height: 12),
            TripRouteSummary(pickup: ride.pickup.name, drop: ride.dropTitle, fare: ride.quote.total),
          ],
        ),
      ),
    );
  }
}
