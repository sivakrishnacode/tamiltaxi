import 'package:flutter/material.dart';

import '../theme/tt_colors.dart';
import '../theme/tt_tokens.dart';

/// One destination in [TtBottomNav].
class TtNavItem {
  const TtNavItem({required this.icon, required this.label});
  final IconData icon;
  final String label;
}

/// Bottom navigation (4 items): active item gets a coral-50 pill behind a filled coral icon.
class TtBottomNav extends StatelessWidget {
  const TtBottomNav({
    super.key,
    required this.items,
    required this.currentIndex,
    required this.onTap,
    this.iconWeight = 400,
  });

  final List<TtNavItem> items;
  final int currentIndex;
  final ValueChanged<int> onTap;

  /// Material Symbols stroke weight (100–700) for every icon in the bar.
  final double iconWeight;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return DecoratedBox(
      decoration: const BoxDecoration(
        color: TtColors.surface,
        border: Border(top: BorderSide(color: TtColors.divider)),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 76,
          child: Row(
            children: [
              for (var i = 0; i < items.length; i++)
                Expanded(
                  child: Semantics(
                    selected: i == currentIndex,
                    button: true,
                    label: items[i].label,
                    excludeSemantics: true,
                    child: InkWell(
                      key: ValueKey('nav-${items[i].label}'),
                      onTap: () => onTap(i),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          AnimatedContainer(
                            duration: const Duration(milliseconds: 180),
                            width: 56,
                            height: 32,
                            decoration: BoxDecoration(
                              color: i == currentIndex ? TtColors.coral50 : Colors.transparent,
                              borderRadius: TtRadii.pillRadius,
                            ),
                            child: Icon(
                              items[i].icon,
                              fill: i == currentIndex ? 1 : 0,
                              weight: iconWeight,
                              color: i == currentIndex ? TtColors.coral600 : TtColors.navy500,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            items[i].label,
                            style: t.caption.copyWith(
                              fontSize: 13,
                              color: i == currentIndex ? TtColors.coral600 : TtColors.navy500,
                              fontWeight: i == currentIndex ? FontWeight.w600 : FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
