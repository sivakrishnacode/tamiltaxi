import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../common/showcase.dart';
import '../../state/booking_prefs.dart';
import '../../state/driver_account.dart';
import '../../state/live_helpers.dart';

/// Account › Services: the work this driver gets. The vehicle's main service (rides; parcels for goods vehicles) is
/// always on; the others switch on and off: parcels for bikes, scooters and autos (Parcel on Auto, up to 100 kg),
/// rentals and outstation for cabs, goods to another town and Packers & Movers for goods trucks. Switching one off
/// asks for how long (30 min, 2 or 4 hours, or until switched on again) and, optionally, why. Dispatch skips a
/// service that is off or paused.
class ServicesScreen extends ConsumerStatefulWidget {
  const ServicesScreen({super.key, this.showcase = false, this.showcaseKind = VehicleKind.auto});

  /// Opened on its own from the Design gallery: render [showcaseKind]'s services, change nothing.
  final bool showcase;
  final VehicleKind showcaseKind;

  @override
  ConsumerState<ServicesScreen> createState() => _ServicesScreenState();
}

class _ServicesScreenState extends ConsumerState<ServicesScreen> {
  /// The service being saved (its switch waits).
  DriverService? _busy;

  Future<void> _toggle(DriverService service, bool on, VehicleKind kind, BookingPrefs prefs) async {
    final copy = serviceCopy(service, kind);
    int? helpers;
    PauseChoice? pause;
    if (on && service == DriverService.shifting) {
      helpers = await _HelpersSheet.show(context, prefs.helpers);
      if (helpers == null) return;
    } else if (!on) {
      pause = await PauseServiceSheet.show(context, title: copy.title, reasons: _reasonsFor(service));
      if (pause == null) return;
    }
    if (!mounted) return;
    setState(() => _busy = service);
    try {
      await ref.read(bookingPrefsProvider.notifier).setService(
            service,
            on: on,
            pauseFor: pause?.duration,
            reason: pause?.reason,
            helpers: helpers,
          );
      if (!mounted) return;
      showTtSnack(
        context,
        on
            ? '${copy.title} is on'
            : pause!.duration == null
                ? '${copy.title} is off until you switch it on'
                : '${copy.title} paused ${_till(DateTime.now().add(pause.duration!))}',
        success: on,
      );
    } on Exception catch (e) {
      if (mounted) showTtSnack(context, userMessage(e));
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final kind = widget.showcase ? widget.showcaseKind : ref.watch(driverProfileProvider).value?.vehicleKind;
    final loaded = widget.showcase ? const AsyncData(BookingPrefs()) : ref.watch(bookingPrefsProvider);
    final prefs = loaded.value;
    final now = DateTime.now();
    final main = kind == null ? null : mainServiceCopy(kind);

    return Scaffold(
      backgroundColor: TtColors.background,
      appBar: const TtAppBar(title: 'Services'),
      body: kind == null || prefs == null || main == null
          ? Center(
              child: loaded.hasError
                  ? Padding(
                      padding: const EdgeInsets.all(TtSpacing.gutter),
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                        Text("Couldn't load your services.", style: t.body),
                        TtButton.text(label: 'Retry', onPressed: () => ref.invalidate(bookingPrefsProvider)),
                      ]),
                    )
                  : const CircularProgressIndicator(),
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(TtSpacing.gutter, TtSpacing.l, TtSpacing.gutter, TtSpacing.xl),
              children: [
                Text('Choose the work you get. Your main service is always on.',
                    style: t.body.copyWith(color: TtColors.navy700)),
                const SizedBox(height: TtSpacing.l),
                _ServiceCard(icon: main.icon, title: main.title, subtitle: main.subtitle, on: true, locked: true),
                for (final s in DriverService.availableFor(kind)) ...[
                  const SizedBox(height: TtSpacing.m),
                  Builder(builder: (context) {
                    final copy = serviceCopy(s, kind);
                    final on = prefs.isOn(s, kind, now);
                    final pause = prefs.pauseOf(s, now);
                    return _ServiceCard(
                      icon: copy.icon,
                      title: copy.title,
                      subtitle: copy.subtitle,
                      on: on,
                      busy: _busy == s,
                      pausedNote: pause == null ? null : (pause.until == null ? 'Off until you switch it on' : 'Paused ${_till(pause.until!)}'),
                      helpersNote: s == DriverService.shifting && on
                          ? 'With ${prefs.helpers} helper${prefs.helpers == 1 ? '' : 's'}'
                          : null,
                      onChanged: unlessShowcase(context, widget.showcase, () => _toggle(s, !on, kind, prefs)),
                    );
                  }),
                ],
                const SizedBox(height: TtSpacing.l),
                Text(
                  'A paused service comes back on by itself when its time is up. You can switch it on sooner here.',
                  style: t.caption.copyWith(color: TtColors.navy500),
                ),
              ],
            ),
    );
  }

  static List<String> _reasonsFor(DriverService s) => switch (s) {
        DriverService.parcels => const ['Too far', 'Long waits', 'Low pay', 'Other'],
        DriverService.rentals => const ['Long hours', 'Low pay', 'Other'],
        DriverService.outstation => const ['Too far from home', 'Low pay', 'Other'],
        DriverService.shifting => const ['No helpers today', 'Low pay', 'Other'],
      };
}

