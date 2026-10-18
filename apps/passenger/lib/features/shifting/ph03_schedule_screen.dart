import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../router/routes.dart';
import '../../state/shifting_flow.dart';
import 'widgets/shifting_widgets.dart';

/// PH-03 House shifting · day and extras: the next 7 days in one row (weekends marked with what they add), a
/// two-hour slot, the vehicle (every goods truck's total, the suggested one marked), packing, and extras: taking
/// furniture apart, unpacking, more helpers. Nothing scrolls sideways; the price follows every choice. Review → PH-04.
class PH03ScheduleScreen extends ConsumerWidget {
  const PH03ScheduleScreen({super.key, this.showcase = false});

  /// Opened on its own from the Design gallery: render the sample plan, start no timers.
  final bool showcase;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.type;
    final s = showcase ? ShiftingFlowState.sample() : ref.watch(shiftingFlowProvider);
    final flow = ref.read(shiftingFlowProvider.notifier);
    final d = s.details;
    final q = s.quote;
    final rates = s.pricing.shifting;
    final size = rates.size(d.homeSize);
    final now = DateTime.now();
    final open = ShiftingFlowController.slotsOpen(s.day, now);
    final helperRate = rates.helperRate(between: d.between);

    return ShiftingScaffold(
      error: s.quoteError,
      onRetry: () => ref.read(shiftingFlowProvider.notifier).refreshQuote(),
      title: 'Packers & Movers',
      step: 3,
      bottom: ShiftingPriceBar(
        pricing: s.quoteError == null,
        total: q?.lines.total,
        caption: q == null ? (s.quoteError ?? 'Getting the price…') : moverTeam(q.vehicle, q.lines.helperCount),
        label: 'Review',
        onDetails: q == null
            ? null
            : () => showShiftingPrice(context, q, details: d),
        onPressed: showcase
            ? () {}
            : (q == null || !open.contains(s.slotHour)
                  ? null
                  : () => context.push(Routes.shiftingReview)),
      ),
      children: [
        ShiftingHeading(
          title: 'When?',
          subtitle: rates.weekendPct > 0 ? 'Saturday and Sunday cost ${rates.weekendPct}% more.' : null,
        ),
        Row(
          children: [
            for (var i = 0; i < 7; i++) ...[
              if (i > 0) const SizedBox(width: 6),
              Expanded(
                child: () {
                  final day = DateTime(now.year, now.month, now.day + i);
                  return _DayCell(
                    day: day,
                    today: i == 0,
                    weekendPct: GoodsModeRates.isIstWeekend(DateTime(day.year, day.month, day.day, 9)) ? rates.weekendPct : 0,
                    selected: DateUtils.isSameDay(day, s.day),
                    full: ShiftingFlowController.slotsOpen(day, now).isEmpty,
                    onTap: showcase ? null : () => flow.setDay(day),
                  );
                }(),
              ),
            ],
          ],
        ),
        const SizedBox(height: TtSpacing.m),
        Wrap(
          spacing: TtSpacing.s,
          runSpacing: TtSpacing.s,
          children: [
            for (final h in GoodsModeRates.slotHours)
              TtChip(
                label: slotLabel(h),
                selected: h == s.slotHour && open.contains(h),
                onTap: showcase || !open.contains(h) ? null : () => flow.setSlot(h),
              ),
          ],
        ),
        const SizedBox(height: TtSpacing.s),
        Text(
          open.contains(s.slotHour)
              ? '${moveDayLabel(s.day)} · the movers reach between ${slotLabel(s.slotHour)}'
              : 'Choose a time',
          style: t.caption,
        ),
        const SizedBox(height: TtSpacing.xl),
        const ShiftingHeading(title: 'Vehicle', subtitle: 'Bigger homes may need two trips in a smaller vehicle.'),
        ShiftingCard(
          children: [
            for (final kind in GoodsModeRates.goodsTrucks)
              () {
                final v = q?.vehicles.where((x) => x.kind == kind).firstOrNull;
                return ShiftingChoiceRow(
                  title: kind.textLabel,
                  subtitle: Seed.vehicle(kind).capacityLabel,
                  note: (v?.suggested ?? kind == size.vehicle) ? 'Suggested' : null,
                  vehicle: kind,
                  price: v == null ? null : formatInr(v.total),
                  pricePending: true,
                  selected: kind == (q?.vehicle ?? s.vehicleOrSuggested),
                  onTap: showcase ? null : () => flow.setVehicle(kind),
                );
              }(),
          ],
        ),
        const SizedBox(height: TtSpacing.xl),
        const ShiftingHeading(title: 'Packing'),
        ShiftingCard(
          children: [
            for (final p in PackingLevel.values)
              () {
                final price = switch (p) {
                  PackingLevel.none => 0,
                  PackingLevel.basic => size.basic,
                  PackingLevel.full => size.full,
                };
                return ShiftingChoiceRow(
                  title: p.label,
                  subtitle: p.hint,
                  price: price == 0 ? 'Free' : formatInr(price),
                  selected: d.packing == p,
                  onTap: showcase ? null : () => flow.setPacking(p),
                );
              }(),
          ],
        ),
        const SizedBox(height: TtSpacing.xl),
        const ShiftingHeading(title: 'Extras'),
        ShiftingCard(
          indent: TtSpacing.m,
          children: [
            _ExtraRow(
              title: 'Take apart and put back',
              subtitle: 'Beds, almirahs · ${formatInr(rates.dismantlePerPiece)} each',
              trailing: CountStepper(
                value: d.dismantlePieces,
                max: GoodsModeRates.maxDismantlePieces,
                label: '${d.dismantlePieces}',
                semanticsLabel: 'Pieces to take apart',
                dense: true,
                onChanged: flow.setDismantle,
              ),
            ),
            _ExtraRow(
              title: 'Unpacking at the new home',
              subtitle: '${formatInr(size.unpack)} · cartons opened, things set out',
              // Design gallery: looks ready, does nothing.
              trailing: Switch(value: d.unpack, onChanged: showcase ? (_) {} : flow.setUnpack),
            ),
            _ExtraRow(
              title: 'Extra helpers',
              subtitle: '${size.helpers} included · ${formatInr(helperRate)} each',
              trailing: CountStepper(
                value: d.extraHelpers,
                max: GoodsModeRates.maxExtraHelpers,
                label: '+${d.extraHelpers}',
                semanticsLabel: 'Extra helpers',
                dense: true,
                onChanged: flow.setExtraHelpers,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/// One day of the week row: "Today" or the weekday, the date, and what a weekend adds ("+10%"). A day with no slot
/// left is faded and can't be chosen.
class _DayCell extends StatelessWidget {
  const _DayCell({
    required this.day,
    required this.today,
    required this.weekendPct,
    required this.selected,
    required this.full,
    required this.onTap,
  });
  final DateTime day;
  final bool today;

  /// What this day adds (0 on weekdays).
  final int weekendPct;
  final bool selected;
  final bool full;
  final VoidCallback? onTap;

  static const _days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final name = today ? 'Today' : _days[day.weekday - 1];
    return Semantics(
      button: true,
      selected: selected,
      inMutuallyExclusiveGroup: true,
      label: '${moveDayLabel(day)}${weekendPct > 0 ? ', $weekendPct% more' : ''}${full ? ', no slots left' : ''}',
      excludeSemantics: true,
      child: Material(
        color: selected ? TtColors.coral50 : TtColors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: TtRadii.cardRadius,
          side: BorderSide(color: selected ? TtColors.coral600 : TtColors.divider, width: selected ? 1.5 : 1),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: full ? null : onTap,
          child: Opacity(
            opacity: full ? 0.4 : 1,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: TtSpacing.s),
              child: Column(
                children: [
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(name, style: t.caption.copyWith(color: selected ? TtColors.coral700 : TtColors.navy500)),
                  ),
                  Text(
                    '${day.day}',
                    style: TtTextStyles.tabular(t.bodySemibold.copyWith(color: selected ? TtColors.coral700 : TtColors.navy900)),
                  ),
                  SizedBox(
                    height: 16,
                    child: weekendPct > 0
                        ? Text(
                            '+$weekendPct%',
                            style: t.caption.copyWith(color: TtColors.warningText, fontWeight: FontWeight.w600, fontSize: 11),
                          )
                        : null,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// An extra with its stepper or switch.
class _ExtraRow extends StatelessWidget {
  const _ExtraRow({required this.title, required this.subtitle, required this.trailing});
  final String title;
  final String subtitle;
  final Widget trailing;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Padding(
      padding: const EdgeInsets.fromLTRB(TtSpacing.m, 10, TtSpacing.s, 10),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: t.listTitle),
                Text(subtitle, style: t.listMeta),
              ],
            ),
          ),
          const SizedBox(width: TtSpacing.s),
          trailing,
        ],
      ),
    );
  }
}
