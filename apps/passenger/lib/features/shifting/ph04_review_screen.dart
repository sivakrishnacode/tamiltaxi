import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../router/routes.dart';
import '../../state/shifting_flow.dart';
import '../parcel/widgets/parcel_widgets.dart';
import 'widgets/shifting_widgets.dart';

/// PH-04 Review the move: when, from → to with floors, the vehicle and team, the items as typed and the price lines;
/// each part can be changed. Book → P-36 "You're booked" and Activity › Upcoming.
class PH04ReviewScreen extends ConsumerStatefulWidget {
  const PH04ReviewScreen({super.key, this.showcase = false});

  /// Opened on its own from the Design gallery: render the sample plan, start no timers.
  final bool showcase;

  @override
  ConsumerState<PH04ReviewScreen> createState() => _PH04ReviewScreenState();
}

class _PH04ReviewScreenState extends ConsumerState<PH04ReviewScreen> {
  bool _allItems = false;

  Future<void> _book() async {
    final r = await ref.read(shiftingFlowProvider.notifier).book();
    if (!mounted) return;
    if (r.error != null) return showTtSnack(context, r.error!);
    if (r.trip != null) context.go(Routes.parcelBooked, extra: r.trip);
  }

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final s = widget.showcase ? ShiftingFlowState.sample() : ref.watch(shiftingFlowProvider);
    final d = s.details;
    final q = s.quote;
    final drop = s.drop;
    final items = d.items;
    final shown = _allItems ? items : items.take(4).toList();
    final extras = [
      if (d.packing != PackingLevel.none) '${d.packing.label} packing',
      if (d.dismantlePieces > 0)
        '${d.dismantlePieces} piece${d.dismantlePieces == 1 ? '' : 's'} taken apart',
      if (d.unpack) 'Unpacking',
    ];

    Widget change(String route) => TextButton(
      onPressed: widget.showcase ? () {} : () => context.go(route),
      style: TextButton.styleFrom(
        foregroundColor: TtColors.coral600,
        minimumSize: const Size(48, 36),
        padding: const EdgeInsets.symmetric(horizontal: 8),
      ),
      child: const Text('Change'),
    );

    return ShiftingScaffold(
      error: s.quoteError,
      onRetry: () => ref.read(shiftingFlowProvider.notifier).refreshQuote(),
      title: 'Review your move',
      bottom: SafeArea(
        top: false,
        child: Container(
          decoration: const BoxDecoration(
            color: TtColors.surface,
            border: Border(top: BorderSide(color: TtColors.divider)),
          ),
          padding: const EdgeInsets.fromLTRB(
            TtSpacing.l,
            TtSpacing.m,
            TtSpacing.l,
            TtSpacing.m,
          ),
          child: TtButton(
            label: q == null
                ? (s.quoteError == null
                      ? 'Getting the price…'
                      : 'Price unavailable')
                : 'Book · ${formatInr(q.lines.total)}',
            loading: s.busy,
            onPressed: widget.showcase
                ? () {}
                : (q == null || drop == null ? null : _book),
          ),
        ),
      ),
      children: [
        // When.
        Container(
          padding: const EdgeInsets.all(TtSpacing.l),
          decoration: const BoxDecoration(color: TtColors.navy900, borderRadius: TtRadii.cardRadius),
          child: Row(
            children: [
              const Icon(Symbols.event_available_rounded, color: TtColors.coral100, fill: 1),
              const SizedBox(width: TtSpacing.m),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(moveDayLabel(s.day), style: t.h2.copyWith(color: Colors.white)),
                    Text('Movers reach between ${slotLabel(s.slotHour)}', style: t.bodySmall.copyWith(color: Colors.white70)),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: TtSpacing.m),
        ShiftingSection(
          title: d.between ? 'To another town' : 'In town',
          trailing: change(Routes.shifting),
          child: PickupDropConnector(
            pickupTitle: s.pickup.name,
            pickupSubtitle: floorLabel(d.pickupFloor, d.pickupLift),
            dropTitle: drop?.name ?? 'Choose the new home',
            dropSubtitle: floorLabel(d.dropFloor, d.dropLift),
          ),
        ),
        ShiftingSection(
          title: 'Vehicle and team',
          trailing: change(Routes.shiftingSchedule),
          child: Row(
            children: [
              ParcelVehicleArt(kind: q?.vehicle ?? s.vehicleOrSuggested, width: 80, height: 52),
              const SizedBox(width: TtSpacing.m),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${(q?.vehicle ?? s.vehicleOrSuggested).textLabel} · ${Seed.vehicle(q?.vehicle ?? s.vehicleOrSuggested).capacityLabel}',
                      style: t.bodySemibold,
                    ),
                    Text(
                      '${q?.lines.helperCount ?? s.pricing.shifting.size(d.homeSize).helpers} helpers · ${d.homeSize.label}',
                      style: t.bodySmall.copyWith(color: TtColors.navy700),
                    ),
                    if (extras.isNotEmpty) Text(extras.join(' · '), style: t.bodySmall.copyWith(color: TtColors.navy500)),
                  ],
                ),
              ),
            ],
          ),
        ),
        ShiftingSection(
          title: '${items.length} item${items.length == 1 ? '' : 's'} · ${d.itemCount} in all',
          trailing: change(Routes.shiftingItems),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final i in shown)
                Padding(
                  padding: const EdgeInsets.only(bottom: TtSpacing.s),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(
                        width: 36,
                        child: Text('${i.qty} ×', style: TtTextStyles.tabular(t.bodySmall.copyWith(color: TtColors.navy500))),
                      ),
                      Expanded(
                        child: Text.rich(
                          TextSpan(children: [
                            TextSpan(text: i.name, style: t.bodySmall.copyWith(color: TtColors.navy900, fontWeight: FontWeight.w600)),
                            if (i.note.isNotEmpty) TextSpan(text: ' · ${i.note}', style: t.bodySmall.copyWith(color: TtColors.navy500)),
                          ]),
                        ),
                      ),
                    ],
                  ),
                ),
              if (items.length > 4)
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(
                    onPressed: () => setState(() => _allItems = !_allItems),
                    style: TextButton.styleFrom(foregroundColor: TtColors.coral600, padding: EdgeInsets.zero, minimumSize: const Size(48, 36)),
                    child: Text(_allItems ? 'Show less' : 'Show all ${items.length}'),
                  ),
                ),
            ],
          ),
        ),
        if (q != null)
          ShiftingSection(
            title: 'Price',
            subtitle: 'Fixed now. You pay the driver by cash or UPI after the move.',
            child: shiftingBreakdown(q.lines, vehicle: q.vehicle, details: d, between: d.between),
          ),
        const SizedBox(height: TtSpacing.xs),
        for (final (icon, text) in [
          (Symbols.event_busy_rounded,
              'Free to cancel until we start finding your movers, ${formatMinutes(ref.watch(dispatchLeadMinProvider))} before the slot.'),
          (Symbols.toll_rounded, 'Tolls, parking and building entry fees on the way are yours.'),
          (Symbols.shield_person_rounded, 'Tamil Taxi connects you with drivers and is not liable for lost or damaged goods.'),
        ])
          Padding(
            padding: const EdgeInsets.only(bottom: TtSpacing.s),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(icon, size: 18, color: TtColors.navy500),
                const SizedBox(width: TtSpacing.s),
                Expanded(child: Text(text, style: t.caption.copyWith(color: TtColors.navy500))),
              ],
            ),
          ),
      ],
    );
  }
}
