import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../../state/meter.dart';
import 'home_parts.dart';

/// Home, over the map beside Surge / High demand: opens the meter (D-42). Online or offline; not during a booked trip
/// or a meter trip.
class MeterChip extends StatelessWidget {
  const MeterChip({super.key, required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        label: 'Meter, for a passenger off the app',
        excludeSemantics: true,
        child: DecoratedBox(
          decoration: const BoxDecoration(borderRadius: TtRadii.pillRadius, boxShadow: TtShadows.soft),
          child: Material(
            color: TtColors.navy900,
            borderRadius: TtRadii.pillRadius,
            child: InkWell(
              borderRadius: TtRadii.pillRadius,
              onTap: onTap,
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 40),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12, 6, 14, 6),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Symbols.speed_rounded, size: 18, color: Colors.white, fill: 1),
                    const SizedBox(width: 6),
                    Text('Meter',
                        style: context.type.bodySmallMedium.copyWith(color: Colors.white, fontWeight: FontWeight.w600)),
                  ]),
                ),
              ),
            ),
          ),
        ),
      );
}

/// Home during a meter trip: "Meter running · ₹82" (or "Collect ₹100" once ended) with Return to D-42. Watches the
/// meter itself, so Home doesn't rebuild on every GPS fix.
class MeterBanner extends ConsumerWidget {
  const MeterBanner({super.key, required this.onOpen});

  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final m = ref.watch(meterProvider);
    if (!m.active) return const SizedBox.shrink();
    final running = m.status == MeterStatus.running;
    return TripInProgressBanner(
      icon: Symbols.speed_rounded,
      title: running ? 'Meter running · ${formatInr(m.fare)}' : 'Collect ${formatInr(m.fare)}',
      subtitle: '${m.km.toStringAsFixed(1)} km · ${m.elapsed(DateTime.now()).inMinutes} min',
      onOpen: onOpen,
    );
  }
}
