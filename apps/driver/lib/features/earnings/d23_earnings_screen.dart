import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../state/driver_session.dart';
import '../states/s15_empty_earnings_view.dart';
import 'd23b_trip_detail_sheet.dart';
import 'widgets/earnings_header.dart';

/// D-23 Earnings: Today / Week / Month tabs, big total, "You kept 100%", bar chart (the
/// best bar in coral-500), stat tiles and the trip list (tap → D-23b). Empty → S-15.
class D23EarningsScreen extends ConsumerStatefulWidget {
  const D23EarningsScreen({super.key, this.showcase = false});

  /// Opened on its own from the Design gallery: render seed state, start no timers.
  final bool showcase;

  @override
  ConsumerState<D23EarningsScreen> createState() => _D23EarningsScreenState();
}

class _D23EarningsScreenState extends ConsumerState<D23EarningsScreen> {
  EarningsPeriod _period = EarningsPeriod.week;

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(earningsProvider(_period));
    final summary = async.value;
    final empty = summary != null && summary.rides == 0 && summary.trips.isEmpty;

    final Widget body;
    if (async.hasError && summary == null) {
      body = Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(TtSpacing.gutter),
          child: EmptyState(
            illustration: const TtIllustration(IllustrationKind.offline, height: 160),
            title: "You're offline",
            message: 'Check your internet connection and try again.',
            actionLabel: 'Retry',
            onAction: () => ref.invalidate(earningsProvider(_period)),
          ),
        ),
      );
    } else if (summary == null) {
      body = const _EarningsSkeleton();
    } else if (empty) {
      body = S15EmptyEarningsView(period: _period);
    } else {
      body = RefreshIndicator(
        color: TtColors.coral600,
        onRefresh: () => ref.refresh(earningsProvider(_period).future),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(TtSpacing.gutter, TtSpacing.l, TtSpacing.gutter, TtSpacing.xl),
          children: [
            _ChartCard(bars: summary.bars),
            const SizedBox(height: TtSpacing.m),
            Row(children: [
              Expanded(child: _StatTile(value: formatCount(summary.rides), label: 'rides')),
              const SizedBox(width: TtSpacing.s),
              Expanded(child: _StatTile(value: '${summary.onlineHours}h', label: 'online')),
              const SizedBox(width: TtSpacing.s),
              Expanded(child: _StatTile(value: summary.rating.toStringAsFixed(1), label: 'rating', star: true)),
            ]),
            const SizedBox(height: TtSpacing.m),
            _TripList(trips: summary.trips),
          ],
        ),
      );
    }

    return Scaffold(
      backgroundColor: TtColors.background,
      body: Column(children: [
        EarningsHeader(
          period: _period,
          onPeriod: (p) => setState(() => _period = p),
          total: summary?.total,
          commissionSaved: summary == null || empty ? null : summary.commissionSaved,
        ),
        Expanded(child: body),
      ]),
    );
  }
}

String _short(int v) {
  if (v < 1000) return '$v';
  final k = v / 1000;
  return k >= 10 ? '${k.round()}k' : '${k.toStringAsFixed(1)}k';
}

