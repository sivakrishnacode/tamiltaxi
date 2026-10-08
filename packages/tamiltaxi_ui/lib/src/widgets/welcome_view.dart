import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/tt_colors.dart';
import '../theme/tt_tokens.dart';
import 'tt_button.dart';

/// The welcome screen both apps open on before sign-in: a soft coral panel with the [brand] row and one picture,
/// then [title], [body] and a single "Continue with phone number" button. The picture rises and fades in once
/// ([animate] false, or system animations off, shows it at once: Design gallery, screenshots).
class TtWelcomeView extends StatefulWidget {
  const TtWelcomeView({
    super.key,
    required this.brand,
    required this.image,
    required this.semanticLabel,
    required this.title,
    required this.body,
    required this.onContinue,
    this.animate = true,
  });

  final Widget brand;
  final ImageProvider image;
  final String semanticLabel;
  final String title;
  final String body;
  final VoidCallback? onContinue;
  final bool animate;

  @override
  State<TtWelcomeView> createState() => _TtWelcomeViewState();
}

class _TtWelcomeViewState extends State<TtWelcomeView> with SingleTickerProviderStateMixin {
  late final AnimationController _enter = AnimationController(vsync: this, duration: const Duration(milliseconds: 700));
  late final Animation<double> _in = CurvedAnimation(parent: _enter, curve: Curves.easeOutCubic);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final still = !widget.animate || (MediaQuery.maybeDisableAnimationsOf(context) ?? false);
    if (still) {
      _enter.value = 1;
    } else if (_enter.isDismissed) {
      _enter.forward();
    }
  }

  @override
  void dispose() {
    _enter.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark,
      child: Scaffold(
        backgroundColor: TtColors.surface,
        body: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: DecoratedBox(
                decoration: const BoxDecoration(
                  color: TtColors.coral50,
                  borderRadius: BorderRadius.vertical(bottom: Radius.circular(28)),
                ),
                child: SafeArea(
                  bottom: false,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(TtSpacing.l, TtSpacing.m, TtSpacing.l, 0),
                        child: widget.brand,
                      ),
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(TtSpacing.l, TtSpacing.xl, TtSpacing.l, TtSpacing.xl),
                          child: AnimatedBuilder(
                            animation: _in,
                            builder: (context, child) => Opacity(
                              opacity: _in.value,
                              child: Transform.translate(offset: Offset(0, 16 * (1 - _in.value)), child: child),
                            ),
                            child: Image(
                              image: widget.image,
                              semanticLabel: widget.semanticLabel,
                              fit: BoxFit.contain,
                              alignment: const Alignment(0, 0.3),
                              filterQuality: FilterQuality.medium,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(TtSpacing.l, TtSpacing.xl, TtSpacing.l, TtSpacing.l),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _BalancedText(widget.title, style: t.display),
                    const SizedBox(height: TtSpacing.s),
                    _BalancedText(widget.body, style: t.body.copyWith(color: TtColors.navy700)),
                    const SizedBox(height: TtSpacing.xl),
                    TtButton(label: 'Continue with phone number', onPressed: widget.onContinue),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Text that wraps into even lines, like CSS `text-wrap: balance`: laid out at the narrowest width that keeps the
/// same number of lines, so no line ends with one lonely word at any screen width or text size.
class _BalancedText extends StatefulWidget {
  const _BalancedText(this.text, {required this.style});
  final String text;
  final TextStyle style;

  @override
  State<_BalancedText> createState() => _BalancedTextState();
}

class _BalancedTextState extends State<_BalancedText> {
  // Bundled fonts can finish loading after the first frame: measure again then, as Text itself does.
  void _fontsChanged() => setState(() {});

  @override
  void initState() {
    super.initState();
    PaintingBinding.instance.systemFonts.addListener(_fontsChanged);
  }

  @override
  void dispose() {
    PaintingBinding.instance.systemFonts.removeListener(_fontsChanged);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scaler = MediaQuery.textScalerOf(context);
    final direction = Directionality.of(context);
    // Measure with the style Text will draw with (it merges the inherited default style).
    final drawn = DefaultTextStyle.of(context).style.merge(widget.style);
    return LayoutBuilder(
      builder: (context, c) {
        int lines(double width) {
          final painter = TextPainter(
            text: TextSpan(text: widget.text, style: drawn),
            textDirection: direction,
            textScaler: scaler,
          )..layout(maxWidth: width);
          final count = painter.computeLineMetrics().length;
          painter.dispose();
          return count;
        }

        var width = c.maxWidth;
        final count = lines(width);
        if (count > 1) {
          var narrow = width / 2;
          for (var i = 0; i < 12; i++) {
            final mid = (narrow + width) / 2;
            if (lines(mid) > count) {
              narrow = mid;
            } else {
              width = mid;
            }
          }
        }
        return SizedBox(width: (width + 1).clamp(0, c.maxWidth), child: Text(widget.text, style: drawn));
      },
    );
  }
}
