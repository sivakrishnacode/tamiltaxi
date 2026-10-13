import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

/// Navy sign-up app bar: back arrow, title, "Step n of 3" and a coral progress line from the left edge.
class SignupAppBar extends StatelessWidget implements PreferredSizeWidget {
  const SignupAppBar({super.key, required this.title, this.step, this.total = 3, this.onBack, this.showBack = true});

  final String title;

  /// Null hides the step label and the progress line.
  final int? step;
  final int total;
  final VoidCallback? onBack;
  final bool showBack;

  @override
  Size get preferredSize => Size.fromHeight(64 + (step == null ? 0 : 4));

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Material(
        color: TtColors.navy900,
        child: SafeArea(
          bottom: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                height: 64,
                child: Row(
                  children: [
                    if (showBack)
                      IconButton(
                        tooltip: 'Back',
                        icon: const Icon(Symbols.arrow_back_rounded, color: Colors.white),
                        onPressed: onBack ?? () => Navigator.of(context).maybePop(),
                      )
                    else
                      const SizedBox(width: TtSpacing.l),
                    Expanded(
                      child: Text(title,
                          style: t.h1.copyWith(color: Colors.white), maxLines: 1, overflow: TextOverflow.ellipsis),
                    ),
                    if (step != null)
                      Padding(
                        padding: const EdgeInsets.only(right: TtSpacing.l, left: TtSpacing.s),
                        child: Text('Step $step of $total',
                            style: t.bodySmallMedium.copyWith(color: TtColors.navy300)),
                      ),
                  ],
                ),
              ),
              if (step != null)
                // Full width: in the centred Column a width-less box shrank to the coral part and sat in the middle.
                SizedBox(
                  height: 4,
                  width: double.infinity,
                  child: Stack(
                    children: [
                      const Positioned.fill(child: ColoredBox(color: TtColors.navy700)),
                      FractionallySizedBox(
                        alignment: AlignmentDirectional.centerStart,
                        widthFactor: step! / total,
                        heightFactor: 1,
                        child: const ColoredBox(color: TtColors.coral500),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Back handler for sign-up screens reached with `go` (nothing to pop): go to [fallback].
VoidCallback backOr(BuildContext context, String fallback) => () {
      if (context.canPop()) {
        context.pop();
      } else {
        context.go(fallback);
      }
    };

/// Flat "orb" for navy headers (D-02, D-10, D-12b, S-10): navy-700 outer circle, a coloured
/// inner circle and a centred [child]. Optional accent dots.
class DriverOrb extends StatelessWidget {
  const DriverOrb({
    super.key,
    required this.color,
    required this.child,
    this.size = 160,
    this.dots = false,
    this.innerFactor = 0.7,
  });

  final Color color;
  final Widget child;
  final double size;
  final bool dots;
  final double innerFactor;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: size,
        height: size,
        child: Stack(
          alignment: Alignment.center,
          clipBehavior: Clip.none,
          children: [
            Container(
                width: size,
                height: size,
                decoration: const BoxDecoration(color: TtColors.navy700, shape: BoxShape.circle)),
            Container(
              width: size * innerFactor,
              height: size * innerFactor,
              decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            ),
            child,
            if (dots) ...[
              Positioned(top: size * 0.14, left: size * 0.08, child: _dot(size * 0.09, TtColors.coral500)),
              Positioned(bottom: size * 0.12, right: size * 0.1, child: _dot(size * 0.06, TtColors.coral100)),
            ],
          ],
        ),
      );

  Widget _dot(double d, Color c) =>
      Container(width: d, height: d, decoration: BoxDecoration(color: c, shape: BoxShape.circle));
}

/// A circle drawn with dashes (face guides on D-09 / S-13, photo circle on D-06).
class DashedRing extends StatelessWidget {
  const DashedRing({
    super.key,
    required this.size,
    required this.child,
    this.color = TtColors.coral500,
    this.strokeWidth = 3,
    this.dash = 10,
    this.gap = 6,
  });

  final double size;
  final Widget child;
  final Color color;
  final double strokeWidth;
  final double dash;
  final double gap;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: size,
        height: size,
        child: CustomPaint(
          painter: _DashedCirclePainter(color: color, strokeWidth: strokeWidth, dash: dash, gap: gap),
          child: Center(child: child),
        ),
      );
}

class _DashedCirclePainter extends CustomPainter {
  _DashedCirclePainter({required this.color, required this.strokeWidth, required this.dash, required this.gap});

  final Color color;
  final double strokeWidth;
  final double dash;
  final double gap;

  @override
  void paint(Canvas canvas, Size size) {
    final r = (math.min(size.width, size.height) - strokeWidth) / 2;
    final c = size.center(Offset.zero);
    final paint = Paint()
      ..color = color
      ..strokeWidth = strokeWidth
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    final circumference = 2 * math.pi * r;
    final count = (circumference / (dash + gap)).floor();
    final sweep = (dash / circumference) * 2 * math.pi;
    final step = 2 * math.pi / count;
    final rect = Rect.fromCircle(center: c, radius: r);
    for (var i = 0; i < count; i++) {
      canvas.drawArc(rect, -math.pi / 2 + i * step, sweep, false, paint);
    }
  }

  @override
  bool shouldRepaint(_DashedCirclePainter old) =>
      old.color != color || old.strokeWidth != strokeWidth || old.dash != dash || old.gap != gap;
}

/// Pill with a leading icon (document statuses on D-07 / S-09).
class IconPill extends StatelessWidget {
  const IconPill({super.key, required this.label, required this.icon, required this.bg, required this.fg});

  final String label;
  final IconData icon;
  final Color bg;
  final Color fg;

  @override
  Widget build(BuildContext context) => Container(
        height: 36,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        decoration: BoxDecoration(color: bg, borderRadius: TtRadii.pillRadius),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 18, color: fg, fill: 1),
            const SizedBox(width: 6),
            Text(label, style: context.type.bodySmallMedium.copyWith(color: fg, fontWeight: FontWeight.w600)),
          ],
        ),
      );
}

/// Navy header used by the document screens (D-07, S-09): app bar row, a summary line
/// and a segmented progress bar.
class DocsHeader extends StatelessWidget {
  const DocsHeader({
    super.key,
    required this.title,
    required this.summary,
    required this.segments,
    this.trailing,
    this.trailingColor = TtColors.navy300,
    this.onBack,
    this.onHelp,
    this.showBack = true,
  });

