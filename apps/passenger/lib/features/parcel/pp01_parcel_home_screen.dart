import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../common/async_view.dart';
import '../../common/trip_routes.dart';
import '../../router/routes.dart';
import '../../state/parcel_flow.dart';
import '../../state/passenger_session.dart';
import '../activity/widgets/trip_rows.dart';
import 'pp05_prohibited_items_sheet.dart';
import 'widgets/parcel_widgets.dart';

/// PP-01 Parcel home, light like Home: "Send a parcel" with "What can't I send?", in town or to another town, the
/// pickup (your location, you as the sender) and the drop with a Switch on grey, goods vehicles three to a row,
/// Packers & Movers as one row, recent parcels as plain rows. Booking starts from the drop: search → PP-03
/// drop details → PP-06 choose vehicle and book.
class PP01ParcelHomeScreen extends ConsumerWidget {
  const PP01ParcelHomeScreen({super.key, this.showcase = false});

  /// Opened on its own from the Design gallery: render seed state, start no timers.
  final bool showcase;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.type;
    final flow = ref.watch(parcelFlowProvider);
    final ctrl = ref.read(parcelFlowProvider.notifier);
    final recent = ref.watch(recentParcelsProvider);
    final me = ref.watch(currentProfileProvider);
    final d = flow.details;
    // Who the driver calls at the pickup: the sender typed on PP-02, else the rider (as booked).
    final senderName = d.senderName.trim().isNotEmpty ? d.senderName : (me.name == kPlaceholderName ? '' : me.name);
    final senderPhone = d.senderName.trim().isNotEmpty ? d.senderPhone : me.phone;

