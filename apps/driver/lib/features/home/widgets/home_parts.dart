import 'package:flutter/material.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import 'navy_header.dart';

/// D-13 / D-14 navy header: avatar, greeting and status pill.
class HomeHeader extends StatelessWidget {
  const HomeHeader({
    super.key,
    required this.initials,
    required this.firstName,
    required this.subtitle,
    required this.pill,
    required this.onlineRing,
    this.photo,
  });

  final String initials;
  final String firstName;
  final String subtitle;
  final Widget pill;
  final bool onlineRing;

  /// The driver's profile photo; initials when null.
  final ImageProvider? photo;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return NavyHeader(
      padding: const EdgeInsets.fromLTRB(TtSpacing.gutter, TtSpacing.m, TtSpacing.gutter, TtSpacing.m),
      child: Row(
        children: [
          TtAvatar(
            initials: initials,
            size: 46,
            tone: AvatarTone.dark,
            ringColor: onlineRing ? TtColors.success : null,
            image: photo,
          ),
          const SizedBox(width: TtSpacing.m),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(subtitle,
                    maxLines: 1, overflow: TextOverflow.ellipsis, style: t.bodySmall.copyWith(color: Colors.white70)),
                Text('Hi, $firstName',
                    maxLines: 1, overflow: TextOverflow.ellipsis, style: t.h1.copyWith(color: Colors.white)),
              ],
            ),
          ),
          const SizedBox(width: TtSpacing.s),
          pill,
        ],
      ),
    );
  }
}

/// "Offline" pill tuned for the navy header (navy-700 fill, hollow dot).
class OfflineHeaderPill extends StatelessWidget {
  const OfflineHeaderPill({super.key});

  @override
  Widget build(BuildContext context) => Container(
        height: 36,
        padding: const EdgeInsets.symmetric(horizontal: 14),
        decoration: const BoxDecoration(color: TtColors.navy700, borderRadius: TtRadii.pillRadius),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 10,
            height: 10,
            decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: TtColors.navy300, width: 2)),
          ),
          const SizedBox(width: TtSpacing.s),
          Text('Offline', style: context.type.bodySemibold.copyWith(color: Colors.white)),
        ]),
      );
}

/// Big coral round "GO ONLINE" button (disabled shows a lock).
class GoOnlineButton extends StatelessWidget {
  const GoOnlineButton({super.key, required this.onPressed, this.loading = false});

  final VoidCallback? onPressed;

