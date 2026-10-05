import 'package:flutter/material.dart';
import 'package:material_symbols_icons/symbols.dart';

import '../format.dart';
import '../theme/tt_colors.dart';
import '../theme/tt_tokens.dart';

/// Badge style on a vehicle card: "Lowest" / "Best value" = coral, "Comfort" / "Fastest" = navy.
enum VehicleBadgeTone { coral, navy }

/// One row of a ride / goods vehicle list, like Rapido's and Uber's: the vehicle's miniature ([art]) or a symbol tile,
/// name + capacity + badge, "3 min away · Drop 9:24 PM" and the fare. 60 dp tall with no box of its own: only the
/// [selected] row gets a white fill and an outline ([accent], coral). [onInfo] adds an ⓘ before the selected row's fare (P-10:
/// fare details). Disabled shows [disabledReason] in grey. [fastest] adds a "Fastest" chip (earliest drop of the list).
class VehicleOptionCard extends StatelessWidget {
  const VehicleOptionCard({
    super.key,
    required this.icon,
    required this.name,
    required this.subtitle,
    required this.fare,
    this.selected = false,
    this.badge,
    this.badgeTone = VehicleBadgeTone.coral,
    this.disabledReason,
    this.onTap,
    this.capacity,
    this.fastest = false,
    this.art,
    this.onInfo,
    this.accent = TtColors.coral500,
    this.fareText,
  });

  final IconData icon;

  /// The vehicle's picture (e.g. [VehicleArt]); when set it replaces the coral symbol tile.
  final Widget? art;
  final String name;

  /// "3 min away · Drop 9:24 PM" (or "2 min away · 1 seat" when [capacity] is not given).
  final String subtitle;

  /// "1 seat", "4 seats": shown next to the name as "👤 1" (the full text for screen readers).
  final String? capacity;

  /// Earliest drop of the list: a "Fastest" chip with a bolt.
  final bool fastest;
  final int fare;
  final bool selected;
  final String? badge;
  final VehicleBadgeTone badgeTone;

  /// When set, the card is greyed out and not tappable.
  final String? disabledReason;
  final VoidCallback? onTap;

  /// "Fare details" ⓘ before the fare, shown on the selected row only.
  final VoidCallback? onInfo;

  /// The selected row's outline (Pink Taxi: pink).
  final Color accent;

  /// Shown instead of [fare], e.g. a range for Book Any ("₹130–₹420").
  final String? fareText;

  bool get _disabled => disabledReason != null;

  /// "3" from "3 seats" / "1 seat" ("3–6" from "3–6 seats"); null for other capacities.
  String? get _seats => RegExp(r'^(\d+(?:–\d+)?) seats?$').firstMatch(capacity ?? '')?.group(1);

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final fg = _disabled ? TtColors.navy500 : TtColors.navy900;
    final info = onInfo;
    return Semantics(
      container: true,
      selected: selected,
      enabled: !_disabled,
      button: true,
      label: [
        name,
        ?capacity,
        if (fastest && !_disabled) 'Fastest',
        _disabled ? disabledReason! : subtitle,
        fareText ?? formatInr(fare),
      ].join(', '),
      child: Opacity(
        opacity: _disabled ? 0.6 : 1,
        child: Material(
          color: selected ? TtColors.surface : Colors.transparent,
          shape: RoundedRectangleBorder(
            borderRadius: TtRadii.cardRadius,
            side: BorderSide(color: selected ? accent : Colors.transparent, width: 1.5),
          ),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: _disabled ? null : onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Row(
                children: [
                  ExcludeSemantics(
                    child: art != null
                        ? SizedBox(width: 56, height: 40, child: Center(child: art))
                        : Container(
                            width: 56,
                            height: 40,
                            decoration: BoxDecoration(
                              color: _disabled ? TtColors.inputBg : TtColors.coral50,
                              borderRadius: const BorderRadius.all(Radius.circular(10)),
                            ),
                            child: Icon(icon, size: 24, color: _disabled ? TtColors.navy500 : TtColors.coral500, fill: 1),
                          ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ExcludeSemantics(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Row(
                            children: [
                              Flexible(
                                child: Text(name,
                                    style: t.listTitle.copyWith(color: fg), maxLines: 1, overflow: TextOverflow.ellipsis),
                              ),
                              // Seats as "👤 3" (like Rapido) so a long name ("Auto Priority") keeps its room; other
                              // capacities ("Up to 500 kg") shrink with ellipsis. Screen readers get the full label.
                              if (capacity != null) ...[
                                const SizedBox(width: 6),
                                const Icon(Symbols.person_rounded, size: 14, color: TtColors.navy500, fill: 1),
                                if (_seats != null)
                                  Text(_seats!, style: t.caption.copyWith(color: TtColors.navy500), maxLines: 1)
                                else
                                  Flexible(
                                    child: Text(capacity!,
                                        style: t.caption.copyWith(color: TtColors.navy500),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis),
                                  ),
                              ],
                              if (fastest && !_disabled) ...[
                                const SizedBox(width: 6),
                                const _Badge(label: 'Fastest', tone: VehicleBadgeTone.navy, icon: Symbols.bolt_rounded),
                              ] else if (badge != null && !_disabled) ...[
                                const SizedBox(width: 6),
                                _Badge(label: badge!, tone: badgeTone),
                              ],
                            ],
                          ),
                          const SizedBox(height: 2),
                          Text(
                            _disabled ? disabledReason! : subtitle,
                            style: t.listMeta,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  if (selected && info != null && !_disabled)
                    IconButton(
                      tooltip: 'Fare details',
                      onPressed: info,
                      icon: const Icon(Symbols.info_rounded, size: 18, color: TtColors.navy500),
                      visualDensity: VisualDensity.compact,
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints.tightFor(width: 32, height: 40),
                    ),
                  ExcludeSemantics(child: Text(fareText ?? formatInr(fare), style: t.price.copyWith(color: fg))),
                  const SizedBox(width: 4),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.label, required this.tone, this.icon});
  final String label;
  final VehicleBadgeTone tone;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
        decoration: BoxDecoration(
          color: tone == VehicleBadgeTone.coral ? TtColors.coral600 : TtColors.navy900,
          borderRadius: TtRadii.pillRadius,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon, size: 12, color: Colors.white, fill: 1),
              const SizedBox(width: 2),
            ],
            Text(
              label,
              style: context.type.caption.copyWith(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 11),
            ),
          ],
        ),
      );
}
