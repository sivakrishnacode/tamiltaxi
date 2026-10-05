import 'package:flutter/material.dart';
import 'package:material_symbols_icons/symbols.dart';

import '../theme/tt_colors.dart';
import '../theme/tt_tokens.dart';

import 'location_markers.dart';

enum LocationRowKind { pickup, drop, recent, saved, landmark, search }

/// One place row (56 dp): a bare leading icon in a 24 dp column, title 15 sp + grey subtitle 13 sp, optional trailing
/// text (distance) and chevron.
class LocationRow extends StatelessWidget {
  const LocationRow({
    super.key,
    required this.title,
    this.subtitle,
    this.kind = LocationRowKind.search,
    this.icon,
    this.trailingText,
    this.showChevron = false,
    this.onTap,
    this.dense = false,
  });

  final String title;
  final String? subtitle;
  final LocationRowKind kind;

  /// Overrides the kind's default icon (e.g. flight for the airport).
  final IconData? icon;
  final String? trailingText;
  final bool showChevron;
  final VoidCallback? onTap;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    // Bare icons in one 24 dp column (like Rapido's lists), so every kind's text lines up.
    final Widget leading = SizedBox(
      width: 24,
      child: Center(
        child: switch (kind) {
          LocationRowKind.pickup => const PickupDot(size: 10),
          LocationRowKind.drop => const DropPin(size: 20),
          LocationRowKind.recent => Icon(icon ?? Symbols.history_rounded, color: TtColors.navy500, size: 20),
          LocationRowKind.saved ||
          LocationRowKind.landmark =>
            Icon(icon ?? Symbols.star_rounded, color: TtColors.coral600, size: 20, fill: 1),
          LocationRowKind.search => Icon(icon ?? Symbols.location_on_rounded, color: TtColors.navy500, size: 20),
        },
      ),
    );
    return InkWell(
      onTap: onTap,
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 56),
        child: Padding(
          padding: EdgeInsets.symmetric(vertical: dense ? 6 : 8),
          child: Row(
            children: [
              leading,
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: t.listTitle.copyWith(fontWeight: FontWeight.w500), maxLines: 1, overflow: TextOverflow.ellipsis),
                    if (subtitle != null)
                      Text(
                        subtitle!,
                        style: t.listMeta,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                  ],
                ),
              ),
              if (trailingText != null) ...[
                const SizedBox(width: 8),
                Text(trailingText!, style: t.caption),
              ],
              if (showChevron) ...[
                const SizedBox(width: 4),
                const Icon(Symbols.chevron_right_rounded, color: TtColors.navy500),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
