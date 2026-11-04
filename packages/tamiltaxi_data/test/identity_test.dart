import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';

void main() {
  test('reads /kyc/me', () {
    final check = IdentityCheck.fromJson({'isEnabled': false, 'isRequired': true, 'status': 'IN_REVIEW', 'verifiedAt': null});
    expect((check.status, check.isRequired, check.isApproved), (IdentityStatus.inReview, true, false));

    final approved = IdentityCheck.fromJson({'isRequired': true, 'status': 'APPROVED', 'verifiedAt': '2026-11-04T06:00:00.000Z'});
    expect(approved.isApproved, isTrue);
    expect(approved.verifiedAt, isNotNull);

    // Riders, and drivers on apps that send no version: nothing to do.
    expect(IdentityCheck.fromJson({'status': 'NOT_STARTED'}).isRequired, isFalse);
  });
}
