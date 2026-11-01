import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../common/launch.dart';
import '../../router/routes.dart';
import '../../state/passenger_session.dart';
import 'widgets/trip_rows.dart';

/// P-22 Trip details: static route map, date and status, pickup/drop times, driver, fare
/// breakdown (every line adds up to the fare), trip ID, "Get help with this trip" and "Download receipt".
class P22TripDetailsScreen extends ConsumerWidget {
  const P22TripDetailsScreen({super.key, this.tripId = 'RD-24091528', this.showcase = false});

  final String tripId;

  /// Opened on its own from the Design gallery: render seed state, start no timers.
  final bool showcase;

  /// The itemised quote for [trip], adjusted so that the lines add up exactly to `trip.fare`.
  static FareQuote quoteFor(Trip trip) {
    final q = trip.quote ??
        FareEngine.quote(
          Seed.vehicle(trip.vehicle),
          RouteEstimate(distanceKm: trip.distanceKm, durationMin: trip.durationMin),
        );
    final diff = trip.fare - q.total;
    if (diff == 0) return q;
    // Put the difference on the distance line (the part that varies with the real route);
    // if that would go negative, the rest comes off the peak line.
    // Waiting, an earlier cancellation fee and the rider's extra are their own lines and never move.
    final distance = (q.distanceCharge + diff).clamp(0, 1 << 30);
    final subtotal = q.base + distance + q.timeCharge + q.minFareTopUp;
    return q.copyWith(
      distanceCharge: distance,
      subtotal: subtotal,
      peakCharge: trip.fare - subtotal - q.waitingCharge - q.previousCancellationFee - q.extra,
      total: trip.fare,
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final trip = ref.watch(tripByIdProvider(tripId));
    return Scaffold(
      appBar: const TtAppBar(
        title: 'Trip details',
        bottom: PreferredSize(preferredSize: Size.fromHeight(1), child: Divider(height: 1)),
      ),
      body: switch (trip) {
        AsyncData(value: final t?) => _Details(trip: t),
        AsyncData() => EmptyState(
            illustration: const TtIllustration(IllustrationKind.emptyTrips, width: 160, height: 160),
            title: 'Trip not found',
            message: "We couldn't find this trip. It may have been removed.",
            actionLabel: 'Back to Activity',
            onAction: () => context.go(Routes.activity),
          ),
        AsyncError() => EmptyState(
            illustration: const TtIllustration(IllustrationKind.offline, width: 160, height: 160),
            title: "Couldn't load this trip",
            message: 'Check your connection and try again',
            actionLabel: 'Retry',
            onAction: () => ref.invalidate(tripByIdProvider(tripId)),
          ),
        _ => const Center(child: CircularProgressIndicator()),
      },
    );
  }
}

class _Details extends StatelessWidget {
  const _Details({required this.trip});
  final Trip trip;

