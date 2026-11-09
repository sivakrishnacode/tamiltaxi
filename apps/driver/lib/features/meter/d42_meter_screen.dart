import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../common/showcase.dart';
import '../../router/routes.dart';
import '../../state/driver_location.dart';
import '../../state/driver_session.dart';
import '../../state/live_helpers.dart';
import '../../state/meter.dart';
import '../home/widgets/navy_header.dart';
import '../jobs/widgets/upi_qr.dart';

/// D-42 Meter tab (also opened from Home's Meter button and strip), for a passenger picked up off the app. Start
/// (D-42): the driver's rates and Start meter (going offline first). Running (D-42b): the fare, km and time, big on
/// navy so the passenger can read it, then End trip. Collect (D-42c): the fare, its lines and the driver's UPI QR,
/// then Done. Works with no internet ([MeterController]).
class D42MeterScreen extends ConsumerStatefulWidget {
  const D42MeterScreen({super.key, this.showcase = false, this.sample, this.sampleRates});

  /// Opened on its own from the Design gallery: render [sample] (else the start view at [sampleRates]), start nothing.
  final bool showcase;
  final MeterState? sample;
  final MeterRates? sampleRates;

  /// Gallery: an auto meter 3.1 km and 11 min 42 s in (₹82).
  static MeterState sampleRunning() {
    final now = DateTime.now();
    return MeterState(
      status: MeterStatus.running,
      rule: Seed.vehicle(VehicleKind.auto).fareRule,
      startedAt: now.subtract(const Duration(minutes: 11, seconds: 42)),
      metres: 3150,
      lastFixAt: now,
      upiId: Seed.karthik.upiId,
      payee: Seed.karthik.name,
    );
  }

  /// Gallery: the same auto trip ended at 3.8 km after 14 minutes (₹100).
  static MeterState sampleEnded() {
    final now = DateTime.now();
    return MeterState(
      status: MeterStatus.ended,
      rule: Seed.vehicle(VehicleKind.auto).fareRule,
      startedAt: now.subtract(const Duration(minutes: 14)),
      endedAt: now,
      metres: 3820,
      upiId: Seed.karthik.upiId,
      payee: Seed.karthik.name,
    );
  }

  /// Gallery: an auto's rates with the night fare.
  static final sampleAutoRates = MeterRates(
    vehicle: VehicleKind.auto,
    rule: Seed.vehicle(VehicleKind.auto).fareRule,
    night: const AutoNightFare(multiplier: 1.5, startHour: 22, endHour: 5),
    upiId: Seed.karthik.upiId,
    payee: Seed.karthik.name,
  );

  @override
  ConsumerState<D42MeterScreen> createState() => _D42MeterScreenState();
}

class _D42MeterScreenState extends ConsumerState<D42MeterScreen> {
  bool _busy = false;

  /// While running: the clock and the "Weak GPS" note follow the time.
  Timer? _ticker;

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  MeterController get _meter => ref.read(meterProvider.notifier);

