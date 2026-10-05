import 'package:flutter/material.dart';

import '../theme/tt_colors.dart';

/// The Butterfly mark (women riders, women drivers): a flat, symmetric butterfly drawn in code, no asset.
/// Upper wings butterfly-600, lower wings butterfly-400, navy body and antennae. [size] is the square it fills.
class ButterflyMark extends StatelessWidget {
  const ButterflyMark({super.key, this.size = 32, this.color = TtColors.butterfly600, this.accent = TtColors.butterfly400});

  final double size;

  /// Upper wings.
  final Color color;

  /// Lower wings.
  final Color accent;

  @override
  Widget build(BuildContext context) => Semantics(
        image: true,
        label: 'Pink Taxi',
        child: SizedBox.square(dimension: size, child: CustomPaint(painter: _ButterflyPainter(color, accent))),
      );
}

class _ButterflyPainter extends CustomPainter {
  _ButterflyPainter(this.color, this.accent);
  final Color color;
  final Color accent;

  @override
  void paint(Canvas canvas, Size size) {
    // Drawn on a 100 × 100 grid, centred on x = 50.
    final k = size.shortestSide / 100;
    canvas.translate((size.width - 100 * k) / 2, (size.height - 100 * k) / 2);
    canvas.scale(k);

    Path upper(bool left) {
      final s = left ? -1.0 : 1.0;
      double x(double v) => 50 + s * v;
      return Path()
        ..moveTo(x(3), 46)
        ..cubicTo(x(10), 22, x(28), 10, x(40), 14)
        ..cubicTo(x(50), 17, x(48), 34, x(40), 44)
        ..cubicTo(x(32), 52, x(14), 54, x(3), 50)
        ..close();
    }

    Path lower(bool left) {
      final s = left ? -1.0 : 1.0;
      double x(double v) => 50 + s * v;
      return Path()
        ..moveTo(x(3), 53)
        ..cubicTo(x(16), 54, x(32), 58, x(34), 70)
        ..cubicTo(x(36), 82, x(22), 88, x(14), 82)
        ..cubicTo(x(6), 76, x(3), 64, x(3), 53)
        ..close();
    }

    final wing = Paint()..color = color;
    final low = Paint()..color = accent;
    for (final left in [true, false]) {
      canvas.drawPath(lower(left), low);
      canvas.drawPath(upper(left), wing);
    }
    // Wing spots.
    final spot = Paint()..color = TtColors.surface.withValues(alpha: 0.85);
    canvas.drawCircle(const Offset(50 - 30, 28), 4.5, spot);
    canvas.drawCircle(const Offset(50 + 30, 28), 4.5, spot);

    final body = Paint()..color = TtColors.navy900;
    canvas.drawRRect(RRect.fromRectAndRadius(const Rect.fromLTWH(46.5, 30, 7, 50), const Radius.circular(3.5)), body);
    final antenna = Paint()
      ..color = TtColors.navy900
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.6
      ..strokeCap = StrokeCap.round;
    canvas.drawPath(Path()..moveTo(48.5, 31)..quadraticBezierTo(44, 18, 36, 12), antenna);
    canvas.drawPath(Path()..moveTo(51.5, 31)..quadraticBezierTo(56, 18, 64, 12), antenna);
    canvas.drawCircle(const Offset(36, 12), 2.6, body);
    canvas.drawCircle(const Offset(64, 12), 2.6, body);
  }

  @override
  bool shouldRepaint(_ButterflyPainter old) => old.color != color || old.accent != accent;
}
