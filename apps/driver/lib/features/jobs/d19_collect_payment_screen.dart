import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../common/showcase.dart';
import '../../router/routes.dart';
import '../../state/driver_account.dart';
import '../../state/driver_session.dart';
import '../../state/live_helpers.dart';
import '../home/widgets/navy_header.dart';
import 'widgets/job_common.dart';
import 'widgets/rate_customer_sheet.dart';

/// D-19 Collect payment (and D-22b for deliveries): "Collect ₹38", the driver's own UPI QR,
/// "Received cash" / "Received on UPI" → rate the passenger → D-14 with today's earnings up.
/// A rental or outstation trip also lists what the fare is made of (package, extra km / minutes, allowance), so the
/// driver can show the rider.
class D19CollectPaymentScreen extends ConsumerStatefulWidget {
  const D19CollectPaymentScreen({super.key, this.delivery = false, this.showcase = false, this.sample});

  /// Design gallery: the trip shown (default: the bike ride / the parcel).
  final RideRequest? sample;

  /// D-22b "Collect from receiver" variant.
  final bool delivery;

  /// Opened on its own from the Design gallery: render seed state, start no timers.
  final bool showcase;

  @override
  ConsumerState<D19CollectPaymentScreen> createState() => _D19CollectPaymentScreenState();
}

class _D19CollectPaymentScreenState extends ConsumerState<D19CollectPaymentScreen> {
  late final RideRequest _job = ref.read(driverSessionProvider).job ??
      widget.sample ??
      (widget.delivery ? Seed.deliveryRequest : Seed.rideRequest);
  bool _busy = false;

  bool get _isDelivery => widget.delivery || _job.isDelivery;

  String get _rateName => _isDelivery ? (_job.parcel?.receiverName ?? _job.customerName) : _job.customerName;

  /// "Received cash / on UPI". Mock mode (and the gallery) asks for the passenger's stars first; live there is no API
  /// for drivers rating riders, so no sheet that throws the stars away.
  Future<void> _received(PaymentMode mode) async {
    if (_busy) return;
    final live = !widget.showcase && ref.read(isLiveApiProvider);
    if (!live) {
      final stars = await RateCustomerSheet.show(context, name: _rateName.split(' ').first);
      if (stars == null || !mounted) return;
    }
    if (widget.showcase) return showTtSnack(context, kPreviewNote);
    setState(() => _busy = true);
    try {
      await ref.read(driverSessionProvider.notifier).collectPayment(mode);
    } on Exception catch (e) {
      // Offline: the payment method wasn't saved; stay here so the driver can tap again.
      if (!mounted) return;
      setState(() => _busy = false);
      return showTtSnack(context, userMessage(e));
    }
    if (!mounted) return;
    showTtSnack(context, '${formatInr(_job.fare)} added. You keep 100%.', success: true);
    context.go(Routes.home);
  }

  /// A rental / outstation trip's fare lines: the server's final ones (with any extra km / minutes), else the terms'
  /// own (mock mode). Null for local rides and parcels.
  FareQuote? _modeQuote() {
    final terms = _job.modeTerms;
    if (terms == null) return null;
    final q = _job.quote;
    if (q != null && q.total == _job.fare) return q.modeTerms == null ? q.copyWith(modeTerms: terms) : q;
    return RideModeRates.quote(Seed.vehicle(_job.vehicle), terms, distanceKm: _job.tripKm, durationMin: _job.tripMin);
  }

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final liveApi = !widget.showcase && ref.watch(isLiveApiProvider);
    final profileState = ref.watch(driverProfileProvider);
    // Live: only the driver's own UPI ID, once loaded (never the seed one); mock: the seed driver.
    final profile = profileState.value ?? (liveApi ? null : Seed.karthik);
    // Demo: a delivery shown with the bike driver's profile pays the seed goods driver. Live: always you.
    final demoGoods = !liveApi && _isDelivery && !(profile?.vehicleKind.isGoods ?? true);
    final upi = (demoGoods ? Seed.selvam.upiId : profile?.upiId ?? '').trim();
    final payee = demoGoods ? Seed.selvam.name : profile?.name ?? '';
    final qrData = 'upi://pay?pa=$upi&pn=${Uri.encodeComponent(payee)}&am=${_job.fare}&cu=INR';
    final fromReceiver = _job.parcel?.payer != ParcelPayer.sender;
    final live = !widget.showcase && ref.watch(driverSessionProvider.select((s) => s.job)) != null;

