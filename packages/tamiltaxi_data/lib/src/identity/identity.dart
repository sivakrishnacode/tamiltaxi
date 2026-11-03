import 'package:didit_sdk/sdk_flutter.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../demo_settings.dart';
import '../providers.dart';

/// The user's Didit identity check (ID document + selfie). Drivers need it to be approved; riders get a badge.
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

/// One scanned ID: Didit's document name ("Driving License", "Identity Card"…) and the number's last 4 digits.
@immutable
class ScannedDocument {
  const ScannedDocument({required this.type, this.last4});
  final String type;
  final String? last4;

  bool get isDrivingLicence => RegExp(r'driv|^dl$', caseSensitive: false).hasMatch(type);
}

/// How drivers' identities are checked: Didit's in-app check, or the licence, Aadhaar and selfie for an admin.
enum IdentityMode { didit, manual }

@immutable
class IdentityCheck {
  const IdentityCheck({
    required this.isEnabled,
    required this.status,
    this.mode = IdentityMode.didit,
    bool? isRequired,
    this.fullName,
    this.documentType,
    this.documentLast4,
    this.documents = const [],
    this.reasons = const [],
    this.verifiedAt,
  }) : isRequired = isRequired ?? isEnabled;

  factory IdentityCheck.fromJson(Map<String, dynamic> j) => IdentityCheck(
        isEnabled: j['isEnabled'] as bool? ?? false,
        status: IdentityStatus.fromApi(j['status']),
        mode: j['mode'] == 'MANUAL' ? IdentityMode.manual : IdentityMode.didit,
        isRequired: j['isRequired'] as bool?,
        fullName: j['fullName'] as String?,
        documentType: j['documentType'] as String?,
        documentLast4: j['documentLast4'] as String?,
        documents: [
          for (final d in (j['documents'] as List? ?? const []))
            if (d is Map && d['type'] is String) ScannedDocument(type: d['type'] as String, last4: d['last4'] as String?),
        ],
        reasons: [for (final r in (j['reasons'] as List? ?? const [])) '$r'],
        verifiedAt: DateTime.tryParse('${j['verifiedAt']}')?.toLocal(),
      );

  /// Didit's in-app check is offered.
  final bool isEnabled;
  final IdentityStatus status;

  /// Drivers: Didit, or the documents by hand (the server's setting, or Didit can't be used right now).
  final IdentityMode mode;

  /// The driver must pass the identity step (servers before 0.1.2 only sent [isEnabled]).
  final bool isRequired;

  bool get isManual => mode == IdentityMode.manual;

  /// The same check, done by hand (after Didit answered `IDENTITY_MANUAL`).
  IdentityCheck asManual() => IdentityCheck(
        isEnabled: isEnabled,
        status: status,
        mode: IdentityMode.manual,
        isRequired: true,
        fullName: fullName,
        documentType: documentType,
        documentLast4: documentLast4,
        documents: documents,
        reasons: reasons,
        verifiedAt: verifiedAt,
      );

  /// As read from the ID.
  final String? fullName;
  final String? documentType;
  final String? documentLast4;

  /// Every scanned ID (drivers: the licence and Aadhaar).
  final List<ScannedDocument> documents;

  /// What to fix after a decline, one per failed step, e.g. "Driving licence: this looks like a photo of a screen…".
  final List<String> reasons;
  final DateTime? verifiedAt;

  bool get isApproved => status == IdentityStatus.approved;

  /// Done as far as the user is concerned: approved, or waiting on a reviewer.
  bool get isSubmitted => status == IdentityStatus.approved || status == IdentityStatus.inReview;

  /// The user can (re)start the in-app check.
  bool get canStart => isEnabled && !isSubmitted;
}

/// A decline reason as a sentence: "Driving licence: this looks like…" → "Driving licence: This looks like….".
String identityReasonSentence(String reason) {
  final i = reason.indexOf(': ');
  final s = i < 0 || i + 2 >= reason.length
      ? reason
      : '${reason.substring(0, i + 2)}${reason[i + 2].toUpperCase()}${reason.substring(i + 3)}';
  return s.endsWith('.') ? s : '$s.';
}

/// `/kyc/*` on the API.
abstract interface class IdentityRepository {
  Future<IdentityCheck> status();

  /// A session token for the Didit SDK. Throws [ApiException] (e.g. 429 too many attempts, 503 busy).
  Future<String> startSession();

  /// Asks the API to read the decision (after the SDK closes).
  Future<IdentityCheck> sync();
}

class ApiIdentityRepository implements IdentityRepository {
  ApiIdentityRepository(this.api);
  final ApiClient api;

  @override
  Future<IdentityCheck> status() async => IdentityCheck.fromJson(await api.get('/kyc/me') as Map<String, dynamic>);

