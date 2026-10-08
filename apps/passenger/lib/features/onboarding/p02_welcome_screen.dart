import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../router/routes.dart';

/// P-02 Welcome: one screen like Ola's: the rider-and-vehicles picture, "Rides and parcels at fair prices" and
/// "Continue with phone number" (marks the welcome as seen, then P-03).
class P02WelcomeScreen extends ConsumerWidget {
  const P02WelcomeScreen({super.key, this.showcase = false});

  /// Opened on its own from the Design gallery: render seed state, start no timers.
  final bool showcase;

  @override
  Widget build(BuildContext context, WidgetRef ref) => TtWelcomeView(
        brand: const TtWordmark(size: 28, stacked: false, roadColor: TtColors.coral500),
        image: const AssetImage('assets/onboarding/choose_ride.webp'),
        semanticLabel: 'A rider choosing between a bike, an auto and a cab',
        title: 'Rides and parcels at fair prices',
        body: 'Bike, auto or cab. Your driver keeps 100% of the fare.',
        animate: !showcase,
        onContinue: showcase
            ? () {}
            : () {
                ref.read(authRepositoryProvider).markOnboardingSeen();
                context.go(Routes.login);
              },
      );
}