  Future<void> _start(MeterRates rates) async {
    if (widget.showcase) return showTtSnack(context, kPreviewNote);
    if (ref.read(driverSessionProvider).onJob) {
      return showTtSnack(context, 'Finish your current trip first, then start the meter.');
    }
    setState(() => _busy = true);
    try {
      await _meter.start(rates);
    } on LocationProblem catch (e) {
      if (!mounted) return;
      final locator = ref.read(driverLocatorProvider);
      showTtSnack(
        context,
        e.message,
        actionLabel: e.fix == LocationFix.none ? null : 'Settings',
        onAction: e.fix == LocationFix.none ? null : () => locator.openSettings(e.fix),
      );
    } catch (e) {
      if (mounted) showTtSnack(context, userMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _end(int fare) async {
    if (widget.showcase) return showTtSnack(context, kPreviewNote);
    final ok = await showTtConfirm(
      context,
      icon: Symbols.stop_circle_rounded,
      title: 'End the trip at ${formatInr(fare)}?',
      message: 'The meter stops and shows the fare to collect.',
      confirmLabel: 'End trip',
      cancelLabel: 'Keep running',
    );
    if (ok && mounted) await _meter.end();
  }

  Future<void> _cancel() async {
    if (widget.showcase) return showTtSnack(context, kPreviewNote);
    final ok = await showTtConfirm(
      context,
      icon: Symbols.delete_rounded,
      title: 'Cancel the meter?',
      message: 'The distance so far is lost. Use this only if you started it by mistake.',
      confirmLabel: 'Cancel meter',
      cancelLabel: 'Keep running',
      destructive: true,
    );
    if (ok && mounted) await _meter.clear();
  }

  Future<void> _done(int fare) async {
    if (widget.showcase) return showTtSnack(context, kPreviewNote);
    await _meter.clear();
    if (!mounted) return;
    showTtSnack(context, 'Meter trip done: ${formatInr(fare)}. You keep 100%.', success: true);
    context.go(Routes.home);
  }

  @override
  Widget build(BuildContext context) {
    final MeterState meter = widget.sample ?? (widget.showcase ? const MeterState() : ref.watch(meterProvider));
    final running = meter.status == MeterStatus.running;
    if (running && !widget.showcase) {
      _ticker ??= Timer.periodic(const Duration(seconds: 1), (_) {
        if (mounted) setState(() {});
      });
    } else {
      _ticker?.cancel();
      _ticker = null;
    }
    return switch (meter.status) {
      MeterStatus.idle => _startView(context),
      MeterStatus.running => _RunningView(
          meter: meter,
          now: DateTime.now(),
          onEnd: () => _end(meter.fare),
          onCancel: _cancel,
        ),
      MeterStatus.ended => _CollectView(meter: meter, onDone: () => _done(meter.fare)),
    };
  }

  Widget _startView(BuildContext context) {
    final t = context.type;
    final AsyncValue<MeterRates> rates =
        widget.showcase ? AsyncData(widget.sampleRates ?? D42MeterScreen.sampleAutoRates) : ref.watch(meterRatesProvider);
    final online = widget.showcase || ref.watch(driverSessionProvider.select((s) => s.online));
    return Scaffold(
      backgroundColor: TtColors.background,
      appBar: const TtAppBar(title: 'Meter', showBack: false),
      body: rates.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(TtSpacing.gutter),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Symbols.wifi_off_rounded, size: 40, color: TtColors.navy500),
              const SizedBox(height: TtSpacing.m),
              Text(e is MeterUnavailable ? e.toString() : "Couldn't load your rates.",
                  textAlign: TextAlign.center, style: t.body),
              TtButton.text(label: 'Try again', icon: Symbols.refresh_rounded, onPressed: () => ref.invalidate(meterRatesProvider)),
            ]),
          ),
        ),
        data: (r) => ListView(
          padding: const EdgeInsets.fromLTRB(TtSpacing.gutter, TtSpacing.l, TtSpacing.gutter, TtSpacing.xl),
          children: [
            Row(children: [
              Container(
                width: 58,
                height: 58,
                decoration: const BoxDecoration(color: TtColors.coral50, borderRadius: BorderRadius.all(Radius.circular(18))),
                child: const Icon(Symbols.speed_rounded, size: 32, fill: 1, color: TtColors.coral600),
              ),
              const SizedBox(width: TtSpacing.m),
              Expanded(child: Text('Passenger off the app?\nUse the meter.', style: t.h2)),
            ]),
            const SizedBox(height: TtSpacing.m),
            Text(
              'Start when the passenger gets in. The fare goes up by the distance, like an auto meter. '
              'Works without internet.',
              style: t.body.copyWith(color: TtColors.navy700),
            ),
            const SizedBox(height: TtSpacing.l),
            _RatesCard(rates: r, now: DateTime.now()),
            if (!r.fresh) ...[
              const SizedBox(height: TtSpacing.m),
              const _Note(
                icon: Symbols.wifi_off_rounded,
                text: 'No internet, so these are the rates saved on this phone.',
              ),
            ],
            if (online) ...[
              const SizedBox(height: TtSpacing.m),
              const _Note(
                icon: Symbols.power_settings_new_rounded,
                text: "You're online. The meter takes you offline, so no ride requests come in while it runs.",
                warning: true,
              ),
            ],
          ],
        ),
      ),
      bottomNavigationBar: rates.value == null
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(TtSpacing.gutter, TtSpacing.m, TtSpacing.gutter, TtSpacing.m),
                // A bottom bar gets the whole height: only the button's own.
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  TtButton(
                    label: 'Start meter',
                    icon: Symbols.play_arrow_rounded,
                    loading: _busy,
                    onPressed: () => _start(rates.value!),
                  ),
                ]),
              ),
            ),
    );
  }
}

