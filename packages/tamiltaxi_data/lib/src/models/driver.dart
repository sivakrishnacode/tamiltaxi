import 'package:flutter/foundation.dart';

import 'people.dart';
import 'place.dart';
import 'trip.dart';
import '../goods_modes.dart';
import '../ride_modes.dart';
import 'vehicle.dart';

/// Driver subscription status. [paused] and [cancelled] back the D-24b / D-24c frames.
enum PlanStatus {
  trial('Free trial'),
  active('Active'),
  grace('Grace'),
  expired('Expired'),
  paused('Paused'),
  cancelled('Cancelled');

  const PlanStatus(this.label);
  final String label;

  /// Whether the driver may go online.
  bool get canGoOnline => this != expired && this != paused;
}

@immutable
class SubscriptionPlan {
  const SubscriptionPlan({
    required this.vehicle,
    required this.monthlyPrice,
    required this.status,
    required this.startedAt,
    required this.nextDebit,
    this.upiApp = 'GPay',
    this.graceDaysLeft = 2,
  });

  final VehicleKind vehicle;

  /// Null when the price is not decided yet ("₹—").
  final int? monthlyPrice;
  final PlanStatus status;
  final DateTime startedAt;
  final DateTime nextDebit;
  final String upiApp;
  final int graceDaysLeft;

  SubscriptionPlan copyWith({
    VehicleKind? vehicle,
    int? monthlyPrice,
    PlanStatus? status,
    DateTime? startedAt,
    DateTime? nextDebit,
    String? upiApp,
    int? graceDaysLeft,
  }) =>
      SubscriptionPlan(
        vehicle: vehicle ?? this.vehicle,
        monthlyPrice: monthlyPrice ?? this.monthlyPrice,
        status: status ?? this.status,
        startedAt: startedAt ?? this.startedAt,
        nextDebit: nextDebit ?? this.nextDebit,
        upiApp: upiApp ?? this.upiApp,
        graceDaysLeft: graceDaysLeft ?? this.graceDaysLeft,
      );
}

enum PaymentRecordStatus { paid, freeTrial, failed }

@immutable
class PaymentRecord {
  const PaymentRecord({
    required this.label,
    required this.amount,
    required this.status,
    required this.date,
  });

  /// "Aug 2026"
  final String label;
  final int amount;
  final PaymentRecordStatus status;
  final DateTime date;

  PaymentRecord copyWith({String? label, int? amount, PaymentRecordStatus? status, DateTime? date}) =>
      PaymentRecord(
        label: label ?? this.label,
        amount: amount ?? this.amount,
        status: status ?? this.status,
        date: date ?? this.date,
      );
}

enum KycDocType {
  drivingLicence('Driving licence'),
  aadhaar('Aadhaar'),
  vehicleRc('Vehicle RC'),
  insurance('Vehicle insurance'),
  policeVerification('Police verification certificate');

  const KycDocType(this.label);
  final String label;
}

/// Documents every driver uploads (an admin checks them). Police verification is retired.
const driverUploadDocs = [KycDocType.vehicleRc, KycDocType.insurance];

/// The identity check by hand, when the server asks for it or Didit can't be used: an admin checks these and approves
/// the profile photo as the matching face.
const identityUploadDocs = [KycDocType.drivingLicence, KycDocType.aadhaar];

/// Shown in the driver's document lists: RC and insurance, and the identity documents once uploaded.
bool isShownDoc(KycDocument d) => driverUploadDocs.contains(d.type) || (identityUploadDocs.contains(d.type) && d.isUploaded);

enum KycStatus { notUploaded, underReview, verified, rejected }

@immutable
class KycDocument {
  const KycDocument({required this.type, required this.status, this.rejectReason});

  final KycDocType type;
  final KycStatus status;
  final String? rejectReason;

  bool get isUploaded => status != KycStatus.notUploaded;

  KycDocument copyWith({KycDocType? type, KycStatus? status, String? rejectReason}) => KycDocument(
        type: type ?? this.type,
        status: status ?? this.status,
        rejectReason: rejectReason ?? this.rejectReason,
      );
}

/// One bar of the earnings chart.
@immutable
class EarningsDay {
  const EarningsDay({required this.label, required this.amount, this.rides = 0});

  /// "Mon", "W1", "9 AM"…
  final String label;
  final int amount;
  final int rides;

