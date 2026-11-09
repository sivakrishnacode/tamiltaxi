import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../router/app_router.dart' show rootNavigatorKey;
import '../router/routes.dart';
import '../state/driver_location.dart';
import '../state/driver_session.dart';
import '../state/live_helpers.dart';
import '../state/registration.dart';

/// Where a refused go-online sends the driver, from the API's 403: S-10 when an admin put the account on hold, S-10b
/// with the end time when paused for too many cancellations, D-07 when the account is not approved (any more: a new
/// number plate waits for its RC check). Null: just show the message.
String? goOnlineRefusalRoute(ApiException e) {
  final pausedUntil = e.tempBlockedUntil;
  if (pausedUntil != null) return Routes.accountPaused(pausedUntil);
  if (e.status != 403) return null;
  final m = e.message.toLowerCase();
  if (e.code == 'ACCOUNT_ON_HOLD' || m.contains('on_hold') || m.contains('on hold')) return Routes.accountOnHold;
  if (m.contains('account is pending') || m.contains('account is rejected')) return Routes.documents;
  return null;
}

/// Goes online from any screen with a Go online button (Home, D-12b) and explains a refusal the same way everywhere:
/// the screens of [goOnlineRefusalRoute], a snack with a Settings action when Location is off or not allowed
/// ([LocationProblem]), else a snack with the message. [toHome]: the screen closes to Home first (the plan screen),
/// success or not. True when online.
Future<bool> goOnlineOrExplain(BuildContext context, WidgetRef ref, {bool toHome = false}) async {
  // Read up front: the calling screen may close (toHome) before the answer comes.
  final router = GoRouter.of(context);
  final container = ProviderScope.containerOf(context, listen: false);
  final session = container.read(driverSessionProvider.notifier);
  final locator = container.read(driverLocatorProvider);

  void snack(String message, {String? actionLabel, VoidCallback? onAction}) {
    // After the navigation settles, on whatever screen is showing then.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final c = rootNavigatorKey.currentContext;
      if (c != null) showTtSnack(c, message, actionLabel: actionLabel, onAction: onAction);
    });
  }

  void home() {
    if (toHome) router.go(Routes.home);
  }

  try {
    await session.goOnline();
  } on LocationProblem catch (e) {
    home();
    snack(
      e.message,
      actionLabel: e.fix == LocationFix.none ? null : 'Settings',
      onAction: e.fix == LocationFix.none ? null : () => locator.openSettings(e.fix),
    );
    return false;
  } on ApiException catch (e) {
    final route = goOnlineRefusalRoute(e);
    if (e.tempBlockedUntil != null) container.invalidate(cancelRateProvider);
    if (route == Routes.documents) {
      // Not approved (Home had an old status): the registration page says what's missing; back leads Home.
      container.invalidate(driverApprovalProvider);
      router.push(Routes.documents);
      snack(e.message);
      return false;
    }
    home();
    if (route != null) {
      router.push(route);
    } else {
      snack(e.message);
    }
    return false;
  } catch (e) {
    home();
    snack(userMessage(e));
    return false;
  }
  home();
  return true;
}
