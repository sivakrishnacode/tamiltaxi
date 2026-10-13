import 'package:flutter/painting.dart';

/// Tamil Taxi palette (design system board: docs/design/system). Screens must use these instead of literal colours.
abstract final class TtColors {
  // Primary: coral
  static const coral500 = Color(0xFFF4511E);
  static const coral600 = Color(0xFFD84315);
  static const coral700 = Color(0xFFA8330E);
  static const coral50 = Color(0xFFFFF1EC);
  static const coral100 = Color(0xFFFFDCCF);

  // Secondary: navy
  static const navy900 = Color(0xFF1E293B);
  static const navy700 = Color(0xFF334155);
  static const navy500 = Color(0xFF64748B);
  static const navy300 = Color(0xFFCBD5E1);

  // Neutrals
  static const surface = Color(0xFFFFFFFF);
  static const background = Color(0xFFF8FAFC);
  static const divider = Color(0xFFE2E8F0);
  static const inputBg = Color(0xFFF1F5F9);

  // Status
  static const success = Color(0xFF16A34A);
  static const warning = Color(0xFFF59E0B);
  static const error = Color(0xFFB91C1C);
  static const sos = Color(0xFFDC2626);

  /// Drop markers (the map ring, list pins), like RedTaxi's; the pickup is [success] green.
  static const drop = Color(0xFFDC2626);

  // Status tints (10% fill used by banners and pills)
  static const successTint = Color(0xFFDCFCE7);
  static const successText = Color(0xFF15803D);
  static const warningTint = Color(0xFFFEF3C7);
  static const warningText = Color(0xFF92400E);
  static const errorTint = Color(0xFFFEE2E2);
  static const infoTint = Color(0xFFE2E8F0);

  /// A cool light blue for a tile next to a coral-50 one (Home › Outstation beside Rental), and its edge.
  static const skyTint = Color(0xFFEDF4FD);
  static const sky100 = Color(0xFFD3E4F8);

  // Map style
  static const mapLand = Color(0xFFEEF0F3);
  static const mapRoad = Color(0xFFFFFFFF);
  static const mapWater = Color(0xFFD5E5F1);
  static const mapPark = Color(0xFFDDEBD8);

  /// Butterfly (women riders, women drivers): its own pink so it reads apart from coral. 600 on white is 5.9:1.
  static const butterfly600 = Color(0xFFC2185B);
  static const butterfly400 = Color(0xFFEC6FA5);
  static const butterfly100 = Color(0xFFFBD3E6);
  static const butterfly50 = Color(0xFFFDF0F6);

  /// Illustration skin tone.
  static const skin = Color(0xFFE8B88A);

  /// Soft shadow: y 2, blur 8, navy at 8%.
  static const shadow = Color(0x141E293B);

  /// Scrim behind dialogs / full-height sheets (navy at 32%).
  static const scrim = Color(0x521E293B);
}
