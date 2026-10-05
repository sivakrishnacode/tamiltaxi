import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart' show Marker;
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../common/passenger_shell.dart';
import '../../router/routes.dart';

/// S-07a Home skeleton: the P-07 map and bottom sheet while Home data loads.
class S07aHomeSkeletonScreen extends StatelessWidget {
  const S07aHomeSkeletonScreen({super.key, this.showcase = false});

  /// Opened on its own from the Design gallery: render seed state, start no timers.
  final bool showcase;

  static const _tabs = [Routes.ride, Routes.parcel, Routes.activity, Routes.account];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: TtColors.surface,
      body: LayoutBuilder(
        builder: (context, c) {
          final sheetTop = c.maxHeight * 0.4;
          return Stack(
            children: [
              Positioned.fill(
                bottom: c.maxHeight - sheetTop - TtSpacing.xl,
                child: Stack(
                  children: [
                    TtMap(
                      center: offsetPoint(Seed.gandhipuram.location, 250, 180),
                      zoom: 15,
                      interactive: false,
                      showAttribution: false,
                      extraMarkers: [
                        Marker(
                          point: Seed.gandhipuram.location,
                          width: 24,
                          height: 24,
                          child: Container(
                            decoration: BoxDecoration(
                              color: TtColors.navy300,
                              shape: BoxShape.circle,
                              border: Border.all(color: TtColors.surface, width: 4),
                            ),
                          ),
                        ),
                      ],
                    ),
                    // Wash the map out while loading.
                    Positioned.fill(child: ColoredBox(color: TtColors.surface.withValues(alpha: 0.45))),
                  ],
                ),
              ),
              Positioned(
                left: 0,
                right: 0,
                top: 0,
                child: SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(TtSpacing.l, TtSpacing.m, TtSpacing.l, 0),
                    // Home's top row: the one-line pickup pill on the left, the SOS map button on the right.
                    child: SkeletonShimmer(
                      child: Row(
                        children: [
                          Container(
                            height: 44,
                            width: 200,
                            padding: const EdgeInsets.symmetric(horizontal: 14),
                            alignment: Alignment.centerLeft,
                            decoration: const BoxDecoration(
                              color: TtColors.surface,
                              borderRadius: TtRadii.pillRadius,
                              boxShadow: TtShadows.soft,
                            ),
                            child: const SkeletonBox(width: 140, height: 12),
                          ),
                          const Spacer(),
                          const SkeletonBox(width: 44, height: 44, circle: true),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              Positioned(
                left: 0,
                right: 0,
                top: sheetTop,
                bottom: 0,
                child: const DecoratedBox(
                  decoration: BoxDecoration(
                    color: TtColors.surface,
                    borderRadius: TtRadii.sheetTop,
                    boxShadow: TtShadows.raised,
                  ),
                  child: SingleChildScrollView(
                    physics: NeverScrollableScrollPhysics(),
                    padding: EdgeInsets.fromLTRB(TtSpacing.l, 0, TtSpacing.l, TtSpacing.l),
                    child: Column(children: [SheetHandle(), S07aHomeSheetSkeleton()]),
                  ),
                ),
              ),
            ],
          );
        },
      ),
      bottomNavigationBar: TtBottomNav(
        items: PassengerShell.items,
        currentIndex: 0,
        onTap: (i) => context.go(_tabs[i]),
      ),
    );
  }
}

/// The Home bottom-sheet content in skeleton form (search, saved-place pills, 3 recent rows, 4 tiles).
/// P-07 shows it while recent destinations load.
class S07aHomeSheetSkeleton extends StatelessWidget {
  const S07aHomeSheetSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    Widget row() => const Padding(
      padding: EdgeInsets.symmetric(vertical: 11),
      child: Row(
        children: [
          SkeletonBox(width: 20, height: 20, circle: true),
          SizedBox(width: 18),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                FractionallySizedBox(widthFactor: 0.5, child: SkeletonBox(height: 12)),
                SizedBox(height: TtSpacing.s),
                FractionallySizedBox(widthFactor: 0.7, child: SkeletonBox(height: 10)),
              ],
            ),
          ),
        ],
      ),
    );
    return SkeletonShimmer(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SkeletonBox(height: 52, radius: TtRadii.card),
          const SizedBox(height: TtSpacing.m),
          const Row(
            children: [
              SkeletonBox(width: 84, height: 36, radius: TtRadii.pill),
              SizedBox(width: TtSpacing.s),
              SkeletonBox(width: 84, height: 36, radius: TtRadii.pill),
              SizedBox(width: TtSpacing.s),
              SkeletonBox(width: 72, height: 36, radius: TtRadii.pill),
            ],
          ),
          const SizedBox(height: TtSpacing.xs),
          row(),
          row(),
          row(),
          const SizedBox(height: TtSpacing.l),
          const Row(
            children: [
              Expanded(child: SkeletonBox(height: 64, radius: TtRadii.card)),
              SizedBox(width: TtSpacing.s),
              Expanded(child: SkeletonBox(height: 64, radius: TtRadii.card)),
              SizedBox(width: TtSpacing.s),
              Expanded(child: SkeletonBox(height: 64, radius: TtRadii.card)),
              SizedBox(width: TtSpacing.s),
              Expanded(child: SkeletonBox(height: 64, radius: TtRadii.card)),
            ],
          ),
        ],
      ),
    );
  }
}
