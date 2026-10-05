import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

import 'tt_colors.dart';
import 'tt_transitions.dart';
import 'tt_tokens.dart';

/// Builds the Tamil Taxi Material 3 light theme.
abstract final class TtTheme {
  /// Set to false in tests so no font is fetched over the network.
  static bool useGoogleFonts = true;

  static TextStyle _poppins(double size, double height, FontWeight weight) {
    final base = TextStyle(
      fontSize: size,
      height: height / size,
      fontWeight: weight,
      color: TtColors.navy900,
      letterSpacing: -0.2,
    );
    return useGoogleFonts ? GoogleFonts.poppins(textStyle: base) : base;
  }

  static TextStyle _inter(double size, double height, FontWeight weight) {
    final base = TextStyle(fontSize: size, height: height / size, fontWeight: weight, color: TtColors.navy900);
    return useGoogleFonts ? GoogleFonts.inter(textStyle: base) : base;
  }

  static TtTextStyles textStyles() => TtTextStyles(
        display: _poppins(28, 36, FontWeight.w700),
        h1: _poppins(22, 30, FontWeight.w600),
        h2: _poppins(18, 26, FontWeight.w600),
        body: _inter(16, 24, FontWeight.w400),
        bodyMedium: _inter(16, 24, FontWeight.w500),
        bodySemibold: _inter(16, 24, FontWeight.w600),
        bodySmall: _inter(14, 20, FontWeight.w400).copyWith(color: TtColors.navy700),
        bodySmallMedium: _inter(14, 20, FontWeight.w500),
        caption: _inter(12, 16, FontWeight.w400).copyWith(color: TtColors.navy500),
        button: _inter(16, 24, FontWeight.w600),
        overline: _inter(12, 16, FontWeight.w600).copyWith(color: TtColors.navy500, letterSpacing: 1.2),
        hero: TtTextStyles.tabular(_poppins(56, 64, FontWeight.w700)),
        heroSmall: TtTextStyles.tabular(_poppins(40, 48, FontWeight.w700)),
        otp: TtTextStyles.tabular(_poppins(28, 34, FontWeight.w600)),
        listTitle: _inter(15, 20, FontWeight.w600),
        listMeta: _inter(13, 18, FontWeight.w400).copyWith(color: TtColors.navy500),
        price: TtTextStyles.tabular(_inter(16, 22, FontWeight.w600)),
      );

