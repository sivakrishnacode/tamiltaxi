// Dev tool: renders every Design gallery frame, plus the screens added after the design, to PNGs. This is how
// docs/design/ is refreshed from the app (see docs/design/index.md).
//
//   flutter test test/tool/design_export_test.dart --dart-define=OUT_DIR=/tmp/shots
//
// Writes <OUT_DIR>/<frame id>.png (780 × 1688). Skipped when OUT_DIR is not given, so it never runs in normal
// test runs.
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_passenger/features/design_gallery/gallery_registry.dart';
import 'package:tamiltaxi_passenger/router/routes.dart';

import '../support/harness.dart';

const _outDir = String.fromEnvironment('OUT_DIR');

/// Only these frame IDs (comma-separated), e.g. `--dart-define=ONLY=P-10,P-26`.
const _only = String.fromEnvironment('ONLY');

/// Screens added after the original design, opened through their real route. One with a gallery frame's ID
/// replaces that frame (the screen as it is in the flow today).
const extraShots = <({String id, String name, String route, String? tap})>[
  (id: 'P-10b', name: "Who's riding (sheet)", route: Routes.chooseVehicle, tap: 'For me'),
  (id: 'P-26', name: 'Edit profile', route: Routes.editProfile, tap: null),
  (id: 'P-27', name: 'Saved places', route: Routes.savedPlaces, tap: null),
  (id: 'P-28', name: 'Safety preferences', route: Routes.safety, tap: null),
  (id: 'P-29', name: 'Verify identity', route: Routes.verifyIdentity, tap: null),
  (id: 'P-30', name: 'Contribute', route: Routes.contribute, tap: null),
  (id: 'P-31', name: 'About', route: Routes.about, tap: null),
  (id: 'P-32', name: 'Terms', route: '/legal/terms', tap: null),
  (id: 'P-33', name: 'Privacy', route: '/legal/privacy', tap: null),
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

  // The design-system board (shared by both apps) scrolls: one PNG per screenful, DS-board-01.png, -02…
  testWidgets('export DS board pages', (tester) async {
    await pumpRoute(tester, Routes.galleryView('DS'));
    await tester.pump(const Duration(milliseconds: 600));
    final position = tester.state<ScrollableState>(find.byType(Scrollable).first).position;
    final step = position.viewportDimension - 80;
    for (var page = 1, at = 0.0;; page++, at += step) {
      position.jumpTo(at.clamp(0, position.maxScrollExtent));
      await tester.pump(const Duration(milliseconds: 300));
      await precacheImages(tester);
      await saveScreenshot(tester, '$_outDir/DS-board-${page.toString().padLeft(2, '0')}.png');
      if (at >= position.maxScrollExtent) break;
    }
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(minutes: 1));
  }, skip: _outDir.isEmpty || !wanted('DS'));

  final replaced = {'DS', for (final s in extraShots) s.id};
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
