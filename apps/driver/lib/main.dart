import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';

import 'app_version.dart';
import 'app.dart';
import 'overlay/driver_overlay_app.dart';
import 'overlay/offer_alerts.dart';

/// Entry point of the floating overlay (flutter_overlay_window runs it in its own engine): the Tamil Taxi bubble
/// and the full-screen request card shown over other apps while online.
@pragma('vm:entry-point')
void overlayMain() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const DriverOverlayApp());
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  if (!kUseLiveApi) {
    // Seed data + trip simulator (--dart-define=TT_LIVE_API=false). Road-following routes for the demo
    // trips (falls back to curved lines offline).
    RoadRouter.prefetchDemoRoutes();
    runApp(const ProviderScope(child: TtDriverApp()));
    return;
  }
  // Tamil Taxi API: repositories over HTTP, offers and job updates over Socket.IO, routes from the backend
  // (no Google key in the app). A 401 sends the driver back to log in (see TtDriverApp).
  TtClock.useRealDate();
  final session = await ApiSession.load();
  final api = ApiClient(baseUrl: kApiBaseUrl, session: session, appVersion: kDriverAppVersion);
  RoadRouter.backend = backendRouter(api);
  // Push notifications (FCM): requests reach the driver with the app in the background or closed.
  final push = await TtPush.create(api, app: PushApp.driver);
  if (push != null) {
    // Ride requests with the app in the background or closed: re-posted with a full-screen intent.
    FirebaseMessaging.onBackgroundMessage(driverBackgroundPush);
  }
  // TtPush owns the notification plugin (and its tap callback) when Firebase is set up.
  await OfferAlerts.ensureReady(initialise: push == null);
  runApp(ProviderScope(overrides: liveApiOverrides(api, push: push), child: const TtDriverApp()));
}
