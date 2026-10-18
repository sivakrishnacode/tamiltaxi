import 'package:flutter/material.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

/// The three planning steps of a house shift.
const shiftingSteps = ['Moving', 'Items', 'Day & extras'];

/// A house-shifting screen: app bar, the step bar ([step] 1–3; null on the review), a scrolling body and a pinned
/// [bottom] (usually [ShiftingPriceBar]).
class ShiftingScaffold extends StatelessWidget {
  const ShiftingScaffold({
    super.key,
    required this.title,
    this.step,
    required this.children,
    required this.bottom,
    this.onBack,
    this.error,
    this.onRetry,
  });

  final String title;
  final int? step;
  final List<Widget> children;
  final Widget bottom;
  final VoidCallback? onBack;
  final String? error;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: TtColors.background,
    appBar: TtAppBar(title: title, onBack: onBack),
    body: Column(
      children: [
        if (step case final s?) _StepBar(step: s),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(
              TtSpacing.l,
              TtSpacing.m,
              TtSpacing.l,
              TtSpacing.xl,
            ),
            children: [
              if (error != null)
                TtCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        error!,
                        style: context.type.bodySmall.copyWith(
                          color: TtColors.error,
                        ),
                      ),
                      TextButton(
                        onPressed: onRetry,
                        child: const Text('Retry price'),
                      ),
                    ],
                  ),
                ),
              ...children,
            ],
          ),
        ),
        bottom,
      ],
    ),
  );
}

/// Three thin bars with the step names under them; done and current steps in coral.
class _StepBar extends StatelessWidget {
  const _StepBar({required this.step});
  final int step;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Semantics(
      label: 'Step $step of ${shiftingSteps.length}: ${shiftingSteps[step - 1]}',
      excludeSemantics: true,
      child: Container(
        color: TtColors.surface,
        padding: const EdgeInsets.fromLTRB(TtSpacing.l, 0, TtSpacing.l, TtSpacing.m),
        child: Row(
          children: [
            for (var i = 1; i <= shiftingSteps.length; i++) ...[
              if (i > 1) const SizedBox(width: TtSpacing.s),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    AnimatedContainer(
                      duration: const Duration(milliseconds: 250),
                      height: 4,
                      decoration: BoxDecoration(
                        color: i <= step ? TtColors.coral600 : TtColors.divider,
                        borderRadius: TtRadii.pillRadius,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      shiftingSteps[i - 1],
                      style: t.caption.copyWith(
                        color: i == step ? TtColors.navy900 : TtColors.navy500,
                        fontWeight: i == step ? FontWeight.w600 : null,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// A white card with a title (and an optional line under it, or a [trailing] on the right).
class ShiftingSection extends StatelessWidget {
  const ShiftingSection({super.key, required this.title, required this.child, this.subtitle, this.trailing});

  final String title;
  final String? subtitle;
  final Widget? trailing;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Container(
      margin: const EdgeInsets.only(bottom: TtSpacing.m),
      padding: const EdgeInsets.all(TtSpacing.l),
      decoration: BoxDecoration(
        color: TtColors.surface,
        borderRadius: TtRadii.cardRadius,
        border: Border.all(color: TtColors.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: Text(title, style: t.bodySemibold)),
              ?trailing,
            ],
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 2),
            Text(subtitle!, style: t.bodySmall.copyWith(color: TtColors.navy500)),
          ],
          const SizedBox(height: TtSpacing.m),
          child,
        ],
      ),
    );
  }
}

/// A − value + stepper (floors, pieces, helpers).
class CountStepper extends StatelessWidget {
  const CountStepper({
    super.key,
    required this.value,
    required this.onChanged,
    required this.label,
    this.min = 0,
    this.max = 99,
    this.semanticsLabel,
    this.dense = false,
  });

  /// Smaller buttons and value, for rows with a title beside them.
  final bool dense;

  final int value;
  final ValueChanged<int> onChanged;

  /// What [value] reads as ("2nd", "3 pieces").
  final String label;
  final int min;
  final int max;
  final String? semanticsLabel;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    Widget button(IconData icon, String tip, int? next) => IconButton(
          tooltip: tip,
          onPressed: next == null ? null : () => onChanged(next),
          style: IconButton.styleFrom(
            backgroundColor: next == null ? TtColors.inputBg : TtColors.coral50,
            foregroundColor: TtColors.coral600,
            disabledForegroundColor: TtColors.navy300,
            minimumSize: Size.square(dense ? 34 : 40),
            fixedSize: dense ? const Size.square(34) : null,
            padding: dense ? EdgeInsets.zero : null,
          ),
          icon: Icon(icon, size: dense ? 18 : 20),
        );
    return Semantics(
      label: semanticsLabel,
      value: label,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          button(Symbols.remove_rounded, 'Less', value > min ? value - 1 : null),
          ConstrainedBox(
            constraints: BoxConstraints(minWidth: dense ? 32 : 64),
            child: Text(label, textAlign: TextAlign.center, style: TtTextStyles.tabular(t.bodySemibold)),
          ),
          button(Symbols.add_rounded, 'More', value < max ? value + 1 : null),
        ],
      ),
    );
  }
}

/// "Tomorrow, Fri 2 Oct" / "Sat 3 Oct" (PH-03, PH-04).
String moveDayLabel(DateTime day) {
  final when = formatWhen(DateTime(day.year, day.month, day.day, 9)).split(', ').first;
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  final date = '${days[day.weekday - 1]} ${day.day} ${months[day.month - 1]}';
  return when == 'Today' || when == 'Tomorrow' ? '$when, $date' : date;
}

/// "Pickup truck · 2 helpers".
String moverTeam(VehicleKind kind, int helpers) => '${kind.textLabel} · $helpers helper${helpers == 1 ? '' : 's'}';

/// "5th" (the floor sheet, the floor line).
String _ordinal(int floor) => floorLabel(floor, false).split(' ').first;

/// PH-01's From → To card, like Porter's: each home (tap to change it) and how the furniture gets in and out: Ground
/// floor, Lift or No lift. Lift and No lift ask the floor in a sheet. The new home's choice shows once it is chosen.
class MoveRouteCard extends StatelessWidget {
  const MoveRouteCard({
    super.key,
    required this.pickup,
    required this.drop,
    required this.details,
    required this.onPlace,
    required this.onLevel,
    this.stairsPerFloor = GoodsModeRates.stairsPerFloor,
  });

