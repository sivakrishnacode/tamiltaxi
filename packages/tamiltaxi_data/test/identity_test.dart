import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';

class _FakeRepo implements IdentityRepository {
  int syncs = 0;
  ApiException? sessionError;
  IdentityCheck next = const IdentityCheck(isEnabled: true, status: IdentityStatus.approved, documentLast4: '2345');

  @override
  Future<IdentityCheck> status() async => const IdentityCheck(isEnabled: true, status: IdentityStatus.notStarted);

  @override
  Future<String> startSession() async {
    final e = sessionError;
    if (e != null) throw e;
    return 'tok';
  }

  @override
  Future<IdentityCheck> sync() async {
    syncs++;
    return next;
  }
}

void main() {
  test('reads /kyc/me', () {
    final check = IdentityCheck.fromJson({
      'isEnabled': true,
      'status': 'DECLINED',
      'reasons': ['Document has expired'],
      'documentLast4': '2345',
      'documents': [
        {'type': 'Driving License', 'last4': '2345'},
        {'type': 'Identity Card', 'last4': '9012'},
      ],
      'verifiedAt': null,
    });
    expect(check.documents.map((d) => d.isDrivingLicence), [true, false]);
    expect(check.documents.last.last4, '9012');
    expect(check.status, IdentityStatus.declined);
    expect(check.reasons, ['Document has expired']);
    expect(check.canStart, isTrue);
    expect(const IdentityCheck(isEnabled: true, status: IdentityStatus.inReview).canStart, isFalse);
    expect(const IdentityCheck(isEnabled: false, status: IdentityStatus.notStarted).canStart, isFalse);
  });

  test('verify runs the SDK with the session token, then syncs', () async {
    final repo = _FakeRepo();
    String? token;
    final container = ProviderContainer(overrides: [
      identityRepositoryProvider.overrideWithValue(repo),
      identitySdkProvider.overrideWithValue((t) async {
        token = t;
        return (IdentitySdkOutcome.cancelled, null);
      }),
    ]);
    addTearDown(container.dispose);
    expect((await container.read(identityProvider.future)).status, IdentityStatus.notStarted);
    expect(await container.read(identityProvider.notifier).verify(), isNull);
    expect(token, 'tok');
    expect(repo.syncs, 1);
    expect(container.read(identityProvider).value?.documentLast4, '2345');
  });

  test('verify returns the SDK error message', () async {
    final container = ProviderContainer(overrides: [
      identityRepositoryProvider.overrideWithValue(_FakeRepo()),
      identitySdkProvider.overrideWithValue((_) async => (IdentitySdkOutcome.failed, 'Allow camera access')),
    ]);
    addTearDown(container.dispose);
    await container.read(identityProvider.future);
    expect(await container.read(identityProvider.notifier).verify(), 'Allow camera access');
  });

  test('reads the mode and whether the check is required', () {
    final manual = IdentityCheck.fromJson({'isEnabled': false, 'mode': 'MANUAL', 'isRequired': true, 'status': 'NOT_STARTED'});
    expect((manual.isManual, manual.isRequired), (true, true));
    // An older server sends only isEnabled.
    final old = IdentityCheck.fromJson({'isEnabled': true, 'status': 'NOT_STARTED'});
    expect((old.isManual, old.isRequired), (false, true));
  });

  test('Didit unavailable (IDENTITY_MANUAL) switches to the documents by hand', () async {
    final repo = _FakeRepo()
      ..sessionError = const ApiException(503, "The automatic check isn't available right now", code: 'IDENTITY_MANUAL');
    final container = ProviderContainer(overrides: [identityRepositoryProvider.overrideWithValue(repo)]);
    addTearDown(container.dispose);
    await container.read(identityProvider.future);
    expect(await container.read(identityProvider.notifier).verify(), "The automatic check isn't available right now");
    expect(container.read(identityProvider).value?.isManual, true);
    expect(repo.syncs, 0);
  });
}
