import 'package:flutter/foundation.dart';
import 'package:in_app_review/in_app_review.dart';

/// Google Play's in-app review sheet: stars and an optional public review, without leaving the app. Google decides
/// whether it shows (only on installs from Play, and only a few times a year per person), so callers just ask after
/// a good moment. Never ask "Do you like the app?" first: Play's rules forbid questions before the sheet.
abstract final class PlayReview {
  /// Never throws: a sheet that can't show is no problem.
  static Future<void> ask() async {
    try {
      final review = InAppReview.instance;
      if (await review.isAvailable()) await review.requestReview();
    } catch (e) {
      debugPrint('Play review not shown: $e');
    }
  }
}
