import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';

import '../features/account/account_providers.dart';
import 'booking_prefs.dart';
import 'driver_session.dart';
import 'meter.dart';

/// The signed-in driver's profile (Karthik by default; the API driver with the live API).
class DriverProfileController extends AsyncNotifier<DriverProfile> {
  @override
  Future<DriverProfile> build() {
    ref.watch(mockDatabaseProvider);
    return ref.read(driverRepositoryProvider).profile();
  }

  /// Shows [p] at once and saves it. Live API: keeps what the API returns; on an error (e.g. "Enter a
  /// valid number plate") the previous profile comes back and the error is rethrown.
  Future<void> save(DriverProfile p) async {
    final previous = state.value;
    state = AsyncData(p);
    try {
      final saved = await ref.read(driverRepositoryProvider).updateProfile(p);
      if (ref.read(isLiveApiProvider) && ref.mounted) state = AsyncData(saved);
    } catch (_) {
      if (previous != null && ref.mounted) state = AsyncData(previous);
      rethrow;
    }
  }
}

final driverProfileProvider =
    AsyncNotifierProvider<DriverProfileController, DriverProfile>(DriverProfileController.new);

/// KYC checklist (D-07). Mock: uploading sets "Under review", then "Verified" after 3 s. Live API: the
/// photo is uploaded and stays under review until an admin decides.
class KycController extends AsyncNotifier<List<KycDocument>> {
  final TripSimulator _timers = TripSimulator();

  @override
  Future<List<KycDocument>> build() {
    ref.watch(mockDatabaseProvider);
    ref.onDispose(_timers.cancelAll);
    return ref.read(driverRepositoryProvider).kycDocuments();
  }

  /// Mock: the simulated camera's "Use photo".
  Future<void> upload(KycDocType type) async {
    final repo = ref.read(driverRepositoryProvider);
    state = AsyncData(await repo.setKycStatus(type, KycStatus.underReview));
    _timers.after(ref.read(simTimingProvider)(SimTimings.docVerify), () async {
      final docs = await repo.setKycStatus(type, KycStatus.verified);
      state = AsyncData(docs);
    });
  }

  /// Live API: uploads a photo (JPG / PNG / WebP / PDF, up to 8 MB). Throws [ApiException] / [OfflineException].
  Future<void> uploadFile(KycDocType type, List<int> bytes, String filename) async {
    final docs = await ref.read(driverRepositoryProvider).uploadKyc(type, bytes, filename);
    if (ref.mounted) state = AsyncData(docs);
  }

  Future<void> reload() async {
    final docs = await ref.read(driverRepositoryProvider).kycDocuments();
    if (ref.mounted) state = AsyncData(docs);
  }

  /// D-10 check: true approved (all verified), false rejected (S-09), null still under review (live API
  /// only, until an admin decides). The checklist is reloaded either way.
  Future<bool?> checkApplication() async {
    bool? ok;
    try {
      ok = await ref.read(driverRepositoryProvider).checkApplication();
    } on StillUnderReviewException {
      ok = null;
    } on AccountOnHoldException {
      // Put on hold while registering: still waiting on an admin as far as D-07 can tell.
      ok = null;
    }
    await reload();
    return ok;
  }
}

final kycProvider = AsyncNotifierProvider<KycController, List<KycDocument>>(KycController.new);

/// The driver's plan. Mock: follows Demo control "Plan status" and the Pause / Cancel / Pay actions.
/// Live API: whatever `/subscriptions/me` says.
class PlanController extends AsyncNotifier<SubscriptionPlan> {
  @override
  Future<SubscriptionPlan> build() async {
    ref.watch(mockDatabaseProvider);
    final repo = ref.read(subscriptionRepositoryProvider);
    if (ref.read(isLiveApiProvider)) return repo.plan();
    ref.listen(demoSettingsProvider.select((s) => s.planStatus), (_, next) => setStatus(next));
    final plan = await repo.plan();
    final demo = ref.read(demoSettingsProvider).planStatus;
    return plan.status == demo ? plan : repo.setStatus(demo);
  }