  @override
  Future<String> startSession() async => ((await api.post('/kyc/session')) as Map<String, dynamic>)['sessionToken'] as String;

  @override
  Future<IdentityCheck> sync() async => IdentityCheck.fromJson(await api.post('/kyc/sync', null, true) as Map<String, dynamic>);
}

/// Seed data: starts "not started"; a check is approved, or declined with Demo control "Reject KYC".
class MockIdentityRepository implements IdentityRepository {
  MockIdentityRepository(this.settings);
  final DemoSettings Function() settings;
  IdentityCheck _check = const IdentityCheck(isEnabled: true, status: IdentityStatus.notStarted);

  @override
  Future<IdentityCheck> status() async => _check;

  @override
  Future<String> startSession() async => 'mock-token';

  @override
  Future<IdentityCheck> sync() async => _check = settings().rejectKyc
      ? const IdentityCheck(isEnabled: true, status: IdentityStatus.declined, reasons: ["Selfie: your selfie doesn't match the photo on the ID. Retake it in good light"])
      : IdentityCheck(
          isEnabled: true,
          status: IdentityStatus.approved,
          fullName: 'Karthik S',
          documentType: 'Driving License',
          documentLast4: '2345',
          documents: const [ScannedDocument(type: 'Driving License', last4: '2345'), ScannedDocument(type: 'Identity Card', last4: '7781')],
          verifiedAt: DateTime.now(),
        );
}

final identityRepositoryProvider = Provider<IdentityRepository>(
  (ref) => ref.watch(isLiveApiProvider)
      ? ApiIdentityRepository(ref.watch(apiClientProvider))
      : MockIdentityRepository(() => ref.read(demoSettingsProvider)),
);

/// How the in-app check ended.
enum IdentitySdkOutcome { completed, cancelled, failed }

/// Opens Didit's native verification screens (camera, document, selfie) inside the app. No browser.
typedef IdentitySdkLauncher = Future<(IdentitySdkOutcome, String?)> Function(String sessionToken);

Future<(IdentitySdkOutcome, String?)> launchDiditSdk(String sessionToken) async {
  final result = await DiditSdk.startVerification(
    sessionToken,
    config: const DiditConfig(languageCode: 'en', showLanguageSelector: true),
  );
  return switch (result) {
    VerificationCompleted() => (IdentitySdkOutcome.completed, null),
    VerificationCancelled() => (IdentitySdkOutcome.cancelled, null),
    VerificationFailed(:final error) => (IdentitySdkOutcome.failed, _sdkError(error)),
  };
}

String _sdkError(VerificationError e) => switch (e.type) {
      VerificationErrorType.cameraAccessDenied => 'Allow camera access to scan your ID and take a selfie',
      VerificationErrorType.networkError => "You're offline. Check your internet and try again",
      VerificationErrorType.sessionExpired => 'This check expired. Please start again',
      _ => e.message.isEmpty ? 'Verification failed. Please try again' : e.message,
    };

/// Live API: the Didit SDK. Seed data / tests: completes at once.
final identitySdkProvider = Provider<IdentitySdkLauncher>(
  (ref) => ref.watch(isLiveApiProvider) ? launchDiditSdk : (_) async => (IdentitySdkOutcome.completed, null),
);

/// The signed-in user's identity check, and [verify] to run it in the app.
class IdentityController extends AsyncNotifier<IdentityCheck> {
  @override
  Future<IdentityCheck> build() {
    ref.watch(mockDatabaseProvider);
    return ref.watch(identityRepositoryProvider).status();
  }

  /// Starts (or resumes) a session, runs the SDK, then reads the result. Returns an error to show, or null.
  Future<String?> verify() async {
    final repo = ref.read(identityRepositoryProvider);
    try {
      final token = await repo.startSession();
      final (outcome, error) = await ref.read(identitySdkProvider)(token);
      final check = await repo.sync();
      if (ref.mounted) state = AsyncData(check);
      return outcome == IdentitySdkOutcome.failed ? error : null;
    } on ApiException catch (e) {
      await refresh();
      // Didit can't be used (no credits, down, or switched off): go on with the documents by hand.
      if (e.code == 'IDENTITY_MANUAL') {
        final check = state.value;
        if (check != null && ref.mounted) state = AsyncData(check.asManual());
      }
      return e.message;
    } catch (e) {
      return e is ApiException
          ? e.message
          : 'Could not open the identity check. Please try again.';
    }
  }

  Future<void> refresh() async {
    try {
      final check = await ref.read(identityRepositoryProvider).status();
      if (ref.mounted) state = AsyncData(check);
    } catch (_) {}
  }
}

final identityProvider = AsyncNotifierProvider<IdentityController, IdentityCheck>(IdentityController.new);