class _ChartCard extends StatelessWidget {
  const _ChartCard({required this.bars});
  final List<EarningsDay> bars;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    if (bars.isEmpty) return const SizedBox.shrink();
    final maxV = bars.map((b) => b.amount).reduce((a, b) => a > b ? a : b);
    final maxIndex = bars.indexWhere((b) => b.amount == maxV);
    return TtCard(
      padding: const EdgeInsets.fromLTRB(TtSpacing.m, TtSpacing.xl, TtSpacing.m, TtSpacing.s),
      child: SizedBox(
        height: 190,
        child: Semantics(
          label: 'Earnings chart. ${[for (final b in bars) '${b.label} ${formatInr(b.amount)}'].join(', ')}',
          child: BarChart(
            BarChartData(
              maxY: maxV * 1.22,
              minY: 0,
              alignment: BarChartAlignment.spaceAround,
              gridData: const FlGridData(show: false),
              borderData: FlBorderData(show: false),
              barTouchData: BarTouchData(
                enabled: false,
                touchTooltipData: BarTouchTooltipData(
                  getTooltipColor: (_) => Colors.transparent,
                  tooltipPadding: EdgeInsets.zero,
                  tooltipMargin: 4,
                  getTooltipItem: (group, _, rod, _) => BarTooltipItem(
                    _short(rod.toY.round()),
                    TtTextStyles.tabular(t.caption.copyWith(color: TtColors.navy700, fontWeight: FontWeight.w600)),
                  ),
                ),
              ),
              titlesData: FlTitlesData(
                leftTitles: const AxisTitles(),
                rightTitles: const AxisTitles(),
                topTitles: const AxisTitles(),
                bottomTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    reservedSize: 28,
                    getTitlesWidget: (v, meta) => SideTitleWidget(
                      meta: meta,
                      child: Text(bars[v.toInt()].label, style: t.bodySmall.copyWith(color: TtColors.navy500)),
                    ),
                  ),
                ),
              ),
              barGroups: [
                for (var i = 0; i < bars.length; i++)
                  BarChartGroupData(
                    x: i,
                    showingTooltipIndicators: const [0],
                    barRods: [
                      BarChartRodData(
                        toY: bars[i].amount.toDouble(),
                        width: bars.length > 5 ? 32 : 44,
                        color: i == maxIndex ? TtColors.coral500 : TtColors.coral100,
                        borderRadius: const BorderRadius.vertical(top: Radius.circular(8)),
                      ),
                    ],
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({required this.value, required this.label, this.star = false});
  final String value;
  final String label;
  final bool star;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return TtCard(
      padding: const EdgeInsets.symmetric(horizontal: TtSpacing.m, vertical: TtSpacing.m),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Flexible(child: FittedBox(child: Text(value, style: TtTextStyles.tabular(t.h1)))),
          if (star) ...[
            const SizedBox(width: 4),
            const Icon(Symbols.star_rounded, fill: 1, color: TtColors.warning, size: 22),
          ],
        ]),
        Text(label, style: t.bodySmall.copyWith(color: TtColors.navy500)),
      ]),
    );
  }
}

class _TripList extends StatelessWidget {
  const _TripList({required this.trips});
  final List<EarningsTrip> trips;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return TtCard(
      padding: EdgeInsets.zero,
      child: Column(children: [
        for (var i = 0; i < trips.length; i++) ...[
          if (i > 0) const Divider(),
          InkWell(
            onTap: () => D23bTripDetailSheet.show(context, trips[i]),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: TtSpacing.l, vertical: TtSpacing.l),
              child: Row(children: [
                SizedBox(
                  width: 72,
                  child: Text(formatTime(trips[i].time),
                      style: TtTextStyles.tabular(t.bodySmall.copyWith(color: TtColors.navy500))),
                ),
                Expanded(
                  child: Text(trips[i].isMeter ? 'Meter · ${trips[i].from}' : '${trips[i].from} → ${trips[i].to}',
                      style: t.body, maxLines: 1, overflow: TextOverflow.ellipsis),
                ),
                const SizedBox(width: TtSpacing.s),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: TtSpacing.s, vertical: 3),
                  decoration: BoxDecoration(color: TtColors.inputBg, borderRadius: BorderRadius.circular(6)),
                  // A meter trip's Done covers cash and UPI.
                  child: Text(trips[i].isMeter ? 'Meter' : trips[i].paymentMode == PaymentMode.upi ? 'UPI' : 'Cash',
                      style: t.caption.copyWith(color: TtColors.navy700, fontWeight: FontWeight.w600)),
                ),
                const SizedBox(width: TtSpacing.m),
                Text(formatInr(trips[i].fare), style: TtTextStyles.tabular(t.bodySemibold)),
              ]),
            ),
          ),
        ],
      ]),
    );
  }
}

class _EarningsSkeleton extends StatelessWidget {
  const _EarningsSkeleton();

  @override
  Widget build(BuildContext context) => SkeletonShimmer(
        child: ListView(
          physics: const NeverScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(TtSpacing.gutter, TtSpacing.l, TtSpacing.gutter, TtSpacing.l),
          children: [
            const SkeletonBox(height: 220, radius: TtRadii.card),
            const SizedBox(height: TtSpacing.m),
            Row(children: const [
              Expanded(child: SkeletonBox(height: 84, radius: TtRadii.card)),
              SizedBox(width: TtSpacing.s),
              Expanded(child: SkeletonBox(height: 84, radius: TtRadii.card)),
              SizedBox(width: TtSpacing.s),
              Expanded(child: SkeletonBox(height: 84, radius: TtRadii.card)),
            ]),
            const SizedBox(height: TtSpacing.m),
            for (var i = 0; i < 4; i++) ...[
              const SkeletonBox(height: 56, radius: TtRadii.card),
              const SizedBox(height: TtSpacing.s),
            ],
          ],
        ),
      );
}