/// "till 4:30 PM", or "till tomorrow 9:00 AM".
String _till(DateTime at) {
  final now = DateTime.now();
  final today = at.year == now.year && at.month == now.month && at.day == now.day;
  return 'till ${today ? '' : 'tomorrow '}${formatTime(at)}';
}

/// Account's line for Services: "Auto rides · Parcels", "Bike rides · Parcels paused".
String servicesSummary(VehicleKind kind, BookingPrefs prefs, DateTime now) => [
      mainServiceCopy(kind).title,
      for (final s in DriverService.availableFor(kind))
        if (prefs.isOn(s, kind, now))
          serviceCopy(s, kind).title
        else if (prefs.pauseOf(s, now)?.until != null)
          '${serviceCopy(s, kind).title} paused',
    ].join(' · ');

/// What a service is called and says on Services (and Account's summary).
typedef ServiceCopy = ({IconData icon, String title, String subtitle});

/// The vehicle's main service, always on.
ServiceCopy mainServiceCopy(VehicleKind kind) {
  final kg = Seed.vehicle(kind).capacityKg;
  return switch (kind) {
    VehicleKind.scooty => (icon: kind.icon, title: 'Scooty rides', subtitle: 'Scooty rides, and Bike rides at the Bike fare'),
    VehicleKind.auto => (icon: kind.icon, title: 'Auto rides', subtitle: 'Including Auto Priority: riders pay more to be picked first'),
    VehicleKind.threeWheeler => (
        icon: Symbols.package_2_rounded,
        title: 'Parcels',
        subtitle: 'Deliveries in town, up to ${formatCount(kg ?? 0)} kg. Small parcels booked on Auto too',
      ),
    // No parcels in town for trucks (like Porter): their work is the two services below.
    VehicleKind.truck => (
        icon: Symbols.local_shipping_rounded,
        title: 'Big loads',
        subtitle: 'Packers & Movers and goods to another town. Parcels in town go by smaller vehicles',
      ),
    _ when kind.isGoods => (icon: Symbols.package_2_rounded, title: 'Parcels', subtitle: 'Deliveries in town, up to ${formatCount(kg ?? 0)} kg'),
    _ => (icon: kind.icon, title: '${kind.label} rides', subtitle: 'Passengers, in town'),
  };
}

