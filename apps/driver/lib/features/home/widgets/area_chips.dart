import 'package:flutter/material.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import 'demand_layer.dart';

/// Home, over the map: "Surge" and "High demand" with how many areas each has now; each opens D-14c on its list.
class AreaChips extends StatelessWidget {
  const AreaChips({super.key, required this.surge, required this.busy, required this.onSurge, required this.onBusy});

  /// How many areas each list has.
  final int surge;
  final int busy;
  final VoidCallback onSurge;
  final VoidCallback onBusy;

  // A Wrap: with the phone's large-text setting the second chip goes under the first instead of off screen.
  @override
  Widget build(BuildContext context) => Wrap(
    spacing: TtSpacing.s,
    runSpacing: TtSpacing.s,
    children: [
      _AreaChip(
        icon: zoneIcon(MapZoneKind.surge),
        color: zoneColor(MapZoneKind.surge),
        label: 'Surge',
        count: surge,
        onTap: onSurge,
      ),
      _AreaChip(
        icon: Symbols.local_fire_department_rounded,
        color: TtColors.coral600,
        label: 'High demand',
        count: busy,
        onTap: onBusy,
      ),
    ],
  );
}

class _AreaChip extends StatelessWidget {
  const _AreaChip({
    required this.icon,
    required this.color,
    required this.label,
    required this.count,
    required this.onTap,
  });

  final IconData icon;
  final Color color;
  final String label;
  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Semantics(
      button: true,
      label:
          '$label, ${count == 0
              ? 'none now'
              : count == 1
              ? '1 area'
              : '$count areas'}',
      excludeSemantics: true,
      child: DecoratedBox(
        decoration: const BoxDecoration(borderRadius: TtRadii.pillRadius, boxShadow: TtShadows.soft),
        child: Material(
          color: TtColors.surface,
          borderRadius: TtRadii.pillRadius,
          child: InkWell(
            borderRadius: TtRadii.pillRadius,
            onTap: onTap,
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 40),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 6, 14, 6),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(icon, size: 18, color: color, fill: 1),
                    const SizedBox(width: 6),
                    Text(
                      label,
                      style: t.bodySmallMedium.copyWith(color: TtColors.navy900, fontWeight: FontWeight.w600),
                    ),
                    if (count > 0) ...[
                      const SizedBox(width: 6),
                      Container(
                        constraints: const BoxConstraints(minWidth: 20),
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                        decoration: BoxDecoration(color: color, borderRadius: TtRadii.pillRadius),
                        child: Text(
                          '$count',
                          textAlign: TextAlign.center,
                          style: t.caption.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
