import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';

import '../router/routes.dart';
import '../state/app_permissions.dart';

/// Where a signed-in driver lands (live API): Home, approved or not. Until an admin approves the documents, Home
/// shows the verify banner (Verify now → D-07) and keeps Go online locked; the Meter, Earnings and Account all work.
/// On hold: Go online explains the hold (S-10). The check also keeps the last status for an offline start. A 401
/// (the session is gone) is rethrown.
Future<String> driverStartRoute(DriverRepository repo) async {
  try {
    await repo.checkApplication();
  } on ApiException catch (e) {
    if (e.status == 401) rethrow;
  } on Exception {
    // Under review, on hold or offline: Home all the same.
  }
  return Routes.home;
}

/// D-03c first while anything it asks for is still off (after the OTP and at start-up, live API), then [route].
Future<String> permissionsFirst(WidgetRef ref, String route) async {
  await ref.read(missingPermissionsProvider.notifier).refresh();
  return ref.read(missingPermissionsProvider).isEmpty ? route : Routes.permissions(next: route);
}