    return PopScope(
      canPop: !live,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) confirmLeaveJob(context, delivery: _isDelivery);
      },
      child: Scaffold(
        backgroundColor: TtColors.surface,
        body: Column(
          children: [
            NavyHeader(
              padding: const EdgeInsets.fromLTRB(TtSpacing.gutter, TtSpacing.l, TtSpacing.gutter, TtSpacing.xl),
              child: SizedBox(
                width: double.infinity,
                child: Column(children: [
                  if (_isDelivery)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: TtSpacing.m, vertical: 6),
                      decoration: const BoxDecoration(color: TtColors.success, borderRadius: TtRadii.pillRadius),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        const Icon(Symbols.verified_rounded, fill: 1, color: Colors.white, size: 18),
                        const SizedBox(width: 6),
                        Text('Delivered · OTP verified', style: t.bodySmallMedium.copyWith(color: Colors.white)),
                      ]),
                    )
                  else
                    Text('${_job.isRental ? 'Rental' : _job.isOutstation ? 'Trip' : 'Ride'} complete · ${_job.customerName}',
                        style: t.body.copyWith(color: Colors.white70)),
                  const SizedBox(height: TtSpacing.xs),
                  FittedBox(
                    child: Text('Collect ${formatInr(_job.fare)}', style: t.heroSmall.copyWith(color: Colors.white)),
                  ),
                  Text(
                    _isDelivery && !_job.isShifting ? 'from ${fromReceiver ? 'receiver' : 'sender'} · Cash or UPI' : 'Cash or UPI',
                    style: t.body.copyWith(color: Colors.white),
                  ),
                ]),
              ),
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(TtSpacing.gutter, TtSpacing.l, TtSpacing.gutter, TtSpacing.l),
                child: Column(children: [
                  if (_job.shifting case ShiftingDetails(lines: final l?)) ...[
                    Container(
                      padding: const EdgeInsets.all(TtSpacing.l),
                      decoration: BoxDecoration(
                        color: TtColors.background,
                        borderRadius: TtRadii.cardRadius,
                        border: Border.all(color: TtColors.divider),
                      ),
                      child: FareBreakdown.fromShifting(
                        l,
                        vehicle: _job.vehicle,
                        details: _job.shifting,
                        between: _job.shifting!.between,
                        title: 'Packers & Movers · ${_job.shifting!.homeSize.label}',
                      ),
                    ),
                    const SizedBox(height: TtSpacing.l),
                  ] else if (_modeQuote() case final q?) ...[
                    Container(
                      padding: const EdgeInsets.all(TtSpacing.l),
                      decoration: BoxDecoration(
                        color: TtColors.background,
                        borderRadius: TtRadii.cardRadius,
                        border: Border.all(color: TtColors.divider),
                      ),
                      child: FareBreakdown.fromQuote(q, title: _job.modeLabel),
                    ),
                    const SizedBox(height: TtSpacing.l),
                  ],
                  if (upi.isEmpty)
                    _NoUpiCard(
                      loading: profileState.isLoading,
                      failed: profileState.hasError,
                      onRetry: () => ref.invalidate(driverProfileProvider),
                    )
                  else ...[
                    Container(
                      padding: const EdgeInsets.all(TtSpacing.m),
                      decoration: BoxDecoration(
                        color: TtColors.surface,
                        borderRadius: const BorderRadius.all(Radius.circular(20)),
                        border: Border.all(color: TtColors.divider),
                        boxShadow: TtShadows.soft,
                      ),
                      child: Stack(alignment: Alignment.center, children: [
                        QrImageView(
                          data: qrData,
                          size: 196,
                          padding: EdgeInsets.zero,
                          errorCorrectionLevel: QrErrorCorrectLevel.H,
                          semanticsLabel: 'UPI QR code for $upi',
                          eyeStyle: const QrEyeStyle(eyeShape: QrEyeShape.square, color: TtColors.navy900),
                          dataModuleStyle:
                              const QrDataModuleStyle(dataModuleShape: QrDataModuleShape.square, color: TtColors.navy900),
                        ),
                        // The Tamil Taxi app icon (it was a coral "r" from the old name). Error correction H keeps the
                        // code readable under it.
                        Container(
                          width: 48,
                          height: 48,
                          decoration: const BoxDecoration(
                            shape: BoxShape.circle,
                            color: TtColors.surface,
                            boxShadow: TtShadows.soft,
                          ),
                          padding: const EdgeInsets.all(3),
                          child: ClipOval(
                            child: Image.asset('assets/brand/launcher_rider.png', package: 'tamiltaxi_ui', fit: BoxFit.cover),
                          ),
                        ),
                      ]),
                    ),
                    const SizedBox(height: TtSpacing.m),
                    Text(upi, style: t.bodySemibold),
                  ],
                  const SizedBox(height: TtSpacing.s),
                  Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: TtSpacing.s, vertical: 2),
                      decoration: const BoxDecoration(color: TtColors.coral50, borderRadius: TtRadii.pillRadius),
                      child: Text('0%',
                          style: t.caption.copyWith(color: TtColors.coral600, fontWeight: FontWeight.w700)),
                    ),
                    const SizedBox(width: TtSpacing.s),
                    Flexible(
                      child: Text('You keep 100% of this fare', style: t.body.copyWith(color: TtColors.navy700)),
                    ),
                  ]),
                  const SizedBox(height: TtSpacing.xl),
                  LayoutBuilder(builder: (context, c) {
                    final cash = TtButton.secondary(
                      label: 'Received cash',
                      icon: Symbols.payments_rounded,
                      onPressed: _busy ? null : () => _received(PaymentMode.cash),
                    );
                    final upiButton = TtButton(
                      label: 'Received on UPI',
                      icon: Symbols.qr_code_2_rounded,
                      loading: _busy,
                      onPressed: () => _received(PaymentMode.upi),
                    );
                    // Side by side when there is room (D-19), stacked on narrow phones.
                    if (c.maxWidth >= 400) {
                      return Row(children: [
                        Expanded(child: cash),
                        const SizedBox(width: TtSpacing.m),
                        Expanded(child: upiButton),
                      ]);
                    }
                    return Column(children: [upiButton, const SizedBox(height: TtSpacing.m), cash]);
                  }),
                  const SizedBox(height: TtSpacing.l),
                  Text('Tap once the money is with you. Then rate ${_rateName.split(' ').first}.',
                      textAlign: TextAlign.center, style: t.caption),
                ]),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Live: no QR without the driver's own UPI ID (still loading, failed to load, or never added).
