import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../common/driver_logo.dart';
import '../../common/start_route.dart';
import '../../router/routes.dart';

/// D-01 Splash: white background and the Tamil Taxi Driver logo (same picture, size and place as the native splash).
/// After 1.5 s: signed in → Home, otherwise → D-02 Welcome. With the live API a signed-in driver goes
/// where their application stands: Home (approved), or D-07 (missing documents, under review or rejected).
class D01SplashScreen extends ConsumerStatefulWidget {
  const D01SplashScreen({super.key, this.showcase = false});

  /// Opened on its own from the Design gallery: render seed state, start no timers.
  final bool showcase;

  @override
  ConsumerState<D01SplashScreen> createState() => _D01SplashScreenState();
}

class _D01SplashScreenState extends ConsumerState<D01SplashScreen> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    if (widget.showcase) return;
    _timer = Timer(ref.read(simTimingProvider)(SimTimings.splash), _route);
  }

  Future<void> _route() async {
    if (!mounted) return;
    final repo = ref.read(driverRepositoryProvider);
    if (!repo.isLoggedIn) {
      context.go(Routes.welcome);
      return;
    }
    var route = Routes.home;
    if (ref.read(isLiveApiProvider)) {
      try {
        route = await driverStartRoute(
          repo,
          ref.read(identityRepositoryProvider),
        );
      } on ApiException catch (e) {
        // 401: the session was cleared; anything else: Home shows what it can.
        route = e.status == 401 ? Routes.welcome : Routes.documents;
      } catch (_) {
        route = Routes.documents;
      }
      if (route != Routes.welcome && mounted) route = await permissionsFirst(ref, route);
    }
    if (mounted) context.go(route);
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark,
      child: Scaffold(
        backgroundColor: TtColors.surface,
        body: Stack(
          children: [
            // Exactly where the native splash drew it: the window centre, 129 dp wide (scripts/brand_icons.py).
            const Center(child: DriverLogo(width: 129)),
            SafeArea(
              child: Align(
                alignment: Alignment.bottomCenter,
                child: Padding(
                  padding: const EdgeInsets.only(bottom: TtSpacing.xxl + TtSpacing.s),
                  child: Text('Rides and deliveries near you',
                      textAlign: TextAlign.center,
                      style: context.type.body.copyWith(color: TtColors.navy700)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