/// An optional service for [kind].
ServiceCopy serviceCopy(DriverService s, VehicleKind kind) => switch (s) {
      DriverService.parcels when kind == VehicleKind.auto => (
          icon: Symbols.package_2_rounded,
          title: 'Parcels',
          subtitle: 'Parcels up to 100 kg inside your auto, between rides. Nothing on the roof',
        ),
      DriverService.parcels when kind == VehicleKind.scooty => (
          icon: Symbols.package_2_rounded,
          title: 'Parcels',
          subtitle: 'Parcels up to 20 kg on your scooty, between rides',
        ),
      DriverService.parcels => (
          icon: Symbols.package_2_rounded,
          title: 'Parcels',
          subtitle: 'Small parcels up to 10 kg on your bike, between rides',
        ),
      DriverService.rentals => (icon: Symbols.timer_rounded, title: 'Rentals', subtitle: 'Riders book you by the hour, with km included'),
      DriverService.outstation when kind.isGoods => (
          icon: Symbols.local_shipping_rounded,
          title: 'Goods to another town',
          subtitle: 'One-way loads to other towns, by the km',
        ),
      DriverService.outstation => (icon: Symbols.route_rounded, title: 'Outstation', subtitle: 'One way and round trips to other towns'),
      DriverService.shifting => (icon: Symbols.home_rounded, title: 'Packers & Movers', subtitle: 'Moves booked for a day and slot, with your helpers'),
    };

class _ServiceCard extends StatelessWidget {
  const _ServiceCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.on,
    this.locked = false,
    this.busy = false,
    this.pausedNote,
    this.helpersNote,
    this.onChanged,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final bool on;
  final bool locked;
  final bool busy;
  final String? pausedNote;
  final String? helpersNote;
  final VoidCallback? onChanged;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final Widget trailing = locked
        ? Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: const BoxDecoration(color: TtColors.successTint, borderRadius: TtRadii.pillRadius),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Symbols.lock_rounded, size: 14, color: TtColors.successText),
              const SizedBox(width: 4),
              Text('Always on', style: t.caption.copyWith(color: TtColors.successText, fontWeight: FontWeight.w600)),
            ]),
          )
        : busy
            ? const Padding(
                padding: EdgeInsets.all(12),
                child: SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2.5)),
              )
            : Switch(value: on, onChanged: onChanged == null ? null : (_) => onChanged!());
    return TtCard(
      padding: const EdgeInsets.fromLTRB(TtSpacing.l, TtSpacing.m, TtSpacing.m, TtSpacing.l),
      child: Semantics(
        container: true,
        label: '$title, ${locked ? 'always on' : on ? 'on' : pausedNote ?? 'off'}',
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(color: on ? TtColors.coral50 : TtColors.background, borderRadius: TtRadii.cardRadius),
                child: Icon(icon, color: on ? TtColors.coral600 : TtColors.navy500),
              ),
            ),
            const SizedBox(width: TtSpacing.m),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                // Title and switch on one line (48 dp for the switch); the description gets the full width under them.
                SizedBox(
                  height: 48,
                  child: Row(children: [
                    Expanded(child: Text(title, style: t.bodySemibold, maxLines: 1, overflow: TextOverflow.ellipsis)),
                    const SizedBox(width: TtSpacing.s),
                    trailing,
                  ]),
                ),
                Text(subtitle, style: t.bodySmall.copyWith(color: TtColors.navy500)),
              ]),
            ),
          ]),
          if (pausedNote != null || helpersNote != null) ...[
            const SizedBox(height: TtSpacing.m),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: TtSpacing.m, vertical: TtSpacing.s),
              decoration: BoxDecoration(
                color: pausedNote != null ? TtColors.warningTint : TtColors.background,
                borderRadius: TtRadii.cardRadius,
              ),
              child: Row(children: [
                Icon(pausedNote != null ? Symbols.pause_circle_rounded : Symbols.group_rounded,
                    size: 18, color: pausedNote != null ? TtColors.warningText : TtColors.navy700),
                const SizedBox(width: TtSpacing.s),
                Expanded(
                  child: Text(pausedNote ?? helpersNote!,
                      style: t.bodySmallMedium.copyWith(color: pausedNote != null ? TtColors.warningText : TtColors.navy700)),
                ),
              ]),
            ),
          ],
        ]),
      ),
    );
  }
}

/// How long to pause (null: until switched on again) and why.
class PauseChoice {
  const PauseChoice(this.duration, this.reason);
  final Duration? duration;
  final String? reason;
}

enum _PauseFor {
  min30('30 min', Duration(minutes: 30)),
  h2('2 hours', Duration(hours: 2)),
  h4('4 hours', Duration(hours: 4)),
  untilOn('Until I switch it on', null);

