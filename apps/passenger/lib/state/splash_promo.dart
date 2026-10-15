import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';

/// The admin's splash picture (6j), kept on the phone: P-01 shows it the moment the app opens, and each start fetches
/// the next one ([sync]) for the start after. Every failure means "no picture": the logo intro plays as always.
abstract final class SplashPromo {
  static const _key = 'tamiltaxi.splashPromo';

  /// The picture to show now: on the phone and live at [now].
  static Future<({File file, String title})?> current({DateTime? now}) async {
    try {
      final raw = (await SharedPreferences.getInstance()).getString(_key);
      if (raw == null) return null;
      final saved = jsonDecode(raw) as Map<String, dynamic>;
      final startsAt = DateTime.parse(saved['startsAt'] as String);
      final endsAt = saved['endsAt'] == null ? null : DateTime.parse(saved['endsAt'] as String);
      final at = now ?? DateTime.now();
      if (startsAt.isAfter(at) || (endsAt != null && !endsAt.isAfter(at))) return null;
      final file = File(saved['path'] as String);
      if (!await file.exists()) return null;
      return (file: file, title: saved['title'] as String? ?? '');
    } catch (e) {
      debugPrint('Splash picture unavailable: $e');
      return null;
    }
  }

  /// Keeps the phone's copy in step with the API's [splash]: downloads a new one, removes one that was withdrawn.
  static Future<void> sync(Promo? splash) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_key);
      final saved = raw == null ? null : jsonDecode(raw) as Map<String, dynamic>;
      if (saved != null && saved['id'] == splash?.id) return; // A promo's picture never changes.
      if (splash != null) {
        final dir = Directory('${(await getApplicationSupportDirectory()).path}/splash');
        await dir.create(recursive: true);
        final file = File('${dir.path}/${splash.id}');
        if (!await _download(splash.imageUrl, file)) return;
        await prefs.setString(
          _key,
          jsonEncode({
            'id': splash.id,
            'title': splash.title,
            'path': file.path,
            'startsAt': splash.startsAt.toIso8601String(),
            'endsAt': splash.endsAt?.toIso8601String(),
          }),
        );
      } else {
        await prefs.remove(_key);
      }
      if (saved != null) await File(saved['path'] as String).delete().catchError((_) => File(''));
    } catch (e) {
      debugPrint('Splash picture not updated: $e');
    }
  }

  /// Writes to a temporary file first, so a broken download never replaces a good picture.
  static Future<bool> _download(String url, File to) async {
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 15);
    try {
      final res = await (await client.getUrl(Uri.parse(url))).close();
      if (res.statusCode != 200) return false;
      final bytes = await consolidateHttpClientResponseBytes(res);
      if (bytes.isEmpty) return false;
      final part = File('${to.path}.part');
      await part.writeAsBytes(bytes, flush: true);
      await part.rename(to.path);
      return true;
    } finally {
      client.close();
    }
  }
}
