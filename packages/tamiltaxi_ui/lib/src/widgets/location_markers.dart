import 'dart:math' as math;

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

/// The pickup (green) or drop (red) on a map: a teardrop pin with a white centre and a white edge, its tip on the
/// point (like RedTaxi's and Ola's).
class MapPin extends StatelessWidget {
  const MapPin.pickup({super.key}) : color = TtColors.success;
  const MapPin.drop({super.key}) : color = TtColors.drop;

  final Color color;

  static const double width = 30;
  static const double height = 40;

  /// How far above its point (the tip) the head's centre is.
  static const double headAbove = height - width / 2;

  @override
  Widget build(BuildContext context) =>
      SizedBox(width: width, height: height, child: CustomPaint(painter: _PinPainter(color)));
}

class _PinPainter extends CustomPainter {
  const _PinPainter(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final r = size.width / 2 - 1;
    final c = Offset(size.width / 2, r + 1);
    final tip = Offset(size.width / 2, size.height - 1);
    // Head circle plus the two tangents down to the tip.
    final d = tip.dy - c.dy;
    final a = math.asin(r / d);
    final path = Path()
      ..moveTo(tip.dx, tip.dy)
      ..lineTo(c.dx - r * math.cos(a), c.dy + r * math.sin(a))
      ..arcTo(Rect.fromCircle(center: c, radius: r), math.pi - a, math.pi + 2 * a, false)
      ..close();
    canvas.drawShadow(path, TtColors.navy900, 2, false);
    canvas.drawPath(path, Paint()..color = color);
    canvas.drawPath(
      path,
      Paint()
        ..color = Colors.white
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2,
    );
    canvas.drawCircle(c, r * 0.4, Paint()..color = Colors.white);
  }

  @override
  bool shouldRepaint(_PinPainter old) => old.color != color;
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
