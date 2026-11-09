import 'package:flutter/foundation.dart';

import 'place.dart';
import 'vehicle.dart';

enum Gender { female, male, preferNotToSay }

/// Butterfly (women riders only): who may take the ride. [preferred] = women drivers first, men if none is near;
/// [only] = women drivers only.
enum WomenDriverPref {
  none,
  preferred,
  only;

  bool get isOn => this != none;
}

/// "Who's riding?": the person a ride is booked for when it isn't the account holder (e.g. a daughter).
@immutable
class OtherRider {
  const OtherRider({required this.name, required this.phone, this.isWoman = false});

  final String name;

  /// 10 digits, "9876543210".
  final String phone;

  /// Lets the ride use Butterfly (women drivers).
  final bool isWoman;

  String get firstName => name.trim().split(' ').first;

  @override
  bool operator ==(Object other) =>
      other is OtherRider && other.name == name && other.phone == phone && other.isWoman == isWoman;

  @override
  int get hashCode => Object.hash(name, phone, isWoman);
}

/// Someone the passenger (or driver) trusts in an emergency.
@immutable
class EmergencyContact {
  const EmergencyContact({
    required this.id,
    required this.name,
    required this.relation,
    required this.phone,
  });

  final String id;
  final String name;
  final String relation;
  final String phone;

  EmergencyContact copyWith({String? id, String? name, String? relation, String? phone}) =>
      EmergencyContact(
        id: id ?? this.id,
        name: name ?? this.name,
        relation: relation ?? this.relation,
        phone: phone ?? this.phone,
      );
}

/// A Tamil Taxi driver as seen by passengers and in the driver app.
@immutable
class DriverProfile {
  const DriverProfile({
    required this.id,
    required this.name,
    required this.phone,
    required this.vehicleKind,
    required this.vehicleModel,
    required this.vehicleColor,
    required this.plate,
    required this.rating,
    required this.rides,
    required this.upiId,
    this.gender = Gender.male,
    this.photoPath,
    this.hasPendingPhoto = false,
    this.photoRejectReason,
    this.cityId,
  });

  final String id;
  final String name;
  final String phone;
  final VehicleKind vehicleKind;
  final String vehicleModel;
  final String vehicleColor;

  /// "TN 37 AB 4521"
  final String plate;
  final double rating;
  final int rides;
  final String upiId;
  final Gender gender;

  /// API path of the approved profile photo (`/drivers/<id>/photo?v=<file>`); null until an admin approves one.
  /// Load it with [driverPhotoProvider].
  final String? photoPath;

  /// Driver app: a new photo is waiting for an admin (unclear face match).
  final bool hasPendingPhoto;

  /// Driver app: why an admin rejected the last photo.
  final String? photoRejectReason;

  /// The service city the driver works in (picked at sign-up, D-06; else set when they first go online in one).
  final String? cityId;

  String get firstName => name.split(' ').first;

  String get initials {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts[0].substring(0, 1) + parts[1].substring(0, 1)).toUpperCase();
  }

  /// "Honda Activa · Grey"
  String get vehicleLabel => vehicleColor.isEmpty ? vehicleModel : '$vehicleModel · $vehicleColor';

  DriverProfile copyWith({
    String? id,
    String? name,
    String? phone,
    VehicleKind? vehicleKind,
    String? vehicleModel,
    String? vehicleColor,
    String? plate,
    double? rating,
    int? rides,
    String? upiId,
    Gender? gender,
    String? photoPath,
    bool? hasPendingPhoto,
    String? photoRejectReason,
    String? cityId,
  }) =>
      DriverProfile(
        id: id ?? this.id,
        name: name ?? this.name,
        phone: phone ?? this.phone,
        vehicleKind: vehicleKind ?? this.vehicleKind,
        vehicleModel: vehicleModel ?? this.vehicleModel,
        vehicleColor: vehicleColor ?? this.vehicleColor,
        plate: plate ?? this.plate,
        rating: rating ?? this.rating,
        rides: rides ?? this.rides,
        upiId: upiId ?? this.upiId,
        gender: gender ?? this.gender,
        photoPath: photoPath ?? this.photoPath,
        hasPendingPhoto: hasPendingPhoto ?? this.hasPendingPhoto,
        photoRejectReason: photoRejectReason ?? this.photoRejectReason,
        cityId: cityId ?? this.cityId,
      );
}

/// The signed-in passenger.
@immutable
class PassengerProfile {
  const PassengerProfile({
    required this.name,
    required this.phone,
    required this.gender,
    this.email = '',
    this.rating = 4.9,
    this.savedPlaces = const [],
    this.emergencyContacts = const [],
    this.preferWomenDriver = false,
    this.autoShareTrips = true,
  });

  final String name;
  final String phone;
  final String email;
  final Gender gender;
  final double rating;
  final List<SavedPlace> savedPlaces;
  final List<EmergencyContact> emergencyContacts;
  final bool preferWomenDriver;
  final bool autoShareTrips;

  String get firstName => name.split(' ').first;

  String get initials {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts[0].substring(0, 1) + parts[1].substring(0, 1)).toUpperCase();
  }

  PassengerProfile copyWith({
    String? name,
    String? phone,
    String? email,
    Gender? gender,
    double? rating,
    List<SavedPlace>? savedPlaces,
    List<EmergencyContact>? emergencyContacts,
    bool? preferWomenDriver,
    bool? autoShareTrips,
  }) =>
      PassengerProfile(
        name: name ?? this.name,
        phone: phone ?? this.phone,
        email: email ?? this.email,
        gender: gender ?? this.gender,
        rating: rating ?? this.rating,
        savedPlaces: savedPlaces ?? this.savedPlaces,
        emergencyContacts: emergencyContacts ?? this.emergencyContacts,
        preferWomenDriver: preferWomenDriver ?? this.preferWomenDriver,
        autoShareTrips: autoShareTrips ?? this.autoShareTrips,
      );
}