  EarningsDay copyWith({String? label, int? amount, int? rides}) =>
      EarningsDay(label: label ?? this.label, amount: amount ?? this.amount, rides: rides ?? this.rides);
}

/// A completed job in the driver's earnings list.
@immutable
class EarningsTrip {
  const EarningsTrip({
    required this.id,
    required this.time,
    required this.from,
    required this.to,
    required this.fare,
    required this.paymentMode,
    this.distanceKm = 0,
    this.durationMin = 0,
    this.passengerName = '',
    this.isDelivery = false,
    this.waitingCharge = 0,
    this.previousCancellationFee = 0,
    this.extra = 0,
  });

  final String id;
  final DateTime time;
  final String from;
  final String to;
  final int fare;

  /// Part of [fare] paid for waiting at the pickup (0 = none).
  final int waitingCharge;

  /// Part of [fare] that was the passenger's earlier cancellation fee (collected here, owed to another driver).
  final int previousCancellationFee;

  /// Part of [fare] the rider added while nobody had taken the trip.
  final int extra;
  final PaymentMode paymentMode;
  final double distanceKm;
  final int durationMin;
  final String passengerName;
  final bool isDelivery;

  EarningsTrip copyWith({
    String? id,
    DateTime? time,
    String? from,
    String? to,
    int? fare,
    PaymentMode? paymentMode,
    double? distanceKm,
    int? durationMin,
    String? passengerName,
    bool? isDelivery,
    int? waitingCharge,
    int? previousCancellationFee,
    int? extra,
  }) =>
      EarningsTrip(
        id: id ?? this.id,
        time: time ?? this.time,
        from: from ?? this.from,
        to: to ?? this.to,
        fare: fare ?? this.fare,
        paymentMode: paymentMode ?? this.paymentMode,
        distanceKm: distanceKm ?? this.distanceKm,
        durationMin: durationMin ?? this.durationMin,
        passengerName: passengerName ?? this.passengerName,
        isDelivery: isDelivery ?? this.isDelivery,
        waitingCharge: waitingCharge ?? this.waitingCharge,
        previousCancellationFee: previousCancellationFee ?? this.previousCancellationFee,
        extra: extra ?? this.extra,
      );
}

/// Summary for a Today / Week / Month tab.
@immutable
class EarningsSummary {
  const EarningsSummary({
    required this.total,
    required this.rides,
    required this.onlineHours,
    required this.rating,
    required this.bars,
    required this.trips,
    required this.commissionSaved,
  });

  final int total;
  final int rides;
  final int onlineHours;
  final double rating;
  final List<EarningsDay> bars;
  final List<EarningsTrip> trips;
  final int commissionSaved;

  EarningsSummary copyWith({
    int? total,
    int? rides,
    int? onlineHours,
    double? rating,
    List<EarningsDay>? bars,
    List<EarningsTrip>? trips,
    int? commissionSaved,
  }) =>
      EarningsSummary(
        total: total ?? this.total,
        rides: rides ?? this.rides,
        onlineHours: onlineHours ?? this.onlineHours,
        rating: rating ?? this.rating,
        bars: bars ?? this.bars,
        trips: trips ?? this.trips,
        commissionSaved: commissionSaved ?? this.commissionSaved,
      );
}

/// An incoming job offer shown on D-15 / D-20.
@immutable
class RideRequest {
  const RideRequest({
    required this.id,
    required this.kind,
    required this.vehicle,
    required this.fare,
    required this.pickup,
    required this.drop,
    required this.pickupDistanceKm,
    required this.pickupEtaMin,
    required this.tripKm,
    required this.tripMin,
    required this.customerName,
    required this.customerRating,
    this.customerPhone = '',
    this.isCustomerVerified = false,
    this.womenDriver = WomenDriverPref.none,
    this.bookedBy,
    this.parcel,
    this.parcelPhotoFile,
    this.otp = '4829',
    this.extra = 0,
    this.rideMode = RideMode.local,
    this.modeTerms,
    this.scheduledAt,
    this.quote,
    this.rideStartedAt,
    this.shifting,
  });

  /// Rental (by the hour, no fixed drop) or outstation (another town); local otherwise.
  final RideMode rideMode;
  final ModeTerms? modeTerms;

  /// Pickup time of a trip booked for later (the driver accepts it ahead).
  final DateTime? scheduledAt;

  bool get isRental => rideMode == RideMode.rental;
  bool get isOutstation => rideMode == RideMode.outstation;

