import 'package:flutter/material.dart';
import 'package:material_symbols_icons/symbols.dart';

import '../theme/tt_colors.dart';
import '../theme/tt_tokens.dart';

/// Green pickup ring with a white centre, like RedTaxi's (map + lists).
class PickupDot extends StatelessWidget {
  const PickupDot({super.key, this.size = 14});

  /// The coloured ring's size inside the 4 px white edge (the widget is [size] + 8).
  final double size;

  @override
  Widget build(BuildContext context) => _RingDot(size: size, color: TtColors.success);
}

/// Red drop ring with a white centre: the drop on the map, the pickup's twin.
class DropDot extends StatelessWidget {
  const DropDot({super.key, this.size = 14});
  final double size;

  @override
  Widget build(BuildContext context) => _RingDot(size: size, color: TtColors.drop);
}

class _RingDot extends StatelessWidget {
  const _RingDot({required this.size, required this.color});
  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
        width: size + 8,
        height: size + 8,
        decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle, boxShadow: TtShadows.soft),
        alignment: Alignment.center,
        child: Container(
          width: size + 4,
          height: size + 4,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          alignment: Alignment.center,
          child: Container(
            width: (size + 4) * 0.4,
            height: (size + 4) * 0.4,
            decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
          ),
        ),
      );
}

/// Red drop pin (lists, the drop chooser).
class DropPin extends StatelessWidget {
  const DropPin({super.key, this.size = 22});
  final double size;

  @override
  Widget build(BuildContext context) =>
      Icon(Symbols.location_on_rounded, fill: 1, color: TtColors.drop, size: size);
}
