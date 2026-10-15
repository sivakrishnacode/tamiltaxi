import 'dart:async';
import 'dart:convert';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'api_client.dart';

/// Which app this is (the API keeps one device list per app).
enum PushApp { passenger, driver }

/// A notification's data: `type` (trip, chat, offer, kyc, announcement, safety, sos, suggest, campaign), `tripId`,
/// `status`, `channel`.
typedef PushData = Map<String, String>;

/// Android channels; ids match the API's `PushChannel`.
const _channels = [
  AndroidNotificationChannel('ride_requests', 'Ride requests',
      description: 'New ride and delivery requests', importance: Importance.max, playSound: true, enableVibration: true),
  AndroidNotificationChannel('trip_updates', 'Trip updates',
      description: 'Driver assigned, arrived, trip started and finished', importance: Importance.high),
  AndroidNotificationChannel('chat', 'Messages', description: 'Chat during a trip', importance: Importance.high),
  AndroidNotificationChannel('account', 'Account', description: 'Documents, approval and plan', importance: Importance.defaultImportance),
  AndroidNotificationChannel('announcements', 'Announcements', description: 'News and offers from Tamil Taxi', importance: Importance.defaultImportance),
  AndroidNotificationChannel('safety', 'Safety',
      description: 'SOS alerts and "Is everything OK?" checks during a ride', importance: Importance.max, playSound: true, enableVibration: true),
  AndroidNotificationChannel('suggestions', 'Trip suggestions',
      description: 'Reminders about a trip you looked up, your usual rides and festival travel', importance: Importance.defaultImportance),
];

/// Firebase Cloud Messaging for the Tamil Taxi apps.
///
/// - Registers this phone's FCM token with the API (`POST /me/devices`) whenever the session signs in or FCM
///   rotates the token, and subscribes to the announcement topics; on sign-out deletes the token so the old
///   account's pushes stop (the API drops dead tokens).
/// - In the background Android shows notifications itself (they carry a channel id). In the foreground they are
///   shown locally unless [suppress] says the app already shows that event on screen.
/// - Taps (from the tray, a cold start or a foreground notification) arrive on [taps].
///
/// Needs `google-services.json` in `android/app` (without it [create] returns null and the apps run without push)
/// and a white-on-transparent `@drawable/ic_notification` status-bar icon.
class TtPush {
  TtPush._(this._api, this._app);

  final ApiClient _api;
  final PushApp _app;
  final FirebaseMessaging _fcm = FirebaseMessaging.instance;
  final FlutterLocalNotificationsPlugin _local = FlutterLocalNotificationsPlugin();
  final _taps = StreamController<PushData>.broadcast();
  final List<StreamSubscription<Object?>> _subs = [];
  PushData? _launch;

  /// Return true for events the app already shows while open (e.g. the driver's request card).
  bool Function(PushData data)? suppress;

  Stream<PushData> get taps => _taps.stream;

  /// The notification that opened the app from a cold start (read once, after the first screen is up).
  PushData? takeLaunchTap() {
    final tap = _launch;
    _launch = null;
    return tap;
  }

  /// Initialises Firebase and push; null when Firebase isn't configured for this build.
  static Future<TtPush?> create(ApiClient api, {required PushApp app}) async {
    try {
      await Firebase.initializeApp();
    } catch (e) {
      debugPrint('Push off: Firebase not configured ($e)');
      return null;
    }
    final push = TtPush._(api, app);
    await push._start();
    return push;
  }

  List<String> get _topics => ['all', _app == PushApp.driver ? 'drivers' : 'passengers'];

  Future<void> _start() async {
    final android = _local.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    for (final c in _channels) {
      await android?.createNotificationChannel(c);
    }
    await _local.initialize(
      settings: const InitializationSettings(android: AndroidInitializationSettings('@drawable/ic_notification')),
      onDidReceiveNotificationResponse: (r) => _emit(_decode(r.payload)),
    );
    final initial = await _fcm.getInitialMessage();
    if (initial != null) _launch = _dataOf(initial);
    _subs
      ..add(FirebaseMessaging.onMessageOpenedApp.listen((m) => _emit(_dataOf(m))))
      ..add(FirebaseMessaging.onMessage.listen(_onForeground))
      ..add(_fcm.onTokenRefresh.listen((t) => unawaited(_register(t))));
    _api.session.tokenChanges.addListener(_onSession);
    _onSession();
  }

  /// Asks for the notification permission (Android 13+). Call when it makes sense to the user (after sign-in).
  Future<bool> requestPermission() async {
    final settings = await _fcm.requestPermission();
    return settings.authorizationStatus == AuthorizationStatus.authorized ||
        settings.authorizationStatus == AuthorizationStatus.provisional;
  }

  void _onSession() {
    if (_api.session.tokenChanges.value != null) {
      unawaited(_signIn());
    } else {
      unawaited(_signOut());
    }
  }

  Future<void> _signIn() async {
    try {
      await requestPermission();
      final token = await _fcm.getToken();
      if (token != null) await _register(token);
      for (final t in _topics) {
        await _fcm.subscribeToTopic(t);
      }
    } catch (e) {
      debugPrint('Push registration failed: $e');
    }
  }

  Future<void> _register(String token) async {
    if (!_api.session.isLoggedIn) return;
    try {
      await _api.post('/me/devices', {'token': token, 'app': _app == PushApp.driver ? 'DRIVER' : 'PASSENGER', 'platform': 'android'});
    } catch (e) {
      debugPrint('Push token not saved: $e');
    }
  }

  Future<void> _signOut() async {
    try {
      for (final t in _topics) {
        await _fcm.unsubscribeFromTopic(t);
      }
      await _fcm.deleteToken();
    } catch (e) {
      debugPrint('Push sign-out: $e');
    }
  }

  void _onForeground(RemoteMessage m) {
    final data = _dataOf(m);
    final n = m.notification;
    if (n == null || (suppress?.call(data) ?? false)) return;
    final channel = _channels.firstWhere((c) => c.id == data['channel'], orElse: () => _channels[1]);
    unawaited(_local.show(
      id: (data['tripId'] ?? m.messageId ?? '${DateTime.now().millisecondsSinceEpoch}').hashCode & 0x7fffffff,
      title: n.title,
      body: n.body,
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(channel.id, channel.name,
            channelDescription: channel.description,
            importance: channel.importance,
            priority: Priority.high,
            icon: 'ic_notification'),
      ),
      payload: jsonEncode(data),
    ));
  }

  void _emit(PushData data) {
    if (data.isNotEmpty) _taps.add(data);
  }

  static PushData _dataOf(RemoteMessage m) => {for (final e in m.data.entries) e.key: '${e.value}'};

  static PushData _decode(String? payload) {
    if (payload == null || payload.isEmpty) return const {};
    final json = jsonDecode(payload);
    return json is Map ? {for (final e in json.entries) '${e.key}': '${e.value}'} : const {};
  }

  void dispose() {
    _api.session.tokenChanges.removeListener(_onSession);
    for (final s in _subs) {
      unawaited(s.cancel());
    }
    _taps.close();
  }
}
