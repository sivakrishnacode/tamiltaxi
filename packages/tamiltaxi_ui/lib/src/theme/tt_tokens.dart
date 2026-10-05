import 'dart:ui' show FontFeature, lerpDouble;

import 'package:flutter/material.dart';

import 'tt_colors.dart';

/// 8pt spacing grid. Const so it can be used inside const widgets.
abstract final class TtSpacing {
  static const double xs = 4;
  static const double s = 8;
  static const double m = 12;
  static const double l = 16;
  static const double xl = 24;
  static const double xxl = 32;

  /// Side padding of every screen.
  static const double gutter = 16;
}

/// Corner radii: 12 cards and inputs, 16 bottom sheets, full-round buttons and chips.
abstract final class TtRadii {
  static const double card = 12;
  static const double sheet = 16;
  static const double pill = 999;

  static const BorderRadius cardRadius = BorderRadius.all(Radius.circular(card));
  static const BorderRadius sheetTop = BorderRadius.vertical(top: Radius.circular(sheet));
  static const BorderRadius pillRadius = BorderRadius.all(Radius.circular(pill));
}

abstract final class TtShadows {
  /// y 2, blur 8, navy at 8%.
  static const List<BoxShadow> soft = [BoxShadow(color: TtColors.shadow, offset: Offset(0, 2), blurRadius: 8)];

  /// Slightly stronger, for floating map controls.
  static const List<BoxShadow> raised = [BoxShadow(color: Color(0x241E293B), offset: Offset(0, 4), blurRadius: 16)];
}

/// Named text styles from the Part 1 type scale. Access with `context.type.h1`.
@immutable
class TtTextStyles {
  const TtTextStyles({
    required this.display,
    required this.h1,
    required this.h2,
    required this.body,
    required this.bodyMedium,
    required this.bodySemibold,
    required this.bodySmall,
    required this.bodySmallMedium,
    required this.caption,
    required this.button,
    required this.overline,
    required this.hero,
    required this.heroSmall,
    required this.otp,
    required this.listTitle,
    required this.listMeta,
    required this.price,
  });

  /// 28/36 Poppins Bold.
  final TextStyle display;

  /// 22/30 Poppins SemiBold.
  final TextStyle h1;

  /// 18/26 Poppins SemiBold.
  final TextStyle h2;

  /// 16/24 Inter Regular.
  final TextStyle body;

  /// 16/24 Inter Medium.
  final TextStyle bodyMedium;

  /// 16/24 Inter SemiBold.
  final TextStyle bodySemibold;

  /// 14/20 Inter Regular.
  final TextStyle bodySmall;

  /// 14/20 Inter Medium.
  final TextStyle bodySmallMedium;

  /// 12/16 Inter Regular.
  final TextStyle caption;

  /// 16/24 Inter SemiBold.
  final TextStyle button;

  /// 12/16 Inter SemiBold, letter-spaced, for section labels ("RECENT TRIP").
  final TextStyle overline;

  /// 56/64 Poppins Bold, tabular: big amounts ("₹38" on P-19, D-15, D-19).
  final TextStyle hero;

  /// 40/48 Poppins Bold, tabular: large amounts in cards ("₹1,420", "₹8,940 this week").
  final TextStyle heroSmall;

  /// 28/34 Poppins SemiBold, tabular: OTP digits and big counters.
  final TextStyle otp;

  /// 15/20 Inter SemiBold: the name in a list row ("Bike", "Race Course"), lighter than [bodySemibold] so a list
  /// reads like the other ride apps'.
  final TextStyle listTitle;

  /// 13/18 Inter Regular, grey: the line under a list row's name ("3 min away · Drop 6:19 PM").
  final TextStyle listMeta;

  /// 16/22 Inter SemiBold, tabular: a fare at the end of a list row ("₹68").
  final TextStyle price;

  /// Adds tabular (fixed-width) figures for fares, OTPs and timers.
  static TextStyle tabular(TextStyle s) =>
      s.copyWith(fontFeatures: const [FontFeature.tabularFigures()]);

