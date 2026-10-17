import 'package:flutter_overlay_window/flutter_overlay_window.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:permission_handler/permission_handler.dart' as perm;

import '../overlay/offer_alerts.dart';
import 'driver_location.dart';

/// Android permissions that ride requests depend on. D-03c asks for all of them before the driver gets past
/// sign-in (live API); Home shows a banner for the first missing one (besides location, which has its own
/// [LocationAccess] banner) until it's allowed.
enum AppPermission {
  /// Precise location, "while using the app" (the online foreground service keeps it in the background).
  location,

  /// Requests with the app in the background or closed, and the "You're online" notification.
  notifications,

  /// "Display over other apps": the floating bubble and requests popping up over other apps.
  overlay,

  /// Android 14+ "Full-screen notifications": requests light up a locked phone.
  fullScreen,

  /// No battery limits (battery optimisation off): the phone's battery saver doesn't pause requests and GPS.
  battery,
}

/// Reads and asks for the [AppPermission]s (overridable in tests).
class AppPermissionChecker {
  const AppPermissionChecker();

  static const _locator = DriverLocator();

  Future<bool> isGranted(AppPermission p) async {
    try {
      return switch (p) {
        // Unknown (not on this platform): nothing to ask.
        AppPermission.location => !const {
          LocationAccess.denied,
          LocationAccess.deniedForever,
          LocationAccess.approximate,
        }.contains(await _locator.access(service: false)),
        AppPermission.notifications => await perm.Permission.notification.isGranted,
        AppPermission.overlay => await FlutterOverlayWindow.isPermissionGranted(),
        AppPermission.fullScreen => await OfferAlerts.canUseFullScreenIntent(),
        AppPermission.battery => await perm.Permission.ignoreBatteryOptimizations.isGranted,
      };
    } catch (_) {
      return true; // Not on this platform: nothing to ask.
    }
  }

  /// Asks for [p]: the system prompt while Android still shows it, else the matching settings page.
  Future<void> request(AppPermission p) async {
    try {
      switch (p) {
        case AppPermission.location:
          final access = await _locator.access(ask: true, service: false);
          // Refused twice, or precise refused: only the app's settings page can allow it now.
          if (access == LocationAccess.deniedForever || access == LocationAccess.approximate) {
            await _locator.openSettings(LocationFix.appSettings);
          }
        case AppPermission.notifications:
          final status = await perm.Permission.notification.request();
          // Refused twice: Android no longer shows the prompt, only the app's settings page can allow it.
          if (status.isPermanentlyDenied) await perm.openAppSettings();
        case AppPermission.overlay:
          await FlutterOverlayWindow.requestPermission();
        case AppPermission.fullScreen:
          await OfferAlerts.openFullScreenIntentSettings();
        case AppPermission.battery:
          await perm.Permission.ignoreBatteryOptimizations.request();
      }
    } catch (_) {
      // No settings screen on this platform.
    }
  }
}

final appPermissionCheckerProvider = Provider<AppPermissionChecker>((ref) => const AppPermissionChecker());

/// The missing [AppPermission]s, most important first. Refreshed when Home or D-03c opens and whenever the driver
/// comes back to the app (e.g. from a settings page), so the banner goes away and D-03c ticks once allowed.
class MissingPermissionsController extends Notifier<List<AppPermission>> {
  @override
  List<AppPermission> build() => const [];

  Future<void> refresh() async {
    final checker = ref.read(appPermissionCheckerProvider);
    final missing = [
      for (final p in AppPermission.values)
        if (!await checker.isGranted(p)) p,
    ];
    if (ref.mounted) state = missing;
  }

  Future<void> fix(AppPermission p) async {
    await ref.read(appPermissionCheckerProvider).request(p);
    await refresh();
  }
}

final missingPermissionsProvider =
    NotifierProvider<MissingPermissionsController, List<AppPermission>>(MissingPermissionsController.new);