  final Place pickup;
  final Place? drop;
  final ShiftingDetails details;

  /// Change the old home (true) or the new one; null in the Design gallery.
  final void Function(bool pickup)? onPlace;
  final void Function({required bool pickup, required int floor, required bool lift}) onLevel;

  /// The city's stairs charge per floor without a lift.
  final int stairsPerFloor;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.fromLTRB(TtSpacing.m, TtSpacing.xs, TtSpacing.xs, TtSpacing.m),
        decoration: BoxDecoration(
          color: TtColors.surface,
          borderRadius: TtRadii.cardRadius,
          border: Border.all(color: TtColors.divider),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _MoveEnd(
              isPickup: true,
              place: pickup.isUnknownPickup ? null : pickup,
              floor: details.pickupFloor,
              lift: details.pickupLift,
              stairsPerFloor: stairsPerFloor,
              onPlace: onPlace == null ? null : () => onPlace!(true),
              onLevel: (floor, lift) => onLevel(pickup: true, floor: floor, lift: lift),
            ),
            const Padding(
              padding: EdgeInsets.fromLTRB(36, TtSpacing.m, TtSpacing.s, TtSpacing.xs),
              child: Divider(height: 1),
            ),
            _MoveEnd(
              isPickup: false,
              place: drop,
              floor: details.dropFloor,
              lift: details.dropLift,
              stairsPerFloor: stairsPerFloor,
              onPlace: onPlace == null ? null : () => onPlace!(false),
              onLevel: (floor, lift) => onLevel(pickup: false, floor: floor, lift: lift),
            ),
          ],
        ),
      );
}

/// One home on [MoveRouteCard]: the place row, then Ground floor · Lift · No lift and the floor chosen.
class _MoveEnd extends StatelessWidget {
  const _MoveEnd({
    required this.isPickup,
    required this.place,
    required this.floor,
    required this.lift,
    required this.stairsPerFloor,
    required this.onPlace,
    required this.onLevel,
  });

  final bool isPickup;
  final Place? place;
  final int floor;
  final bool lift;
  final int stairsPerFloor;
  final VoidCallback? onPlace;
  final void Function(int floor, bool lift) onLevel;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final p = place;
    final where = isPickup ? 'old home' : 'new home';

    Future<void> chooseFloor({required bool withLift}) async {
      final f = await showFloorSheet(context, floor: floor, lift: withLift, where: where, stairsPerFloor: stairsPerFloor);
      if (f != null) onLevel(f, withLift);
    }