  const _PauseFor(this.label, this.duration);
  final String label;
  final Duration? duration;
}

/// "Pause Parcels?": for how long, and why (optional). Pops a [PauseChoice], or null for "Keep it on".
class PauseServiceSheet extends StatefulWidget {
  const PauseServiceSheet({super.key, required this.title, required this.reasons});
  final String title;
  final List<String> reasons;

  static Future<PauseChoice?> show(BuildContext context, {required String title, required List<String> reasons}) =>
      showTtSheet<PauseChoice>(context, builder: (_) => PauseServiceSheet(title: title, reasons: reasons));

  @override
  State<PauseServiceSheet> createState() => _PauseServiceSheetState();
}

class _PauseServiceSheetState extends State<PauseServiceSheet> {
  _PauseFor? _for;
  String? _reason;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text('Pause ${widget.title}?', style: t.h2),
      const SizedBox(height: 4),
      Text("You won't get these requests while it's paused.", style: t.body.copyWith(color: TtColors.navy700)),
      const SizedBox(height: TtSpacing.l),
      Text('For how long', style: t.bodySmallMedium.copyWith(color: TtColors.navy700)),
      const SizedBox(height: TtSpacing.s),
      ChoiceChips<_PauseFor>(
        options: _PauseFor.values,
        labelOf: (p) => p.label,
        selected: {?_for},
        onChanged: (p) => setState(() => _for = p),
      ),
      const SizedBox(height: TtSpacing.l),
      Text.rich(
        TextSpan(children: [
          const TextSpan(text: 'Why? '),
          TextSpan(text: '(optional)', style: t.bodySmall.copyWith(color: TtColors.navy500)),
        ]),
        style: t.bodySmallMedium.copyWith(color: TtColors.navy700),
      ),
      const SizedBox(height: TtSpacing.s),
      ChoiceChips<String>(
        options: widget.reasons,
        labelOf: (r) => r,
        selected: {?_reason},
        onChanged: (r) => setState(() => _reason = _reason == r ? null : r),
      ),
      const SizedBox(height: TtSpacing.xl),
      TtButton(
        label: 'Pause',
        onPressed: _for == null ? null : () => Navigator.of(context).pop(PauseChoice(_for!.duration, _reason)),
      ),
      TtButton.text(label: 'Keep it on', onPressed: () => Navigator.of(context).pop()),
    ]);
  }
}

/// Packers & Movers on: how many helpers the driver brings (moves needing more never reach them).
class _HelpersSheet extends StatefulWidget {
  const _HelpersSheet({required this.initial});
  final int initial;

  static Future<int?> show(BuildContext context, int initial) =>
      showTtSheet<int>(context, builder: (_) => _HelpersSheet(initial: initial));

  @override
  State<_HelpersSheet> createState() => _HelpersSheetState();
}

class _HelpersSheetState extends State<_HelpersSheet> {
  late int _n = widget.initial;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text('Helpers you bring', style: t.h2),
      const SizedBox(height: 4),
      Text(
        _n == 0 ? 'Only moves that need no helpers' : 'Moves needing up to $_n. The customer pays for them in the price.',
        style: t.body.copyWith(color: TtColors.navy700),
      ),
      const SizedBox(height: TtSpacing.l),
      Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        IconButton.outlined(
          tooltip: 'Fewer',
          onPressed: _n > 0 ? () => setState(() => _n--) : null,
          icon: const Icon(Symbols.remove_rounded),
        ),
        SizedBox(width: 72, child: Text('$_n', textAlign: TextAlign.center, style: TtTextStyles.tabular(t.h1))),
        IconButton.outlined(
          tooltip: 'More',
          onPressed: _n < BookingPrefs.maxHelpers ? () => setState(() => _n++) : null,
          icon: const Icon(Symbols.add_rounded),
        ),
      ]),
      const SizedBox(height: TtSpacing.xl),
      TtButton(label: 'Switch on', onPressed: () => Navigator.of(context).pop(_n)),
    ]);
  }
}
