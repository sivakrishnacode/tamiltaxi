import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';

import '../common/trip_routes.dart';
import '../router/routes.dart';
import 'parcel_flow.dart';
import 'passenger_session.dart';
import 'ride_flow.dart';
import 'shifting_flow.dart';

/// Live API: reopens the passenger's unfinished ride or parcel after a restart / sign-in. A trip a flow already
/// follows (e.g. a tapped notification opened it first) is kept as it is.
/// Returns the screen that shows it, or null when there is none (or in mock mode).
Future<String?> restoreActiveTrip(WidgetRef ref) async {
  if (!ref.read(isLiveApiProvider)) return null;
  final current = followedTripRoute(ref);
  if (current != null) return current;
  try {
    final update = await ref.read(liveTripsProvider).active();
    if (update == null) return null;
    return followTrip(ref, update);
  } catch (e) {
    debugPrint('No active trip restored: $e');
    return null;
  }
}

/// Follows [update]'s trip in the ride or parcel flow (a ride or parcel already followed only moves on) and returns
/// the screen that shows it.
String? followTrip(WidgetRef ref, LiveTripUpdate update) {
  if (update.trip.isParcel) {
    ref.read(parcelFlowProvider.notifier).restore(update);
    return routeForParcelPhase(ref.read(parcelFlowProvider).phase);
  }
  ref.read(rideFlowProvider.notifier).restore(update);
  return routeForRidePhase(ref.read(rideFlowProvider).phase);
}

/// The screen of the trip a flow follows now ([tripId]: only that trip), or null when none is followed.
String? followedTripRoute(WidgetRef ref, [String? tripId]) {
  final ride = ref.read(rideFlowProvider);
  if (ref.read(rideFlowProvider.notifier).isFollowing(tripId ?? ride.tripId)) return routeForRidePhase(ride.phase);
  final parcel = ref.read(parcelFlowProvider);
  if (ref.read(parcelFlowProvider.notifier).isFollowing(tripId ?? parcel.tripId)) return routeForParcelPhase(parcel.phase);
  return null;
}

/// A ride or parcel is on, or being booked: a trip the app didn't book must not take over the screen.
bool isBusyWithTrip(WidgetRef ref) {
  final ride = ref.read(rideFlowProvider);
  final parcel = ref.read(parcelFlowProvider);
  return ride.isActive || parcel.isActive || ride.busy || parcel.busy || ref.read(shiftingFlowProvider).busy;
}

/// API statuses of a trip that is on (searching or with a driver): one the app isn't following yet gets followed.
const kOngoingStatuses = {'SEARCHING', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVED', 'IN_PROGRESS', 'PICKED_UP'};

/// Where a tapped trip / chat / nudge notification goes: the trip being followed; a finished trip the app no longer
/// follows (the app was closed) opens its payment and rating (P-19 / PP-10), or its details (P-22) once rated;
/// otherwise the active trip, if any.
Future<String?> routeForTripPush(WidgetRef ref, Map<String, String> data) async {
  if (!ref.read(isLiveApiProvider)) return null;
  final id = data['tripId'];
  if (id != null && id.isNotEmpty) {
    final followed = followedTripRoute(ref, id);
    if (followed != null) return followed;
    if (const {'COMPLETED', 'DELIVERED'}.contains(data['status'])) return openFinishedTrip(ref, id);
  }
  return restoreActiveTrip(ref);
}

/// Where a tapped trip suggestion goes (the API's automations: "Siva, Ooty?" after fares were checked but nothing was
/// booked, or "Going to Tidel Park?" before a usual trip): the trip ready to book, P-35 for outstation, else P-10 with
/// the usual vehicle chosen. The pushed pickup is used for a usual trip, or when the phone's location isn't known
/// yet. Null (stay put) while signed out or a trip is on or being booked.
String? routeForSuggestionPush(WidgetRef ref, Map<String, String> data) {
  if (!ref.read(authRepositoryProvider).isLoggedIn || isBusyWithTrip(ref)) return null;
  final drop = _pushedPlace(data, 'drop');
  if (drop == null) return Routes.search;
  final flow = ref.read(rideFlowProvider.notifier);
  final pickup = _pushedPlace(data, 'pickup');
  if (pickup != null && (data['kind'] == 'routine' || ref.read(rideFlowProvider).pickup.isUnknownPickup)) flow.setPickup(pickup);
  flow.setDrop(drop);
  if (data['mode'] == 'OUTSTATION') {
    flow.startMode(const ModeRequest(mode: RideMode.outstation));
    return Routes.outstation;
  }
  flow.clearMode();
  final vehicle = knownVehicleKind(data['vehicle']);
  if (vehicle != null) flow.selectVehicle(vehicle);
  return Routes.chooseVehicle;
}

/// A place sent in a push as `<prefix>Name`, `<prefix>Address`, `<prefix>Lat`, `<prefix>Lng`; null without a point.
Place? _pushedPlace(Map<String, String> data, String prefix) {
  final lat = double.tryParse(data['${prefix}Lat'] ?? '');
  final lng = double.tryParse(data['${prefix}Lng'] ?? '');
  if (lat == null || lng == null) return null;
  final name = (data['${prefix}Name'] ?? '').trim();
  return Place(
    id: 'push-$prefix-${lat.toStringAsFixed(5)},${lng.toStringAsFixed(5)}',
    name: name.isEmpty ? 'Pinned location' : name,
    address: data['${prefix}Address'] ?? '',
    location: LatLng(lat, lng),
  );
}

/// Where a tapped campaign (a festival or weekend push from the admin) goes: the screen it names, else Home.
String routeForCampaignPush(Map<String, String> data) => switch (data['target']) {
      'OUTSTATION' => Routes.outstation,
      'RENTAL' => Routes.rental,
      'PARCEL' => Routes.parcel,
      _ => Routes.ride,
    };

/// A finished trip from a notification: still to rate (and nothing else on) → its P-19 / PP-10 with the driver and
/// fare; rated, or another trip on → its details (P-22).
Future<String> openFinishedTrip(WidgetRef ref, String tripId) async {
  try {
    final update = await ref.read(liveTripsProvider).poll(tripId);
    final finished = update.status == (update.trip.isParcel ? 'DELIVERED' : 'COMPLETED');
    if (finished && update.trip.rating == null && !isBusyWithTrip(ref)) return followTrip(ref, update) ?? Routes.tripDetails(tripId);
  } catch (e) {
    debugPrint('Finished trip not loaded: $e');
  }
  return Routes.tripDetails(tripId);
}

/// Signs out and forgets everything tied to the account (flows, profile, lists, the socket).
Future<void> signOut(WidgetRef ref) async {
  try {
    await ref.read(authRepositoryProvider).logout();
  } catch (e) {
    debugPrint('Logout: $e');
  }
  resetSignedInState(ref);
}

/// Drops the signed-in state without calling the API (also used when the token is rejected).
void resetSignedInState(WidgetRef ref) {
  if (ref.read(isLiveApiProvider)) ref.read(realtimeProvider).disconnect();
  ref
    ..invalidate(rideFlowProvider)
    ..invalidate(parcelFlowProvider)
    ..invalidate(shiftingFlowProvider)
    ..invalidate(identityProvider)
    ..invalidate(upcomingTripsProvider)
    ..invalidate(passengerProfileProvider)
    ..invalidate(tripHistoryProvider)
    ..invalidate(recentDestinationsProvider)
    ..invalidate(ticketsProvider);
}
