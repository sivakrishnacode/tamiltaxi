import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart' as geo;
import 'package:permission_handler/permission_handler.dart' as perm;
import 'package:tamiltaxi_data/tamiltaxi_data.dart';

/// Why the driver can't share a location yet. [message] is shown as is.
class LocationProblem implements Exception {
  const LocationProblem(this.message, {this.fix = LocationFix.none});
  final String message;
  final LocationFix fix;

  @override
  String toString() => message;
}

/// What the "Settings" action of a [LocationProblem] opens.
enum LocationFix { none, locationSettings, appSettings }

/// Whether the app may use the phone's location (the Home "Turn on location" banner).
enum LocationAccess {
  unknown,
  granted,

  /// Phone location (GPS) is switched off.
  serviceOff,

  /// "Don't allow": Android will ask again.
  denied,

  /// Android no longer shows the prompt: only the app's settings page can allow it.
  deniedForever,

  /// Allowed, but "Precise location" is off: Android then gives an app one fix about every 10 minutes, so the
  /// driver would go "GPS signal lost" right after going online.
  approximate,
}

class LocationAccessController extends Notifier<LocationAccess> {
  @override
  LocationAccess build() => LocationAccess.unknown;

  void set(LocationAccess access) {
    if (state != access) state = access;
  }
}

final locationAccessProvider = NotifierProvider<LocationAccessController, LocationAccess>(LocationAccessController.new);

/// A GPS fix with the direction of travel (degrees, or null when standing still).
@immutable
class GpsFix {
  const GpsFix(this.point, {this.heading, required this.at, this.accuracy, this.speed, this.isMocked = false});
  final LatLng point;
  final double? heading;
  final DateTime at;

  /// Horizontal accuracy (m) and speed (m/s) as the phone reported them, when known.
  final double? accuracy;
  final double? speed;

  /// Android flagged the position as coming from a mock-location app.
  final bool isMocked;

  /// What goes up to the API.
  DriverFix toUpload() => DriverFix(point, at: at, accuracy: accuracy, speed: speed, heading: heading, isMocked: isMocked);
}

/// The phone's GPS for the live driver session (geolocator). While online the stream runs as an Android
/// foreground service with an ongoing notification, so fixes keep flowing when the app is in the
/// background during a job. Only "while in use" permission is asked for (no background location).
class DriverLocator {
  const DriverLocator();

  /// Checks the location service and permission (asking once), then returns a fresh fix.
  Future<GpsFix> currentFix() async {
    await ensureReady();
    try {
      final p = await geo.Geolocator.getCurrentPosition(
        locationSettings: const geo.LocationSettings(
          accuracy: geo.LocationAccuracy.high,
          timeLimit: Duration(seconds: 10),
        ),
      );
      return _fix(p);
    } on TimeoutException {
      // Indoors a precise fix can take long: the last known position (fused or LocationManager) is good enough.
      final last = await lastKnownFix();
      if (last != null) return last;
      throw const LocationProblem("Couldn't get your location. Move to an open area and try again.");
    } on geo.LocationServiceDisabledException {
      throw const LocationProblem('Turn on Location to go online', fix: LocationFix.locationSettings);
    }
  }

  /// Throws [LocationProblem] when the service is off, permission is missing or only approximate.
  Future<void> ensureReady() async {
    if (!await geo.Geolocator.isLocationServiceEnabled()) {
      throw const LocationProblem('Turn on Location to go online', fix: LocationFix.locationSettings);
    }
    var permission = await geo.Geolocator.checkPermission();
    if (permission == geo.LocationPermission.denied) permission = await geo.Geolocator.requestPermission();
    switch (permission) {
      case geo.LocationPermission.whileInUse || geo.LocationPermission.always:
        if (!await _precise(ask: true)) {
          throw const LocationProblem(
              'Turn on "Use precise location" for Tamil Taxi Driver. With approximate location riders can\'t follow you.',
              fix: LocationFix.appSettings);
        }
      case geo.LocationPermission.denied:
        throw const LocationProblem('Allow location access so riders can find you');
      case geo.LocationPermission.deniedForever:
        throw const LocationProblem('Location access is off for Tamil Taxi Driver. Allow it in Settings to go online.',
            fix: LocationFix.appSettings);
      case geo.LocationPermission.unableToDetermine:
        return;
    }
  }

  /// Whether the permission is for the precise location. With only the approximate one and [ask], asks again:
  /// Android 12+ then shows the "Change to precise location" dialog (until the driver refused it twice).
  Future<bool> _precise({bool ask = false}) async {
    try {
      if (await geo.Geolocator.getLocationAccuracy() != geo.LocationAccuracyStatus.reduced) return true;
      if (!ask) return false;
      await geo.Geolocator.requestPermission();
      return await geo.Geolocator.getLocationAccuracy() != geo.LocationAccuracyStatus.reduced;
    } catch (_) {
      return true; // Not available on this platform / Android version: no approximate mode.
    }
  }

