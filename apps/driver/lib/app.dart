import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import 'common/job_routes.dart';
import 'overlay/background_offers.dart';
import 'router/app_router.dart';
import 'router/routes.dart';
import 'state/driver_account.dart';
import 'state/driver_session.dart';

/// The driver app root. [router] is injectable for tests.
///
/// With the live API it also: sends the driver to log in when the token is rejected (401), shows the
/// session's notices (e.g. "Priya cancelled the ride") and closes the job screens when a job ends from
/// the other side, and tells the session when the app comes back to the foreground. In the background it
/// runs [BackgroundOffers]: the floating bubble while online and the full-screen request card.
class TtDriverApp extends ConsumerStatefulWidget {
  const TtDriverApp({super.key, this.router});
  final GoRouter? router;

  @override
  ConsumerState<TtDriverApp> createState() => _TtDriverAppState();
}

class _TtDriverAppState extends ConsumerState<TtDriverApp> with WidgetsBindingObserver {
  late final GoRouter _router = widget.router ?? createDriverRouter();
  StreamSubscription<void>? _unauthorized;
  StreamSubscription<PushData>? _pushTaps;
  BackgroundOffers? _background;

  /// Routes where a signed-out driver already is (no redirect, no snack).
  static const _authPaths = {Routes.splash, Routes.welcome, '/auth/phone', '/auth/otp'};

  bool get _live => ref.read(isLiveApiProvider);

  @override
  void initState() {
    super.initState();
    // Service cities (sign-up city, the maps' first view) come from the API; nothing is built in.
    ref.read(serviceCitiesProvider);
    if (!_live) return;
    WidgetsBinding.instance.addObserver(this);
    _unauthorized = ref.read(apiClientProvider).onUnauthorized.listen((_) => _signedOut());
    _background = BackgroundOffers(ref, onAccepted: _openJob)..start();
    final push = ref.read(pushProvider);
    if (push != null) {
      // While the app is open the request card and job screens show these; account news still notifies.
      push.suppress = (data) => const {'offer', 'trip'}.contains(data['type']);
      _pushTaps = push.taps.listen(_onPushTap);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        final launch = push.takeLaunchTap();
        if (launch != null) _onPushTap(launch);
      });
    }
  }

  /// Request / job / chat → pick up the offer or job from the API; KYC decision → the start screen decides
  /// (Home once approved, else the registration page with what to fix).
  void _onPushTap(PushData data) {
    switch (data['type']) {
      case 'offer' || 'trip' || 'chat' || 'nudge':
        ref.read(driverSessionProvider.notifier).onAppResumed();
        if (data['type'] == 'chat' &&
            ref.read(driverSessionProvider).job != null) {
          _router.push(Routes.chat);
        }
      case 'kyc' || 'account':
        ref.invalidate(identityProvider);
        ref.invalidate(driverProfileProvider);
        if (!_authPaths.contains(_path)) _router.go(Routes.splash);
    }
  }

  /// Accepted on the overlay: the job's screen, ready when the app comes to the front.
  void _openJob(RideRequest job) {
    final route = routeForJob(JobPhase.toPickup, delivery: job.isDelivery);
    if (route == null) return;
    _router.go(Routes.home);
    _router.push(route);
  }

  @override
  void dispose() {
    _background?.dispose();
    WidgetsBinding.instance.removeObserver(this);
    _unauthorized?.cancel();
    _pushTaps?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _background?.onLifecycle(state);
    if (state == AppLifecycleState.resumed) ref.read(driverSessionProvider.notifier).onAppResumed();
  }

  String get _path => _router.routerDelegate.currentConfiguration.uri.path;

  void _signedOut() {
    if (!mounted) return;
    ref.read(realtimeProvider).disconnect();
    resetDriverData(ref);
    ref.invalidate(signupProvider);
    if (_authPaths.contains(_path)) return;
    _router.go(Routes.welcome);
    final context = rootNavigatorKey.currentContext;
    if (context != null) {
      showTtSnack(context, 'Your session ended. Please log in again.');
    }
  }

  void _onNotice(SessionNotice notice) {
    // Job screens are pushed over Home, so the router's path stays /home: always go (it clears the pushed screens).
    if (notice.goTo != null) {
      _router.go(notice.goTo!);
    } else if (notice.jobEnded) {
      _router.go(Routes.home);
    }
    // Let the navigation settle so the snack shows on the new screen.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final context = rootNavigatorKey.currentContext;
      if (context != null) showTtSnack(context, notice.message);
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_live) {
      ref.listen(driverSessionProvider.select((s) => s.notice), (prev, next) {
        if (next != null && !identical(prev, next)) _onNotice(next);
      });
      // The stacked requests too: the overlay list and their notifications follow them.
      ref.listen(
          driverSessionProvider.select(
              (s) => (s.online, s.incoming?.id, s.job?.id, s.queued.map((q) => q.request.id).join(','))), (_, _) {
        _background?.onSession();
      });
      // The job ended any way (cancelled by either side, found gone on reconnect, paid): no job screen may stay open,
      // or it would carry on as a demo and even offer to rate a cancelled trip.
      ref.listen(driverSessionProvider.select((s) => s.job?.id), (prev, next) {
        if (prev != null && next == null) _router.go(Routes.home);
      });
    }
    return MaterialApp.router(
      title: 'Tamil Taxi Driver',
      debugShowCheckedModeBanner: false,
      theme: TtTheme.light(),
      themeMode: ThemeMode.light,
      routerConfig: _router,
    );
  }
}
