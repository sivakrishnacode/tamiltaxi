import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../../router/routes.dart';
import '../../../state/ride_flow.dart';

/// "Book outstation instead?" (over P-08 search, P-09 pin and P-10): the drop is beyond the service city (Ooty from
/// Coimbatore), so a local ride can't go there, but an outstation cab can. Pops true for "Book outstation".
class OutstationOfferSheet extends ConsumerWidget {
  const OutstationOfferSheet({super.key, required this.drop});

  final Place drop;

  static Future<bool> show(BuildContext context, Place drop) async =>
      await showTtSheet<bool>(context, builder: (_) => OutstationOfferSheet(drop: drop)) ?? false;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.type;
    final pickup = ref.watch(rideFlowProvider.select((s) => s.pickup.location));
    final cities = ref.watch(serviceCitiesProvider).value ?? const <ServiceCity>[];
    final city = nearestCity(cities, pickup)?.name ?? ref.watch(serviceCitiesLabelProvider);
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: TtSpacing.m),
        Center(
          child: Image.asset(
            'packages/tamiltaxi_ui/assets/vehicles/way_outstation.webp',
            height: 72,
            fit: BoxFit.contain,
            filterQuality: FilterQuality.medium,
            errorBuilder: (context, error, stack) => const SizedBox(height: 72),
          ),
        ),
        const SizedBox(height: TtSpacing.l),
        Text('Book outstation instead?', style: t.h2, textAlign: TextAlign.center),
        const SizedBox(height: TtSpacing.s),
        Text(
          "${drop.name} is outside $city, so a local ride can't go there. "
          'An outstation cab can, one way or there and back.',
          style: t.body.copyWith(color: TtColors.navy500),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: TtSpacing.xl),
        TtButton(label: 'Book outstation', onPressed: () => Navigator.of(context).pop(true)),
        const SizedBox(height: TtSpacing.s),
        TtButton.secondary(label: 'Change drop', onPressed: () => Navigator.of(context).pop(false)),
      ],
    );
  }
}

/// A local drop outside the service area (with the pickup inside): offers outstation and, when taken, opens P-35
/// with [drop] as the destination ([replace]: instead of the screen below, so P-10 isn't left under it). Returns
/// whether the rider took it; false = "Change drop".
Future<bool> offerOutstation(BuildContext context, WidgetRef ref, Place drop, {bool replace = false}) async {
  final take = await OutstationOfferSheet.show(context, drop);
  if (!take || !context.mounted) return false;
  ref.read(rideFlowProvider.notifier)
    ..setDrop(drop)
    ..startMode(const ModeRequest(mode: RideMode.outstation));
  if (replace) {
    context.go(Routes.outstation);
  } else {
    context.push(Routes.outstation);
  }
  return true;
}
