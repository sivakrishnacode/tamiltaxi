import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

/// Home shell: five tabs (Home · Meter · Earnings · Plan · Account), each with its own stack. In the free app
/// (paid plans off) the Plan tab is hidden and the bar shows Home · Meter · Earnings · Account.
class DriverShell extends ConsumerWidget {
  const DriverShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  static const items = [
    TtNavItem(icon: Symbols.home_rounded, label: 'Home'),
    TtNavItem(icon: Symbols.payments_rounded, label: 'Earnings'),
    TtNavItem(icon: Symbols.workspace_premium_rounded, label: 'Plan'),
    TtNavItem(icon: Symbols.person_rounded, label: 'Account'),
    TtNavItem(icon: Symbols.speed_rounded, label: 'Meter'),
  ];

  /// Branch index of the Plan tab.
  static const planBranch = 2;

  /// The tabs left to right, as branch indexes: the meter (D-42, the last branch) sits next to Home.
  static const _order = [0, 4, 1, 2, 3];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Visible tab → shell branch.
    final branches = [
      for (final i in _order)
        if (i != planBranch || ref.watch(driverPlansEnabledProvider)) i,
    ];
    final current = branches.indexOf(navigationShell.currentIndex);
    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: TtBottomNav(
        items: [for (final b in branches) items[b]],
        currentIndex: current < 0 ? 0 : current,
        onTap: (i) => navigationShell.goBranch(branches[i], initialLocation: branches[i] == navigationShell.currentIndex),
      ),
    );
  }
}
