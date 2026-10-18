import 'package:flutter/material.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';

import '../format.dart';
import '../theme/tt_colors.dart';
import '../theme/tt_tokens.dart';
import '../vehicle_ui.dart';

/// One line in a [FareBreakdown].
class FareLine {
  const FareLine(this.label, this.amount, {this.note, this.tag, this.signed = false, this.emphasis = false});

  final String label;
  final int amount;

  /// Small caption to the right of the label ("4.2 km × ₹5").
  final String? note;

  /// Small pill after the label ("1.1x", "0%").
  final String? tag;

  /// Show "+₹3" instead of "₹3".
  final bool signed;

  /// Bold row (subtotal).
  final bool emphasis;
}

/// Fare breakdown table: labels in navy-700, amounts right-aligned in tabular figures,
/// only the total row is bold.
class FareBreakdown extends StatelessWidget {
  const FareBreakdown({super.key, required this.lines, required this.total, this.title, this.subtitle, this.footer});

  /// Builds the standard lines from a [FareQuote]: base, distance, time, subtotal, peak, waiting (when charged).
  factory FareBreakdown.fromQuote(FareQuote q, {Key? key, String? title, String? subtitle, Widget? footer}) {
    final terms = q.modeTerms;
    if (terms != null) return FareBreakdown._mode(q, terms, key: key, title: title, subtitle: subtitle, footer: footer);
    final perKm = q.vehicle.fareRule.perKm;
    final perKmText = perKm == perKm.roundToDouble() ? perKm.toStringAsFixed(0) : perKm.toStringAsFixed(1);
    return FareBreakdown(
      key: key,
      title: title,
      subtitle: subtitle,
      footer: footer,
      total: q.total,
      lines: [
        FareLine('Base fare', q.base),
        FareLine('Distance', q.distanceCharge, note: '${q.distanceKm.toStringAsFixed(1)} km × ₹$perKmText'),
        // Billed on the fixed 18 km/h minutes, not the traffic time on the route chip: say so when they differ.
        FareLine(
          'Time charge',
          q.timeCharge,
          note: q.travelMin != null && q.travelMin != q.durationMin ? '${q.durationMin} min at 18 km/h' : '${q.durationMin} min',
        ),
        if (q.minFareTopUp > 0) FareLine('Minimum fare top-up', q.minFareTopUp),
        FareLine('Subtotal', q.subtotal, emphasis: true),
        if (q.hasPeak) FareLine('Peak time', q.peakCharge, tag: '${q.multiplier.toStringAsFixed(1)}x', signed: true),
        if (q.hasWaiting) waitingLine(q),
        if (q.hasCancellationFee) cancellationFeeLine(q),
        if (q.hasExtra) extraLine(q),
      ],
    );
  }

  /// A house shift's lines: the vehicle, helpers, stairs, packing, taking apart, unpacking, the weekend share. The
  /// notes come from the lines and [details] (the city's rates may differ from the built-in ones).
  factory FareBreakdown.fromShifting(
    ShiftingLines l, {
    required VehicleKind vehicle,
    bool between = false,
    ShiftingDetails? details,
    Key? key,
    String? title,
    String? subtitle,
    Widget? footer,
  }) {
    final d = details;
    final floors = d == null ? null : (d.pickupLift ? 0 : d.pickupFloor) + (d.dropLift ? 0 : d.dropFloor);
    final pieces = d?.dismantlePieces;
    final pct = l.subtotal > 0 && l.weekend > 0 ? (l.weekend * 100 / l.subtotal).round() : null;
    return FareBreakdown(
      key: key,
      title: title,
      subtitle: subtitle,
      footer: footer,
      total: l.total,
      lines: [
        FareLine(vehicle.textLabel, l.transport, note: between ? 'one way, by the km' : 'on the route'),
        FareLine('Helpers', l.helpers, note: l.helperCount > 0 ? '${l.helperCount} × ${formatInr(l.helpers ~/ l.helperCount)}' : null),
        if (l.stairs > 0) FareLine('Stairs', l.stairs, note: floors == null || floors == 0 ? 'no lift' : '$floors floors without a lift'),
        if (l.packing > 0) FareLine('Packing', l.packing),
        if (l.dismantle > 0)
          FareLine('Taking apart', l.dismantle,
              note: pieces == null || pieces == 0 ? null : '$pieces × ${formatInr(l.dismantle ~/ pieces)}'),
        if (l.unpack > 0) FareLine('Unpacking', l.unpack),
        if (l.weekend > 0) FareLine('Weekend', l.weekend, tag: pct == null ? null : '+$pct%', signed: true),
      ],
    );
  }