  /// Location access now, asking for the permission first when [ask] and Android still shows the prompt.
  /// [service] false: only the app's permission counts, not whether the phone's Location switch is on.
  Future<LocationAccess> access({bool ask = false, bool service = true}) async {
    try {
      if (service && !await geo.Geolocator.isLocationServiceEnabled()) return LocationAccess.serviceOff;
      var p = await geo.Geolocator.checkPermission();
      if (p == geo.LocationPermission.denied && ask) p = await geo.Geolocator.requestPermission();
      return switch (p) {
        geo.LocationPermission.denied => LocationAccess.denied,
        geo.LocationPermission.deniedForever => LocationAccess.deniedForever,
        _ => await _precise(ask: ask) ? LocationAccess.granted : LocationAccess.approximate,
      };
    } catch (_) {
      return LocationAccess.unknown;
    }
  }

  /// The last fix the phone knows (instant, may be old), or null. Tries the fused provider, then Android's
  /// LocationManager (the fused cache is often empty right after the app starts).
  Future<GpsFix?> lastKnownFix() async {
    for (final forceManager in [false, true]) {
      try {
        final p = await geo.Geolocator.getLastKnownPosition(forceAndroidLocationManager: forceManager);
        if (p != null) return _fix(p);
      } catch (_) {
        // Try the other source.
      }
    }
    return null;
  }

  /// While offline with the app open: a light stream (Wi-Fi / cell, a fix within seconds indoors, no foreground
  /// service or notification) so the map shows where the driver is. The high-accuracy [positions] take over online.
  Stream<GpsFix> previewPositions() => geo.Geolocator.getPositionStream(
        locationSettings: const geo.LocationSettings(accuracy: geo.LocationAccuracy.medium, distanceFilter: 15),
      ).map(_fix);

  /// True when GPS can be used without asking the driver anything (used to resume after a restart).
  Future<bool> isReadyWithoutPrompt() async {
    try {
      if (!await geo.Geolocator.isLocationServiceEnabled()) return false;
      final p = await geo.Geolocator.checkPermission();
      return (p == geo.LocationPermission.whileInUse || p == geo.LocationPermission.always) && await _precise();
    } catch (_) {
      return false;
    }
  }

  /// Android 13+: the foreground-service notification needs POST_NOTIFICATIONS. Denying it only hides
  /// the notification; location keeps working.
  Future<void> requestNotificationPermission() async {
    try {
      await perm.Permission.notification.request();
    } catch (_) {
      // Not available on this platform.
    }
  }

  /// A fix about every 5 s while online (standing still included, so dispatch knows the driver is alive).
  Stream<GpsFix> positions() => geo.Geolocator.getPositionStream(locationSettings: _streamSettings()).map(_fix);

  Future<void> openSettings(LocationFix fix) async {
    try {
      switch (fix) {
        case LocationFix.locationSettings:
          await geo.Geolocator.openLocationSettings();
        case LocationFix.appSettings:
          await geo.Geolocator.openAppSettings();
        case LocationFix.none:
          break;
      }
    } catch (_) {
      // No settings screen on this platform.
    }
  }

  static geo.LocationSettings _streamSettings() {
    if (defaultTargetPlatform == TargetPlatform.android) {
      return geo.AndroidSettings(
        accuracy: geo.LocationAccuracy.high,
        intervalDuration: const Duration(seconds: 5),
        foregroundNotificationConfig: const geo.ForegroundNotificationConfig(
          notificationTitle: "You're online on Tamil Taxi Driver",
          notificationText: 'Sharing your location for ride requests and live tracking',
          notificationChannelName: 'Online status',
          notificationIcon: geo.AndroidResource(name: 'ic_notification', defType: 'drawable'),
          enableWakeLock: true,
          setOngoing: true,
        ),
      );
    }
    return const geo.LocationSettings(accuracy: geo.LocationAccuracy.high);
  }

  static GpsFix _fix(geo.Position p) => GpsFix(
        LatLng(p.latitude, p.longitude),
        heading: p.speed > 1 && p.heading >= 0 ? p.heading : null,
        at: p.timestamp,
        accuracy: p.accuracy > 0 ? p.accuracy : null,
        speed: p.speed >= 0 ? p.speed : null,
        isMocked: p.isMocked,
      );
}

/// The GPS used by the live session (overridable in tests).
final driverLocatorProvider = Provider<DriverLocator>((ref) => const DriverLocator());
