import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart' show Marker;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../common/launch.dart';
import '../../common/measure_size.dart';
import '../../common/showcase.dart';
import '../../state/demand_map.dart';
import '../../state/driver_account.dart';
import '../../state/driver_session.dart';
import '../jobs/widgets/job_map.dart';
import 'widgets/demand_areas.dart';
import 'widgets/demand_layer.dart';
import 'widgets/navy_header.dart';

/// D-14c Surge / D-14d High demand, from Home's chips: the areas on the map with a list below, nearest first. Tap a
/// row or an area to show it; the arrow opens Google Maps there. Live: Home's demand map (refreshed every two
/// minutes); mock mode and the Design gallery: the seeded one.
class D14cDemandAreasScreen extends ConsumerStatefulWidget {
  const D14cDemandAreasScreen({super.key, this.view = AreaView.surge, this.showcase = false, this.sample});

  /// The list it opens on.
  final AreaView view;

  /// Opened on its own from the Design gallery: the seeded map, buttons only show a note.
  final bool showcase;

  /// Design gallery: this demand map instead of the seeded one (D-14e: no surge now).
  final DemandMap? sample;

  @override
  ConsumerState<D14cDemandAreasScreen> createState() => _D14cDemandAreasScreenState();
}

class _D14cDemandAreasScreenState extends ConsumerState<D14cDemandAreasScreen> {
  late AreaView _view = widget.view;

  /// The area shown with its name; null: the first in the list.
  String? _picked;
  double _panelHeight = 0;
  double _zoom = 13;
  final _camera = TtMapController();
  late final DemandMap _demo = widget.sample ?? DemandMap.demo();

  /// Where the driver was when the screen opened: the distances and the first view use it, so the camera doesn't
  /// jump on every GPS fix.
  late final LatLng? _from = widget.showcase
      ? Seed.driverHome
      : ref.read(driverSessionProvider.notifier).vehicle.value?.position;

  @override
  void dispose() {
    _camera.dispose();
    super.dispose();
  }

  bool get _surge => _view == AreaView.surge;
  Color get _color => _surge ? zoneColor(MapZoneKind.surge) : TtColors.coral600;
  IconData get _icon => _surge ? zoneIcon(MapZoneKind.surge) : Symbols.local_fire_department_rounded;

  static List<LatLng> _pointsOf(DemandArea a) => [for (final ring in a.outline) ...ring];

  /// The first view of a list: all its areas and the driver.
  List<LatLng> _fitOf(Iterable<DemandArea> areas) => [for (final a in areas) ..._pointsOf(a), ?_from];

  void _pick(DemandArea a) {
    setState(() => _picked = a.id);
    _camera.fitTo(_pointsOf(a));
  }

  void _show(AreaView view, List<DemandArea> areas) {
    if (view == _view) return;
    setState(() {
      _view = view;
      _picked = null;
    });
    _camera.fitTo(_fitOf(areas));
  }

  /// A tap in an area, or on its pin just above its top edge, shows it.
  void _tapAt(LatLng p, List<DemandArea> areas) {
    final hit =
        areas.where((a) => a.outline.any((ring) => pointInRing(p, ring))).firstOrNull ??
        areas.where((a) => screenDistance(a.top, p, _zoom) < 44).firstOrNull;
    if (hit != null) _pick(hit);
  }

