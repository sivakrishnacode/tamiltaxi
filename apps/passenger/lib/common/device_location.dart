import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';

import '../state/parcel_flow.dart';
import '../state/ride_flow.dart';
import '../state/shifting_flow.dart';

/// Outcome of asking for the phone's location.
enum LocateResult {
  /// Location found inside a service city; the pickup was set to it.
  inArea,

  /// Location found but outside the service area; the demo keeps its seeded pickup.
  outsideArea,

  /// Permission denied (once or forever) or location services are off.
  denied,

  /// Not available (e.g. tests, or no GPS fix in time).
  unavailable,
}

/// Whether the app may use the phone's location (drives the "Turn on location" banner).
enum LocationAccess {
  /// Not checked yet.
  unknown,
  granted,

  /// Phone location (GPS) is switched off.
  serviceOff,

  /// "Don't allow": Android will ask again.
  denied,

  /// Android no longer shows the prompt: only the app's settings page can allow it.
  deniedForever,
}

class LocationAccessController extends Notifier<LocationAccess> {
  @override
  LocationAccess build() => LocationAccess.unknown;

  void set(LocationAccess access) {
    if (state != access) state = access;
  }
}

final locationAccessProvider = NotifierProvider<LocationAccessController, LocationAccess>(LocationAccessController.new);

/// The phone's real GPS position (via geolocator), or null until located.
class DeviceLocationController extends Notifier<LatLng?> {
  @override
  LatLng? build() => null;

  /// Asks for permission if needed ([askPermission]), then uses the phone's position: the last known fix right away
  /// (no Gandhipuram placeholder while GPS warms up), then a fresh one. Live API: the pickup is the real location
  /// even outside the service area (the app shows a banner and the API refuses the booking there). Never throws.
  Future<LocateResult> locate({bool askPermission = true}) async {
    final access = ref.read(locationAccessProvider.notifier);
    try {
      if (ref.read(demoSettingsProvider).locationDenied) return LocateResult.denied;
      if (!await Geolocator.isLocationServiceEnabled()) {
        access.set(LocationAccess.serviceOff);
        return LocateResult.denied;
      }
      var perm = await Geolocator.checkPermission();
      // Queued behind any prompt already open (the notification one right after sign-in), which would cancel it.
      if (perm == LocationPermission.denied && askPermission) {
        perm = await PermissionPrompts.run(Geolocator.requestPermission);
      }
      if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
        access.set(perm == LocationPermission.deniedForever ? LocationAccess.deniedForever : LocationAccess.denied);
        return LocateResult.denied;
      }
      access.set(LocationAccess.granted);

      // Last known fix is instant: show it now, then refine with a fresh fix (slow indoors).
      final last = await Geolocator.getLastKnownPosition();
      LocateResult? result;
      if (last != null) result = await _use(LatLng(last.latitude, last.longitude));
      try {
        final pos = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 10)),
        );
        return await _use(LatLng(pos.latitude, pos.longitude));
      } catch (_) {
        return result ?? LocateResult.unavailable;
      }
    } catch (e) {
      debugPrint('Location unavailable: $e');
      return LocateResult.unavailable;
    }
  }

  Future<LocateResult> _use(LatLng point) async {
    state = point;
    final places = ref.read(placesRepositoryProvider);
    final live = places is ApiPlacesRepository;
    // Live API: reverse geocode first; the API's answer also says whether the point is in the service area.
    final geocoded = live ? await places.reverseGeocode(point) : null;
    final inArea = places.isInServiceArea(point);
    // The seeded demo keeps its seeded pickup outside the area; the live app always shows where you are.
    if (!inArea && !live) return LocateResult.outsideArea;
    final place = geocoded ?? await places.reverseGeocode(point);
    final here = place.copyWith(id: 'current', name: 'Current location', address: place.fullAddress);
    // Default pickup everywhere (P-08 "Use current location", new parcel bookings) is the real location.
    if (places is ApiPlacesRepository) places.currentLocation = here;
    // Only where the rider hasn't chosen a pickup themselves (coming back to the app must not move it).
    ref.read(rideFlowProvider.notifier).useDeviceLocation(here);
    if (live) ref.read(parcelFlowProvider.notifier).useDeviceLocation(here);
    // A move being planned (a new one starts from places.currentLocation, set above).
    if (live && ref.exists(shiftingFlowProvider)) ref.read(shiftingFlowProvider.notifier).useDeviceLocation(here);
    return inArea ? LocateResult.inArea : LocateResult.outsideArea;
  }

  /// The banner's / S-05's button: asks again while Android still shows the prompt, else opens the phone's location
  /// settings (GPS off) or this app's settings (after "Don't allow" twice). Then locates.
  Future<LocateResult> fixAccess() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        await Geolocator.openLocationSettings();
        return LocateResult.denied;
      }
      final perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.deniedForever) {
        await Geolocator.openAppSettings();
        return LocateResult.denied;
      }
    } catch (_) {}
    return locate();
  }

  /// S-05 "Open settings": the phone's location settings when location is switched off, else this app's
  /// settings (to allow the permission after "Don't allow").
  Future<void> openSettings() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        await Geolocator.openLocationSettings();
      } else {
        await Geolocator.openAppSettings();
      }
    } catch (_) {}
  }
}

final deviceLocationProvider = NotifierProvider<DeviceLocationController, LatLng?>(DeviceLocationController.new);
