import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../state/driver_account.dart';
import '../../state/rate_card.dart';

/// Account › Rate card: what each of the driver's services pays in the city they are in, one tab per service (an
/// auto: Auto, Auto Priority, Parcels). In town: base fare, per km, per minute, minimum fare, then the extras
/// (waiting at the pickup, peak, the rider's extra, the cancellation fee while it is on). Cabs also show rentals and
/// outstation; goods trucks goods to another town. Same rates the rider app quotes.
class RateCardScreen extends ConsumerStatefulWidget {
  const RateCardScreen({super.key, this.showcase = false, this.showcaseKind = VehicleKind.auto});

  /// Opened on its own from the Design gallery: [showcaseKind] at the built-in rates.
  final bool showcase;
  final VehicleKind showcaseKind;

  @override
  ConsumerState<RateCardScreen> createState() => _RateCardScreenState();
}

enum _Kind { inTown, rentals, outstation, goodsOutstation }

typedef _Tab = ({String label, _Kind kind, VehicleKind vehicle});

/// The tabs for a [k] driver: their own rides or parcels first, then what else they take.
List<_Tab> _tabsFor(VehicleKind k) => switch (k) {
      VehicleKind.bike => [
          (label: 'Bike', kind: _Kind.inTown, vehicle: k),
          (label: 'Parcels', kind: _Kind.inTown, vehicle: VehicleKind.goodsBike),
        ],
      VehicleKind.scooty => [
          (label: 'Scooty', kind: _Kind.inTown, vehicle: k),
          (label: 'Bike', kind: _Kind.inTown, vehicle: VehicleKind.bike),
          (label: 'Parcels', kind: _Kind.inTown, vehicle: VehicleKind.scootyParcel),
          (label: 'Bike parcels', kind: _Kind.inTown, vehicle: VehicleKind.goodsBike),
        ],
      VehicleKind.auto => [
          (label: 'Auto', kind: _Kind.inTown, vehicle: k),
          (label: 'Auto Priority', kind: _Kind.inTown, vehicle: VehicleKind.autoPriority),
          (label: 'Parcels', kind: _Kind.inTown, vehicle: VehicleKind.autoParcel),
        ],
      VehicleKind.cab || VehicleKind.sedan || VehicleKind.suv => [
          (label: k.label, kind: _Kind.inTown, vehicle: k),
          (label: 'Rentals', kind: _Kind.rentals, vehicle: k),
          (label: 'Outstation', kind: _Kind.outstation, vehicle: k),
        ],
      VehicleKind.threeWheeler => [
          (label: 'Parcels', kind: _Kind.inTown, vehicle: k),
          (label: 'Auto parcels', kind: _Kind.inTown, vehicle: VehicleKind.autoParcel),
          (label: 'Another town', kind: _Kind.goodsOutstation, vehicle: k),
        ],
      VehicleKind.miniTruck || VehicleKind.pickup => [
          (label: 'Parcels', kind: _Kind.inTown, vehicle: k),
          (label: 'Another town', kind: _Kind.goodsOutstation, vehicle: k),
        ],
      // No parcels in town: its in-town rates price Packers & Movers moves.
      VehicleKind.truck => [
          (label: 'In town', kind: _Kind.inTown, vehicle: k),
          (label: 'Another town', kind: _Kind.goodsOutstation, vehicle: k),
        ],
      _ => [(label: k.isGoods ? 'Parcels' : k.label, kind: _Kind.inTown, vehicle: k)],
    };

