import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../providers.dart';

/// The driver's identity check by hand: an admin verifies the licence and Aadhaar, with the profile photo as the face
/// that matches them.
enum IdentityStatus {
  notStarted,
  inProgress,
  inReview,
  approved,
  declined;

  static IdentityStatus fromApi(Object? value) => switch (value) {
        'IN_PROGRESS' => inProgress,
        'IN_REVIEW' => inReview,
        'APPROVED' => approved,
        'DECLINED' => declined,
        _ => notStarted,
      };
}

@immutable
class IdentityCheck {
  const IdentityCheck({required this.status, this.isRequired = false, this.verifiedAt});

  factory IdentityCheck.fromJson(Map<String, dynamic> j) => IdentityCheck(
        status: IdentityStatus.fromApi(j['status']),
        isRequired: j['isRequired'] as bool? ?? false,
        verifiedAt: DateTime.tryParse('${j['verifiedAt']}')?.toLocal(),
      );

  final IdentityStatus status;

  /// The driver must pass the check (their app uploads the licence and Aadhaar).
  final bool isRequired;
  final DateTime? verifiedAt;

  bool get isApproved => status == IdentityStatus.approved;
}

/// `GET /kyc/me` on the API.
abstract interface class IdentityRepository {
  Future<IdentityCheck> status();
}

class ApiIdentityRepository implements IdentityRepository {
  ApiIdentityRepository(this.api);
  final ApiClient api;

  @override
  Future<IdentityCheck> status() async => IdentityCheck.fromJson(await api.get('/kyc/me') as Map<String, dynamic>);
}

/// Seed data: the check is asked and not started; the licence and Aadhaar rows show their own progress.
class MockIdentityRepository implements IdentityRepository {
  @override
  Future<IdentityCheck> status() async => const IdentityCheck(status: IdentityStatus.notStarted, isRequired: true);
}

final identityRepositoryProvider = Provider<IdentityRepository>(
  (ref) => ref.watch(isLiveApiProvider) ? ApiIdentityRepository(ref.watch(apiClientProvider)) : MockIdentityRepository(),
);

/// The signed-in driver's identity check.
class IdentityController extends AsyncNotifier<IdentityCheck> {
  @override
  Future<IdentityCheck> build() {
    ref.watch(mockDatabaseProvider);
    return ref.watch(identityRepositoryProvider).status();
  }

  Future<void> refresh() async {
    try {
      final check = await ref.read(identityRepositoryProvider).status();
      if (ref.mounted) state = AsyncData(check);
    } catch (_) {}
  }
}

final identityProvider = AsyncNotifierProvider<IdentityController, IdentityCheck>(IdentityController.new);
