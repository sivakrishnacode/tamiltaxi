import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../repositories/repositories.dart';

/// The API answered with an error. [message] is safe to show (the API writes user-facing messages).
class ApiException implements Exception {
  const ApiException(this.status, this.message, {this.code, this.details = const {}});
  final int status;
  final String message;

  /// Machine-readable reason for errors the app handles specially (e.g. `TOO_FAR`).
  final String? code;
  final Map<String, dynamic> details;

  /// The driver is too far from the pickup / drop and must give a reason to continue.
  TooFar? get tooFar => code == 'TOO_FAR' ? TooFar.fromDetails(details, message) : null;

  /// 403 `DRIVER_TEMP_BLOCKED` from going online: paused for too many cancellations until then.
  DateTime? get tempBlockedUntil => code == 'DRIVER_TEMP_BLOCKED' && details['until'] is String
      ? DateTime.tryParse(details['until'] as String)?.toLocal()
      : null;

  @override
  String toString() => message;
}

/// 422 `TOO_FAR` from `POST /trips/:id/arrived` or `/complete`: resend with `farReason` to continue.
class TooFar {
  const TooFar({required this.stop, required this.distanceM, required this.radiusM, required this.reasons, required this.message});

  factory TooFar.fromDetails(Map<String, dynamic> d, String message) => TooFar(
        stop: d['stop'] == 'drop' ? 'drop' : 'pickup',
        distanceM: (d['distanceM'] as num?)?.round() ?? 0,
        radiusM: (d['radiusM'] as num?)?.round() ?? 0,
        reasons: [for (final r in (d['reasons'] as List? ?? const [])) '$r'],
        message: message,
      );

  /// `pickup` or `drop`.
  final String stop;
  final int distanceM;
  final int radiusM;

  /// Suggested reasons (the driver can also type one, 3–200 characters).
  final List<String> reasons;

  /// e.g. "You're 850 m from the pickup point".
  final String message;
}

/// Signed-in state kept on the device: the access token and (driver app) the driver id.
class ApiSession {
  ApiSession(this._prefs) : tokenChanges = ValueNotifier(_prefs.getString(_tokenKey));
  final SharedPreferences _prefs;

  /// The stored token (null when signed out). Every sign-in, including a new driver token after sign-up, is a
  /// change; push registration follows it.
  final ValueNotifier<String?> tokenChanges;

  static const _tokenKey = 'tamiltaxi.accessToken';
  static const _driverKey = 'tamiltaxi.driverId';
  static const _onboardingKey = 'tamiltaxi.seenOnboarding';

  static Future<ApiSession> load() async => ApiSession(await SharedPreferences.getInstance());

  String? get token => _prefs.getString(_tokenKey);
  String? get driverId => _prefs.getString(_driverKey);
  bool get isLoggedIn => (token ?? '').isNotEmpty;
  bool get hasSeenOnboarding => _prefs.getBool(_onboardingKey) ?? false;

  Future<void> save({required String token, String? driverId}) async {
    await _prefs.setString(_tokenKey, token);
    if (driverId != null) {
      await _prefs.setString(_driverKey, driverId);
    } else {
      await _prefs.remove(_driverKey);
      await _prefs.remove('tamiltaxi.driverStatus');
    }
    tokenChanges.value = token;
  }

  String? get lastDriverStatus => _prefs.getString('tamiltaxi.driverStatus');
  Future<void> saveDriverStatus(String status) =>
      _prefs.setString('tamiltaxi.driverStatus', status);

  Future<void> markOnboardingSeen() => _prefs.setBool(_onboardingKey, true);

  Future<void> clear() async {
    await _prefs.remove(_tokenKey);
    await _prefs.remove(_driverKey);
    await _prefs.remove('tamiltaxi.driverStatus');
    tokenChanges.value = null;
  }
}

/// JSON over HTTP to the Tamil Taxi API with the session's Bearer token.
///
/// Network failures become [OfflineException] (screens already show the offline state for it); API errors become
/// [ApiException] with the API's message. A 401 clears the session and fires [onUnauthorized].
class ApiClient {
  ApiClient({required this.baseUrl, required this.session, this.appVersion, http.Client? client}) : _http = client ?? http.Client();

  final String baseUrl;

  /// Sent as `x-app-version` (driver app from 0.1.2): the server then knows the app can upload the identity documents.
  final String? appVersion;
  final ApiSession session;
  final http.Client _http;
  final _unauthorized = StreamController<void>.broadcast();

  static const _timeout = Duration(seconds: 20);

  /// Fires when the token is rejected (expired, or the account was blocked and signed out).
  Stream<void> get onUnauthorized => _unauthorized.stream;

  /// Origin of the API (for Socket.IO), e.g. `https://api.65-0-233-253.sslip.io`.
  String get origin {
    final u = Uri.parse(baseUrl);
    return '${u.scheme}://${u.host}${u.hasPort ? ':${u.port}' : ''}';
  }