  SubscriptionRepository get _repo => ref.read(subscriptionRepositoryProvider);

  Future<void> setStatus(PlanStatus s) async => state = AsyncData(await _repo.setStatus(s));

  Future<void> setupAutopay(String app) async => state = AsyncData(await _repo.setupAutopay(app));

  /// Throws [PaymentFailedException] when Demo control "Fail next payment" is on (or the API refuses).
  Future<void> payNow(String app) async {
    state = AsyncData(await _repo.payNow(app));
    ref.invalidate(paymentsProvider);
  }

  /// S-14 "Pay later": grace period.
  Future<void> payLater() => setStatus(PlanStatus.grace);

  Future<void> pause() async => state = AsyncData(await _repo.pause());
  Future<void> resume() async => state = AsyncData(await _repo.resume());
  Future<void> cancel() async => state = AsyncData(await _repo.cancel());
  Future<void> changeVehicle(VehicleKind v) async => state = AsyncData(await _repo.changePlanVehicle(v));
}

final planProvider = AsyncNotifierProvider<PlanController, SubscriptionPlan>(PlanController.new);

final paymentsProvider = FutureProvider<List<PaymentRecord>>((ref) {
  ref.watch(mockDatabaseProvider);
  return ref.watch(subscriptionRepositoryProvider).payments();
});

/// Monthly plan price per vehicle (D-05). Mock: the seed prices (null = "₹—, contact us"). Live API:
/// `GET /plans` (MONTHLY), falling back to the seed prices offline.
final monthlyPlanPricesProvider = FutureProvider<Map<VehicleKind, int?>>((ref) async {
  final seed = {for (final v in Seed.allVehicles) v.kind: v.subscriptionPrice};
  if (!ref.watch(isLiveApiProvider)) return seed;
  try {
    final plans = await ref.watch(apiClientProvider).get('/plans');
    final prices = {...seed};
    for (final p in (plans as List? ?? const [])) {
      if (p is Map && p['period'] == 'MONTHLY' && p['price'] is num) {
        prices[vehicleKindFromApi(p['vehicleKind'])] = (p['price'] as num).round();
      }
    }
    return prices;
  } on Exception {
    return seed;
  }
});

final driverTicketsProvider = FutureProvider<List<SupportTicket>>((ref) {
  ref.watch(mockDatabaseProvider);
  ref.watch(demoSettingsProvider.select((s) => (s.offline, s.slowLoading)));
  return ref.watch(supportRepositoryProvider).tickets();
});

/// Drops everything loaded for the previous driver (after log in, sign-up, log out or a 401).
void resetDriverData(WidgetRef ref) {
  ref
    ..invalidate(driverSessionProvider)
    ..invalidate(driverProfileProvider)
    ..invalidate(kycProvider)
    ..invalidate(planProvider)
    ..invalidate(paymentsProvider)
    ..invalidate(driverTicketsProvider)
    ..invalidate(driverEmergencyContactProvider)
    ..invalidate(earningsProvider)
    ..invalidate(identityProvider)
    ..invalidate(bookingPrefsProvider)
    ..invalidate(cancelRateProvider);
}

/// Log out (D-26, D-07) or after deleting the account ([deleted]): offline on the phone at once, one
/// `POST /drivers/me/offline` (skipped for a deleted account; the session ends even when it fails), then everything
/// loaded for this driver is dropped. The caller goes to Welcome.
Future<void> signOutDriver(WidgetRef ref, {bool deleted = false}) async {
  final live = ref.read(isLiveApiProvider);
  await ref.read(driverSessionProvider.notifier).goOffline(tellServer: false);
  // A meter trip and its saved rates belong to this driver, not the next one on this phone.
  await ref.read(meterProvider.notifier).forget();
  if (!deleted) await ref.read(driverRepositoryProvider).logout();
  if (live) {
    ref.read(realtimeProvider).disconnect();
    resetDriverData(ref);
  }
  ref.invalidate(signupProvider);
}