/// D-42: the driver's rates for the meter. Autos: minimum fare (the distance it covers), then per km, and the night
/// fare; other vehicles: base, per km, per minute (counted at 18 km/h, as for booked trips) and the minimum fare.
class _RatesCard extends StatelessWidget {
  const _RatesCard({required this.rates, required this.now});

  final MeterRates rates;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final r = rates.rule;
    // A fare by the km only (autos): the minimum fare covers its first stretch, then each km after.
    final minKm = r.perMin == 0 && r.perKm > 0 && r.minFare > r.base ? (r.minFare - r.base) / r.perKm : null;
    final night = AutoNightFare.kinds.contains(rates.vehicle) ? rates.night : null;
    final lines = <(String, String, String)>[
      if (minKm == null) ('Base fare', 'To start the trip', formatInr(r.base)),
      ('Minimum fare', minKm != null ? 'Up to ${minKm.toStringAsFixed(1)} km' : 'A short trip pays at least this', formatInr(r.minFare)),
      (minKm != null ? 'After that' : 'Distance', 'Per km', _rs(r.perKm)),
      if (r.perMin > 0) ('Time', 'Per minute, counted at 18 km/h', _rs(r.perMin)),
      if (night != null)
        (
          'Night fare',
          'Started ${_hour(night.startHour)} to ${_hour(night.endHour)}${rates.nightAt(now) > 1 ? ' · on now' : ''}',
          _x(night.multiplier),
        ),
    ];
    return TtCard(
      padding: EdgeInsets.zero,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Container(
          padding: const EdgeInsets.fromLTRB(TtSpacing.l, TtSpacing.m, TtSpacing.l, TtSpacing.m),
          decoration: const BoxDecoration(
            color: TtColors.coral50,
            borderRadius: BorderRadius.vertical(top: Radius.circular(TtRadii.card)),
          ),
          child: Text('${rates.vehicle.label} · your rates', style: t.bodySemibold.copyWith(color: TtColors.coral600)),
        ),
        for (var i = 0; i < lines.length; i++) ...[
          if (i > 0) const Divider(height: 1, indent: TtSpacing.l, endIndent: TtSpacing.l),
          Padding(
            padding: const EdgeInsets.fromLTRB(TtSpacing.l, TtSpacing.m, TtSpacing.l, TtSpacing.m),
            child: Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(lines[i].$1, style: t.bodyMedium),
                  Text(lines[i].$2, style: t.bodySmall.copyWith(color: TtColors.navy500)),
                ]),
              ),
              const SizedBox(width: TtSpacing.m),
              Text(lines[i].$3, style: TtTextStyles.tabular(t.bodySemibold)),
            ]),
          ),
        ],
      ]),
    );
  }

  /// "₹25", "₹0.30".
  static String _rs(double v) => v == v.roundToDouble() ? '₹${v.toStringAsFixed(0)}' : '₹${v.toStringAsFixed(2)}';

  /// "1.5×".
  static String _x(double m) => '${m == m.roundToDouble() ? m.toStringAsFixed(0) : m.toStringAsFixed(1)}×';

  /// "10 pm", "5 am".
  static String _hour(int h) => '${h % 12 == 0 ? 12 : h % 12} ${h < 12 ? 'am' : 'pm'}';
}

class _Note extends StatelessWidget {
  const _Note({required this.icon, required this.text, this.warning = false});

  final IconData icon;
  final String text;
  final bool warning;

  @override
  Widget build(BuildContext context) {
    final color = warning ? const Color(0xFF78350F) : TtColors.navy700;
    return Container(
      padding: const EdgeInsets.all(TtSpacing.m),
      decoration: BoxDecoration(
        color: warning ? TtColors.warningTint : TtColors.inputBg,
        borderRadius: const BorderRadius.all(Radius.circular(12)),
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(icon, size: 20, color: color),
        const SizedBox(width: TtSpacing.s),
        Expanded(child: Text(text, style: context.type.bodySmall.copyWith(color: color))),
      ]),
    );
  }
}

/// D-42b: the running meter, big on navy like a real one so the passenger can read it from the back seat.
class _RunningView extends StatelessWidget {
  const _RunningView({
    required this.meter,
    required this.now,
    required this.onEnd,
    required this.onCancel,
  });