  Marker _pin(DemandArea a, {required bool named}) {
    final text = _surge
        ? (named ? '${multiplierLabel(a.multiplier)} · ${a.name}' : multiplierLabel(a.multiplier))
        : (named ? a.name : null);
    return Marker(
      point: a.top,
      width: 240,
      height: 40,
      alignment: Alignment.topCenter,
      child: Center(
        child: text == null ? _Dot(icon: _icon, color: _color) : DemandLabel(text: text, icon: _icon, color: _color),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final live = !widget.showcase && ref.watch(isLiveApiProvider);
    final demand = live ? ref.watch(demandMapProvider) : _demo;
    final vehicle =
        (widget.showcase ? Seed.karthik : (ref.watch(driverProfileProvider).value ?? Seed.karthik)).vehicleKind;
    final now = DateTime.now();
    final surge = areasFor(AreaView.surge, demand, vehicle: vehicle, from: _from, now: now);
    final busy = areasFor(AreaView.busy, demand, vehicle: vehicle, from: _from, now: now);
    final areas = _surge ? surge : busy;
    final picked = areas.where((a) => a.id == _picked).firstOrNull ?? areas.firstOrNull;

    final map = LiveVehicleMap(
      controller: _camera,
      vehicleType: vehicle.mapType,
      fixedPosition: widget.showcase ? Seed.driverHome : null,
      centerOnVehicle: areas.isEmpty,
      fitPoints: areas.isEmpty ? null : _fitOf(areas),
      // Room above for the back button and the pins on the areas' top edges.
      fitPadding: const EdgeInsets.fromLTRB(48, 120, 48, 32),
      mapPadding: EdgeInsets.only(bottom: _panelHeight),
      zoom: 13,
      polygons: [
        for (final a in areas)
          for (final ring in a.outline)
            MapPolygon(
              points: ring,
              fillColor: _color.withValues(alpha: a == picked ? 0.26 : 0.14),
              strokeColor: _color.withValues(alpha: 0.9),
              strokeWidth: a == picked ? 2 : 1,
              zIndex: a == picked ? 2 : 1,
            ),
      ],
      labels: [
        for (final a in areas)
          if (a != picked) _pin(a, named: false),
        // Last, so it draws on top.
        if (picked != null) _pin(picked, named: true),
      ],
      onCamera: (camera) => _zoom = camera.zoom,
      onTap: (p) => _tapAt(p, areas),
    );

    final t = context.type;
    final listHeight = MediaQuery.sizeOf(context).height * 0.34;
    final panel = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        TtSegmented<AreaView>(
          compact: true,
          options: AreaView.values,
          selected: _view,
          labelOf: (v) {
            final (name, count) = v == AreaView.surge ? ('Surge', surge.length) : ('High demand', busy.length);
            return count == 0 ? name : '$name · $count';
          },
          onChanged: (v) => _show(v, v == AreaView.surge ? surge : busy),
        ),
        const SizedBox(height: TtSpacing.l),
        if (demand == null)
          const _Loading()
        else if (areas.isEmpty)
          _Empty(
            view: _view,
            onOther: (_surge ? busy : surge).isEmpty
                ? null
                : () => _show(_surge ? AreaView.busy : AreaView.surge, _surge ? busy : surge),
          )
        else ...[
          Row(
            children: [
              Icon(Symbols.info_rounded, size: 18, color: TtColors.navy500),
              const SizedBox(width: TtSpacing.s),
              Expanded(
                child: Text(
                  _surge
                      ? 'Trips that start here pay more. You keep all of it.'
                      : 'Riders book here a lot right now. Wait nearby for requests sooner.',
                  style: t.caption.copyWith(color: TtColors.navy700),
                ),
              ),
            ],
          ),
          const SizedBox(height: TtSpacing.s),
          ConstrainedBox(
            constraints: BoxConstraints(maxHeight: listHeight),
            child: ListView.separated(
              shrinkWrap: true,
              padding: EdgeInsets.zero,
              itemCount: areas.length,
              separatorBuilder: (_, _) => const SizedBox(height: 2),
              itemBuilder: (context, i) {
                final a = areas[i];
                return _AreaRow(
                  area: a,
                  icon: _icon,
                  color: _color,
                  picked: a == picked,
                  onTap: () => _pick(a),
                  onDirections: unlessShowcase(context, widget.showcase, () => openNavigation(context, a.centre))!,
                );
              },
            ),
          ),
        ],
      ],
    );

    return Scaffold(
      backgroundColor: TtColors.background,
      body: Stack(
        children: [
          Positioned.fill(child: map),
          Positioned(
            left: TtSpacing.l,
            top: 0,
            child: SafeArea(
              child: Padding(
                padding: const EdgeInsets.only(top: TtSpacing.s),
                child: MapCircleButton(
                  icon: Symbols.arrow_back_rounded,
                  tooltip: 'Back',
                  onPressed: unlessShowcase(context, widget.showcase, () => context.pop())!,
                ),
              ),
            ),
          ),
          Align(
            alignment: Alignment.bottomCenter,
            child: MeasureSize(
              onChange: (size) {
                if (mounted && size.height != _panelHeight) setState(() => _panelHeight = size.height);
              },
              child: BottomPanel(child: panel),
            ),
          ),
        ],
      ),
    );
  }
}

