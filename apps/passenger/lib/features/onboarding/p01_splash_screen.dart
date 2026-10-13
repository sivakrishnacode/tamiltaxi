import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../common/rider_logo.dart';
import '../../router/routes.dart';
import '../../state/session_actions.dart';

/// P-01 Splash: white background, the Tamil Taxi logo (same picture, size and place as the native splash, so the
/// hand-off is seamless) and the tagline.
///
/// A 2 s intro ([SimTimings.intro]) plays from the native splash's exact frame: the logo gives a small, soft
/// bounce, then the tagline rises in. Then it routes to onboarding, sign-in or Home. With "Remove animations" on it
/// shows the last frame for [SimTimings.splash] instead.
class P01SplashScreen extends ConsumerStatefulWidget {
  const P01SplashScreen({super.key, this.showcase = false});

  /// Opened on its own from the Design gallery: render seed state, start no timers.
  final bool showcase;

  @override
  ConsumerState<P01SplashScreen> createState() => _P01SplashScreenState();
}

class _P01SplashScreenState extends ConsumerState<P01SplashScreen> with SingleTickerProviderStateMixin {
  /// The native splashes' logo width (scripts/brand_icons.py).
  static const _logoWidth = 136.0;
  Timer? _timer;
  late final AnimationController _intro = AnimationController(
    vsync: this,
    duration: ref.read(simTimingProvider)(SimTimings.intro),
  );
  bool _started = false;

  // The timeline, as fractions of the intro.
  static const _bounce = Interval(0.15, 0.65, curve: Curves.easeInOut);
  static const _tagline = Interval(0.70, 1.0, curve: Curves.easeOut);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    // Gallery: the last frame (tap to replay). Animations off: the last frame, then on as before.
    if (widget.showcase || MediaQuery.disableAnimationsOf(context)) {
      _intro.value = 1;
      if (!widget.showcase) _timer = Timer(ref.read(simTimingProvider)(SimTimings.splash), _next);
      return;
    }
    _intro.addStatusListener((status) {
      if (status == AnimationStatus.completed) _next();
    });
    _intro.forward();
  }

  Future<void> _next() async {
    if (!mounted) return;
    final auth = ref.read(authRepositoryProvider);
    if (!auth.hasSeenOnboarding) {
      context.go(Routes.onboarding);
      return;
    }
    if (!auth.isLoggedIn) {
      context.go(Routes.login);
      return;
    }
    if (!ref.read(isLiveApiProvider)) {
      context.go(Routes.ride);
      return;
    }
    // Live API: finish sign-up if the name was never set, then reopen an unfinished trip.
    try {
      final profile = await auth.profile();
      if (!mounted) return;
      if (profile.name.trim().isEmpty) {
        context.go(Routes.profileSetup);
        return;
      }
    } on ApiException {
      // Signed out by a 401 (the app root shows the login screen) or a server error: carry on to Home.
    } on OfflineException {
      // Home shows its offline states.
    }
    if (!mounted || !auth.isLoggedIn) return;
    final trip = await restoreActiveTrip(ref);
    if (!mounted) return;
    context.go(trip ?? Routes.ride);
  }

  @override
  void dispose() {
    _timer?.cancel();
    _intro.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark,
      child: Scaffold(
        backgroundColor: TtColors.surface,
        body: GestureDetector(
          behavior: HitTestBehavior.opaque,
          // Design gallery: tap to watch the intro again.
          onTap: widget.showcase ? () => _intro.forward(from: 0) : null,
          child: AnimatedBuilder(
            animation: _intro,
            builder: (context, _) {
              final v = _intro.value;
              final bounce = _bounce.transform(v);
              final tagline = _tagline.transform(v);
              return Stack(
                children: [
                  // Centred on the whole window, like the native splash (136 dp wide); the bounce ends at size 1, so
                  // the last frame is the plain logo.
                  Center(
                    child: Transform.scale(
                      scale: 1 + 0.06 * math.sin(math.pi * bounce),
                      child: const RiderLogo(width: _logoWidth),
                    ),
                  ),
                  SafeArea(
                    child: Stack(
                      children: [
                        Positioned(
                          left: TtSpacing.xl,
                          right: TtSpacing.xl,
                          bottom: TtSpacing.xxl,
                          child: Opacity(
                            opacity: tagline,
                            child: Transform.translate(
                              offset: Offset(0, 12 * (1 - tagline)),
                              child: Text(
                                'Fair rides. Full fare to your driver.',
                                textAlign: TextAlign.center,
                                style: t.body.copyWith(color: TtColors.navy700),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}
