import 'package:flutter/material.dart';

/// The Tamil Taxi Driver logo (Clean White with DRIVER under TAXI) on a light background: the splash (D-01) and the
/// welcome screen (D-02). The launcher icon, native splashes and the floating bubble are built from the same file by
/// scripts/brand_icons.py.
class DriverLogo extends StatelessWidget {
  const DriverLogo({super.key, this.width, this.height});

  /// Set one; the other follows the logo's shape (954 × 1024).
  final double? width;
  final double? height;

  static const asset = 'assets/brand/logo.png';

  @override
  Widget build(BuildContext context) => Image.asset(
        asset,
        width: width,
        height: height,
        fit: BoxFit.contain,
        filterQuality: FilterQuality.medium,
        semanticLabel: 'Tamil Taxi Driver',
        // Tests and the first frame: keep the space, no broken-image box.
        errorBuilder: (context, error, stack) => SizedBox(width: width, height: height),
      );
}
