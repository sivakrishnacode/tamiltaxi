import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers.dart';
import 'api_config.dart';

/// A splash or Home banner picture the admin put in the passenger app (`GET /v1/promos`, 6j).
@immutable
class Promo {
  const Promo({
    required this.id,
    required this.title,
    required this.imageUrl,
    required this.startsAt,
    this.linkUrl,
    this.endsAt,
  });

  final String id;

  /// What the picture says (screen readers).
  final String title;
  final String imageUrl;

  /// Banners: opened in the browser on tap. Null = picture only.
  final String? linkUrl;
  final DateTime startsAt;
  final DateTime? endsAt;

  bool isLiveAt(DateTime now) => !startsAt.isAfter(now) && (endsAt == null || endsAt!.isAfter(now));

  /// [baseUrl] is the API's (`…/v1`); the API sends the picture as a path under it.
  static Promo? fromJson(Object? json, {String baseUrl = kApiBaseUrl}) {
    if (json is! Map) return null;
    final id = json['id'];
    final path = json['imagePath'];
    final startsAt = DateTime.tryParse('${json['startsAt']}');
    if (id is! String || path is! String || !path.startsWith('/') || startsAt == null) return null;
    final link = json['linkUrl'];
    return Promo(
      id: id,
      title: json['title'] is String ? json['title'] as String : '',
      imageUrl: '$baseUrl$path',
      linkUrl: link is String && link.startsWith('https://') ? link : null,
      startsAt: startsAt,
      endsAt: json['endsAt'] is String ? DateTime.tryParse(json['endsAt'] as String) : null,
    );
  }
}

/// The splash (live, or starting within 3 days so it can be downloaded early) and the live Home banners, in order.
@immutable
class Promos {
  const Promos({this.splash, this.banners = const []});

  final Promo? splash;
  final List<Promo> banners;

  static const none = Promos();

  factory Promos.fromJson(Object? json, {String baseUrl = kApiBaseUrl}) {
    if (json is! Map) return none;
    final banners = json['banners'];
    return Promos(
      splash: Promo.fromJson(json['splash'], baseUrl: baseUrl),
      banners: [
        if (banners is List)
          for (final b in banners) ?Promo.fromJson(b, baseUrl: baseUrl),
      ],
    );
  }
}

/// Live API: `GET /promos` (public, so it works before sign-in); a failure is fetched again in the background.
/// Mock mode and the Design gallery: none.
final promosProvider = FutureProvider<Promos>((ref) async {
  if (!ref.watch(isLiveApiProvider)) return Promos.none;
  return Promos.fromJson(await ref.watch(apiClientProvider).get('/promos'));
}, retry: backgroundRetry);
