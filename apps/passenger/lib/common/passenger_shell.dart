import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

/// Home shell: four tabs (Ride · Parcel · Activity · Account), each with its own stack.
class PassengerShell extends StatelessWidget {
  const PassengerShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  static const items = [
    TtNavItem(icon: Symbols.home_rounded, label: 'Ride'),
    TtNavItem(icon: Symbols.package_2_rounded, label: 'Parcel'),
    TtNavItem(icon: Symbols.receipt_long_rounded, label: 'Activity'),
    TtNavItem(icon: Symbols.account_circle_rounded, label: 'Account'),
  ];

  /// Bolder than the 400 default so the tab icons read clearly on small screens.
  static const iconWeight = 600.0;

  @override
  Widget build(BuildContext context) {
    // Light screens under a transparent status bar: dark icons (a screen with a dark top sets its own region).
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark.copyWith(statusBarColor: Colors.transparent),
      child: _scaffold(),
    );
  }

  Widget _scaffold() {
    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: TtBottomNav(
        items: items,
        iconWeight: iconWeight,
        currentIndex: navigationShell.currentIndex,
        // Tapping the active tab pops it back to its root.
        onTap: (i) => navigationShell.goBranch(i, initialLocation: i == navigationShell.currentIndex),
      ),
    );
  }
}