/// What the driver entered during sign-up (D-03 … D-06), for the D-07 registration page.
@immutable
class SignupDraft {
  const SignupDraft({
    this.phone = '98430 12345',
    this.workType = WorkType.rides,
    this.vehicle = VehicleKind.bike,
    this.name = 'Karthik S',
    this.dob = '14 Mar 1994',
    this.gender = Gender.male,
    this.emergencyContact = '+91 98940 66123',
    this.upiId = 'karthik@okaxis',
    this.hasPhoto = false,
    this.vehicleModel = '',
    this.vehicleColor = '',
    this.plate = '',
    this.detailsSaved = false,
    this.cityId,
  });

  /// Live API: nothing prefilled.
  static const blank = SignupDraft(phone: '', name: '', emergencyContact: '', upiId: '');

  final String phone;
  final WorkType workType;
  final VehicleKind vehicle;
  final String name;
  final String dob;
  final Gender gender;
  final String emergencyContact;
  final String upiId;
  final bool hasPhoto;

  /// Empty = the seed driver's vehicle for [vehicle] (mock) / not entered yet (live API).
  final String vehicleModel;
  final String vehicleColor;
  final String plate;

  /// D-06 saved the details (live: the driver now exists), so the registration page opens the documents.
  final bool detailsSaved;

  /// D-06's City: the service city the driver picked (null: not picked; D-06 suggests the one nearest the phone).
  final String? cityId;

  SignupDraft copyWith({
    String? phone,
    WorkType? workType,
    VehicleKind? vehicle,
    String? name,
    String? dob,
    Gender? gender,
    String? emergencyContact,
    String? upiId,
    bool? hasPhoto,
    String? vehicleModel,
    String? vehicleColor,
    String? plate,
    bool? detailsSaved,
    String? cityId,
  }) =>
      SignupDraft(
        phone: phone ?? this.phone,
        workType: workType ?? this.workType,
        vehicle: vehicle ?? this.vehicle,
        name: name ?? this.name,
        dob: dob ?? this.dob,
        gender: gender ?? this.gender,
        emergencyContact: emergencyContact ?? this.emergencyContact,
        upiId: upiId ?? this.upiId,
        hasPhoto: hasPhoto ?? this.hasPhoto,
        vehicleModel: vehicleModel ?? this.vehicleModel,
        vehicleColor: vehicleColor ?? this.vehicleColor,
        plate: plate ?? this.plate,
        detailsSaved: detailsSaved ?? this.detailsSaved,
        cityId: cityId ?? this.cityId,
      );
}

class SignupController extends Notifier<SignupDraft> {
  @override
  SignupDraft build() => ref.read(isLiveApiProvider) ? SignupDraft.blank : const SignupDraft();

  void update(SignupDraft Function(SignupDraft d) change) => state = change(state);

  /// D-04: also switches the demo work type so requests match (rides vs deliveries).
  void setWorkType(WorkType w) {
    final vehicle = w == WorkType.rides ? VehicleKind.bike : VehicleKind.threeWheeler;
    state = state.copyWith(workType: w, vehicle: vehicle);
    ref.read(demoSettingsProvider.notifier).update((s) => s.copyWith(workType: w));
  }

  /// Live, once the driver exists (after a restart or a log-in mid-registration the draft is blank): starts the draft
  /// from what is saved, so D-06's Edit shows it and saving doesn't blank the name, plate and UPI or reset the gender.
  Future<void> loadSaved() async {
    final repo = ref.read(driverRepositoryProvider);
    if (!ref.read(isLiveApiProvider) || !repo.isLoggedIn) return;
    final p = await ref.read(driverProfileProvider.future);
    EmergencyContact? contact;
    try {
      contact = await repo.emergencyContact();
    } on Exception {
      contact = null;
    }
    if (!ref.mounted) return;
    state = state.copyWith(
      phone: state.phone.isEmpty ? p.phone : state.phone,
      vehicle: p.vehicleKind,
      name: p.name,
      gender: p.gender,
      upiId: p.upiId,
      vehicleModel: p.vehicleModel,
      vehicleColor: p.vehicleColor,
      plate: p.plate,
      cityId: p.cityId,
      emergencyContact: contact != null && contact.phone.isNotEmpty ? contact.phone : state.emergencyContact,
    );
  }