  TtTextStyles lerp(TtTextStyles other, double t) => TtTextStyles(
        display: TextStyle.lerp(display, other.display, t)!,
        h1: TextStyle.lerp(h1, other.h1, t)!,
        h2: TextStyle.lerp(h2, other.h2, t)!,
        body: TextStyle.lerp(body, other.body, t)!,
        bodyMedium: TextStyle.lerp(bodyMedium, other.bodyMedium, t)!,
        bodySemibold: TextStyle.lerp(bodySemibold, other.bodySemibold, t)!,
        bodySmall: TextStyle.lerp(bodySmall, other.bodySmall, t)!,
        bodySmallMedium: TextStyle.lerp(bodySmallMedium, other.bodySmallMedium, t)!,
        caption: TextStyle.lerp(caption, other.caption, t)!,
        button: TextStyle.lerp(button, other.button, t)!,
        overline: TextStyle.lerp(overline, other.overline, t)!,
        hero: TextStyle.lerp(hero, other.hero, t)!,
        heroSmall: TextStyle.lerp(heroSmall, other.heroSmall, t)!,
        otp: TextStyle.lerp(otp, other.otp, t)!,
        listTitle: TextStyle.lerp(listTitle, other.listTitle, t)!,
        listMeta: TextStyle.lerp(listMeta, other.listMeta, t)!,
        price: TextStyle.lerp(price, other.price, t)!,
      );
}

/// Theme extension holding spacing, radii, shadows and the named type scale.
@immutable
class TtTokens extends ThemeExtension<TtTokens> {
  const TtTokens({
    required this.text,
    this.spaceXs = TtSpacing.xs,
    this.spaceS = TtSpacing.s,
    this.spaceM = TtSpacing.m,
    this.spaceL = TtSpacing.l,
    this.spaceXl = TtSpacing.xl,
    this.spaceXxl = TtSpacing.xxl,
    this.radiusCard = TtRadii.card,
    this.radiusSheet = TtRadii.sheet,
    this.radiusPill = TtRadii.pill,
    this.shadow = TtShadows.soft,
  });

  /// Named type scale. (Not called `type`: that name is ThemeExtension's lookup key.)
  final TtTextStyles text;
  final double spaceXs;
  final double spaceS;
  final double spaceM;
  final double spaceL;
  final double spaceXl;
  final double spaceXxl;
  final double radiusCard;
  final double radiusSheet;
  final double radiusPill;
  final List<BoxShadow> shadow;

  @override
  TtTokens copyWith({TtTextStyles? text, List<BoxShadow>? shadow}) =>
      TtTokens(text: text ?? this.text, shadow: shadow ?? this.shadow);

  @override
  TtTokens lerp(ThemeExtension<TtTokens>? other, double t) {
    if (other is! TtTokens) return this;
    return TtTokens(
      text: text.lerp(other.text, t),
      spaceXs: lerpDouble(spaceXs, other.spaceXs, t)!,
      spaceS: lerpDouble(spaceS, other.spaceS, t)!,
      spaceM: lerpDouble(spaceM, other.spaceM, t)!,
      spaceL: lerpDouble(spaceL, other.spaceL, t)!,
      spaceXl: lerpDouble(spaceXl, other.spaceXl, t)!,
      spaceXxl: lerpDouble(spaceXxl, other.spaceXxl, t)!,
      radiusCard: lerpDouble(radiusCard, other.radiusCard, t)!,
      radiusSheet: lerpDouble(radiusSheet, other.radiusSheet, t)!,
      radiusPill: lerpDouble(radiusPill, other.radiusPill, t)!,
      shadow: t < 0.5 ? shadow : other.shadow,
    );
  }
}

extension TtThemeContext on BuildContext {
  TtTokens get tokens => Theme.of(this).extension<TtTokens>()!;

  /// Named type scale: `context.type.h1`, `context.type.caption`…
  TtTextStyles get type => tokens.text;
}