  Future<dynamic> get(String path, {Map<String, Object?>? query}) => _send('GET', path, query: query, canRetry: true);

  /// [idempotent]: safe to send twice (quotes, routes); only those are retried after a dropped connection.
  Future<dynamic> post(String path, [Object? body, bool idempotent = false]) =>
      _send('POST', path, body: body, canRetry: idempotent);
  Future<dynamic> patch(String path, Object? body) => _send('PATCH', path, body: body, canRetry: true);
  Future<dynamic> put(String path, Object? body) => _send('PUT', path, body: body, canRetry: true);
  Future<dynamic> delete(String path) => _send('DELETE', path, canRetry: true);

  /// multipart/form-data upload with one file field (re-uploading replaces the same document, so it is retried).
  Future<dynamic> upload(String path, {required String field, required List<int> bytes, required String filename}) {
    return _guard(() async {
      final req = http.MultipartRequest('POST', _uri(path))
        ..headers.addAll(_headers(json: false))
        ..files.add(http.MultipartFile.fromBytes(field, bytes, filename: filename, contentType: _mediaType(filename)));
      return http.Response.fromStream(await _http.send(req).timeout(const Duration(seconds: 90)));
    }, canRetry: true);
  }

  Uri _uri(String path, [Map<String, Object?>? query]) {
    final q = {for (final e in (query ?? const {}).entries) if (e.value != null) e.key: '${e.value}'};
    return Uri.parse('$baseUrl$path').replace(queryParameters: q.isEmpty ? null : q);
  }

  Map<String, String> _headers({bool json = true}) => {
        if (json) 'content-type': 'application/json',
        'accept': 'application/json',
        if (session.isLoggedIn) 'authorization': 'Bearer ${session.token}',
        'x-app-version': ?appVersion,
      };

  Future<dynamic> _send(String method, String path, {Map<String, Object?>? query, Object? body, required bool canRetry}) {
    return _guard(() {
      final req = http.Request(method, _uri(path, query))..headers.addAll(_headers(json: body != null));
      if (body != null) req.body = jsonEncode(body);
      return _http.send(req).timeout(_timeout).then(http.Response.fromStream);
    }, canRetry: canRetry);
  }

  /// Runs [run]; a connection that drops before any answer (a pooled connection the server or a mobile network
  /// already closed) is retried once on a fresh connection when [canRetry]. Only then is it "offline".
  Future<dynamic> _guard(Future<http.Response> Function() run, {required bool canRetry}) async {
    http.Response res;
    try {
      res = await run();
    } on TimeoutException {
      throw const OfflineException();
    } on Exception catch (e) {
      if (!_isConnectionError(e)) rethrow;
      if (!canRetry) throw const OfflineException();
      try {
        res = await run();
      } on Exception catch (e2) {
        if (_isConnectionError(e2) || e2 is TimeoutException) throw const OfflineException();
        rethrow;
      }
    }
    final ok = res.statusCode >= 200 && res.statusCode < 300;
    final body = res.body.isEmpty ? null : _decode(res.body);
    if (ok) {
      // A success that isn't JSON never came from the API: a captive-portal login page (hotel or station Wi-Fi) or a
      // proxy answered instead. The API wasn't reached, so it is "offline" (screens know how to show that).
      if (body is _NotJson) throw const OfflineException();
      return body;
    }
    if (res.statusCode == 401 && session.isLoggedIn) {
      await session.clear();
      _unauthorized.add(null);
    }
    throw ApiException(
      res.statusCode,
      _message(body) ?? 'Something went wrong (${res.statusCode})',
      code: body is Map ? body['code'] as String? : null,
      details: body is Map && body['details'] is Map ? (body['details'] as Map).cast<String, dynamic>() : const {},
    );
  }

  static bool _isConnectionError(Exception e) =>
      e is SocketException || e is http.ClientException || e is HandshakeException || e is HttpException;

  static dynamic _decode(String text) {
    try {
      return jsonDecode(text);
    } on FormatException {
      return const _NotJson();
    }
  }

  static String? _message(dynamic body) {
    if (body is! Map) return null;
    final m = body['message'];
    if (m is String) return m;
    if (m is List && m.isNotEmpty) return '${m.first}';
    return null;
  }

  static http.MediaType? _mediaType(String filename) {
    final ext = filename.split('.').last.toLowerCase();
    return switch (ext) {
      'jpg' || 'jpeg' => http.MediaType('image', 'jpeg'),
      'png' => http.MediaType('image', 'png'),
      'webp' => http.MediaType('image', 'webp'),
      'pdf' => http.MediaType('application', 'pdf'),
      _ => null,
    };
  }
}

/// A response body that isn't JSON (an HTML error page, a portal's login page).
class _NotJson {
  const _NotJson();
}
