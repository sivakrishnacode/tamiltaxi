// Dev tool: renders every Design gallery frame, plus the screens added after the design, to PNGs. This is how
// docs/design/ is refreshed from the app (see docs/design/index.md).
//
//   flutter test test/tool/design_export_test.dart --dart-define=OUT_DIR=/tmp/shots
//
// Writes <OUT_DIR>/<frame id>.png (780 × 1688). Skipped when OUT_DIR is not given, so it never runs in normal
// test runs.
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_driver/features/design_gallery/gallery_registry.dart';
import 'package:tamiltaxi_driver/router/routes.dart';

import '../support/harness.dart';

const _outDir = String.fromEnvironment('OUT_DIR');

/// Only these frame IDs (comma-separated), e.g. `--dart-define=ONLY=D-15,D-27`.
const _only = String.fromEnvironment('ONLY');

/// Screens added after the original design, opened through their real route. One with a gallery frame's ID
/// replaces that frame (the screen as it is in the flow today).
const extraShots = <({String id, String name, String route, String? tap})>[
  // In the flow (paid plans off): no plan price on the vehicle cards. The gallery frame shows the design.
  (id: 'D-05', name: 'Choose vehicle', route: Routes.chooseVehicle, tap: null),
  (id: 'D-27', name: 'Profile photo', route: Routes.profilePhoto, tap: null),
  (id: 'D-28', name: 'My documents', route: Routes.accountDocuments, tap: null),
  (id: 'D-29', name: 'Vehicle details', route: Routes.vehicleDetails, tap: null),
  (id: 'D-30', name: 'UPI ID', route: Routes.upiId, tap: null),
  (id: 'D-31', name: 'Emergency contact', route: Routes.emergencyContact, tap: null),
  (id: 'D-32', name: 'Booking preferences', route: Routes.bookingPreferences, tap: null),
  (id: 'D-34', name: 'Help & support', route: Routes.help, tap: null),
  (id: 'D-35', name: 'Raise a ticket', route: '/help/new-ticket', tap: null),
  (id: 'D-36', name: 'Chat with passenger', route: Routes.chat, tap: null),
  (id: 'D-38', name: 'Terms', route: '/legal/terms', tap: null),
  (id: 'D-39', name: 'Privacy', route: '/legal/privacy', tap: null),
];

void main() {
  bool wanted(String id) => _only.isEmpty || _only.split(',').contains(id);

  Future<void> shoot(WidgetTester tester, String id, String route, {String? tap}) async {
    await pumpRoute(tester, route);
    await tester.pump(const Duration(milliseconds: 1500));
    if (tap != null) {
      await tester.tap(find.text(tap).first);
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(milliseconds: 400));
    }
    await precacheImages(tester);
    await saveScreenshot(tester, '$_outDir/$id.png');
    // Unmount and let any timers the screen started run out.
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(minutes: 1));
  }

  final replaced = {for (final s in extraShots) s.id};
  for (final e in galleryEntries.where((e) => wanted(e.id) && !replaced.contains(e.id))) {
    testWidgets(
      'export ${e.id} ${e.name}',
      (tester) => shoot(tester, e.id, Routes.galleryView(e.id)),
      skip: _outDir.isEmpty,
    );
  }
  for (final s in extraShots.where((s) => wanted(s.id))) {
    testWidgets(
      'export ${s.id} ${s.name}',
      (tester) => shoot(tester, s.id, s.route, tap: s.tap),
      skip: _outDir.isEmpty,
    );
  }
}