    Widget chip(String label, bool on, VoidCallback onTap) => Semantics(
          button: true,
          selected: on,
          inMutuallyExclusiveGroup: true,
          label: '$label at the $where',
          excludeSemantics: true,
          child: TtChip(label: label, selected: on, onTap: onPlace == null ? null : onTap),
        );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(
          button: true,
          label: '${isPickup ? 'Moving from' : 'Moving to'} ${p?.name ?? 'not chosen yet'}',
          excludeSemantics: true,
          child: InkWell(
            onTap: onPlace,
            borderRadius: TtRadii.cardRadius,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: TtSpacing.s),
              child: Row(
                children: [
                  SizedBox(width: 24, child: Center(child: isPickup ? const PickupDot(size: 10) : const DropPin(size: 22))),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          p?.name ?? (isPickup ? 'Choose the old home' : 'Choose the new home'),
                          style: t.listTitle.copyWith(color: p == null ? TtColors.coral600 : TtColors.navy900),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        if (p != null && p.address.isNotEmpty)
                          Text(p.address, style: t.listMeta, maxLines: 1, overflow: TextOverflow.ellipsis),
                      ],
                    ),
                  ),
                  const Icon(Symbols.chevron_right_rounded, color: TtColors.navy500),
                ],
              ),
            ),
          ),
        ),
        // How the furniture gets in and out, once the place is known.
        AnimatedSize(
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOutCubic,
          alignment: Alignment.topCenter,
          child: p == null
              ? const SizedBox(width: double.infinity)
              : Padding(
                  padding: const EdgeInsets.only(left: 36, top: TtSpacing.xs, right: TtSpacing.s),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Wrap(
                        spacing: TtSpacing.s,
                        runSpacing: TtSpacing.s,
                        children: [
                          chip('Ground floor', floor == 0, () => onLevel(0, false)),
                          chip('Lift', floor > 0 && lift, () => chooseFloor(withLift: true)),
                          chip('No lift', floor > 0 && !lift, () => chooseFloor(withLift: false)),
                        ],
                      ),
                      if (floor > 0)
                        Padding(
                          padding: const EdgeInsets.only(top: TtSpacing.xs),
                          child: Row(
                            children: [
                              Icon(lift ? Symbols.elevator_rounded : Symbols.stairs_2_rounded, size: 18, color: TtColors.navy500),
                              const SizedBox(width: 6),
                              Expanded(
                                child: Text(
                                  lift
                                      ? '${_ordinal(floor)} floor'
                                      : '${_ordinal(floor)} floor · ${formatInr(stairsPerFloor * floor)} for the stairs',
                                  style: TtTextStyles.tabular(t.listMeta.copyWith(color: TtColors.navy700)),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              TextButton(
                                // Design gallery (no onPlace): looks ready, does nothing.
                                onPressed: () => onPlace == null ? null : chooseFloor(withLift: lift),
                                style: TextButton.styleFrom(
                                  foregroundColor: TtColors.coral600,
                                  textStyle: t.bodySmallMedium,
                                  minimumSize: const Size(48, 40),
                                  padding: const EdgeInsets.symmetric(horizontal: TtSpacing.s),
                                ),
                                child: Semantics(label: 'Change the floor at the $where', excludeSemantics: true, child: const Text('Change')),
                              ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
        ),
      ],
    );
  }
}

/// Which floor a home is on, for Lift or No lift (PH-01): 1st to 20th, one tap picks it. Null when dismissed.
Future<int?> showFloorSheet(
  BuildContext context, {
  required int floor,
  required bool lift,
  required String where,
  int stairsPerFloor = GoodsModeRates.stairsPerFloor,
}) =>
    showTtSheet<int>(
      context,
      builder: (ctx) {
        final t = ctx.type;
        return Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Which floor is the $where on?', style: t.h2),
            const SizedBox(height: 4),
            Text(
              lift ? 'No stairs charge with a lift.' : 'Movers carry everything by the stairs: ${formatInr(stairsPerFloor)} a floor.',
              style: t.bodySmall.copyWith(color: TtColors.navy500),
            ),
            const SizedBox(height: TtSpacing.l),
            GridView.count(
              crossAxisCount: 5,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: TtSpacing.s,
              crossAxisSpacing: TtSpacing.s,
              childAspectRatio: 1.3,
              children: [
                for (var f = 1; f <= 20; f++)
                  Semantics(
                    button: true,
                    selected: f == floor,
                    label: '${_ordinal(f)} floor',
                    excludeSemantics: true,
                    child: Material(
                      color: f == floor ? TtColors.coral600 : TtColors.inputBg,
                      borderRadius: TtRadii.cardRadius,
                      clipBehavior: Clip.antiAlias,
                      child: InkWell(
                        onTap: () => Navigator.of(ctx).pop(f),
                        child: Center(
                          child: Text(
                            _ordinal(f),
                            style: TtTextStyles.tabular(
                              t.bodySmallMedium.copyWith(color: f == floor ? TtColors.surface : TtColors.navy900),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ],
        );
      },
    );

/// A section title on the plain background, with an optional line under it and a [trailing] action (PH-02, PH-03).
class ShiftingHeading extends StatelessWidget {
  const ShiftingHeading({super.key, required this.title, this.subtitle, this.trailing});
  final String title;
  final String? subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Padding(
      padding: const EdgeInsets.only(bottom: TtSpacing.m),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(title, style: t.h2)),
              ?trailing,
            ],
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 2),
            Text(subtitle!, style: t.bodySmall.copyWith(color: TtColors.navy500)),
          ],
        ],
      ),
    );
  }
}

/// White rows in one card with a line between them (the choice lists, PH-03's extras).
class ShiftingCard extends StatelessWidget {
  const ShiftingCard({super.key, required this.children, this.indent = 52});
  final List<Widget> children;

  /// Where the line between rows starts (past a choice's radio).
  final double indent;

  @override
  Widget build(BuildContext context) => Container(
        decoration: BoxDecoration(
          color: TtColors.surface,
          borderRadius: TtRadii.cardRadius,
          border: Border.all(color: TtColors.divider),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          children: [
            for (var i = 0; i < children.length; i++) ...[
              if (i > 0) Divider(height: 1, indent: indent),
              children[i],
            ],
          ],
        ),
      );
}

/// One choice in a [ShiftingCard]: a radio, the name and a line under it ([note] under that in green: "Suggested"),
/// then the vehicle's picture and a price when given. A null [price] with [pricePending] is still loading.
class ShiftingChoiceRow extends StatelessWidget {
  const ShiftingChoiceRow({
    super.key,
    required this.title,
    required this.subtitle,
    required this.selected,
    required this.onTap,
    this.note,
    this.vehicle,
    this.price,
    this.pricePending = false,
  });

  final String title;
  final String subtitle;
  final String? note;
  final bool selected;
  final VoidCallback? onTap;
  final VehicleKind? vehicle;
  final String? price;
  final bool pricePending;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Semantics(
      button: true,
      selected: selected,
      inMutuallyExclusiveGroup: true,
      label: [title, subtitle, ?note, ?price].join('. '),
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(TtSpacing.m, 10, TtSpacing.m, 10),
          child: Row(
            children: [
              _RadioDot(on: selected),
              const SizedBox(width: TtSpacing.m),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: t.listTitle, maxLines: 1, overflow: TextOverflow.ellipsis),
                    Text(subtitle, style: t.listMeta, maxLines: 2, overflow: TextOverflow.ellipsis),
                    if (note != null)
                      Text(note!, style: t.listMeta.copyWith(color: TtColors.successText, fontWeight: FontWeight.w600)),
                  ],
                ),
              ),
              if (vehicle case final v?) ...[
                const SizedBox(width: TtSpacing.s),
                VehicleArt(v, width: 56, height: 40),
              ],
              if (price != null || pricePending) ...[
                const SizedBox(width: TtSpacing.s),
                ConstrainedBox(
                  constraints: const BoxConstraints(minWidth: 56),
                  child: price == null
                      ? const Align(alignment: Alignment.centerRight, child: SkeletonBox(width: 48, height: 16))
                      : Text(price!, textAlign: TextAlign.right, style: TtTextStyles.tabular(t.price)),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// PH-02 "How big is the home?": one row per size with the vehicle and helpers that come for it (the vehicle can still
/// be changed on PH-03).
class HomeSizeList extends StatelessWidget {
  const HomeSizeList({super.key, required this.selected, required this.rates, required this.onChanged});
  final HomeSize selected;
  final ShiftingRates rates;
  final ValueChanged<HomeSize>? onChanged;

  @override
  Widget build(BuildContext context) => ShiftingCard(
        children: [
          for (final hs in HomeSize.values)
            ShiftingChoiceRow(
              title: hs.label,
              subtitle: moverTeam(rates.size(hs).vehicle, rates.size(hs).helpers),
              vehicle: rates.size(hs).vehicle,
              selected: hs == selected,
              onTap: onChanged == null ? null : () => onChanged!(hs),
            ),
        ],
      );
}

/// A radio button's look: a ring, filled coral with a white centre when chosen.
class _RadioDot extends StatelessWidget {
  const _RadioDot({required this.on});
  final bool on;

  @override
  Widget build(BuildContext context) => AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        width: 22,
        height: 22,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: on ? TtColors.coral600 : TtColors.surface,
          border: Border.all(color: on ? TtColors.coral600 : TtColors.navy300, width: 2),
        ),
        alignment: Alignment.center,
        child: on
            ? Container(width: 8, height: 8, decoration: const BoxDecoration(color: TtColors.surface, shape: BoxShape.circle))
            : null,
      );
}

/// The pinned bottom: the total so far (or what is missing) and the next step's button.
class ShiftingPriceBar extends StatelessWidget {
  const ShiftingPriceBar({
    super.key,
    required this.total,
    required this.label,
    required this.onPressed,
    this.caption,
    this.loading = false,
    this.pricing = true,
    this.onDetails,
  });

  /// Null while it is being priced, or when there is nothing to price yet (see [pricing]).
  final int? total;

  /// A null [total] is on its way (a placeholder shows); false: nothing to price yet, the [caption] says why.
  final bool pricing;
  final String label;
  final VoidCallback? onPressed;

  /// Under the total: "2 helpers · Pickup truck", "Add a drop to see the price".
  final String? caption;
  final bool loading;

  /// Opens the price lines.
  final VoidCallback? onDetails;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Container(
      decoration: const BoxDecoration(
        color: TtColors.surface,
        border: Border(top: BorderSide(color: TtColors.divider)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(TtSpacing.l, TtSpacing.m, TtSpacing.l, TtSpacing.m),
          child: Row(
            children: [
              Expanded(
                child: InkWell(
                  onTap: onDetails,
                  borderRadius: TtRadii.cardRadius,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            AnimatedSwitcher(
                              duration: const Duration(milliseconds: 200),
                              child: total != null
                                  ? Text(formatInr(total!), key: ValueKey(total), style: TtTextStyles.tabular(t.h2))
                                  : pricing
                                      ? const SkeletonBox(key: ValueKey('pricing'), width: 72, height: 24)
                                      : const SizedBox.shrink(key: ValueKey('nothing')),
                            ),
                            if (onDetails != null && total != null) ...[
                              const SizedBox(width: 2),
                              const Icon(Symbols.expand_less_rounded, size: 20, color: TtColors.navy500),
                            ],
                          ],
                        ),
                        if (caption != null)
                          Text(
                            caption!,
                            // On its own (nothing priced yet) it is the bar's only line: a size up.
                            style: total == null && !pricing
                                ? t.bodySmall.copyWith(color: TtColors.navy700)
                                : t.caption.copyWith(color: TtColors.navy500),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: TtSpacing.m),
              TtButton(label: label, expand: false, loading: loading, onPressed: onPressed),
            ],
          ),
        ),
      ),
    );
  }
}

/// The price lines of a shift, in the fare-breakdown style.
FareBreakdown shiftingBreakdown(
  ShiftingLines l, {
  required VehicleKind vehicle,
  ShiftingDetails? details,
  String? title,
  String? subtitle,
  bool between = false,
}) =>
    FareBreakdown.fromShifting(l, vehicle: vehicle, details: details, between: between, title: title, subtitle: subtitle);

/// Opens the price lines in a sheet.
Future<void> showShiftingPrice(BuildContext context, ShiftingQuote q, {required ShiftingDetails details}) => showTtSheet<void>(
      context,
      builder: (ctx) => Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          shiftingBreakdown(q.lines,
              vehicle: q.vehicle,
              details: details,
              between: details.between,
              title: 'Price',
              subtitle: '${q.vehicle.label} · ${formatKm(q.distanceKm)}'),
          const SizedBox(height: TtSpacing.s),
          Text('Fixed before you book. Pay the driver by cash or UPI; tolls and parking on the way are yours.',
              style: ctx.type.caption.copyWith(color: TtColors.navy500)),
          const SizedBox(height: TtSpacing.l),
          TtButton(label: 'Got it', onPressed: () => Navigator.of(ctx).pop()),
        ],
      ),
    );
