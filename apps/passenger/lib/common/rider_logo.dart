import 'package:flutter/material.dart';

/// The Tamil Taxi logo (Clean White: navy car and தமிழ், coral pin and TAXI) on a light background: the splash
/// (P-01), the welcome screen (P-02) and About. The launcher icon and native splashes are built from the same file
/// by scripts/brand_icons.py.
class RiderLogo extends StatelessWidget {
  const RiderLogo({super.key, this.width, this.height});

  /// Set one; the other follows the logo's shape (1024 × 984).
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
        semanticLabel: 'Tamil Taxi',
        // Tests and the first frame: keep the space, no broken-image box.
        errorBuilder: (context, error, stack) => SizedBox(width: width, height: height),
      );
}