  /// Plain-text receipt for the share sheet (email, WhatsApp, save to files…).
  String _receipt(FareQuote q) => [
    'Tamil Taxi receipt · ${trip.isShifting
        ? 'Packers & Movers'
        : trip.isParcel
        ? 'Parcel'
        : trip.vehicle.label}',
    '${formatRelativeDay(trip.startedAt, withTime: true)} · Trip ${trip.id}',
    'From: ${trip.pickup.name}',
    'To: ${trip.drop.name}',
    if (trip.driver != null)
      'Driver: ${trip.driver!.name} · ${trip.driver!.plate}',
    '${q.distanceKm.toStringAsFixed(1)} km · ${q.durationMin} min',
    'Base ${formatInr(q.base)} · Distance ${formatInr(q.distanceCharge)}'
        '${q.timeCharge > 0 ? ' · Time ${formatInr(q.timeCharge)}' : ''}'
        '${q.minFareTopUp > 0 ? ' · Minimum fare ${formatInr(q.minFareTopUp)}' : ''}'
        '${q.hasPeak ? ' · ${q.night ? 'Night fare' : 'Peak'} ${formatInr(q.peakCharge)}' : ''}'
        '${q.hasWaiting ? ' · Waiting ${formatInr(q.waitingCharge)}' : ''}'
        '${q.hasCancellationFee ? ' · Previous cancellation fee ${formatInr(q.previousCancellationFee)}' : ''}'
        '${q.hasExtra ? ' · Extra you added ${formatInr(q.extra)}' : ''}',
    'Total: ${formatInr(trip.fare)} (paid to the driver, ${trip.paymentMode == PaymentMode.upi ? 'UPI' : 'cash'})',
  ].join('\n');

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final (kind, label) = tripStatusOf(trip);
    final cancelled = trip.status == TripStatus.cancelled;
    final route = roadPath(
      trip.pickup.location,
      trip.drop.location,
      mode: travelModeFor(trip.vehicle),
    );
    final end = trip.startedAt.add(Duration(minutes: trip.durationMin));
    final driver = trip.driver;
    final quote = P22TripDetailsScreen.quoteFor(trip);
    final paidBy = trip.paymentMode == PaymentMode.upi ? 'UPI' : 'Cash';

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        ClipRRect(
          borderRadius: TtRadii.cardRadius,
          child: Container(
            height: 140,
            foregroundDecoration: BoxDecoration(
              borderRadius: TtRadii.cardRadius,
              border: Border.all(color: TtColors.divider),
            ),
            child: IgnorePointer(
              child: TtMap(
                interactive: false,
                pickup: trip.pickup.location,
                drop: trip.drop.location,
                route: route,
                // Fit the whole route with room for the drop pin (drawn above its point) and the pickup dot; a zoom
                // guessed from the distance cut them off at the card's edges.
                fitPoints: route,
                fitPadding: const EdgeInsets.fromLTRB(32, 48, 32, 20),
                showAttribution: false,
              ),
            ),
          ),
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
              child: Text(
                '${formatRelativeDay(trip.startedAt, withTime: true)} · ${trip.isShifting
                    ? 'Packers & Movers'
                    : trip.isParcel
                    ? 'Parcel'
                    : trip.vehicle.label}',
                style: TtTextStyles.tabular(t.h2),
              ),
            ),
            StatusPill(kind, label: label),
          ],
        ),
        const SizedBox(height: 12),
        TtCard(
          child: Column(
            children: [
              _StopRow(marker: const PickupDot(size: 10), name: trip.pickup.name, time: formatTime(trip.startedAt)),
              const SizedBox(height: 12),
              _StopRow(
                marker: const DropPin(size: 22),
                name: trip.drop.name,
                time: cancelled ? '—' : formatTime(end),
              ),
            ],
          ),
        ),
        if (driver != null) ...[
          const SizedBox(height: 12),
          TtCard(
            child: Row(
              children: [
                DriverAvatar(driver: driver, size: 44, tone: AvatarTone.navy),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('${driver.name} · ${driver.rating.toStringAsFixed(1)}★', style: t.bodySemibold),
                      Text(
                        '${driver.vehicleModel} · ${driver.plate}',
                        style: t.bodySmall.copyWith(color: TtColors.navy500),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                if (trip.rating != null) ...[
                  const SizedBox(width: 8),
                  Text('You rated ', style: t.bodySmall.copyWith(color: TtColors.navy700)),
                  const Icon(Symbols.star_rounded, fill: 1, size: 18, color: TtColors.warning),
                  Text(' ${trip.rating}', style: t.bodySmallMedium),
                ],
              ],
            ),
          ),
        ],
        const SizedBox(height: 12),
        TtCard(
          child: cancelled
              ? Row(
                  children: [
                    const Icon(
                      Symbols.money_off_rounded,
                      color: TtColors.navy700,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text.rich(
                        TextSpan(
                          children: [
                            TextSpan(
                              text: 'No charge. ',
                              style: t.bodySemibold,
                            ),
                            TextSpan(
                              text:
                                  'This trip was cancelled before pickup. Estimated fare was ${formatInr(trip.fare)}.',
                              style: t.bodySmall.copyWith(
                                color: TtColors.navy700,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                )
              : trip.shifting?.lines != null
              ? FareBreakdown.fromShifting(
                  trip.shifting!.lines!,
                  vehicle: trip.vehicle,
                  between: trip.shifting!.between,
                  details: trip.shifting,
                )
              : _FareTable(
                  quote: quote,
                  totalLabel:
                      trip.isParcel &&
                          trip.parcel?.payer == ParcelPayer.receiver
                      ? 'Paid by receiver · $paidBy'
                      : 'Paid to driver · $paidBy',
                ),
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
              child: Text.rich(
                TextSpan(children: [
                  TextSpan(text: 'Trip ID · ', style: t.bodySmall.copyWith(color: TtColors.navy500)),
                  TextSpan(text: trip.id, style: TtTextStyles.tabular(t.bodySmallMedium.copyWith(letterSpacing: 0.5))),
                ]),
              ),
            ),
            IconButton(
              tooltip: 'Copy trip ID',
              icon: const Icon(Symbols.content_copy_rounded, color: TtColors.navy500, size: 20),
              onPressed: () {
                Clipboard.setData(ClipboardData(text: trip.id));
                showTtSnack(context, 'Trip ID copied');
              },
            ),
          ],
        ),
        const SizedBox(height: 4),
        TtListGroup(
          children: [
            TtListTile(
              icon: Symbols.support_agent_rounded,
              title: 'Get help with this trip',
              onTap: () => context.push(Routes.help(tripId: trip.id)),
            ),
            TtListTile(
              icon: Symbols.receipt_long_rounded,
              title: 'Share receipt',
              onTap: () => shareText(context, _receipt(quote), subject: 'Tamil Taxi receipt ${trip.id}'),
            ),
          ],
        ),
      ],
    );
  }
}

class _StopRow extends StatelessWidget {
  const _StopRow({required this.marker, required this.name, required this.time});
  final Widget marker;
  final String name;
  final String time;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Row(
      children: [
        SizedBox(width: 28, child: Center(child: marker)),
        const SizedBox(width: 12),
        Expanded(child: Text(name, style: t.bodyMedium, maxLines: 1, overflow: TextOverflow.ellipsis)),
        const SizedBox(width: 8),
        Text(time, style: TtTextStyles.tabular(t.caption)),
      ],
    );
  }
}

/// Itemised fare (P-22): base, distance, time, dashed rule, subtotal, peak and
/// the bold "Paid to driver" total. Amounts are right-aligned in tabular figures.
class _FareTable extends StatelessWidget {
  const _FareTable({required this.quote, required this.totalLabel});
  final FareQuote quote;
  final String totalLabel;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final perKm = quote.vehicle.fareRule.perKm;
    final perKmText = perKm == perKm.roundToDouble() ? perKm.toStringAsFixed(0) : perKm.toStringAsFixed(1);
    Widget row(String label, String amount, {Widget? tag, bool bold = false}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Row(
            children: [
              Expanded(
                child: Row(children: [
                  Flexible(
                    child: Text(label,
                        style: bold ? t.bodySemibold : t.body.copyWith(color: TtColors.navy700),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis),
                  ),
                  if (tag != null) ...[const SizedBox(width: 8), tag],
                ]),
              ),
              const SizedBox(width: 12),
              Text(amount,
                  style: TtTextStyles.tabular(
                      (bold ? t.bodySemibold : t.bodyMedium).copyWith(color: TtColors.navy900))),
            ],
          ),
        );
    Widget pill(String text, Color bg, Color fg) => Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(color: bg, borderRadius: TtRadii.pillRadius),
          child: Text(text, style: t.caption.copyWith(color: fg, fontWeight: FontWeight.w600)),
        );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        row('Base fare', formatInr(quote.base)),
        row('Distance · ${formatKm(quote.distanceKm)} × ₹$perKmText', formatInr(quote.distanceCharge)),
        if (quote.timeCharge > 0) row('Time charge · ${quote.durationMin} min', formatInr(quote.timeCharge)),
        if (quote.minFareTopUp > 0) row('Minimum fare top-up', formatInr(quote.minFareTopUp)),
        const Padding(padding: EdgeInsets.symmetric(vertical: 6), child: CustomPaint(painter: _DashPainter(), size: Size(double.infinity, 1))),
        row('Subtotal', formatInr(quote.subtotal), bold: true),
        if (quote.hasPeak)
          row(quote.night ? 'Night fare' : 'Peak time', formatInrSigned(quote.peakCharge),
              tag: pill('${quote.multiplier.toStringAsFixed(1)}x', TtColors.warningTint, TtColors.warningText))
        else if (quote.peakCharge != 0)
          row('Adjustment', formatInrSigned(quote.peakCharge)),
        if (quote.hasWaiting)
          row('Waiting charge · after ${quote.freeWaitMin} free min', formatInrSigned(quote.waitingCharge)),
        if (quote.hasCancellationFee) row('Previous cancellation fee', formatInrSigned(quote.previousCancellationFee)),
        if (quote.hasExtra) row('Extra you added', formatInrSigned(quote.extra)),
        const Divider(height: 20),
        Row(
          children: [
            Expanded(child: Text(totalLabel, style: t.bodySemibold)),
            Text(formatInr(quote.total), style: TtTextStyles.tabular(t.h1)),
          ],
        ),
      ],
    );
  }
}

class _DashPainter extends CustomPainter {
  const _DashPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..color = TtColors.navy300
      ..strokeWidth = 1;
    for (double x = 0; x < size.width; x += 7) {
      canvas.drawLine(Offset(x, 0), Offset((x + 4).clamp(0, size.width), 0), p);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