  /// "Rental · 4 hrs · 40 km", "Outstation · round trip"; null for a local ride.
  String? get modeLabel => rideModeLabel(rideMode, modeTerms);

  /// Ends wherever the rider gets off: a rental, or a round trip back to the pickup (no "near the drop" check).
  bool get endsAnywhere => isRental || (modeTerms is OutstationTerms && (modeTerms! as OutstationTerms).roundTrip);

  /// The trip's fare lines (live: the server's, with the rental / round-trip extras once the trip has ended).
  final FareQuote? quote;

  /// When the ride started (OTP checked): a rental's clock runs from here.
  final DateTime? rideStartedAt;

  /// House shifting: what the mover is asked to do (items, floors, helpers, packing).
  final ShiftingDetails? shifting;
  bool get isShifting => shifting != null;

  final String id;
  final TripKind kind;
  final VehicleKind vehicle;

  /// What the driver collects, the rider's [extra] included.
  final int fare;

  /// Part of [fare] the rider added while nobody had taken the trip: the card shows "₹50 + ₹20".
  final int extra;
  final Place pickup;
  final Place drop;
  final double pickupDistanceKm;
  final int pickupEtaMin;
  final double tripKm;
  final int tripMin;

  /// Passenger (rides) or receiver (deliveries).
  final String customerName;
  final double customerRating;
  final String customerPhone;

  /// The rider passed the optional identity check (Didit): a "Verified" badge on the request card.
  final bool isCustomerVerified;

  /// Butterfly: a woman rider asked for a woman driver first ([WomenDriverPref.preferred]) or only
  /// ([WomenDriverPref.only]). The request card gets the pink Butterfly band.
  final WomenDriverPref womenDriver;

  /// Any Butterfly ride: the rider is a woman (the driver may cancel, with no penalty, if she isn't).
  bool get isButterfly => womenDriver.isOn;

  /// Butterfly for women drivers only.
  bool get isWomenOnly => womenDriver == WomenDriverPref.only;

  /// Booked for someone else: the account holder's name ([customerName] / [customerPhone] are the rider's).
  final String? bookedBy;
  final ParcelDetails? parcel;
  final String? parcelPhotoFile;
  final String otp;

  bool get isDelivery => kind == TripKind.parcel;

  RideRequest copyWith({
    String? id,
    TripKind? kind,
    VehicleKind? vehicle,
    int? fare,
    Place? pickup,
    Place? drop,
    double? pickupDistanceKm,
    int? pickupEtaMin,
    double? tripKm,
    int? tripMin,
    String? customerName,
    double? customerRating,
    String? customerPhone,
    bool? isCustomerVerified,
    WomenDriverPref? womenDriver,
    String? bookedBy,
    ParcelDetails? parcel,
    String? parcelPhotoFile,
    String? otp,
    int? extra,
    RideMode? rideMode,
    ModeTerms? modeTerms,
    DateTime? scheduledAt,
    FareQuote? quote,
    DateTime? rideStartedAt,
    ShiftingDetails? shifting,
  }) => RideRequest(
    id: id ?? this.id,
    kind: kind ?? this.kind,
    vehicle: vehicle ?? this.vehicle,
    fare: fare ?? this.fare,
    pickup: pickup ?? this.pickup,
    drop: drop ?? this.drop,
    pickupDistanceKm: pickupDistanceKm ?? this.pickupDistanceKm,
    pickupEtaMin: pickupEtaMin ?? this.pickupEtaMin,
    tripKm: tripKm ?? this.tripKm,
    tripMin: tripMin ?? this.tripMin,
    customerName: customerName ?? this.customerName,
    customerRating: customerRating ?? this.customerRating,
    customerPhone: customerPhone ?? this.customerPhone,
    isCustomerVerified: isCustomerVerified ?? this.isCustomerVerified,
    womenDriver: womenDriver ?? this.womenDriver,
    bookedBy: bookedBy ?? this.bookedBy,
    parcel: parcel ?? this.parcel,
    parcelPhotoFile: parcelPhotoFile ?? this.parcelPhotoFile,
    otp: otp ?? this.otp,
    extra: extra ?? this.extra,
    rideMode: rideMode ?? this.rideMode,
    modeTerms: modeTerms ?? this.modeTerms,
    scheduledAt: scheduledAt ?? this.scheduledAt,
    quote: quote ?? this.quote,
    rideStartedAt: rideStartedAt ?? this.rideStartedAt,
    shifting: shifting ?? this.shifting,
  );
}
