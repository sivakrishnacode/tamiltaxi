import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../../common/passenger_shell.dart';
import '../../../router/routes.dart';

/// The Activity tabs.
const activityTabs = ['All', 'Rides', 'Parcels'];

/// White "Activity" header with the All · Rides · Parcels tab bar (P-21, S-06, S-07b).
/// Uses [controller], or the surrounding DefaultTabController.
class ActivityHeader extends StatelessWidget {
  const ActivityHeader({super.key, this.controller});
  final TabController? controller;

  @override
  Widget build(BuildContext context) => Material(
        color: TtColors.surface,
        child: SafeArea(
          bottom: false,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                child: Semantics(header: true, child: Text('Activity', style: context.type.h1)),
              ),
              TabBar(
                controller: controller,
                isScrollable: true,
                tabAlignment: TabAlignment.start,
                indicatorSize: TabBarIndicatorSize.tab,
                indicatorWeight: 3,
                labelStyle: context.type.bodyMedium.copyWith(fontWeight: FontWeight.w600),
                unselectedLabelStyle: context.type.bodyMedium,
                labelPadding: const EdgeInsets.symmetric(horizontal: 16),
                tabs: [for (final t in activityTabs) Tab(height: 44, text: t)],
              ),
            ],
          ),
        ),
      );
}

/// Bottom nav for Activity state frames opened on their own (S-06, S-07b showcases):
/// the real tab shell provides it in the flow.
class ActivityShowcaseNav extends StatelessWidget {
  const ActivityShowcaseNav({super.key});

  static const _roots = [Routes.ride, Routes.parcel, Routes.activity, Routes.account];

  @override
  Widget build(BuildContext context) => TtBottomNav(
        items: PassengerShell.items,
        iconWeight: PassengerShell.iconWeight,
        currentIndex: 2,
        onTap: (i) => context.go(_roots[i]),
      );
}
