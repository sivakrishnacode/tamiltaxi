import 'package:flutter/material.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../../state/registration.dart';

/// Home, until an admin approves the driver (it can't be closed): what is left to go online, and one button to the
/// registration page (D-07). Missing documents: "Verify your documents to go online · 3 left"; all in: "Documents under
/// review"; something rejected: "1 document needs a new upload". [progress] null: still loading (no count).
class VerifyBanner extends StatelessWidget {
  const VerifyBanner({super.key, required this.progress, required this.onVerify});

  final RegistrationProgress? progress;
  final VoidCallback onVerify;

  @override
  Widget build(BuildContext context) {
    final p = progress;
    final errors = p?.errors ?? 0;
    if (errors > 0) {
      return TtBanner(
        type: TtBannerType.error,
        icon: Symbols.error_rounded,
        title: errors == 1 ? '1 document needs a new upload' : '$errors documents need a new upload',
        message: 'Upload it again to go online.',
        actionLabel: 'Fix now',
        onAction: onVerify,
        inlineAction: true,
      );
    }
    if (p != null && p.allIn) {
      return TtBanner(
        type: TtBannerType.warning,
        icon: Symbols.hourglass_top_rounded,
        title: 'Documents under review',
        message: 'You can go online once an admin approves them.',
        actionLabel: 'View',
        onAction: onVerify,
        inlineAction: true,
      );
    }
    return TtBanner(
      type: TtBannerType.warning,
      icon: Symbols.badge_rounded,
      title: 'Verify your documents to go online',
      message: p == null ? 'Use the Meter meanwhile.' : '${p.left} left · use the Meter meanwhile.',
      actionLabel: 'Verify now',
      onAction: onVerify,
      inlineAction: true,
    );
  }
}
