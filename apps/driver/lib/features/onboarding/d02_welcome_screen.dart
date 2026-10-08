import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../common/showcase.dart';
import '../../router/routes.dart';
import 'widgets/signup_widgets.dart';

/// D-02 Welcome: one screen like Ola's: the auto driver picture, "Drive and keep 100% of every fare" and
/// "Continue with phone number". New and registered drivers take the same path; the OTP step tells them apart.
class D02WelcomeScreen extends StatelessWidget {
  const D02WelcomeScreen({super.key, this.showcase = false});

  /// Opened on its own from the Design gallery: render seed state, start no timers.
  final bool showcase;

  @override
  Widget build(BuildContext context) => TtWelcomeView(
        brand: const Row(
          children: [
            DriverWordmark(size: 28, stacked: false, color: TtColors.navy900),
            SizedBox(width: TtSpacing.s),
            DriverTag(),
          ],
        ),
        image: const AssetImage('assets/onboarding/keep_fare.webp'),
        semanticLabel: 'A smiling auto driver showing a payment received on his phone',
        title: 'Drive and keep 100% of every fare',
        body: '0% commission. No subscription.',
        animate: !showcase,
        onContinue: unlessShowcase(context, showcase, () => context.push(Routes.phone(signup: true))),
      );
}
