import 'package:flutter/material.dart';

import '../theme/tt_colors.dart';
import '../theme/tt_tokens.dart';

/// Segmented control used for "Who pays the driver?" and the earnings tabs.
class TtSegmented<T> extends StatelessWidget {
  const TtSegmented({
    super.key,
    required this.options,
    required this.labelOf,
    required this.selected,
    required this.onChanged,
    this.dark = false,
    this.compact = false,
  });

  final List<T> options;
  final String Function(T) labelOf;
  final T selected;
  final ValueChanged<T> onChanged;

  /// Navy-700 track with a white thumb (driver app header).
  final bool dark;

  /// 36 dp segments with 14 sp labels (PP-01's "In town / To another town").
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: dark ? TtColors.navy700 : TtColors.inputBg,
        borderRadius: TtRadii.pillRadius,
      ),
      child: Row(
        children: [
          for (final o in options)
            Expanded(
              child: Semantics(
                selected: o == selected,
                button: true,
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => onChanged(o),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 180),
                    height: compact ? 36 : 44,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: o == selected ? TtColors.surface : Colors.transparent,
                      borderRadius: TtRadii.pillRadius,
                      boxShadow: o == selected && !dark ? TtShadows.soft : null,
                    ),
                    child: Text(
                      labelOf(o),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: (compact ? t.bodySmallMedium : t.bodyMedium).copyWith(
                        color: o == selected ? TtColors.navy900 : (dark ? Colors.white70 : TtColors.navy500),
                        fontWeight: o == selected ? FontWeight.w600 : FontWeight.w500,
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