/// A busy area's pin away from the one shown with its name: the flame on a white dot.
class _Dot extends StatelessWidget {
  const _Dot({required this.icon, required this.color});

  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    width: 26,
    height: 26,
    decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle, boxShadow: TtShadows.soft),
    child: Icon(icon, size: 15, color: color, fill: 1),
  );
}

class _AreaRow extends StatelessWidget {
  const _AreaRow({
    required this.area,
    required this.icon,
    required this.color,
    required this.picked,
    required this.onTap,
    required this.onDirections,
  });

  final DemandArea area;
  final IconData icon;
  final Color color;

  /// Shown on the map with its name.
  final bool picked;
  final VoidCallback onTap;
  final VoidCallback onDirections;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final a = area;
    final far = a.km == null ? null : formatKm(a.km!);
    return Semantics(
      selected: picked,
      child: Material(
        color: picked ? color.withValues(alpha: 0.07) : Colors.transparent,
        borderRadius: TtRadii.cardRadius,
        child: InkWell(
          borderRadius: TtRadii.cardRadius,
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(TtSpacing.s, TtSpacing.s, 0, TtSpacing.s),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(color: color.withValues(alpha: 0.12), shape: BoxShape.circle),
                  child: Icon(icon, color: color, size: 22, fill: 1),
                ),
                const SizedBox(width: TtSpacing.m),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(a.name, style: t.bodySemibold, maxLines: 1, overflow: TextOverflow.ellipsis),
                      const SizedBox(height: 2),
                      Text(
                        a.detail,
                        style: t.caption.copyWith(color: TtColors.navy700),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: TtSpacing.s),
                if (a.here)
                  Padding(
                    padding: const EdgeInsets.only(right: TtSpacing.m),
                    child: Text(
                      "You're here",
                      style: t.caption.copyWith(color: TtColors.successText, fontWeight: FontWeight.w600),
                    ),
                  )
                else ...[
                  if (far != null)
                    Text(
                      far,
                      style: t.caption.copyWith(color: TtColors.navy700, fontWeight: FontWeight.w600),
                    ),
                  IconButton(
                    tooltip: 'Directions',
                    onPressed: onDirections,
                    icon: const Icon(Symbols.turn_right_rounded, color: TtColors.navy900, size: 22),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.view, this.onOther});

  final AreaView view;

  /// Opens the other list; null when it is empty too.
  final VoidCallback? onOther;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final surge = view == AreaView.surge;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Center(
          child: Container(
            width: 48,
            height: 48,
            decoration: const BoxDecoration(color: TtColors.inputBg, shape: BoxShape.circle),
            child: Icon(
              surge ? Symbols.trending_flat_rounded : Symbols.local_fire_department_rounded,
              color: TtColors.navy500,
              size: 26,
            ),
          ),
        ),
        const SizedBox(height: TtSpacing.m),
        Text(surge ? 'No surge right now' : 'No busy areas right now', textAlign: TextAlign.center, style: t.h2),
        const SizedBox(height: TtSpacing.xs),
        Text(
          surge
              ? 'Fares are normal everywhere. When an area gets busy, its higher fare shows here.'
              : 'Riders are spread across the city. Check again in a few minutes.',
          textAlign: TextAlign.center,
          style: t.body.copyWith(color: TtColors.navy700),
        ),
        if (onOther != null) ...[
          const SizedBox(height: TtSpacing.l),
          TtButton.secondary(label: surge ? 'See high demand areas' : 'See surge areas', onPressed: onOther),
        ],
      ],
    );
  }
}

class _Loading extends StatelessWidget {
  const _Loading();

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: TtSpacing.l),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
        const SizedBox(width: TtSpacing.m),
        Text('Getting live areas…', style: context.type.body.copyWith(color: TtColors.navy700)),
      ],
    ),
  );
}