  final String title;
  final String summary;

  /// False on the registration page (the first page after the OTP: nothing to go back to).
  final bool showBack;

  /// Shows a "Help" button at the top right (stuck on a document → support), like Namma Yatri's checklist.
  final VoidCallback? onHelp;
  final String? trailing;
  final Color trailingColor;
  final VoidCallback? onBack;

  /// (flex, colour) segments of the progress bar; the rest is navy-700.
  final List<(double, Color)> segments;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final filled = segments.fold<double>(0, (a, s) => a + s.$1);
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Material(
        color: TtColors.navy900,
        child: SafeArea(
          bottom: false,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(
                height: 64,
                child: Row(
                  children: [
                    if (showBack)
                      IconButton(
                        tooltip: 'Back',
                        icon: const Icon(Symbols.arrow_back_rounded, color: Colors.white),
                        onPressed: onBack ?? () => Navigator.of(context).maybePop(),
                      )
                    else
                      const SizedBox(width: TtSpacing.l),
                    Expanded(
                      child: Text(title,
                          style: t.h1.copyWith(color: Colors.white), maxLines: 1, overflow: TextOverflow.ellipsis),
                    ),
                    if (onHelp != null)
                      Padding(
                        padding: const EdgeInsets.only(right: TtSpacing.s),
                        child: TextButton.icon(
                          onPressed: onHelp,
                          style: TextButton.styleFrom(
                            foregroundColor: Colors.white,
                            backgroundColor: TtColors.navy700,
                            shape: const StadiumBorder(),
                            minimumSize: const Size(48, 40),
                          ),
                          icon: const Icon(Symbols.help_rounded, size: 18),
                          label: const Text('Help'),
                        ),
                      ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(TtSpacing.l, TtSpacing.xs, TtSpacing.l, TtSpacing.l),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        Expanded(child: Text(summary, style: t.h2.copyWith(color: Colors.white))),
                        if (trailing != null)
                          Text(trailing!, style: t.bodySmall.copyWith(color: trailingColor)),
                      ],
                    ),
                    const SizedBox(height: TtSpacing.m),
                    ClipRRect(
                      borderRadius: TtRadii.pillRadius,
                      child: SizedBox(
                        height: 8,
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            for (final s in segments)
                              if (s.$1 > 0) Expanded(flex: (s.$1 * 1000).round(), child: ColoredBox(color: s.$2)),
                            if (filled < 1)
                              Expanded(
                                flex: ((1 - filled) * 1000).round(),
                                child: const ColoredBox(color: TtColors.navy700),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Bottom-pinned action area with safe-area padding.
class BottomActions extends StatelessWidget {
  const BottomActions({super.key, required this.children, this.color});

  final List<Widget> children;
  final Color? color;

  @override
  Widget build(BuildContext context) => ColoredBox(
        color: color ?? Colors.transparent,
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(TtSpacing.l, TtSpacing.m, TtSpacing.l, TtSpacing.m),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
          ),
        ),
      );
}

/// Navy header for D-03a / D-03b: back arrow, big title and a subtitle line.
class AuthHeader extends StatelessWidget {
  const AuthHeader({super.key, required this.title, required this.subtitle});

  final String title;
  final Widget subtitle;

  @override
  Widget build(BuildContext context) => AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.light,
        child: Material(
          color: TtColors.navy900,
          child: SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(TtSpacing.xs, TtSpacing.s, TtSpacing.l, TtSpacing.xl),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  IconButton(
                    tooltip: 'Back',
                    icon: const Icon(Symbols.arrow_back_rounded, color: Colors.white),
                    onPressed: () => Navigator.of(context).maybePop(),
                  ),
                  const SizedBox(height: TtSpacing.m),
                  Padding(
                    padding: const EdgeInsets.only(left: TtSpacing.m),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(title, style: context.type.display.copyWith(color: Colors.white)),
                        const SizedBox(height: TtSpacing.s),
                        subtitle,
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
}
