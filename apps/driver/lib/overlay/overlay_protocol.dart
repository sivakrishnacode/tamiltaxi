import 'package:flutter/foundation.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart' show VehicleKindUi;

/// Messages between the app (main isolate) and the floating overlay (its own engine / isolate, see
/// `overlayMain`), sent with `FlutterOverlayWindow.shareData` as JSON maps. The overlay only draws; every
/// API call stays in the app.
///
/// App → overlay: `{cmd: bubble}` (collapse to the bubble), `{cmd: offer, offer: {…}, others: [{…}]}` (full-screen
/// request card; with [others] the comparison list of every open request), `{cmd: accepting}`, `{cmd: error, message}`.
/// Overlay → app: `{action: ready}`, `{action: open}` (bubble tapped), `{action: accept | decline | timeout, id}`.
abstract final class OverlayMsg {
  static const cmd = 'cmd';
  static const action = 'action';

  static const bubble = 'bubble';
  static const offer = 'offer';
  static const accepting = 'accepting';
  static const error = 'error';

  static const ready = 'ready';
  static const open = 'open';
  static const accept = 'accept';
  static const decline = 'decline';
  static const timeout = 'timeout';
}

/// What the overlay's request card shows (a [RideRequest] reduced to JSON-safe values).
@immutable
class OverlayOffer {
  const OverlayOffer({
    required this.id,
    required this.fare,
    required this.vehicle,
    required this.vehicleLabel,
    required this.isDelivery,
    required this.pickupName,
    required this.dropName,
    required this.pickupKm,
    required this.pickupEtaMin,
    required this.tripKm,
    required this.tripMin,
    required this.customerName,
    required this.expiresAtMs,
    this.pickupAddress = '',
    this.dropAddress = '',
    this.pickupLandmark,
    this.rating = 4.8,
    this.womenDriver = WomenDriverPref.none,
    this.extra = 0,
    this.rideMode = RideMode.local,
    this.modeTerms,
    this.scheduledAt,
    this.shifting,
    this.parcel,
    this.bookedBy,
  });

  factory OverlayOffer.fromRequest(RideRequest r, DateTime expiresAt) =>
      OverlayOffer(
        id: r.id,
        fare: r.fare,
        vehicle: r.vehicle,
        vehicleLabel: r.vehicle.label,
        isDelivery: r.isDelivery,
        pickupName: r.pickup.name,
        dropName: r.drop.name,
        pickupKm: r.pickupDistanceKm,
        pickupEtaMin: r.pickupEtaMin,
        tripKm: r.tripKm,
        tripMin: r.tripMin,
        customerName: r.customerName,
        expiresAtMs: expiresAt.millisecondsSinceEpoch,
        pickupAddress: r.pickup.address,
        dropAddress: r.drop.address,
        pickupLandmark: r.pickup.landmark,
        rating: r.customerRating,
        womenDriver: r.womenDriver,
        extra: r.extra,
        rideMode: r.rideMode,
        modeTerms: r.modeTerms,
        scheduledAt: r.scheduledAt,
        shifting: r.shifting,
        parcel: r.parcel,
        bookedBy: r.bookedBy,
      );

  /// Null when [json] isn't an offer (e.g. a message from an older build).
  static OverlayOffer? fromJson(Object? json) {
    if (json is! Map) return null;
    final id = json['id'];
    if (id is! String || id.isEmpty) return null;
    num n(String k) => json[k] is num ? json[k] as num : 0;
    String s(String k) => json[k] is String ? json[k] as String : '';
    return OverlayOffer(
      id: id,
      fare: n('fare').round(),
      vehicle: VehicleKind.values.firstWhere((v) => v.name == json['vehicle'], orElse: () => VehicleKind.bike),
      vehicleLabel: s('vehicleLabel'),
      isDelivery: json['isDelivery'] == true,
      pickupName: s('pickupName'),
      dropName: s('dropName'),
      pickupKm: n('pickupKm').toDouble(),
      pickupEtaMin: n('pickupEtaMin').round(),
      tripKm: n('tripKm').toDouble(),
      tripMin: n('tripMin').round(),
      customerName: s('customerName'),
      expiresAtMs: n('expiresAtMs').round(),
      pickupAddress: s('pickupAddress'),
      dropAddress: s('dropAddress'),
      pickupLandmark: s('pickupLandmark').isEmpty ? null : s('pickupLandmark'),
      rating: json['rating'] is num ? (json['rating'] as num).toDouble() : 4.8,
      womenDriver:
          WomenDriverPref.values.asNameMap()[json['womenDriver']] ??
          (json['isWomenOnly'] == true
              ? WomenDriverPref.only
              : WomenDriverPref.none),
      extra: n('extra').round(),
      rideMode: RideMode.values.asNameMap()[json['rideMode']] ?? RideMode.local,
      modeTerms: ModeTerms.fromJson(json['modeTerms']),
      scheduledAt: json['scheduledAtMs'] is num
          ? DateTime.fromMillisecondsSinceEpoch(
              (json['scheduledAtMs'] as num).round(),
            )
          : null,
      shifting: ShiftingDetails.fromJson(json['shifting']),
      parcel: json['parcel'] is Map
          ? parcelFromJson(
              Map<String, dynamic>.from(json['parcel'] as Map),
              otp: '',
            )
          : null,
      bookedBy: json['bookedBy'] as String?,
    );
  }

