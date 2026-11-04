import 'package:flutter/material.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../../common/launch.dart';
import 'demand_layer.dart';

/// Home map: a tapped admin zone's details (what it means for the driver, when it runs) with Directions.
Future<void> showZoneSheet(BuildContext context, MapZone zone) => showTtSheet<void>(
      context,
      builder: (ctx) => ZoneDetails(
        zone: zone,
        now: DateTime.now(),
        onDirections: zone.kind == MapZoneKind.noService ? null : () => openNavigation(ctx, zone.centre),
      ),
    );

/// Home map: a tapped demand hex's details with Directions.
Future<void> showHotspotSheet(BuildContext context, Hotspot hotspot) => showTtSheet<void>(
      context,
      builder: (ctx) => HotspotDetails(hotspot: hotspot, onDirections: () => openNavigation(ctx, hotspot.centre)),
    );

const _weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/// When [z] runs, e.g. "5:00 PM – 9:00 PM · Fri, Sat", "Until 9:30 PM" (a Surge now) or "All day".
String zoneWhen(MapZone z, DateTime now) {
  String clock(int minute) => formatTime(DateTime(2000, 1, 1, minute ~/ 60, minute % 60));
  final start = z.startMinute, end = z.endMinute;
  final ends = z.endsAt;
  final until = ends == null ? null : 'until ${DateUtils.isSameDay(ends, now) ? formatTime(ends) : formatShortDate(ends)}';
  // Monday first, as people say the week.
  final days = [for (final d in const [1, 2, 3, 4, 5, 6, 0]) if (z.days.contains(d)) _weekdays[d]];
  final when = [
    if (start != null && end != null) '${clock(start)} – ${clock(end)}' else if (until == null || days.isNotEmpty) 'All day',
    if (days.isNotEmpty) days.join(', '),
    ?until,
  ].join(' · ');
  return '${when[0].toUpperCase()}${when.substring(1)}';
}

/// What [z] means for the driver, one line each.
List<(IconData, String)> zoneFacts(MapZone z) => switch (z.kind) {
      MapZoneKind.surge => [
          (Symbols.payments_rounded, 'Fares are ${multiplierLabel(z.multiplier)} on trips that start here'),
          (
            Symbols.directions_car_rounded,
            z.vehicleKinds.isEmpty ? 'Every vehicle' : 'For ${z.vehicleKinds.map((v) => v.label).join(', ')}',
          ),
        ],
      MapZoneKind.demand => [(Symbols.groups_rounded, 'Many riders book here at this time')],
      MapZoneKind.noService => [
          (
            Symbols.block_rounded,
            z.blocksPickups && z.blocksDrops
                ? 'No requests start or end inside'
                : z.blocksPickups
                    ? 'No requests start inside. Drops here are fine'
                    : 'No trips end inside. Pickups here are fine',
          ),
        ],
      MapZoneKind.pickupPoint => [
          (Symbols.where_to_vote_rounded, z.meetingPoint == null ? 'Riders wait at the marked pickup spot' : 'Meet riders at: ${z.meetingPoint}'),
          (Symbols.info_rounded, 'Requests from here show the meeting spot'),
        ],
    };

class ZoneDetails extends StatelessWidget {
  const ZoneDetails({super.key, required this.zone, required this.now, this.onDirections});

  final MapZone zone;
  final DateTime now;

  /// Null: no Directions button (a no-service zone isn't somewhere to go).
  final VoidCallback? onDirections;

  @override
  Widget build(BuildContext context) => _AreaDetails(
        icon: zoneIcon(zone.kind),
        color: zoneColor(zone.kind),
        title: zoneTitle(zone),
        subtitle: zone.name.isEmpty ? null : zone.name,
        facts: [...zoneFacts(zone), (Symbols.schedule_rounded, zoneWhen(zone, now))],
        onDirections: onDirections,
      );
}

class HotspotDetails extends StatelessWidget {
  const HotspotDetails({super.key, required this.hotspot, required this.onDirections});

  final Hotspot hotspot;
  final VoidCallback onDirections;

  @override
  Widget build(BuildContext context) {
    final h = hotspot;
    return _AreaDetails(
      icon: Symbols.local_fire_department_rounded,
      color: h.level == HotspotLevel.high ? TtColors.coral600 : TtColors.warningText,
      title: switch (h.level) {
        HotspotLevel.high => 'High demand',
        HotspotLevel.busy => 'Busy area',
        HotspotLevel.some => 'Some bookings',
      },
      subtitle: h.name,
      facts: [
        (Symbols.groups_rounded, 'Riders here now and at this time of day'),
        if (h.isSurging) (Symbols.payments_rounded, 'Fares are ${multiplierLabel(h.multiplier)} here right now'),
      ],
      onDirections: onDirections,
    );
  }
}

class _AreaDetails extends StatelessWidget {
  const _AreaDetails({
    required this.icon,
    required this.color,
    required this.title,
    required this.subtitle,
    required this.facts,
    required this.onDirections,
  });

  final IconData icon;
  final Color color;
  final String title;
  final String? subtitle;
  final List<(IconData, String)> facts;
  final VoidCallback? onDirections;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
      const SizedBox(height: TtSpacing.s),
      Row(children: [
        Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(color: color.withValues(alpha: 0.12), shape: BoxShape.circle),
          child: Icon(icon, color: color, size: 24, fill: 1),
        ),
        const SizedBox(width: TtSpacing.m),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: t.h2.copyWith(color: color)),
            if (subtitle != null)
              Text(subtitle!, style: t.body.copyWith(color: TtColors.navy700), maxLines: 2, overflow: TextOverflow.ellipsis),
          ]),
        ),
      ]),
      const SizedBox(height: TtSpacing.l),
      for (final (i, (factIcon, text)) in facts.indexed) ...[
        if (i > 0) const SizedBox(height: TtSpacing.m),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(factIcon, size: 20, color: TtColors.navy500),
          const SizedBox(width: TtSpacing.m),
          Expanded(child: Text(text, style: t.body.copyWith(color: TtColors.navy900))),
        ]),
      ],
      if (onDirections != null) ...[
        const SizedBox(height: TtSpacing.xl),
        TtButton.secondary(label: 'Directions', icon: Symbols.turn_right_rounded, onPressed: onDirections),
      ],
    ]);
  }
}
