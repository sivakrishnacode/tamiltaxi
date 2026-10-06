import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:latlong2/latlong.dart' show Distance, LengthUnit;
import 'package:tamiltaxi_data/tamiltaxi_data.dart';

/// Helpers shared by the ride and parcel flows when they follow a real trip (live API mode).

/// Average speed of a driver coming to the pickup, for the "Arriving in n min" chip. Matches the API's
/// fallback ETA model (20 km/h), so the passenger sees the same order of magnitude as dispatch used.
const double kApproachSpeedKmh = 20;

/// How often the app asks for the trip while the socket is down (status must still advance).
const Duration kLivePollEvery = Duration(seconds: 8);

/// Where a GPS fix is along a polyline: [progress] is the vertex fraction (0..1, the unit
/// `pointAlong` / `remainingPath` use), [remainingKm] the distance left to the end of the path and
/// [totalKm] the length of the whole path.
typedef PathTrack = ({double progress, double remainingKm, double totalKm});

const Distance _distance = Distance();

/// Snaps [point] to the nearest vertex of [path] and measures what is left of it.
/// ETA comes from this (driver GPS against the stored polyline), never from a Routes call on a timer.
PathTrack trackOnPath(List<LatLng> path, LatLng point) {
  if (path.isEmpty) return (progress: 0, remainingKm: 0, totalKm: 0);
  if (path.length == 1) {
    final km = _distance.as(LengthUnit.Meter, point, path.first) / 1000;
    return (progress: 1, remainingKm: km, totalKm: km);
  }
  var best = 0;
  var bestM = double.infinity;
  for (var i = 0; i < path.length; i++) {
    final m = _distance.as(LengthUnit.Meter, point, path[i]);
    if (m < bestM) {
      bestM = m;
      best = i;
    }
  }
  var metres = bestM;
  var total = 0.0;
  for (var i = 0; i < path.length - 1; i++) {
    final segment = _distance.as(LengthUnit.Meter, path[i], path[i + 1]);
    total += segment;
    if (i >= best) metres += segment;
  }
  return (progress: best / (path.length - 1), remainingKm: metres / 1000, totalKm: total / 1000);
}

/// Whole minutes to cover [km] at [kmh] (at least 1).
int etaMinutes(double km, double kmh) {
  if (kmh <= 0) return 1;
  return _ceilMinutes(km / kmh * 60);
}

/// Minutes left of a trip quoted at [durationMin], from the share of the route still ahead. Scales with the
/// server's duration (road distance, learned speeds) rather than the polyline's own length.
int remainingTripMinutes(PathTrack track, int durationMin) {
  if (track.totalKm <= 0) return math.max(1, durationMin);
  return _ceilMinutes(durationMin * (track.remainingKm / track.totalKm).clamp(0.0, 1.0));
}

/// Rounds up, ignoring floating-point noise (7.000000000001 → 7), and never returns 0.
int _ceilMinutes(double minutes) => math.max(1, (minutes - 1e-6).ceil());

/// Order of the API statuses along a trip (trip JSON has no `updatedAt`, so this orders updates).
int statusRank(String status) => switch (status) {
  'SEARCHING' => 0,
  'NO_DRIVERS' => 1,
  'DRIVER_ASSIGNED' => 2,
  'DRIVER_ARRIVED' => 3,
  'IN_PROGRESS' || 'PICKED_UP' => 4,
  'COMPLETED' || 'DELIVERED' || 'CANCELLED' => 5,
  _ => -1,
};

/// True when [next] would move a trip backwards from [last]: a late answer to an older request. The real
/// backward moves are back to SEARCHING after a driver cancels (or dispatch retries after NO_DRIVERS).
bool isStaleStatus(String next, String? last) {
  if (last == null || next == last) return false;
  if (next == 'SEARCHING' && const {'DRIVER_ASSIGNED', 'DRIVER_ARRIVED', 'NO_DRIVERS'}.contains(last)) return false;
  return statusRank(next) < statusRank(last);
}