  static ThemeData light() {
    // Fonts ship in tamiltaxi_ui/assets/google_fonts, so never fetch them at runtime.
    GoogleFonts.config.allowRuntimeFetching = false;
    final t = textStyles();
    const scheme = ColorScheme(
      brightness: Brightness.light,
      primary: TtColors.coral600,
      onPrimary: Colors.white,
      primaryContainer: TtColors.coral50,
      onPrimaryContainer: TtColors.coral600,
      secondary: TtColors.navy900,
      onSecondary: Colors.white,
      secondaryContainer: TtColors.inputBg,
      onSecondaryContainer: TtColors.navy900,
      tertiary: TtColors.coral500,
      onTertiary: Colors.white,
      error: TtColors.error,
      onError: Colors.white,
      errorContainer: TtColors.errorTint,
      onErrorContainer: TtColors.error,
      surface: TtColors.surface,
      onSurface: TtColors.navy900,
      onSurfaceVariant: TtColors.navy500,
      surfaceContainerLowest: TtColors.surface,
      surfaceContainerLow: TtColors.background,
      surfaceContainer: TtColors.background,
      surfaceContainerHigh: TtColors.inputBg,
      surfaceContainerHighest: TtColors.inputBg,
      outline: TtColors.divider,
      outlineVariant: TtColors.divider,
      shadow: TtColors.navy900,
      scrim: TtColors.navy900,
      inverseSurface: TtColors.navy900,
      onInverseSurface: Colors.white,
      inversePrimary: TtColors.coral100,
    );

    final textTheme = TextTheme(
      displayLarge: t.display,
      displayMedium: t.display,
      displaySmall: t.display,
      headlineLarge: t.display,
      headlineMedium: t.h1,
      headlineSmall: t.h1,
      titleLarge: t.h2,
      titleMedium: t.bodySemibold,
      titleSmall: t.bodySmallMedium,
      bodyLarge: t.body,
      bodyMedium: t.bodySmall.copyWith(color: TtColors.navy900),
      bodySmall: t.caption,
      labelLarge: t.button,
      labelMedium: t.bodySmallMedium,
      labelSmall: t.caption.copyWith(fontWeight: FontWeight.w500),
    );

    const pill = StadiumBorder();
    const inputBorder = OutlineInputBorder(borderRadius: TtRadii.cardRadius, borderSide: BorderSide.none);

    return ThemeData(
      useMaterial3: true,
      // One calm slide-and-fade between every screen in both apps (tt_transitions.dart).
      pageTransitionsTheme: ttPageTransitions,
      colorScheme: scheme,
      textTheme: textTheme,
      scaffoldBackgroundColor: TtColors.background,
      canvasColor: TtColors.surface,
      dividerColor: TtColors.divider,
      splashFactory: InkSparkle.splashFactory,
      visualDensity: VisualDensity.standard,
      materialTapTargetSize: MaterialTapTargetSize.padded,
      extensions: [TtTokens(text: t)],
      appBarTheme: AppBarTheme(
        backgroundColor: TtColors.surface,
        foregroundColor: TtColors.navy900,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: t.h2,
        toolbarHeight: 64,
        systemOverlayStyle: SystemUiOverlayStyle.dark.copyWith(statusBarColor: Colors.transparent),
      ),
      dividerTheme: const DividerThemeData(color: TtColors.divider, thickness: 1, space: 1),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: TtColors.coral600,
          foregroundColor: Colors.white,
          disabledBackgroundColor: TtColors.divider,
          disabledForegroundColor: TtColors.navy500,
          minimumSize: const Size(64, 52),
          shape: pill,
          textStyle: t.button,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: TtColors.navy900,
          minimumSize: const Size(64, 52),
          shape: pill,
          side: const BorderSide(color: TtColors.navy900, width: 1.5),
          textStyle: t.button,
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: TtColors.coral600,
          minimumSize: const Size(48, 48),
          shape: pill,
          textStyle: t.button,
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(minimumSize: const Size(48, 48), foregroundColor: TtColors.navy900),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: TtColors.inputBg,
        hintStyle: t.body.copyWith(color: TtColors.navy500),
        labelStyle: t.bodySmall,
        floatingLabelBehavior: FloatingLabelBehavior.never,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: inputBorder,
        enabledBorder: inputBorder,
        focusedBorder: const OutlineInputBorder(
          borderRadius: TtRadii.cardRadius,
          borderSide: BorderSide(color: TtColors.coral600, width: 2),
        ),
        errorBorder: const OutlineInputBorder(
          borderRadius: TtRadii.cardRadius,
          borderSide: BorderSide(color: TtColors.error, width: 2),
        ),
        focusedErrorBorder: const OutlineInputBorder(
          borderRadius: TtRadii.cardRadius,
          borderSide: BorderSide(color: TtColors.error, width: 2),
        ),
        errorStyle: t.caption.copyWith(color: TtColors.error),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: TtColors.surface,
        selectedColor: TtColors.coral50,
        side: const BorderSide(color: TtColors.divider),
        shape: pill,
        labelStyle: t.bodySmallMedium,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith(
            (s) => s.contains(WidgetState.selected) ? Colors.white : TtColors.navy500),
        trackColor: WidgetStateProperty.resolveWith(
            (s) => s.contains(WidgetState.selected) ? TtColors.coral600 : TtColors.inputBg),
        trackOutlineColor: WidgetStateProperty.resolveWith(
            (s) => s.contains(WidgetState.selected) ? TtColors.coral600 : TtColors.navy500),
      ),
      checkboxTheme: CheckboxThemeData(
        fillColor: WidgetStateProperty.resolveWith(
            (s) => s.contains(WidgetState.selected) ? TtColors.coral600 : Colors.transparent),
        side: const BorderSide(color: TtColors.navy500, width: 1.5),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
      ),
      radioTheme: RadioThemeData(
        fillColor: WidgetStateProperty.resolveWith(
            (s) => s.contains(WidgetState.selected) ? TtColors.coral600 : TtColors.navy500),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: TtColors.coral600,
        linearTrackColor: TtColors.coral100,
        circularTrackColor: TtColors.coral100,
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: TtColors.navy900,
        contentTextStyle: t.bodySmallMedium.copyWith(color: Colors.white),
        actionTextColor: TtColors.coral100,
        shape: RoundedRectangleBorder(borderRadius: TtRadii.cardRadius),
        insetPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: TtColors.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        titleTextStyle: t.h2,
        contentTextStyle: t.bodySmall,
        barrierColor: const Color(0x801E293B),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: TtColors.surface,
        surfaceTintColor: Colors.transparent,
        modalBarrierColor: TtColors.scrim,
        shape: RoundedRectangleBorder(borderRadius: TtRadii.sheetTop),
        showDragHandle: false,
      ),
      tabBarTheme: TabBarThemeData(
        labelColor: TtColors.coral600,
        unselectedLabelColor: TtColors.navy500,
        indicatorColor: TtColors.coral600,
        labelStyle: t.bodySmallMedium.copyWith(fontWeight: FontWeight.w600),
        unselectedLabelStyle: t.bodySmallMedium,
        dividerColor: TtColors.divider,
      ),
      listTileTheme: ListTileThemeData(
        iconColor: TtColors.navy700,
        titleTextStyle: t.bodyMedium,
        subtitleTextStyle: t.bodySmall.copyWith(color: TtColors.navy500),
        minVerticalPadding: 12,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16),
      ),
      tooltipTheme: TooltipThemeData(
        decoration: BoxDecoration(color: TtColors.navy900, borderRadius: BorderRadius.circular(8)),
        textStyle: t.caption.copyWith(color: Colors.white),
      ),
    );
  }
}
