import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../router/routes.dart';
import '../../state/parcel_flow.dart';

/// PP-10 Parcel delivered: confirmation, who pays, rating and Done.
class PP10ParcelDeliveredScreen extends ConsumerStatefulWidget {
  const PP10ParcelDeliveredScreen({super.key, this.showcase = false});

  /// Opened on its own from the Design gallery: render seed state, start no timers.
  final bool showcase;

  @override
  ConsumerState<PP10ParcelDeliveredScreen> createState() => _PP10ParcelDeliveredScreenState();
}

class _PP10ParcelDeliveredScreenState extends ConsumerState<PP10ParcelDeliveredScreen> {
  int _rating = 0;
  bool _saving = false;

  Future<void> _done() async {
    setState(() => _saving = true);
    await ref.read(parcelFlowProvider.notifier).finish(rating: _rating == 0 ? null : _rating);
    if (!mounted) return;
    showTtSnack(context, 'Parcel added to Activity', success: true);
    context.go(Routes.parcel);
    // A delivered parcel is a good moment for Play's review sheet.
    if (!widget.showcase) unawaited(PlayReview.ask());
  }

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final s = ref.watch(parcelFlowProvider);
    final driver = s.driver;
    final fare = formatInr(s.quote.total);
    final deliveredAt = s.deliveredAt ?? DateTime(TtClock.today.year, TtClock.today.month, TtClock.today.day, 16, 8);
    final bySender = s.details.payer == ParcelPayer.sender;
    final receiverFirst = s.details.receiverName.split(' ').first;

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) context.go(Routes.parcel);
      },
      child: Scaffold(
        backgroundColor: TtColors.surface,
        body: SafeArea(
          child: Column(
            children: [
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(16, 32, 16, 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const TtIllustration(IllustrationKind.parcelDelivered, width: 200, height: 160),
                      const SizedBox(height: 16),
                      Text(
                        'Delivered to ${s.details.receiverName} at ${formatTime(deliveredAt)}',
                        style: t.display,
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 16),
                      Center(
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                          decoration: const BoxDecoration(color: TtColors.successTint, borderRadius: TtRadii.pillRadius),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Symbols.verified_rounded, fill: 1, size: 20, color: TtColors.success),
                              const SizedBox(width: 6),
                              Text('Verified with OTP ✓',
                                  style: t.bodySmallMedium.copyWith(color: TtColors.successText, fontWeight: FontWeight.w600)),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 24),
                      TtCard(
                        padding: const EdgeInsets.all(16),
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    bySender
                                        ? 'Pay $fare to ${driver.firstName}: Cash or UPI'
                                        : 'Receiver will pay $fare',
                                    style: TtTextStyles.tabular(t.bodySemibold.copyWith(fontSize: 17)),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    bySender
                                        ? 'Scan ${driver.firstName}\'s UPI QR or pay cash at pickup.'
                                        : '$receiverFirst pays ${driver.firstName} by cash or UPI at drop-off.',
                                    style: t.bodySmall.copyWith(color: TtColors.navy700),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 12),
                            Text(fare, style: TtTextStyles.tabular(t.display)),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                            decoration: const BoxDecoration(color: TtColors.coral50, borderRadius: TtRadii.pillRadius),
                            child: Text('0%',
                                style: t.caption.copyWith(color: TtColors.coral600, fontWeight: FontWeight.w700)),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text('${driver.firstName} keeps the full $fare.',
                                style: TtTextStyles.tabular(t.bodySmall.copyWith(color: TtColors.navy700))),
                          ),
                        ],
                      ),
                      const SizedBox(height: 20),
                      const Divider(),
                      const SizedBox(height: 20),
                      Text('Rate ${driver.firstName}', style: t.bodySemibold, textAlign: TextAlign.center),
                      const SizedBox(height: 8),
                      Center(
                        child: RatingStars.input(
                          value: _rating.toDouble(),
                          onChanged: (v) => setState(() => _rating = v),
                        ),
                      ),
                      if (_rating > 0)
                        Text(RatingStars.labels[_rating - 1],
                            textAlign: TextAlign.center, style: t.bodySmall.copyWith(color: TtColors.navy500)),
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                child: TtButton(label: 'Done', loading: _saving, onPressed: _done),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