  final String pickupAddress;
  final String dropAddress;
  final String? pickupLandmark;
  final double rating;
  final WomenDriverPref womenDriver;

  /// Part of [fare] the rider added ("₹50 + ₹20").
  final int extra;

  /// Rental / outstation and what it agreed to; the pickup time of a trip booked ahead.
  final RideMode rideMode;
  final ModeTerms? modeTerms;
  final DateTime? scheduledAt;

  /// House shifting: the home, items, floors and the team.
  final ShiftingDetails? shifting;
  final ParcelDetails? parcel;
  final String? bookedBy;

  /// Back to a [RideRequest] for the shared card widgets (no coordinates: the overlay draws no map).
  RideRequest toRequest() => RideRequest(
    id: id,
    kind: isDelivery ? TripKind.parcel : TripKind.ride,
    vehicle: vehicle,
    fare: fare,
    pickup: Place(
      id: '$id-p',
      name: pickupName,
      address: pickupAddress,
      location: const LatLng(0, 0),
      landmark: pickupLandmark,
    ),
    drop: Place(
      id: '$id-d',
      name: dropName,
      address: dropAddress,
      location: const LatLng(0, 0),
    ),
    pickupDistanceKm: pickupKm,
    pickupEtaMin: pickupEtaMin,
    tripKm: tripKm,
    tripMin: tripMin,
    customerName: customerName,
    customerRating: rating,
    womenDriver: womenDriver,
    extra: extra,
    rideMode: rideMode,
    modeTerms: modeTerms,
    scheduledAt: scheduledAt,
    shifting: shifting,
    parcel: parcel,
    bookedBy: bookedBy,
  );

  DateTime get expiresAt => DateTime.fromMillisecondsSinceEpoch(expiresAtMs);

  final String id;
  final int fare;
  final VehicleKind vehicle;
  final String vehicleLabel;
  final bool isDelivery;
  final String pickupName;
  final String dropName;
  final double pickupKm;
  final int pickupEtaMin;
  final double tripKm;
  final int tripMin;
  final String customerName;

  /// When the server moves the offer on (ms since epoch; both isolates share the device clock).
  final int expiresAtMs;

  Duration remaining(DateTime now) {
    final left = Duration(
      milliseconds: expiresAtMs - now.millisecondsSinceEpoch,
    );
    return left.isNegative ? Duration.zero : left;
  }

  Map<String, Object> toJson() => {
    'id': id,
    'fare': fare,
    'vehicle': vehicle.name,
    'vehicleLabel': vehicleLabel,
    'isDelivery': isDelivery,
    'pickupName': pickupName,
    'dropName': dropName,
    'pickupKm': pickupKm,
    'pickupEtaMin': pickupEtaMin,
    'tripKm': tripKm,
    'tripMin': tripMin,
    'customerName': customerName,
    'expiresAtMs': expiresAtMs,
    'pickupAddress': pickupAddress,
    'dropAddress': dropAddress,
    'pickupLandmark': ?pickupLandmark,
    'rating': rating,
    'extra': extra,
    'womenDriver': womenDriver.name,
    'rideMode': rideMode.name,
    'modeTerms': ?modeTerms?.toJson(),
    'scheduledAtMs': ?scheduledAt?.millisecondsSinceEpoch,
    'shifting': ?shifting?.toJson(withLines: true),
    'parcel': ?(parcel == null
        ? null
        : {
            'category': parcel!.category.name,
            'weight': parcel!.weight.name,
            'senderName': parcel!.senderName,
            'receiverName': parcel!.receiverName,
            'senderPhone': '',
            'receiverPhone': '',
          }),
    'bookedBy': ?bookedBy,
  };
}

/// What to put over other apps (or in the notification shade) for the live driver session.
enum BackgroundSurface {
  /// App in front, or offline: nothing.
  none,

  /// Online in the background: the floating Tamil Taxi bubble.
  bubble,

  /// A request while in the background: the full-screen overlay card (plus the ringing notification).
  requestOverlay,

  /// A request while in the background without "Display over other apps": the full-screen-intent
  /// notification, ringing until answered.
  requestNotification,
}

BackgroundSurface backgroundSurfaceFor({
  required bool inBackground,
  required bool online,
  required bool hasRequest,
  required bool overlayAllowed,
}) {
  if (!inBackground || !online) return BackgroundSurface.none;
  if (hasRequest) return overlayAllowed ? BackgroundSurface.requestOverlay : BackgroundSurface.requestNotification;
  return overlayAllowed ? BackgroundSurface.bubble : BackgroundSurface.none;
}