  /// Seed vehicle shown on D-06 in mock mode when the driver hasn't typed one.
  DriverProfile get _seedDriver => state.vehicle.isGoods ? Seed.selvam : Seed.karthik;

  Future<String?> _savedContactPhone(DriverRepository repo) async {
    try {
      final c = await repo.emergencyContact();
      return c.phone.isEmpty ? null : apiPhone(c.phone);
    } on Exception {
      return null;
    }
  }

  /// D-06 Continue. Mock: writes the details to the seed profile and plan. Live API: creates the driver
  /// with a free trial ([DriverRepository.register]) or, when already created (back and Continue
  /// again), updates it; then saves the emergency contact. Throws [ApiException] with the API's message
  /// (e.g. "Enter a valid number plate").
  Future<void> commit() async {
    final repo = ref.read(driverRepositoryProvider);
    if (ref.read(isLiveApiProvider)) {
      final profile = DriverProfile(
        id: '',
        name: state.name,
        phone: apiPhone(state.phone),
        vehicleKind: state.vehicle,
        vehicleModel: state.vehicleModel.trim(),
        vehicleColor: state.vehicleColor.trim(),
        plate: state.plate.trim().toUpperCase(),
        rating: 5,
        rides: 0,
        upiId: state.upiId.trim(),
        gender: state.gender,
        cityId: state.cityId,
      );
      if (repo.isLoggedIn) {
        await repo.updateProfile(profile);
      } else {
        await repo.register(profile, state.workType);
        // Sign-up doesn't take a gender; save it on the new driver.
        await repo.updateProfile(profile);
      }
      // Unchanged (an edit of the other details): keep the contact as saved, with the name the driver gave it.
      final saved = repo.isLoggedIn && state.emergencyContact.isNotEmpty ? await _savedContactPhone(repo) : null;
      if (state.emergencyContact.isNotEmpty && saved != apiPhone(state.emergencyContact)) {
        await repo.updateEmergencyContact(EmergencyContact(
          id: '',
          name: kSignupContactName,
          relation: 'Family',
          phone: apiPhone(state.emergencyContact),
        ));
      }
      ref
        ..invalidate(driverProfileProvider)
        ..invalidate(kycProvider)
        ..invalidate(planProvider)
        ..invalidate(paymentsProvider)
        ..invalidate(driverEmergencyContactProvider)
        ..invalidate(driverSessionProvider);
      state = state.copyWith(detailsSaved: true);
      return;
    }
    final profile = ref.read(driverProfileProvider).value ?? Seed.karthik;
    final seedDriver = _seedDriver;
    final sameVehicle = state.vehicle == profile.vehicleKind;
    await ref.read(driverProfileProvider.notifier).save(profile.copyWith(
          name: state.name,
          upiId: state.upiId,
          vehicleKind: state.vehicle,
          vehicleModel: state.vehicleModel.isNotEmpty
              ? state.vehicleModel
              : (sameVehicle ? profile.vehicleModel : seedDriver.vehicleModel),
          vehicleColor: state.vehicleColor.isNotEmpty ? state.vehicleColor : null,
          plate: state.plate.isNotEmpty ? state.plate.toUpperCase() : (sameVehicle ? profile.plate : seedDriver.plate),
          gender: state.gender,
        ));
    await ref.read(planProvider.notifier).changeVehicle(state.vehicle);
    state = state.copyWith(detailsSaved: true);
  }
}

final signupProvider = NotifierProvider<SignupController, SignupDraft>(SignupController.new);