  /// A rental (package, then km / minutes past it) or outstation fare (km, driver allowance, extra km).
  factory FareBreakdown._mode(FareQuote q, ModeTerms terms, {Key? key, String? title, String? subtitle, Widget? footer}) {
    String rate(double r) => r == r.roundToDouble() ? '₹${r.toStringAsFixed(0)}' : '₹${r.toStringAsFixed(1)}';
    return FareBreakdown(
      key: key,
      title: title,
      subtitle: subtitle,
      footer: footer,
      total: q.total,
      lines: [
        ...switch (terms) {
          RentalTerms t => [
              FareLine('Package', q.base, note: t.package.label),
              if (q.extraKmCharge > 0) FareLine('Extra distance', q.extraKmCharge, note: '${rate(t.extraKmRate)} a km', signed: true),
              if (q.extraTimeCharge > 0) FareLine('Extra time', q.extraTimeCharge, note: '${rate(t.extraMinRate)} a min', signed: true),
            ],
          OutstationTerms t => [
              FareLine(t.roundTrip ? 'Round trip' : 'One way', q.base, note: '${formatCount(t.includedKm)} km × ${rate(t.perKm)}'),
              FareLine("Driver's allowance", q.timeCharge, note: t.days == 1 ? '1 day' : '${t.days} days'),
              if (q.extraKmCharge > 0) FareLine('Extra distance', q.extraKmCharge, note: '${rate(t.perKm)} a km', signed: true),
            ],
        },
        if (q.hasCancellationFee) cancellationFeeLine(q),
        if (q.hasExtra) extraLine(q),
      ],
    );
  }

  /// "Waiting charge +₹3 · after 3 free min" (only add it when [FareQuote.hasWaiting]).
  static FareLine waitingLine(FareQuote q) =>
      FareLine('Waiting charge', q.waitingCharge, note: 'after ${q.freeWaitMin} free min', signed: true);

  /// "Previous cancellation fee +₹10" (only add it when [FareQuote.hasCancellationFee]).
  static FareLine cancellationFeeLine(FareQuote q) =>
      FareLine('Previous cancellation fee', q.previousCancellationFee, signed: true);

  /// "Extra you added +₹20" (only add it when [FareQuote.hasExtra]).
  static FareLine extraLine(FareQuote q) => FareLine('Extra you added', q.extra, note: 'goes to the driver', signed: true);

  final List<FareLine> lines;
  final int total;
  final String? title;
  final String? subtitle;
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    Widget row(FareLine l) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        children: [
          Expanded(
            child: Row(
              children: [
                Flexible(
                  child: Text(
                    l.label,
                    style: (l.emphasis ? t.bodyMedium : t.body).copyWith(color: TtColors.navy700),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (l.tag != null) ...[
                  const SizedBox(width: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                    decoration: BoxDecoration(
                      color: TtColors.warningTint,
                      borderRadius: TtRadii.pillRadius,
                    ),
                    child: Text(
                      l.tag!,
                      style: t.caption.copyWith(
                        fontWeight: FontWeight.w600,
                        color: TtColors.warningText,
                      ),
                    ),
                  ),
                ],
                if (l.note != null) ...[
                  const SizedBox(width: 8),
                  Flexible(
                    child: Text(l.note!, style: t.caption, overflow: TextOverflow.ellipsis),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 12),
          Text(
            l.signed ? formatInrSigned(l.amount) : formatInr(l.amount),
            style: TtTextStyles.tabular(
              (l.emphasis ? t.bodySemibold : t.bodyMedium).copyWith(
                color: TtColors.navy900,
              ),
            ),
          ),
        ],
      ),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (title != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              children: [
                Text(title!, style: t.h2),
                const Spacer(),
                if (subtitle != null)
                  Flexible(
                    child: Text(subtitle!, style: t.caption, overflow: TextOverflow.ellipsis),
                  ),
              ],
            ),
          ),
        for (final l in lines) ...[if (l.emphasis) const Divider(height: 16), row(l)],
        const Divider(height: 20),
        Row(
          children: [
            Text('Total', style: t.bodySemibold),
            const Spacer(),
            Text(formatInr(total), style: TtTextStyles.tabular(t.h1)),
          ],
        ),
        if (footer != null) ...[const SizedBox(height: 12), footer!],
      ],
    );
  }
}