    final vehicles = flow.outstation
        ? [for (final k in GoodsModeRates.goodsTrucks) Seed.vehicle(k)]
        : Seed.goodsVehicles;
    return Scaffold(
      backgroundColor: TtColors.surface,
      body: SafeArea(
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          children: [
            // One slim row like Home: the title and "What can't I send?" (PP-05), no subtitle.
            SizedBox(
              height: 44,
              child: Row(
                children: [
                  Expanded(child: Text('Send a parcel', style: t.h2)),
                  const _ProhibitedLink(),
                ],
              ),
            ),
            const SizedBox(height: TtSpacing.s),
            TtSegmented<bool>(
              options: const [false, true],
              labelOf: (out) => out ? 'To another town' : 'In town',
              selected: flow.outstation,
              onChanged: showcase ? (_) {} : ctrl.setOutstation,
              compact: true,
            ),
            const SizedBox(height: TtSpacing.m),
            if (flow.isActive && !showcase) ...[
              TtBanner(
                type: TtBannerType.info,
                icon: Symbols.local_shipping_rounded,
                title: 'Parcel in progress',
                message: _activeMessage(flow),
                onTap: () {
                  final r = routeForParcelPhase(flow.phase);
                  if (r != null) context.go(r);
                },
              ),
              const SizedBox(height: TtSpacing.m),
            ],
            _RouteCard(
              flow: flow,
              sender: senderName.isEmpty ? null : '$senderName · ${localPhone(senderPhone)}',
              onPickup: () => context.push(Routes.parcelPickup),
              onDrop: () => openParcelDrop(context, ref),
              // A parcel coming to you (in town only: the pickup must be in the service area).
              onSwitch: flow.outstation ? null : () => showcase ? null : _switch(context, ref),
            ),
            const SizedBox(height: TtSpacing.l),
            Text(flow.outstation ? 'TRUCKS TO ANOTHER TOWN' : 'CHOOSE A VEHICLE', style: t.overline),
            const SizedBox(height: TtSpacing.s),
            _VehicleGrid(
              vehicles: vehicles,
              // A shortcut: the vehicle is chosen, then the drop (PP-06 still offers the others).
              onTap: (kind) {
                ctrl.selectVehicle(kind);
                openParcelDrop(context, ref);
              },
            ),
            const SizedBox(height: TtSpacing.m),
            _ShiftingRow(onTap: () => context.push(Routes.shifting)),
            const SizedBox(height: TtSpacing.l),
            Text('RECENT', style: t.overline),
            const SizedBox(height: TtSpacing.xs),
            AsyncView<List<Trip>>(
              value: recent,
              onRetry: () => ref.invalidate(recentParcelsProvider),
              loading: const _RecentSkeleton(),
              data: (trips) => trips.isEmpty
                  ? Padding(
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      child: Text('No parcels yet. Your deliveries will show up here.', style: t.listMeta),
                    )
                  // Plain rows like Home's recent places (Activity keeps its cards).
                  : Column(
                      children: [
                        for (final (i, trip) in trips.take(3).indexed) ...[
                          if (i > 0) const Divider(height: 1, indent: 60),
                          TripHistoryRow(trip: trip),
                        ],
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }

  /// Switch: pickup and drop change places. With no drop yet, asks where the parcel comes from; your location
  /// becomes the drop.
  static Future<void> _switch(BuildContext context, WidgetRef ref) async {
    final s = ref.read(parcelFlowProvider);
    final ctrl = ref.read(parcelFlowProvider.notifier);
    if (s.pickup.isUnknownPickup) return showTtSnack(context, 'Finding your location…');
    if (!s.dropSet) {
      final p = await showParcelPlacePicker(context, title: 'Pick up from');
      if (p == null || !context.mounted) return;
      ctrl.setDrop(p);
    }
    ctrl.swapStops();
  }

  static String _activeMessage(ParcelFlowState f) {
    final name = f.driver.firstName;
    final receiver = f.details.receiverName.split(' ').first;
    return switch (f.phase) {
      ParcelPhase.searching => 'Finding a nearby ${f.vehicle.label}…',
      ParcelPhase.assigned => '$name is coming to pick up',
      ParcelPhase.atPickup => '$name is at the pickup',
      ParcelPhase.inTransit => 'On the way to $receiver',
      ParcelPhase.delivered => 'Delivered to $receiver. Tap to rate $name',
      _ => 'Tap to open',
    };
  }
}

/// Pickup and drop on the soft grey of Home's search field, no "Pickup from" / "Deliver to" captions: the green dot
/// and the coral pin say which is which. Switch on the right.
class _RouteCard extends StatelessWidget {
  const _RouteCard({required this.flow, required this.sender, required this.onPickup, required this.onDrop, this.onSwitch});

  final ParcelFlowState flow;

  /// "Priya Raman · 98765 43210" under the pickup (null: no name yet).
  final String? sender;
  final VoidCallback onPickup;
  final VoidCallback onDrop;

  /// Null hides the Switch button.
  final VoidCallback? onSwitch;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    // Room on the right for the Switch button.
    final right = onSwitch == null ? 12.0 : 56.0;
    Widget row({
      required Widget marker,
      required String value,
      required TextStyle style,
      required VoidCallback onTap,
      String? note,
      String semantics = '',
    }) => Semantics(
      button: true,
      label: semantics,
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 52),
          child: Padding(
            padding: EdgeInsets.fromLTRB(12, 8, right, 8),
            child: Row(
              children: [
                SizedBox(width: 24, child: Center(child: marker)),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(value, style: style, maxLines: 1, overflow: TextOverflow.ellipsis),
                      if (note != null)
                        Text(note, style: TtTextStyles.tabular(t.listMeta), maxLines: 1, overflow: TextOverflow.ellipsis),
                    ],
                  ),
                ),
                if (onSwitch == null) const Icon(Symbols.chevron_right_rounded, color: TtColors.navy300, size: 20),
              ],
            ),
          ),
        ),
      ),
    );

    return Material(
      color: TtColors.inputBg,
      borderRadius: TtRadii.cardRadius,
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          Column(
            children: [
              row(
                marker: const PickupDot(size: 10),
                value: shortAddress(flow.pickup),
                style: t.listTitle.copyWith(fontWeight: FontWeight.w500),
                note: sender,
                onTap: onPickup,
                semantics: 'Pickup from ${flow.pickup.name}${sender == null ? '' : ', sender $sender'}. Edit pickup details',
              ),
              const Divider(height: 1, indent: 48, endIndent: 12, color: TtColors.surface, thickness: 1.5),
              row(
                marker: const DropPin(size: 20),
                value: flow.dropSet ? shortAddress(flow.drop) : 'Where should it go?',
                style: flow.dropSet
                    ? t.listTitle.copyWith(fontWeight: FontWeight.w500)
                    : t.listTitle.copyWith(color: TtColors.coral600),
                onTap: onDrop,
                semantics: flow.dropSet ? 'Deliver to ${flow.drop.name}. Edit drop details' : 'Add a drop address',
              ),
            ],
          ),
          if (onSwitch != null)
            Positioned(
              right: 8,
              top: 0,
              bottom: 0,
              child: Center(
                child: Tooltip(
                  message: 'Switch pickup and drop',
                  child: Material(
                    color: TtColors.surface,
                    shape: const CircleBorder(),
                    elevation: 1,
                    shadowColor: TtColors.shadow,
                    child: InkWell(
                      customBorder: const CircleBorder(),
                      onTap: onSwitch,
                      child: const SizedBox(
                        width: 36,
                        height: 36,
                        child: Icon(Symbols.swap_vert_rounded, color: TtColors.navy900, size: 20),
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Goods vehicles three to a row, like Home's "More ways" tiles: the miniature on grey, the name and the load under it.
class _VehicleGrid extends StatelessWidget {
  const _VehicleGrid({required this.vehicles, required this.onTap});
  final List<VehicleType> vehicles;
  final ValueChanged<VehicleKind> onTap;

  @override
  Widget build(BuildContext context) {
    const perRow = 3;
    final rows = <Widget>[];
    for (var i = 0; i < vehicles.length; i += perRow) {
      final row = vehicles.sublist(i, (i + perRow).clamp(0, vehicles.length));
      rows.add(Padding(
        padding: EdgeInsets.only(bottom: i + perRow < vehicles.length ? 12 : 0),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (var j = 0; j < perRow; j++) ...[
              if (j > 0) const SizedBox(width: TtSpacing.s),
              Expanded(
                child: j < row.length ? _VehicleTile(vehicle: row[j], onTap: () => onTap(row[j].kind)) : const SizedBox(),
              ),
            ],
          ],
        ),
      ));
    }
    return Column(children: rows);
  }
}

class _VehicleTile extends StatelessWidget {
  const _VehicleTile({required this.vehicle, required this.onTap});
  final VehicleType vehicle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Semantics(
      button: true,
      label: '${vehicle.name}, ${vehicle.capacityLabel}',
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: TtRadii.cardRadius,
        child: Column(
          children: [
            Container(
              height: 64,
              alignment: Alignment.center,
              decoration: const BoxDecoration(color: TtColors.inputBg, borderRadius: TtRadii.cardRadius),
              child: VehicleArt(vehicle.kind),
            ),
            const SizedBox(height: 6),
            Text(
              vehicle.name,
              style: t.caption.copyWith(color: TtColors.navy900, fontWeight: FontWeight.w600, fontSize: 13),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            Text(
              vehicle.capacityLabel,
              style: t.caption.copyWith(color: TtColors.navy500, fontSize: 11),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}

/// Packers & Movers (PH-01): one light row with the truck, instead of a dark banner.
class _ShiftingRow extends StatelessWidget {
  const _ShiftingRow({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Semantics(
      button: true,
      label: 'Packers and Movers. A truck, helpers and packing on the day you choose',
      excludeSemantics: true,
      child: Material(
        color: TtColors.inputBg,
        borderRadius: TtRadii.cardRadius,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(8, 10, 8, 10),
            child: Row(
              children: [
                const VehicleArt(VehicleKind.truck),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(child: Text('Packers & Movers', style: t.listTitle, maxLines: 1, overflow: TextOverflow.ellipsis)),
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                            decoration: const BoxDecoration(color: TtColors.coral600, borderRadius: TtRadii.pillRadius),
                            child: Text(
                              'NEW',
                              style: t.caption.copyWith(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 10),
                            ),
                          ),
                        ],
                      ),
                      Text('A truck, helpers and packing', style: t.listMeta, maxLines: 1, overflow: TextOverflow.ellipsis),
                    ],
                  ),
                ),
                const Icon(Symbols.chevron_right_rounded, color: TtColors.navy500),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// "What can't I send?" in the title row: opens the prohibited-items list (PP-05) before the customer books.
class _ProhibitedLink extends StatelessWidget {
  const _ProhibitedLink();

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return TextButton.icon(
      onPressed: () => PP05ProhibitedItemsSheet.show(context),
      style: TextButton.styleFrom(
        foregroundColor: TtColors.coral600,
        padding: const EdgeInsets.symmetric(horizontal: 8),
        minimumSize: const Size(0, 40),
        visualDensity: VisualDensity.compact,
      ),
      icon: const Icon(Symbols.block_rounded, size: 16),
      label: Text("What can't I send?", style: t.bodySmallMedium.copyWith(color: TtColors.coral600)),
    );
  }
}

class _RecentSkeleton extends StatelessWidget {
  const _RecentSkeleton();

  @override
  Widget build(BuildContext context) => const SkeletonShimmer(
    child: Row(
      children: [
        SkeletonBox(width: 40, height: 40, radius: 12),
        SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [SkeletonBox(width: 180, height: 14), SizedBox(height: 8), SkeletonBox(width: 120, height: 12)],
          ),
        ),
      ],
    ),
  );
}
