import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';

import 'driver_account.dart';

/// Where an admin is with the driver's application.
enum DriverApproval {
  approved,

  /// Documents missing or under review: everything but going online works.
  pending,

  /// An admin rejected something: the driver uploads it again.
  rejected,

  /// Put on hold by an admin: Go online explains it (S-10).
  onHold;

  /// Not approved yet: Home shows the verify banner and keeps Go online locked.
  bool get awaitingApproval => this == pending || this == rejected;
}

/// The driver's approval (live: `GET /drivers/me`, refreshed by a `driver.status` push; offline: the last one seen).
/// Mock mode: approved.
final driverApprovalProvider = FutureProvider<DriverApproval>((ref) async {
  ref.watch(mockDatabaseProvider);
  if (!ref.watch(isLiveApiProvider)) return DriverApproval.approved;
  final repo = ref.read(driverRepositoryProvider);
  try {
    return await repo.checkApplication() ? DriverApproval.approved : DriverApproval.rejected;
  } on StillUnderReviewException {
    return DriverApproval.pending;
  } on AccountOnHoldException {
    return DriverApproval.onHold;
  } on Exception {
    final last = repo is ApiDriverRepository ? repo.api.session.lastDriverStatus : null;
    return switch (last) {
      'APPROVED' => DriverApproval.approved,
      'ON_HOLD' => DriverApproval.onHold,
      'REJECTED' => DriverApproval.rejected,
      _ => DriverApproval.pending,
    };
  }
});

/// How far the driver's registration is (D-07's "3 of 6 done"; Home's verify banner says how many are left): the
/// details, the identity documents (licence, Aadhaar) when the check is asked, the profile photo, the RC and insurance.
@immutable
class RegistrationProgress {
  const RegistrationProgress({required this.steps, required this.done, required this.errors, required this.allIn});

  final int steps;
  final int done;

  /// Rejected documents or a rejected photo.
  final int errors;

  /// Everything uploaded: waiting for an admin.
  final bool allIn;

  int get left => steps - done;

  static bool _isIn(KycDocument d) => d.status == KycStatus.verified || d.status == KycStatus.underReview;

  /// [allDocs]: every document the API has for the driver; [identity] null while unknown (asked when [live]).
  static RegistrationProgress of({
    required bool detailsDone,
    required List<KycDocument> allDocs,
    required IdentityCheck? identity,
    required DriverProfile? profile,
    required bool live,
  }) {
    final docs = [for (final d in allDocs) if (driverUploadDocs.contains(d.type)) d];
    final idDocs = [
      for (final type in identityUploadDocs)
        allDocs.where((d) => d.type == type).firstOrNull ?? KycDocument(type: type, status: KycStatus.notUploaded),
    ];
    final hasIdentity = identity?.isRequired ?? live;
    final identityApproved = identity?.isApproved ?? false;
    final identityDone = !hasIdentity || identityApproved || idDocs.every(_isIn);
    final idErrors = hasIdentity ? idDocs.where((d) => d.status == KycStatus.rejected).length : 0;
    final needsPhoto = live && hasIdentity;
    // The photo can be taken any time (an admin approves each), not only after the identity check.
    final photoDone = !needsPhoto || profile?.photoPath != null || (profile?.hasPendingPhoto ?? false);
    final photoError = needsPhoto &&
        profile != null &&
        profile.photoRejectReason != null &&
        profile.photoPath == null &&
        !profile.hasPendingPhoto;
    final docsDone = docs.where(_isIn).length;
    final docErrors = docs.where((d) => d.status == KycStatus.rejected).length;
    final idSteps = hasIdentity ? idDocs.length : 0;
    final idDone = !hasIdentity ? 0 : (identityApproved ? idDocs.length : idDocs.where(_isIn).length);
    final steps = 1 + idSteps + (needsPhoto ? 1 : 0) + docs.length;
    // Steps after the details only count once they are open.
    final done = detailsDone ? 1 + idDone + (needsPhoto && photoDone ? 1 : 0) + docsDone : 0;
    return RegistrationProgress(
      steps: steps,
      done: done,
      errors: docErrors + idErrors + (photoError ? 1 : 0),
      allIn: detailsDone && identityDone && photoDone && docsDone == docs.length,
    );
  }
}

/// The signed-in driver's registration progress for Home (live; null while it loads, and in mock mode).
final registrationProgressProvider = Provider<RegistrationProgress?>((ref) {
  if (!ref.watch(isLiveApiProvider)) return null;
  final docs = ref.watch(kycProvider).value;
  final identity = ref.watch(identityProvider);
  final profile = ref.watch(driverProfileProvider).value;
  if (docs == null || identity.isLoading) return null;
  return RegistrationProgress.of(
    detailsDone: true,
    allDocs: docs,
    identity: identity.value,
    profile: profile,
    live: true,
  );
});
