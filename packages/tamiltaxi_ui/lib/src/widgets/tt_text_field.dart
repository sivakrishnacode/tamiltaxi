
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/tt_colors.dart';
import '../theme/tt_tokens.dart';

/// Labelled text field in the Tamil Taxi style (input-bg fill, 12px radius, coral focus ring).
class TtTextField extends StatelessWidget {
  const TtTextField({
    super.key,
    this.label,
    this.hint,
    this.controller,
    this.initialValue,
    this.onChanged,
    this.onSubmitted,
    this.errorText,
    this.keyboardType,
    this.textInputAction,
    this.prefixIcon,
    this.suffix,
    this.enabled = true,
    this.readOnly = false,
    this.onTap,
    this.maxLines = 1,
    this.autofocus = false,
    this.focusNode,
    this.inputFormatters,
    this.textCapitalization = TextCapitalization.none,
    this.fieldKey,
  });

  final String? label;
  final String? hint;
  final TextEditingController? controller;
  final String? initialValue;
  final ValueChanged<String>? onChanged;

  /// The keyboard's action key (Done, Next…) was pressed.
  final ValueChanged<String>? onSubmitted;
  final String? errorText;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final IconData? prefixIcon;
  final Widget? suffix;
  final bool enabled;
  final bool readOnly;
  final VoidCallback? onTap;
  final int maxLines;
  final bool autofocus;
  final FocusNode? focusNode;
  final List<TextInputFormatter>? inputFormatters;
  final TextCapitalization textCapitalization;
  final Key? fieldKey;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (label != null) ...[
          Text(label!, style: t.bodySmallMedium.copyWith(color: TtColors.navy700)),
          const SizedBox(height: 6),
        ],
        TextFormField(
          key: fieldKey,
          controller: controller,
          initialValue: controller == null ? initialValue : null,
          onChanged: onChanged,
          onFieldSubmitted: onSubmitted,
          keyboardType: keyboardType,
          textInputAction: textInputAction,
          enabled: enabled,
          readOnly: readOnly,
          onTap: onTap,
          maxLines: maxLines,
          autofocus: autofocus,
          focusNode: focusNode,
          inputFormatters: inputFormatters,
          textCapitalization: textCapitalization,
          style: t.body.copyWith(color: enabled ? TtColors.navy900 : TtColors.navy500),
          decoration: InputDecoration(
            hintText: hint,
            errorText: errorText,
            prefixIcon: prefixIcon == null ? null : Icon(prefixIcon, color: TtColors.navy500),
            suffixIcon: suffix,
          ),
        ),
      ],
    );
  }
}