class _RateCardScreenState extends ConsumerState<RateCardScreen> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final kind = widget.showcase ? widget.showcaseKind : ref.watch(driverProfileProvider).value?.vehicleKind;
    final card = widget.showcase ? AsyncData(RateCard.demo) : ref.watch(rateCardProvider);
    final tabs = kind == null ? const <_Tab>[] : _tabsFor(kind);
    final tab = tabs.isEmpty ? null : tabs[_tab.clamp(0, tabs.length - 1)];

    return Scaffold(
      backgroundColor: TtColors.background,
      appBar: const TtAppBar(title: 'Rate card'),
      body: card.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text("Couldn't load the rates.", style: t.body),
            TtButton.text(label: 'Retry', onPressed: () => ref.invalidate(rateCardProvider)),
          ]),
        ),
        data: (rc) => tab == null
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.fromLTRB(TtSpacing.gutter, TtSpacing.l, TtSpacing.gutter, TtSpacing.xl),
                children: [
                  if (tabs.length > 1) ...[
                    ChoiceChips<int>(
                      options: [for (var i = 0; i < tabs.length; i++) i],
                      labelOf: (i) => tabs[i].label,
                      selected: {_tab.clamp(0, tabs.length - 1)},
                      solid: true,
                      onChanged: (i) => setState(() => _tab = i),
                    ),
                    const SizedBox(height: TtSpacing.l),
                  ],
                  ...switch (tab.kind) {
                    _Kind.inTown => _inTown(context, rc, tab.vehicle),
                    _Kind.rentals => _rentals(context, rc, tab.vehicle),
                    _Kind.outstation => _outstation(context, rc, tab.vehicle),
                    _Kind.goodsOutstation => _goodsOutstation(context, rc, tab.vehicle),
                  },
                ],
              ),
      ),
    );
  }

  List<Widget> _inTown(BuildContext context, RateCard rc, VehicleKind v) {
    final r = rc.ruleFor(v);
    final t = context.type;
    return [
      _Section(title: 'Trip fare', lines: [
        _Line('Base fare', 'To start the trip', formatInr(r.base)),
        _Line('Distance', 'Per km', _rs(r.perKm)),
        _Line('Time', 'Per minute on the trip', _rs(r.perMin)),
        _Line('Minimum fare', 'A short trip pays at least this', formatInr(r.minFare)),
      ]),
      const SizedBox(height: TtSpacing.m),
      _Section(title: 'Extras', lines: [
        _Line('Waiting at pickup', 'Free for ${rc.freeWaitMin} min, then per minute, up to ${formatInr(rc.waitMaxCharge)}',
            '${formatInr(r.waitPerMin)}/min'),
        _Line('Peak time', 'Busy hours and areas, shown on the request', 'Up to ${_x(rc.maxMultiplier)}'),
        const _Line('Rider’s extra', 'Riders can add ₹10–30 when nobody took the trip', 'All yours'),
        if (rc.cancellationFee != null)
          _Line('Cancellation fee', 'A rider cancels after you arrive: added to your next trip', formatInr(rc.cancellationFee!)),
      ]),
      const SizedBox(height: TtSpacing.l),
      Text(
        'Fare = base + distance + time, at least the minimum fare. You see the full fare on every request before you accept.',
        style: t.caption.copyWith(color: TtColors.navy500),
      ),
    ];
  }

  List<Widget> _rentals(BuildContext context, RateCard rc, VehicleKind v) {
    final r = rc.pricing.rental[v];
    if (r == null) return [const _Empty()];
    final packages = RideModeRates.packages;
    return [
      _Section(title: 'Packages', lines: [
        for (var i = 0; i < packages.length && i < r.prices.length; i++)
          _Line('${packages[i].hours} hr${packages[i].hours == 1 ? '' : 's'}', '${packages[i].km} km included', formatInr(r.prices[i])),
      ]),
      const SizedBox(height: TtSpacing.m),
      _Section(title: 'Past the package', lines: [
        _Line('Extra distance', 'Per km', _rs(r.extraKm)),
        _Line('Extra time', 'Per minute', _rs(r.extraMin)),
      ]),
    ];
  }

  List<Widget> _outstation(BuildContext context, RateCard rc, VehicleKind v) {
    final r = rc.pricing.outstation[v];
    if (r == null) return [const _Empty()];
    return [
      _Section(title: 'Outstation', lines: [
        _Line('One way', 'Per km, at least ${r.oneWayMinKm} km', _rs(r.oneWayPerKm)),
        _Line('Round trip', 'Per km, at least ${r.roundTripKmPerDay} km a day', _rs(r.roundTripPerKm)),
        _Line('Driver’s allowance', 'Per day', formatInr(r.allowancePerDay)),
      ]),
    ];
  }

  List<Widget> _goodsOutstation(BuildContext context, RateCard rc, VehicleKind v) {
    final r = rc.pricing.goodsOutstation[v];
    if (r == null) return [const _Empty()];
    return [
      _Section(title: 'Goods to another town', lines: [
        _Line('Distance', 'Per km, one way, at least ${r.minKm} km', _rs(r.perKm)),
      ]),
    ];
  }

  /// "₹9", "₹0.30", "₹5.50".
  static String _rs(double v) => v == v.roundToDouble() ? '₹${v.toStringAsFixed(0)}' : '₹${v.toStringAsFixed(2)}';

  /// "1.5×".
  static String _x(double m) => '${m == m.roundToDouble() ? m.toStringAsFixed(0) : m.toStringAsFixed(1)}×';
}

class _Line {
  const _Line(this.label, this.note, this.value);
  final String label;
  final String note;
  final String value;
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.lines});
  final String title;
  final List<_Line> lines;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return TtCard(
      padding: EdgeInsets.zero,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Container(
          padding: const EdgeInsets.fromLTRB(TtSpacing.l, TtSpacing.m, TtSpacing.l, TtSpacing.m),
          decoration: const BoxDecoration(
            color: TtColors.coral50,
            borderRadius: BorderRadius.vertical(top: Radius.circular(TtRadii.card)),
          ),
          child: Text(title, style: t.bodySemibold.copyWith(color: TtColors.coral600)),
        ),
        for (var i = 0; i < lines.length; i++) ...[
          if (i > 0) const Divider(height: 1, indent: TtSpacing.l, endIndent: TtSpacing.l),
          Padding(
            padding: const EdgeInsets.fromLTRB(TtSpacing.l, TtSpacing.m, TtSpacing.l, TtSpacing.m),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(lines[i].label, style: t.bodyMedium),
                  Text(lines[i].note, style: t.bodySmall.copyWith(color: TtColors.navy500)),
                ]),
              ),
              const SizedBox(width: TtSpacing.m),
              Text(lines[i].value, style: TtTextStyles.tabular(t.bodySemibold)),
            ]),
          ),
        ],
      ]),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty();

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: TtSpacing.xl),
        child: Text('No rates for this yet.', textAlign: TextAlign.center, style: context.type.body),
      );
}
