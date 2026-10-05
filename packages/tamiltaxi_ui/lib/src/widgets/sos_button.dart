import 'package:flutter/material.dart';
import 'package:material_symbols_icons/symbols.dart';

import '../theme/tt_colors.dart';
import '../theme/tt_tokens.dart';

/// SOS button: a filled #DC2626 circle with a white icon and the label "SOS" (trip screens). [quiet] is the Home
/// form before a trip: a white map button with the red icon, like the other map buttons, so it is there without
/// shouting.
class SosButton extends StatelessWidget {
  const SosButton({super.key, required this.onPressed, this.size = 64, this.quiet = false});

  final VoidCallback onPressed;
  final double size;
  final bool quiet;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'SOS emergency help',
      excludeSemantics: true,
      child: quiet ? _quiet() : Material(
        key: const ValueKey('sos-button'),
        color: TtColors.sos,
        shape: const CircleBorder(),
        elevation: 4,
        shadowColor: const Color(0x66DC2626),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onPressed,
          child: SizedBox(
            width: size,
            height: size,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Symbols.e911_emergency_rounded, fill: 1, color: Colors.white, size: size * 0.36),
                Text(
                  'SOS',
                  style: context.type.caption.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: size * 0.2,
                    height: 1.1,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _quiet() => Material(
        key: const ValueKey('sos-button'),
        color: TtColors.surface,
        shape: const CircleBorder(),
        elevation: 3,
        shadowColor: TtColors.shadow,
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onPressed,
          child: SizedBox(
            width: size,
            height: size,
            child: Icon(Symbols.e911_emergency_rounded, fill: 1, color: TtColors.sos, size: size * 0.5),
          ),
        ),
      );
}