  /// Live API: getting a GPS fix and going online.
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null || loading;
    final fg = enabled ? Colors.white : TtColors.navy500;
    return Semantics(
      button: true,
      enabled: enabled,
      label: loading ? 'Going online' : (enabled ? 'Go online' : 'Go online, locked'),
      excludeSemantics: true,
      child: Material(
        color: enabled ? TtColors.coral600 : TtColors.divider,
        shape: const StadiumBorder(),
        elevation: enabled ? 2 : 0,
        shadowColor: TtColors.shadow,
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: loading ? null : onPressed,
          child: SizedBox(
            height: 64,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (loading)
                  const SizedBox(
                    width: 24,
                    height: 24,
                    child: CircularProgressIndicator(color: Colors.white, strokeWidth: 3),
                  )
                else
                  Icon(enabled ? Symbols.power_settings_new_rounded : Symbols.lock_rounded, color: fg, size: 28, weight: 600),
                const SizedBox(width: TtSpacing.m),
                Text(loading ? 'GOING ONLINE…' : 'GO ONLINE',
                    style: context.type.h2.copyWith(color: fg, letterSpacing: 2, fontWeight: FontWeight.w700)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// White floating card with today's figures ("₹0 today · 0 rides" / "Earned today ₹1,420 · 3 rides").
class TodayCard extends StatelessWidget {
  const TodayCard({super.key, required this.earnings, required this.rides, required this.online, required this.onEarnings});

  final int earnings;
  final int rides;
  final bool online;
  final VoidCallback onEarnings;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final ridesLabel = rides == 1 ? '1 ride' : '$rides rides';
    if (!online) {
      return TtCard(
        shadow: true,
        borderColor: null,
        padding: const EdgeInsets.fromLTRB(TtSpacing.l, TtSpacing.s, TtSpacing.s, TtSpacing.s),
        child: Row(children: [
          const Icon(Symbols.today_rounded, color: TtColors.navy900),
          const SizedBox(width: TtSpacing.m),
          Expanded(
            child: Text('${formatInr(earnings)} today · $ridesLabel',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TtTextStyles.tabular(t.h2)),
          ),
          TextButton(onPressed: onEarnings, child: const Text('Earnings')),
        ]),
      );
    }
    return TtCard(
      shadow: true,
      borderColor: null,
      onTap: onEarnings,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Earned today', style: t.bodySmall.copyWith(color: TtColors.navy500)),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(formatInr(earnings), style: t.heroSmall),
              const SizedBox(width: TtSpacing.m),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      Flexible(
                        child: Text(ridesLabel,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TtTextStyles.tabular(t.bodySmallMedium.copyWith(color: TtColors.navy700))),
                      ),
                      const Icon(Symbols.chevron_right_rounded, size: 20, color: TtColors.navy500),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// D-25a amber banner: "Payment failed. 2 days left to renew." + navy "Pay ₹2,000 now".
class GraceBanner extends StatelessWidget {
  const GraceBanner({super.key, required this.daysLeft, required this.amount, required this.onPay});

  final int daysLeft;
  final int? amount;
  final VoidCallback onPay;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Container(
      padding: const EdgeInsets.fromLTRB(TtSpacing.l, TtSpacing.l, TtSpacing.l, TtSpacing.l),
      decoration: BoxDecoration(
        color: TtColors.warningTint,
        borderRadius: TtRadii.cardRadius,
        border: Border.all(color: TtColors.warning),
        boxShadow: TtShadows.soft,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Symbols.warning_rounded, fill: 1, color: TtColors.warningText, size: 26),
          const SizedBox(width: TtSpacing.m),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Payment failed. $daysLeft ${daysLeft == 1 ? 'day' : 'days'} left to renew.',
                    style: t.bodySemibold),
                const SizedBox(height: 2),
                Text('You can still go online.', style: t.body.copyWith(color: TtColors.navy700)),
                const SizedBox(height: TtSpacing.m),
                TtButton(
                  label: 'Pay ${amount == null ? '₹—' : formatInr(amount!)} now',
                  variant: TtButtonVariant.dark,
                  expand: false,
                  height: 44,
                  onPressed: onPay,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// D-14b coral strip: "Ride in progress · Priya → Brookefields Mall · 9 min" + Return.
class TripInProgressBanner extends StatelessWidget {
  const TripInProgressBanner({
    super.key,
    required this.title,
    required this.subtitle,
    required this.onOpen,
    this.icon = Symbols.navigation_rounded,
  });

  final String title;
  final String subtitle;
  final VoidCallback onOpen;

  /// The navigation arrow for a booked trip; the meter shows its own.
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Material(
      color: TtColors.coral600,
      child: InkWell(
        onTap: onOpen,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(TtSpacing.gutter, TtSpacing.m, TtSpacing.m, TtSpacing.m),
          child: Row(
            children: [
              Icon(icon, color: Colors.white, fill: 1, size: 26),
              const SizedBox(width: TtSpacing.m),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: t.h2.copyWith(color: Colors.white), maxLines: 1, overflow: TextOverflow.ellipsis),
                    Text(subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TtTextStyles.tabular(t.body.copyWith(color: Colors.white.withValues(alpha: 0.92)))),
                  ],
                ),
              ),
              const SizedBox(width: TtSpacing.s),
              Material(
                color: TtColors.surface,
                shape: const StadiumBorder(),
                child: InkWell(
                  customBorder: const StadiumBorder(),
                  onTap: onOpen,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 12, 14, 12),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      Text('Return', style: t.bodySemibold.copyWith(color: TtColors.coral600)),
                      const Icon(Symbols.chevron_right_rounded, color: TtColors.coral600),
                    ]),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Small tinted strip under GO ONLINE ("Bike plan active till 24 Oct 2026").
class PlanStrip extends StatelessWidget {
  const PlanStrip({super.key, required this.text, required this.onTap, this.warning = false});

  final String text;
  final VoidCallback onTap;
  final bool warning;

  @override
  Widget build(BuildContext context) {
    final fg = warning ? TtColors.warningText : TtColors.navy900;
    return Material(
      color: warning ? TtColors.warningTint : TtColors.inputBg,
      borderRadius: TtRadii.cardRadius,
      child: InkWell(
        borderRadius: TtRadii.cardRadius,
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 48),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: TtSpacing.l, vertical: TtSpacing.m),
            child: Row(children: [
              Icon(warning ? Symbols.schedule_rounded : Symbols.verified_rounded,
                  size: 22, fill: warning ? 0 : 1, color: warning ? TtColors.warningText : TtColors.success),
              const SizedBox(width: TtSpacing.m),
              Expanded(child: Text(text, style: context.type.body.copyWith(color: fg), maxLines: 2)),
              if (!warning) const Icon(Symbols.chevron_right_rounded, color: TtColors.navy500),
            ]),
          ),
        ),
      ),
    );
  }
}

/// Green dot + "You're online" + subtitle (D-14 / S-11 panel top).
class OnlineStatusRow extends StatelessWidget {
  const OnlineStatusRow({super.key, required this.title, required this.subtitle, this.icon});

  final String title;
  final String subtitle;

  /// Replaces the green dot (e.g. pause icon for "New requests paused").
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: icon != null
              ? Icon(icon, color: TtColors.navy700, size: 26)
              : Container(
                  width: 22,
                  height: 22,
                  alignment: Alignment.center,
                  decoration: const BoxDecoration(color: TtColors.successTint, shape: BoxShape.circle),
                  child: Container(
                    width: 12,
                    height: 12,
                    decoration: const BoxDecoration(color: TtColors.success, shape: BoxShape.circle),
                  ),
                ),
        ),
        const SizedBox(width: TtSpacing.m),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: t.h2),
            Text(subtitle, style: t.body.copyWith(color: TtColors.navy700)),
          ]),
        ),
      ],
    );
  }
}

/// "Filters on · pickup ≤ 2 km · trips over 5 km   Edit": booking preferences are narrowing requests.
class FiltersOnRow extends StatelessWidget {
  const FiltersOnRow({super.key, required this.summary, required this.onEdit});
  final String summary;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Container(
      padding: const EdgeInsets.fromLTRB(TtSpacing.m, TtSpacing.xs, TtSpacing.xs, TtSpacing.xs),
      decoration: const BoxDecoration(color: TtColors.warningTint, borderRadius: TtRadii.cardRadius),
      child: Row(children: [
        const Icon(Symbols.tune_rounded, color: TtColors.warningText, size: 20),
        const SizedBox(width: TtSpacing.s),
        Expanded(
          child: Text('Filters on · $summary',
              style: t.bodySmall.copyWith(color: TtColors.warningText), maxLines: 2, overflow: TextOverflow.ellipsis),
        ),
        TextButton(onPressed: onEdit, child: const Text('Edit')),
      ]),
    );
  }
}
