// Home banners (6j): the admin's live pictures in a row the rider swipes through, with page dots; × hides one until
// the app restarts.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_passenger/features/ride/widgets/home_banners.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import 'support/harness.dart';

Promo _banner(String id, {DateTime? endsAt}) => Promo(
      id: id,
      title: 'Banner $id',
      imageUrl: 'https://api.example/v1/promos/$id/image',
      linkUrl: 'https://tamiltaxi.example/$id',
      startsAt: DateTime(2026),
      endsAt: endsAt,
    );

Future<ProviderContainer> _pump(WidgetTester tester, List<Promo> banners) async {
  await loadTestFonts();
  usePhone(tester);
  final container = ProviderContainer(overrides: [promosProvider.overrideWith((ref) async => Promos(banners: banners))]);
  addTearDown(container.dispose);
  await tester.pumpWidget(UncontrolledProviderScope(
    container: container,
    child: MaterialApp(
      theme: TtTheme.light(),
      home: const Scaffold(body: Padding(padding: EdgeInsets.all(16), child: HomeBanners())),
    ),
  ));
  await tester.pump();
  await tester.pump();
  return container;
}

/// The page dots: one per banner, or none for a single one.
Finder get _dots => find.descendant(of: find.byType(Row), matching: find.byType(AnimatedContainer));

void main() {
  testWidgets('shows the live banners with a dot each; × hides one until the app restarts', (tester) async {
    final container = await _pump(tester, [_banner('a'), _banner('b'), _banner('old', endsAt: DateTime(2026, 1, 2))]);
    expect(find.bySemanticsLabel('Banner a'), findsOneWidget);
    expect(_dots, findsNWidgets(2), reason: 'the ended banner is left out');

    await tester.tap(find.byTooltip('Close banner').first);
    await tester.pump();
    expect(find.bySemanticsLabel('Banner a'), findsNothing);
    expect(find.bySemanticsLabel('Banner b'), findsOneWidget);
    expect(_dots, findsNothing, reason: 'one banner left: no dots');

    // A restart (the providers start again) brings it back.
    container.invalidate(closedBannersProvider);
    await tester.pump();
    expect(find.bySemanticsLabel('Banner a'), findsOneWidget);
    expect(_dots, findsNWidgets(2));
  });

  testWidgets('no banners: nothing on Home at all', (tester) async {
    await _pump(tester, const []);
    expect(find.byType(PageView), findsNothing);
  });
}
