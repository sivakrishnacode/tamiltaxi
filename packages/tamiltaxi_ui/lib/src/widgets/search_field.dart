
import 'package:flutter/material.dart';
import 'package:material_symbols_icons/symbols.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart' show kMinPlaceQuery;

import '../theme/tt_colors.dart';
import '../theme/tt_tokens.dart';

/// Search field with a coral location icon and an optional mic. In [readOnly] mode the
/// whole field is a button that calls [onTap] (P-07 "Where are you going?").
class SearchField extends StatelessWidget {
  const SearchField({
    super.key,
    required this.hint,
    this.controller,
    this.onChanged,
    this.onTap,
    this.readOnly = false,
    this.autofocus = false,
    this.leadingIcon = Symbols.location_on_rounded,
    this.leadingColor = TtColors.coral500,
    this.showMic = true,
    this.large = false,
    this.focusNode,
  });

  final String hint;
  final TextEditingController? controller;
  final ValueChanged<String>? onChanged;
  final VoidCallback? onTap;
  final bool readOnly;
  final bool autofocus;
  final IconData leadingIcon;
  final Color leadingColor;
  final bool showMic;

  /// Large variant (P-07 Home): 52 dp tall, 16 sp semibold hint in ink, like the other ride apps' "Where to?".
  final bool large;
  final FocusNode? focusNode;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final style = large ? t.bodySemibold : t.body;
    return Semantics(
      button: readOnly,
      label: readOnly ? hint : null,
      child: TextField(
        controller: controller,
        onChanged: onChanged,
        onTap: onTap,
        readOnly: readOnly,
        autofocus: autofocus,
        focusNode: focusNode,
        style: style,
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: style.copyWith(color: large ? TtColors.navy900 : TtColors.navy500),
          contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: large ? 14 : 12),
          prefixIcon: Icon(leadingIcon, color: leadingColor, fill: 1, size: large ? 22 : 24),
          suffixIcon: showMic
              ? IconButton(
                  tooltip: 'Voice search',
                  onPressed: () => ScaffoldMessenger.maybeOf(context)
                    ?..hideCurrentSnackBar()
                    ..showSnackBar(const SnackBar(content: Text('Listening… say a place name'))),
                  icon: const Icon(Symbols.mic_rounded, color: TtColors.navy500),
                )
              : null,
        ),
      ),
    );
  }
}

/// "Type at least 4 letters to search": the quiet line a place search shows while the text is shorter than
/// [kMinPlaceQuery] (live search starts there; recent and saved places stay listed meanwhile).
class SearchMinLengthHint extends StatelessWidget {
  const SearchMinLengthHint({super.key, this.padding = const EdgeInsets.symmetric(vertical: 10)});
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Padding(
      padding: padding,
      child: Row(
        children: [
          const Icon(Symbols.keyboard_rounded, size: 18, color: TtColors.navy500),
          const SizedBox(width: 8),
          Expanded(
            child: Text('Type at least $kMinPlaceQuery letters to search', style: t.bodySmall.copyWith(color: TtColors.navy500)),
          ),
        ],
      ),
    );
  }
}
