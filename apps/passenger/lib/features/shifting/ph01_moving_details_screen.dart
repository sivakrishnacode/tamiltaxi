import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../router/routes.dart';
import '../../state/shifting_flow.dart';
import '../parcel/widgets/parcel_widgets.dart';
import 'widgets/shifting_widgets.dart';

/// PH-01 House shifting · moving, like Porter's first step: in town or to another town, then the old and new home,
/// each with Ground floor, Lift or No lift (the floor in a sheet). No price yet: how big the home is comes on PH-02,
/// with the items. Next → PH-02.
class PH01MovingDetailsScreen extends ConsumerWidget {
  const PH01MovingDetailsScreen({super.key, this.showcase = false});

  /// Opened on its own from the Design gallery: render the sample plan, start no timers.
  final bool showcase;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = showcase ? ShiftingFlowState.sample() : ref.watch(shiftingFlowProvider);
    final flow = ref.read(shiftingFlowProvider.notifier);
    final d = s.details;
    final ready = s.placesReady && !s.pickup.isUnknownPickup;

    Future<void> pick(bool pickup) async {
      final p = await showParcelPlacePicker(
        context,
        title: pickup ? 'Moving from' : 'Moving to',
        current: pickup ? s.pickup : s.drop,
        anywhere: !pickup && d.between,
      );
      if (p == null) return;
      pickup ? flow.setPickup(p) : flow.setDrop(p);
    }

    return ShiftingScaffold(
      title: 'Packers & Movers',
      step: 1,
      onBack: () => context.canPop() ? context.pop() : context.go(Routes.parcel),
      bottom: _NextBar(
        onPressed: showcase ? () {} : (ready ? () => context.push(Routes.shiftingItems) : null),
      ),
      children: [
        TtSegmented<bool>(
          options: const [false, true],
          labelOf: (between) => between ? 'To another town' : 'In town',
          selected: d.between,
          onChanged: showcase ? (_) {} : flow.setBetween,
        ),
        const SizedBox(height: TtSpacing.l),
        MoveRouteCard(
          pickup: s.pickup,
          drop: s.drop,
          details: d,
          stairsPerFloor: s.pricing.shifting.stairsPerFloor,
          onPlace: showcase ? null : pick,
          onLevel: flow.setLevel,
        ),
        const SizedBox(height: TtSpacing.m),
        Text(
          "Next: what you're moving, then the price. You see the full price before you book.",
          style: context.type.caption,
        ),
      ],
    );
  }
}

/// The pinned Next button (no price on this step).
class _NextBar extends StatelessWidget {
  const _NextBar({required this.onPressed});
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) => Container(
        decoration: const BoxDecoration(
          color: TtColors.surface,
          border: Border(top: BorderSide(color: TtColors.divider)),
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.all(TtSpacing.l),
            child: TtButton(label: 'Next', onPressed: onPressed),
          ),
        ),
      );
}