  final MeterState meter;
  final DateTime now;
  final VoidCallback onEnd;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final elapsed = meter.elapsed(now);
    final weak = meter.gpsWeak(now);
    final auto = AutoNightFare.kinds.contains(meter.vehicle);
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(statusBarColor: Colors.transparent),
      child: Scaffold(
        backgroundColor: TtColors.navy900,
        body: SafeArea(
          child: Column(children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(TtSpacing.gutter, TtSpacing.m, TtSpacing.gutter, 0),
              child: Align(alignment: Alignment.centerRight, child: _LivePill()),
            ),
            Expanded(
              child: Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(horizontal: TtSpacing.gutter),
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Text('${meter.vehicle.label} · ${auto ? 'Government fare' : 'Your rates'}',
                        style: t.body.copyWith(color: Colors.white70)),
                    FittedBox(
                      child: Text(
                        formatInr(meter.fare),
                        semanticsLabel: 'Fare ${formatInr(meter.fare)}',
                        style: t.hero.copyWith(color: Colors.white, fontSize: 84, height: 1.1),
                      ),
                    ),
                    if (meter.night > 1)
                      Padding(
                        padding: const EdgeInsets.only(top: TtSpacing.xs),
                        child: Text('Night fare ${_x(meter.night)}',
                            style: t.bodySmallMedium.copyWith(color: const Color(0xFFFCD34D))),
                      ),
                    const SizedBox(height: TtSpacing.l),
                    Container(
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.07),
                        borderRadius: const BorderRadius.all(Radius.circular(16)),
                      ),
                      child: IntrinsicHeight(
                        child: Row(children: [
                          Expanded(child: _Stat(value: meter.km.toStringAsFixed(1), unit: 'km')),
                          VerticalDivider(width: 1, color: Colors.white.withValues(alpha: 0.12)),
                          Expanded(child: _Stat(value: _clock(elapsed), unit: 'min')),
                        ]),
                      ),
                    ),
                    const SizedBox(height: TtSpacing.m),
                    if (weak)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: TtSpacing.m, vertical: TtSpacing.s),
                        decoration: BoxDecoration(
                          color: TtColors.warning.withValues(alpha: 0.16),
                          borderRadius: const BorderRadius.all(Radius.circular(10)),
                        ),
                        child: Row(children: [
                          const Icon(Symbols.gps_off_rounded, size: 18, color: Color(0xFFFCD34D)),
                          const SizedBox(width: TtSpacing.s),
                          Expanded(
                            child: Text('Weak GPS. The distance is added when the signal is back.',
                                style: t.bodySmall.copyWith(color: const Color(0xFFFCD34D))),
                          ),
                        ]),
                      )
                    else
                      Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                        const Icon(Symbols.gps_fixed_rounded, size: 18, color: Color(0xFF4ADE80)),
                        const SizedBox(width: 6),
                        Flexible(
                          child: Text(
                            'GPS good · started ${formatTime(meter.startedAt ?? now).toLowerCase()}',
                            style: t.bodySmall.copyWith(color: Colors.white70),
                          ),
                        ),
                      ]),
                  ]),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(TtSpacing.gutter, TtSpacing.m, TtSpacing.gutter, TtSpacing.m),
              child: Column(children: [
                TtButton(label: 'End trip', icon: Symbols.stop_circle_rounded, onPressed: onEnd),
                const SizedBox(height: TtSpacing.xs),
                TextButton(
                  onPressed: onCancel,
                  style: TextButton.styleFrom(foregroundColor: Colors.white70, minimumSize: const Size(0, 44)),
                  child: Text('Cancel meter', style: t.bodySemibold.copyWith(color: Colors.white70)),
                ),
              ]),
            ),
          ]),
        ),
      ),
    );
  }

  /// "11:42", "1:05:09".
  static String _clock(Duration d) {
    String two(int n) => n.toString().padLeft(2, '0');
    final h = d.inHours;
    final m = d.inMinutes % 60;
    final s = d.inSeconds % 60;
    return h > 0 ? '$h:${two(m)}:${two(s)}' : '${two(d.inMinutes)}:${two(s)}';
  }

  static String _x(double m) => '${m == m.roundToDouble() ? m.toStringAsFixed(0) : m.toStringAsFixed(1)}×';
}

class _LivePill extends StatelessWidget {
  const _LivePill();

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
        decoration: BoxDecoration(
          color: TtColors.success.withValues(alpha: 0.18),
          borderRadius: TtRadii.pillRadius,
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 8,
            height: 8,
            decoration: const BoxDecoration(color: Color(0xFF4ADE80), shape: BoxShape.circle),
          ),
          const SizedBox(width: 7),
          Text('METER RUNNING',
              style: context.type.caption
                  .copyWith(color: const Color(0xFF86EFAC), fontWeight: FontWeight.w700, letterSpacing: 0.6)),
        ]),
      );
}

