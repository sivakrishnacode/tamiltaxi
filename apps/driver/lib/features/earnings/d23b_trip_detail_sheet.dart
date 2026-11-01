import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../common/showcase.dart';
import '../../router/routes.dart';
import '../../state/driver_account.dart';

/// D-23b Trip detail sheet: route, time and trip reference, fare breakdown, the
/// passenger and Help (→ support). Only what the trip record has: no made-up ratings or city codes.
class D23bTripDetailSheet extends ConsumerWidget {
  const D23bTripDetailSheet({super.key, this.trip, this.showcase = false});

  final EarningsTrip? trip;

  /// Opened on its own from the Design gallery: render seed state, start no timers.
  final bool showcase;

  static Future<void> show(BuildContext context, EarningsTrip? trip) =>
      showTtSheet<void>(context, builder: (_) => D23bTripDetailSheet(trip: trip));

  /// Mock mode stores the first word of a seeded place ("Gandhipuram"): the seeded name it came from. Live names are
  /// shown as they are.
  static String _seedName(String short) {
    for (final p in Seed.places) {
      if (p.name.startsWith(short)) return p.name;
    }
    return short;
  }

  /// The trip's own reference for support: the end of its id ("#K3F9Q2XA").
  static String tripCode(EarningsTrip t) {
    final id = t.id.replaceAll(RegExp(r'[^A-Za-z0-9]'), '');
    return '#${(id.length > 8 ? id.substring(id.length - 8) : id).toUpperCase()}';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.type;
    final trip = this.trip ?? Seed.todayTrips().first;
    final live = !showcase && ref.watch(isLiveApiProvider);
    String place(String name) => live ? name : _seedName(name);
    final start = trip.time.subtract(Duration(minutes: trip.durationMin));
    // The driver's own vehicle (the breakdown only shows when it adds up to the fare).
    final kind = showcase ? null : ref.watch(driverProfileProvider).value?.vehicleKind;
    final vehicle = kind != null ? Seed.vehicle(kind) : (trip.isDelivery ? Seed.threeWheeler : Seed.bike);
    final quote = trip.distanceKm > 0
        ? FareEngine.quote(vehicle, RouteEstimate(distanceKm: trip.distanceKm, durationMin: trip.durationMin))
        : null;
    final extras = trip.waitingCharge + trip.previousCancellationFee + trip.extra;
    final useQuote = quote != null && quote.total + extras == trip.fare;
    final kindLabel = trip.isDelivery ? 'Delivery' : '${vehicle.kind.label} ride';
    final paid = trip.paymentMode == PaymentMode.upi ? 'paid on UPI' : 'paid in cash';

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('$kindLabel · ${formatInr(trip.fare)}', style: TtTextStyles.tabular(t.h1)),
            Text(
              '${formatRelativeDay(trip.time)}, ${formatTime(start).replaceAll(' PM', '').replaceAll(' AM', '')} – ${formatTime(trip.time)} · ${tripCode(trip)}',
              style: TtTextStyles.tabular(t.caption),
            ),
          ]),
        ),
        IconButton(
          tooltip: 'Close',
          onPressed: () => Navigator.of(context).maybePop(),
          icon: const Icon(Symbols.close_rounded),
        ),
      ]),
      const SizedBox(height: TtSpacing.l),
      TtCard(
        child: Column(children: [
          Row(children: [
            const PickupDot(size: 12),
            const SizedBox(width: TtSpacing.m),
            Expanded(child: Text(place(trip.from), style: t.body, overflow: TextOverflow.ellipsis)),
          ]),
          const SizedBox(height: TtSpacing.m),
          Row(children: [
            const SizedBox(width: 20, child: Center(child: DropPin())),
            const SizedBox(width: TtSpacing.m),
            Expanded(child: Text(place(trip.to), style: t.body, overflow: TextOverflow.ellipsis)),
          ]),
        ]),
      ),
      const SizedBox(height: TtSpacing.m),
      TtCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (useQuote) ...[
            _line(context, 'Base fare', formatInr(quote.base)),
            _line(context, 'Distance · ${formatKm(trip.distanceKm)} × ₹${quote.vehicle.fareRule.perKm.toStringAsFixed(0)}',
                formatInr(quote.distanceCharge)),
            if (quote.timeCharge > 0) _line(context, 'Time charge · ${trip.durationMin} min', formatInr(quote.timeCharge)),
            const Divider(height: TtSpacing.l),
            _line(context, 'Subtotal', formatInr(quote.subtotal), bold: true),
            if (quote.hasPeak)
              _line(context, quote.night ? 'Night fare' : 'Peak time', formatInrSigned(quote.peakCharge),
                  tag: '${quote.multiplier.toStringAsFixed(1)}x'),
          ] else
            _line(context, 'Trip fare · ${formatKm(trip.distanceKm)} · ${trip.durationMin} min',
                formatInr(trip.fare - extras)),
          if (trip.waitingCharge > 0) _line(context, 'Waiting charge', formatInrSigned(trip.waitingCharge)),
          // Collected for the driver the passenger kept waiting on an earlier, cancelled trip.
          if (trip.previousCancellationFee > 0)
            _line(context, 'Previous cancellation fee', formatInrSigned(trip.previousCancellationFee)),
          if (trip.extra > 0) _line(context, 'Extra from the rider', formatInrSigned(trip.extra)),
          const Divider(height: TtSpacing.l),
          Row(children: [
            Expanded(child: Text('Fare · $paid', style: t.bodySemibold)),
            Text(formatInr(trip.fare), style: TtTextStyles.tabular(t.h1)),
          ]),
        ]),
      ),
      const SizedBox(height: TtSpacing.m),
      Row(children: [
        TtAvatar(initials: trip.passengerName.isEmpty ? '?' : trip.passengerName.substring(0, 1), size: 44),
        const SizedBox(width: TtSpacing.m),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(trip.passengerName.isEmpty ? (trip.isDelivery ? 'Customer' : 'Passenger') : trip.passengerName,
                style: t.bodySemibold, maxLines: 1, overflow: TextOverflow.ellipsis),
            if (trip.passengerName.isNotEmpty) Text(trip.isDelivery ? 'Customer' : 'Passenger', style: t.caption),
          ]),
        ),
        TextButton.icon(
          onPressed: unlessShowcase(context, showcase, () {
            final router = GoRouter.of(context);
            Navigator.of(context).maybePop();
            router.push(Routes.help);
          }),
          icon: const Icon(Symbols.support_agent_rounded),
          label: const Text('Help'),
        ),
      ]),
    ]);
  }

  Widget _line(BuildContext context, String label, String value, {bool bold = false, String? tag}) {
    final t = context.type;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(children: [
        Expanded(
          child: Text(label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: (bold ? t.bodySemibold : t.body).copyWith(color: bold ? TtColors.navy900 : TtColors.navy700)),
        ),
        if (tag != null) ...[
          const SizedBox(width: TtSpacing.s),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: TtSpacing.s, vertical: 1),
            decoration: const BoxDecoration(color: TtColors.warningTint, borderRadius: TtRadii.pillRadius),
            child: Text(tag, style: t.caption.copyWith(color: TtColors.warningText, fontWeight: FontWeight.w600)),
          ),
        ],
        const SizedBox(width: TtSpacing.s),
        Text(value, style: TtTextStyles.tabular(bold ? t.bodySemibold : t.bodyMedium)),
      ]),
    );
  }
}