class _NoUpiCard extends StatelessWidget {
  const _NoUpiCard({required this.loading, required this.failed, required this.onRetry});

  final bool loading;
  final bool failed;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final (String title, String body) = loading
        ? ('Loading your UPI QR…', 'Collect cash, or wait a moment for the QR.')
        : failed
        ? ("Couldn't load your UPI QR", 'Check your connection, or collect cash.')
        : ('No UPI ID yet', 'Add your UPI ID in Account to show a payment QR here. Collect cash for now.');
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(TtSpacing.l),
      decoration: BoxDecoration(
        color: TtColors.background,
        borderRadius: const BorderRadius.all(Radius.circular(20)),
        border: Border.all(color: TtColors.divider),
      ),
      child: Column(
        children: [
          loading
              ? const SizedBox(width: 28, height: 28, child: CircularProgressIndicator(strokeWidth: 3))
              : const Icon(Symbols.qr_code_2_rounded, size: 40, color: TtColors.navy500),
          const SizedBox(height: TtSpacing.m),
          Text(title, style: t.bodySemibold, textAlign: TextAlign.center),
          const SizedBox(height: TtSpacing.xs),
          Text(
            body,
            style: t.body.copyWith(color: TtColors.navy700),
            textAlign: TextAlign.center,
          ),
          if (failed) ...[
            const SizedBox(height: TtSpacing.s),
            TtButton.text(label: 'Try again', icon: Symbols.refresh_rounded, onPressed: onRetry),
          ],
        ],
      ),
    );
  }
}