class _Stat extends StatelessWidget {
  const _Stat({required this.value, required this.unit});

  final String value;
  final String unit;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: TtSpacing.m, horizontal: TtSpacing.s),
      child: Column(children: [
        FittedBox(child: Text(value, style: TtTextStyles.tabular(t.display.copyWith(color: Colors.white)))),
        Text(unit, style: t.bodySmall.copyWith(color: Colors.white60)),
      ]),
    );
  }
}

/// D-42c: the fare to collect, its lines and the driver's UPI QR, then Done.
class _CollectView extends StatelessWidget {
  const _CollectView({required this.meter, required this.onDone});

  final MeterState meter;
  final VoidCallback onDone;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final q = meter.quote!;
    final minutes = meter.elapsed(DateTime.now()).inMinutes;
    final upi = meter.upiId.trim();
    return Scaffold(
      backgroundColor: TtColors.surface,
      body: Column(children: [
        NavyHeader(
          padding: const EdgeInsets.fromLTRB(TtSpacing.gutter, TtSpacing.l, TtSpacing.gutter, TtSpacing.xl),
          child: SizedBox(
            width: double.infinity,
            child: Column(children: [
              Text('Meter trip · ${meter.km.toStringAsFixed(1)} km · $minutes min',
                  textAlign: TextAlign.center, style: t.body.copyWith(color: Colors.white70)),
              const SizedBox(height: TtSpacing.xs),
              FittedBox(
                child: Text('Collect ${formatInr(meter.fare)}', style: t.heroSmall.copyWith(color: Colors.white)),
              ),
              Text('Cash or UPI', style: t.body.copyWith(color: Colors.white)),
            ]),
          ),
        ),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(TtSpacing.gutter, TtSpacing.l, TtSpacing.gutter, TtSpacing.l),
            child: Column(children: [
              Container(
                padding: const EdgeInsets.all(TtSpacing.l),
                decoration: BoxDecoration(
                  color: TtColors.background,
                  borderRadius: TtRadii.cardRadius,
                  border: Border.all(color: TtColors.divider),
                ),
                child: FareBreakdown.fromQuote(q, title: '${meter.vehicle.label} meter'),
              ),
              const SizedBox(height: TtSpacing.l),
              if (upi.isEmpty)
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(TtSpacing.l),
                  decoration: BoxDecoration(
                    color: TtColors.background,
                    borderRadius: const BorderRadius.all(Radius.circular(20)),
                    border: Border.all(color: TtColors.divider),
                  ),
                  child: Column(children: [
                    const Icon(Symbols.qr_code_2_rounded, size: 40, color: TtColors.navy500),
                    const SizedBox(height: TtSpacing.m),
                    Text('No UPI ID yet', style: t.bodySemibold),
                    const SizedBox(height: TtSpacing.xs),
                    Text('Add your UPI ID in Account to show a payment QR here. Collect cash for now.',
                        textAlign: TextAlign.center, style: t.body.copyWith(color: TtColors.navy700)),
                  ]),
                )
              else ...[
                UpiQr(upiId: upi, payee: meter.payee, amount: meter.fare),
                const SizedBox(height: TtSpacing.m),
                Text(upi, style: t.bodySemibold),
              ],
              const SizedBox(height: TtSpacing.s),
              Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: TtSpacing.s, vertical: 2),
                  decoration: const BoxDecoration(color: TtColors.coral50, borderRadius: TtRadii.pillRadius),
                  child: Text('0%', style: t.caption.copyWith(color: TtColors.coral600, fontWeight: FontWeight.w700)),
                ),
                const SizedBox(width: TtSpacing.s),
                Flexible(child: Text('You keep 100% of this fare', style: t.body.copyWith(color: TtColors.navy700))),
              ]),
            ]),
          ),
        ),
        // Pinned above the tab bar, so it never needs a scroll.
        Container(
          padding: const EdgeInsets.fromLTRB(TtSpacing.gutter, TtSpacing.m, TtSpacing.gutter, TtSpacing.m),
          decoration: const BoxDecoration(
            color: TtColors.surface,
            border: Border(top: BorderSide(color: TtColors.divider)),
          ),
          child: TtButton(label: 'Done, money received', icon: Symbols.check_circle_rounded, onPressed: onDone),
        ),
      ]),
    );
  }
}