/// What to tell the passenger when the server cancelled their trip (not their own cancel). [who] is e.g.
/// "Karthik cancelled the ride" when a driver was on the way. The system cancels after drivers kept dropping the trip
/// (reassign limit): no driver name or note then. Otherwise the driver's note, else their reason code, is added.
String cancelledNotice(LiveTripUpdate u, {required String who, required String bookAgain}) {
  if (u.cancelledBy == CancelledBy.system) {
    return u.cancelCode == CancelCode.noDrivers
        ? "Your driver couldn't make it and no other driver is free. $bookAgain"
        : 'Your trip was cancelled. $bookAgain';
  }
  final note = u.json['cancelReason'];
  final code = u.cancelCode;
  final why = note is String && note.trim().isNotEmpty
      ? note.trim()
      : (code != null && code != CancelCode.other ? code.label : null);
  return '$who${why == null ? '' : ' ($why)'}. $bookAgain';
}

/// A user-facing message for a failed API call.
String apiErrorMessage(Object error) => switch (error) {
  ApiException(:final message) => message,
  OfflineException() => "You're offline. Check your connection and try again.",
  _ => 'Something went wrong. Please try again.',
};

/// Adds a chat message pushed by the server, replacing the local copy of a message the passenger just sent.
/// Pending local messages have ids starting with `local-`.
List<ChatMessage> mergeChat(List<ChatMessage> chat, ChatMessage incoming) {
  if (chat.any((m) => m.id == incoming.id)) return chat;
  if (incoming.fromMe) {
    final i = chat.indexWhere((m) => m.id.startsWith('local-') && m.fromMe && m.text == incoming.text);
    if (i >= 0) return [...chat]..[i] = incoming;
  }
  return [...chat, incoming];
}

/// The server's [history] (in its order) followed by messages still being sent from [current].
List<ChatMessage> chatWithHistory(List<ChatMessage> current, List<ChatMessage> history) {
  var chat = <ChatMessage>[];
  for (final m in history) {
    chat = mergeChat(chat, m);
  }
  final pending = current.where((m) => m.id.startsWith('local-') && !history.any((h) => h.fromMe && h.text == m.text));
  return [...chat, ...pending];
}

/// Follows one real trip: status (`trip.updated` / `trip.no_drivers`), driver GPS and chat over the socket,
/// plus a poll every [kLivePollEvery] while the socket is down and one poll after each reconnect.
class LiveTripSession {
  LiveTripSession({
    required this.trips,
    required this.realtime,
    required this.tripId,
    required this.onUpdate,
    required this.onLocation,
    required this.onMessage,
    this.onReconnect,
  });

  final LiveTrips trips;
  final RealtimeClient realtime;
  final String tripId;
  final void Function(LiveTripUpdate update) onUpdate;
  final void Function(LiveLocation location) onLocation;
  final void Function(ChatMessage message) onMessage;

  /// After the socket reconnects (e.g. reload the chat history, messages may have been missed).
  final VoidCallback? onReconnect;

  final List<StreamSubscription<Object?>> _subs = [];
  Timer? _timer;
  bool _polling = false;
  bool _closed = false;

  /// Pushes received so far; a poll answer is dropped if a push arrived while it was in flight (it may be older).
  int _pushes = 0;

  void start() {
    _subs
      ..add(
        trips.updates(tripId).listen((u) {
          _pushes++;
          onUpdate(u);
        }, onError: _log),
      )
      ..add(trips.locations(tripId).listen(onLocation, onError: _log))
      ..add(trips.messages(tripId).listen(onMessage, onError: _log))
      ..add(
        realtime.connection.listen((up) {
          if (!up) return;
          pollNow();
          onReconnect?.call();
        }),
      );
    _timer = Timer.periodic(kLivePollEvery, (_) {
      if (!realtime.isConnected) pollNow();
    });
  }

  /// Asks the API for the trip now (used by the fallback timer and after a reconnect).
  Future<void> pollNow() async {
    if (_polling || _closed) return;
    _polling = true;
    final pushesBefore = _pushes;
    try {
      final update = await trips.poll(tripId);
      if (!_closed && _pushes == pushesBefore) onUpdate(update);
    } catch (e) {
      _log(e);
    } finally {
      _polling = false;
    }
  }

  void dispose() {
    _closed = true;
    _timer?.cancel();
    for (final s in _subs) {
      s.cancel();
    }
    _subs.clear();
    realtime.leaveTrip(tripId);
  }

  static void _log(Object e) => debugPrint('Live trip: $e');
}
