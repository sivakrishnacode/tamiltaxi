import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

/// Shared parts of the rental (P-34) and outstation (P-35) booking screens: the map-over-sheet layout, section
/// titles, package cards, the "When?" choice, the cab list with each tier's terms and the small notes.

/// A map on top, the booking sheet below (scrolls) and a pinned bottom action, like P-10.
class ModeBookingLayout extends StatelessWidget {
  const ModeBookingLayout({super.key, required this.map, required this.onBack, required this.sections, required this.bottom});

  final Widget map;
  final VoidCallback onBack;

  /// The sheet's content, top to bottom.
  final List<Widget> sections;
  final Widget bottom;

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: TtColors.surface,
        body: LayoutBuilder(
          builder: (context, c) {
            // A shorter map than P-10: these screens have more to choose.
            final mapH = (c.maxHeight * 0.3).clamp(170.0, 260.0).toDouble();
            return Stack(
              fit: StackFit.expand,
              children: [
                Positioned(left: 0, right: 0, top: 0, height: mapH + TtSpacing.xl, child: map),
                Positioned(
                  left: 0,
                  top: 0,
                  child: SafeArea(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(TtSpacing.l, TtSpacing.m, 0, 0),
                      child: MapCircleButton(icon: Symbols.arrow_back_rounded, tooltip: 'Back', onPressed: onBack),
                    ),
                  ),
                ),
                Positioned(
                  left: 0,
                  right: 0,
                  top: mapH,
                  bottom: 0,
                  child: DecoratedBox(
                    decoration: const BoxDecoration(color: TtColors.surface, borderRadius: TtRadii.sheetTop, boxShadow: TtShadows.raised),
                    child: SafeArea(
                      top: false,
                      child: Column(
                        children: [
                          const SheetHandle(),
                          Expanded(
                            child: ListView(
                              padding: const EdgeInsets.fromLTRB(TtSpacing.l, 0, TtSpacing.l, TtSpacing.l),
                              children: sections,
                            ),
                          ),
                          Container(
                            decoration: const BoxDecoration(
                              color: TtColors.surface,
                              border: Border(top: BorderSide(color: TtColors.divider)),
                            ),
                            padding: const EdgeInsets.fromLTRB(TtSpacing.l, TtSpacing.m, TtSpacing.l, TtSpacing.m),
                            child: bottom,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      );
}

/// Screen title with a one-line explanation.
class ModeHeader extends StatelessWidget {
  const ModeHeader({super.key, required this.title, required this.subtitle});
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Padding(
      padding: const EdgeInsets.only(bottom: TtSpacing.l),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: t.h1),
          const SizedBox(height: TtSpacing.xs),
          Text(subtitle, style: t.body.copyWith(color: TtColors.navy700)),
        ],
      ),
    );
  }
}

/// "How long?", "When?", "Choose a cab".
class ModeSection extends StatelessWidget {
  const ModeSection({super.key, required this.title, required this.child, this.trailing});
  final String title;
  final Widget child;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Padding(
      padding: const EdgeInsets.only(bottom: TtSpacing.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(children: [
            Expanded(child: Text(title, style: t.bodySemibold.copyWith(fontSize: 17))),
            ?trailing,
          ]),
          const SizedBox(height: TtSpacing.m),
          child,
        ],
      ),
    );
  }
}

/// Rental packages as a row of cards: "4 hrs" big, "40 km" and "from ₹849" small. Scrolls to the selected one.
class RentalPackagePicker extends StatefulWidget {
  const RentalPackagePicker({super.key, required this.selected, required this.onChanged, this.fromPrice});

  final String selected;
  final ValueChanged<String> onChanged;

  /// The cheapest tier's price per package (Mini), for "from ₹849".
  final int Function(RentalPackage p)? fromPrice;

  @override
  State<RentalPackagePicker> createState() => _RentalPackagePickerState();
}

class _RentalPackagePickerState extends State<RentalPackagePicker> {
  static const _width = 104.0;
  late final ScrollController _scroll = ScrollController(
    initialScrollOffset: (RideModeRates.packages.indexWhere((p) => p.id == widget.selected).clamp(0, 99) - 1).clamp(0, 99) * (_width + TtSpacing.s),
  );

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return SizedBox(
      height: 96,
      child: ListView.separated(
        controller: _scroll,
        scrollDirection: Axis.horizontal,
        itemCount: RideModeRates.packages.length,
        separatorBuilder: (_, _) => const SizedBox(width: TtSpacing.s),
        itemBuilder: (context, i) {
          final p = RideModeRates.packages[i];
          final on = p.id == widget.selected;
          return Semantics(
            selected: on,
            button: true,
            label: '${p.hoursLabel}, ${p.km} km',
            excludeSemantics: true,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              width: _width,
              decoration: BoxDecoration(
                color: on ? TtColors.coral50 : TtColors.surface,
                borderRadius: TtRadii.cardRadius,
                border: Border.all(color: on ? TtColors.coral500 : TtColors.divider, width: on ? 1.5 : 1),
              ),
              child: Material(
                type: MaterialType.transparency,
                child: InkWell(
                  borderRadius: TtRadii.cardRadius,
                  onTap: () => widget.onChanged(p.id),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: TtSpacing.m, vertical: TtSpacing.s),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(p.hoursLabel, style: t.h2.copyWith(color: on ? TtColors.coral600 : TtColors.navy900)),
                        Text('${p.km} km', style: t.bodySmall.copyWith(color: TtColors.navy700)),
                        if (widget.fromPrice != null)
                          Text('from ${formatInr(widget.fromPrice!(p))}',
                              style: t.caption.copyWith(color: TtColors.navy500), maxLines: 1, overflow: TextOverflow.ellipsis),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

/// "Now" or a pickup time later (up to [RideModeRates.maxDaysAhead] days). [onChanged] gets null for now.
class WhenChoice extends ConsumerWidget {
  const WhenChoice({super.key, required this.at, required this.onChanged, this.label = 'Pickup', this.allowNow = true, this.after});

  /// Null = now.
  final DateTime? at;
  final ValueChanged<DateTime?> onChanged;

  /// "Pickup" / "Return" (screen reader text and the picker's title).
  final String label;

  /// False for a round trip's return (it is always a time).
  final bool allowNow;

  /// Earliest allowed time (a return after leaving); default [earliestLaterPickup].
  final DateTime? after;

  Future<void> _pick(BuildContext context, WidgetRef ref) async {
    final picked = await pickTripTime(context, initial: at, after: after, title: label, leadMin: ref.read(dispatchLeadMinProvider));
    if (picked != null) onChanged(picked);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final later = !allowNow || at != null;
    return Row(
      children: [
        if (allowNow) ...[
          Expanded(
            child: _WhenTile(
              icon: Symbols.bolt_rounded,
              title: 'Now',
              subtitle: 'Driver in minutes',
              selected: !later,
              onTap: () => onChanged(null),
            ),
          ),
          const SizedBox(width: TtSpacing.s),
        ],
        Expanded(
          flex: allowNow ? 1 : 2,
          child: _WhenTile(
            icon: Symbols.calendar_month_rounded,
            title: at == null ? 'Schedule' : formatWhen(at!),
            subtitle: at == null ? 'Up to ${RideModeRates.maxDaysAhead} days ahead' : 'Tap to change',
            selected: later,
            onTap: () => _pick(context, ref),
          ),
        ),
      ],
    );
  }
}

class _WhenTile extends StatelessWidget {
  const _WhenTile({required this.icon, required this.title, required this.subtitle, required this.selected, required this.onTap});
  final IconData icon;
  final String title;
  final String subtitle;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Semantics(
      selected: selected,
      button: true,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        constraints: const BoxConstraints(minHeight: 64),
        decoration: BoxDecoration(
          color: selected ? TtColors.coral50 : TtColors.surface,
          borderRadius: TtRadii.cardRadius,
          border: Border.all(color: selected ? TtColors.coral500 : TtColors.divider, width: selected ? 1.5 : 1),
        ),
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            borderRadius: TtRadii.cardRadius,
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.all(TtSpacing.m),
              child: Row(
                children: [
                  Icon(icon, size: 22, color: selected ? TtColors.coral600 : TtColors.navy500, fill: selected ? 1 : 0),
                  const SizedBox(width: TtSpacing.s),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(title,
                            style: t.bodySemibold.copyWith(color: selected ? TtColors.coral600 : TtColors.navy900),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis),
                        Text(subtitle, style: t.caption.copyWith(color: TtColors.navy500), maxLines: 1, overflow: TextOverflow.ellipsis),
                      ],
                    ),
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

/// The earliest pickup a trip booked for later can have: the server starts finding its driver [leadMin] minutes
/// before, so that much from [now] plus 15 minutes to spare, rounded up to a quarter hour.
DateTime earliestLaterPickup(int leadMin, {DateTime? now}) =>
    roundUpToQuarter((now ?? DateTime.now()).add(Duration(minutes: leadMin + 15)));

/// Date then time pickers for a trip booked ahead: from [after] (default [earliestLaterPickup] for the server's
/// [leadMin]) to [RideModeRates.maxDaysAhead] days ahead. Null when cancelled.
Future<DateTime?> pickTripTime(
  BuildContext context, {
  DateTime? initial,
  DateTime? after,
  String title = 'Pickup',
  int leadMin = AppConfig.defaultDispatchLeadMin,
}) async {
  final now = DateTime.now();
  final earliest = after == null ? earliestLaterPickup(leadMin, now: now) : roundUpToQuarter(after);
  final last = now.add(const Duration(days: RideModeRates.maxDaysAhead));
  final start = initial != null && initial.isAfter(earliest) ? initial : earliest;
  final date = await showDatePicker(
    context: context,
    initialDate: start,
    firstDate: DateTime(earliest.year, earliest.month, earliest.day),
    lastDate: last,
    helpText: '$title date',
  );
  if (date == null || !context.mounted) return null;
  final time = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(start), helpText: '$title time');
  if (time == null) return null;
  final picked = DateTime(date.year, date.month, date.day, time.hour, time.minute);
  if (picked.isBefore(earliest)) {
    if (context.mounted) showTtSnack(context, 'Choose a time after ${formatWhen(earliest)}');
    return null;
  }
  return picked.isAfter(last) ? last : picked;
}

/// [t] rounded up to the next quarter hour (never earlier than [t]: 10:15:40 → 10:30).
DateTime roundUpToQuarter(DateTime t) {
  final hour = DateTime(t.year, t.month, t.day, t.hour);
  final r = hour.add(Duration(minutes: (t.minute / 15).ceil() * 15));
  return r.isBefore(t) ? r.add(const Duration(minutes: 15)) : r;
}

/// One cab tier for a rental / outstation quote: picture, name, seats, what the price includes, fare.
class ModeCabCard extends StatelessWidget {
  const ModeCabCard({super.key, required this.quote, required this.selected, required this.onTap});
  final FareQuote quote;
  final bool selected;
  final VoidCallback onTap;

  String get _includes => switch (quote.modeTerms) {
        RentalTerms t => 'Then ${formatInr(t.extraKmRate)}/km · ${_rate(t.extraMinRate)}/min',
        OutstationTerms t when t.roundTrip => '${formatCount(t.includedKm)} km included · ${formatInr(t.perKm)}/km after',
        OutstationTerms t => '${formatCount(t.includedKm)} km · driver allowance included',
        null => '',
      };

  static String _rate(double r) => r == r.roundToDouble() ? formatInr(r) : '₹${r.toStringAsFixed(1)}';

  @override
  Widget build(BuildContext context) => VehicleOptionCard(
        icon: quote.vehicle.kind.icon,
        art: VehicleArt(quote.vehicle.kind),
        name: quote.vehicle.name,
        capacity: quote.vehicle.capacityLabel,
        subtitle: _includes,
        fare: quote.total,
        badge: quote.vehicle.kind == VehicleKind.suv ? 'Family' : quote.vehicle.badge,
        badgeTone: VehicleBadgeTone.navy,
        selected: selected,
        onTap: onTap,
      );
}

/// The cab list, or skeletons while the fares load, or the error with Retry.
class ModeCabList extends StatelessWidget {
  const ModeCabList({
    super.key,
    required this.quotes,
    required this.selected,
    required this.onSelect,
    this.error,
    this.onRetry,
  });

  /// Null while loading.
  final List<FareQuote>? quotes;
  final VehicleKind selected;
  final ValueChanged<VehicleKind> onSelect;
  final String? error;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    if (error != null) {
      return Container(
        padding: const EdgeInsets.all(TtSpacing.l),
        decoration: BoxDecoration(color: TtColors.errorTint, borderRadius: TtRadii.cardRadius),
        child: Row(children: [
          const Icon(Symbols.error_rounded, color: TtColors.error),
          const SizedBox(width: TtSpacing.m),
          Expanded(child: Text(error!, style: t.bodySmall.copyWith(color: TtColors.error))),
          if (onRetry != null) TextButton(onPressed: onRetry, child: const Text('Retry')),
        ]),
      );
    }
    final list = quotes;
    if (list == null) {
      return Column(children: [
        for (var i = 0; i < 3; i++) ...[
          const SkeletonBox(height: 72, radius: 16),
          const SizedBox(height: TtSpacing.s),
        ],
      ]);
    }
    return Column(children: [
      for (final q in list) ...[
        ModeCabCard(quote: q, selected: q.vehicle.kind == selected, onTap: () => onSelect(q.vehicle.kind)),
        const SizedBox(height: TtSpacing.xs),
      ],
    ]);
  }
}

/// Small notes under the cab list ("Fuel and driver included").
class ModeNotes extends StatelessWidget {
  const ModeNotes({super.key, required this.notes});
  final List<(IconData, String)> notes;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Container(
      padding: const EdgeInsets.all(TtSpacing.l),
      decoration: const BoxDecoration(color: TtColors.background, borderRadius: TtRadii.cardRadius),
      child: Column(
        children: [
          for (var i = 0; i < notes.length; i++) ...[
            if (i > 0) const SizedBox(height: TtSpacing.s),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(notes[i].$1, size: 18, color: TtColors.navy500),
                const SizedBox(width: TtSpacing.s),
                Expanded(child: Text(notes[i].$2, style: t.bodySmall.copyWith(color: TtColors.navy700))),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
