import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../router/routes.dart';
import '../../state/ride_flow.dart';
import 'widgets/trip_widgets.dart';

/// P-20 Rate driver: avatar, 5-star input (4 by default), "What went well?" tags, an optional
/// comment, Submit and Skip. Both finish the ride and add it to the top of Activity.
class P20RateDriverScreen extends ConsumerStatefulWidget {
  const P20RateDriverScreen({super.key, this.showcase = false});

  /// Opened on its own from the Design gallery: render seed state, start no timers.
  final bool showcase;

  static const tags = ['Safe driving', 'On time', 'Polite', 'Clean vehicle', 'Knew the route'];

  @override
  ConsumerState<P20RateDriverScreen> createState() => _P20RateDriverScreenState();
}

class _P20RateDriverScreenState extends ConsumerState<P20RateDriverScreen> {
  int _rating = 4;
  final Set<String> _tags = {'Safe driving', 'On time'};
  final _comment = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _finish({required bool submit}) async {
    if (_saving) return;
    setState(() => _saving = true);
    final driver = ref.read(rideFlowProvider).driver.firstName;
    await ref.read(rideFlowProvider.notifier).finishRide(rating: submit ? _rating : null);
    if (!mounted) return;
    if (submit) showTtSnack(context, 'Thanks! Your rating helps $driver.', success: true);
    context.go(Routes.ride);
    // A finished ride is a good moment for Play's review sheet; not after Skip (the rider wants to move on).
    if (submit && !widget.showcase) unawaited(PlayReview.ask());
  }

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final ride = ref.watch(rideFlowProvider);
    final driver = ride.driver;

    return Scaffold(
      backgroundColor: TtColors.surface,
      body: SafeArea(
        child: Column(
          children: [
            Align(
              alignment: Alignment.centerRight,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(0, 8, 8, 0),
                child: TextButton(
                  style: TextButton.styleFrom(foregroundColor: TtColors.navy700),
                  onPressed: _saving ? null : () => _finish(submit: false),
                  child: const Text('Skip'),
                ),
              ),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                children: [
                  Center(child: DriverAvatar(driver: driver, size: 88, tone: AvatarTone.navy)),
                  const SizedBox(height: 20),
                  Text('How was your ride with ${driver.firstName}?', style: t.h1, textAlign: TextAlign.center),
                  const SizedBox(height: 6),
                  Text(
                    ride.isRental
                        ? '${ride.vehicle.label} · ${ride.dropTitle}'
                        : '${ride.vehicle.label} · ${shortPlaceName(ride.pickup.name)} → ${shortPlaceName(ride.drop.name)}',
                    style: t.body.copyWith(color: TtColors.navy500),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 20),
                  Center(
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      child: RatingStars.input(
                        value: _rating.toDouble(),
                        onChanged: (v) => setState(() => _rating = v),
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    RatingStars.labels[_rating - 1],
                    style: t.bodySemibold.copyWith(color: TtColors.navy700, fontSize: 17),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 24),
                  Text(_rating >= 4 ? 'What went well?' : 'What could be better?',
                      style: t.bodyMedium.copyWith(color: TtColors.navy700)),
                  const SizedBox(height: 12),
                  ChoiceChips<String>(
                    options: P20RateDriverScreen.tags,
                    labelOf: (x) => x,
                    selected: _tags,
                    showCheck: true,
                    onChanged: (x) => setState(() => _tags.contains(x) ? _tags.remove(x) : _tags.add(x)),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    key: const ValueKey('rating-comment'),
                    controller: _comment,
                    maxLines: 3,
                    textCapitalization: TextCapitalization.sentences,
                    decoration: const InputDecoration(hintText: 'Add a comment (optional)'),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              child: TtButton(label: 'Submit', loading: _saving, onPressed: () => _finish(submit: true)),
            ),
          ],
        ),
      ),
    );
  }
}
