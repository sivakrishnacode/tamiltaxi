import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../state/ride_flow.dart';

/// P-11 Fare details (bottom sheet over P-10): itemised fare for the selected vehicle.
class P11FareDetailsSheet extends ConsumerWidget {
  const P11FareDetailsSheet({super.key, this.showcase = false});

  /// Opened on its own from the Design gallery: render seed state, start no timers.
  final bool showcase;

  /// Opens the sheet over the current screen.
  static Future<void> show(BuildContext context) =>
      showTtSheet<void>(context, builder: (_) => const P11FareDetailsSheet());

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.type;
    final state = ref.watch(rideFlowProvider);
    final q = state.quote;
    String short(String name) => name.split(' ').first;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            VehicleArt(q.vehicle.kind, width: 64, height: 48),
            const SizedBox(width: TtSpacing.m),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${q.vehicle.name} fare', style: t.h2),
                  Text(
                    '${short(state.pickup.name)} → ${short(state.drop.name)}',
                    style: t.bodySmall.copyWith(color: TtColors.navy500),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            IconButton(
              tooltip: 'Close',
              onPressed: () => Navigator.of(context).maybePop(),
              icon: const Icon(Symbols.close_rounded, color: TtColors.navy900),
            ),
          ],
        ),
        const SizedBox(height: TtSpacing.l),
        TtCard(child: FareBreakdown.fromQuote(q)),
        const SizedBox(height: TtSpacing.l),
        Row(
          children: [
            const Icon(
              Symbols.info_rounded,
              color: TtColors.coral600,
              size: 22,
            ),
            const SizedBox(width: TtSpacing.s),
            Text(
              'Things to know',
              style: t.bodySemibold.copyWith(fontSize: 17),
            ),
          ],
        ),
        const SizedBox(height: TtSpacing.m),
        _Note(
          icon: Symbols.timer_rounded,
          color: TtColors.navy700,
          text:
              'Waiting is free for ${q.freeWaitMin} minutes at pickup, then ${formatInr(q.waitPerMin)} per minute (up to ${formatInr(q.waitMaxCharge)}).',
        ),
        const SizedBox(height: TtSpacing.m),
        _Note(
          icon: Symbols.lock_rounded,
          color: TtColors.success,
          // Autos (government fare) have no time charge.
          text: q.timeCharge > 0
              ? 'Your fare is locked when you book. Its time charge uses a fixed 18 km/h, not the traffic time on the map, so slow traffic won\'t change it.'
              : 'Your fare is locked when you book, so slow traffic won\'t change it.',
        ),
        const SizedBox(height: TtSpacing.m),
        for (final (icon, color, text) in _thingsToKnow) ...[
          _Note(icon: icon, color: color, text: text),
          const SizedBox(height: TtSpacing.m),
        ],
        const SizedBox(height: TtSpacing.s),
        TtButton.secondary(
          label: 'Got it',
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ],
    );
  }
}

/// P-11 "Things to know": only rules Tamil Taxi really applies (waiting terms come from the quote).
const _thingsToKnow = <(IconData, Color, String)>[
  (
    Symbols.trending_up_rounded,
    TtColors.coral500,
    'Surge is capped at 1.5x and all of it goes to your driver.',
  ),
  (
    Symbols.payments_rounded,
    TtColors.navy700,
    'Pay your driver by cash or UPI when the ride ends. Tamil Taxi takes 0% of it.',
  ),
  (
    Symbols.pin_rounded,
    TtColors.navy700,
    'Share your 4-digit ride OTP only when you are in the vehicle.',
  ),
];

class _Note extends StatelessWidget {
  const _Note({required this.icon, required this.color, required this.text});
  final IconData icon;
  final Color color;
  final String text;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Icon(icon, color: color, fill: 1, size: 22),
      const SizedBox(width: TtSpacing.m),
      Expanded(
        child: Text(text, style: context.type.body.copyWith(color: TtColors.navy700)),
      ),
    ],
  );
}
