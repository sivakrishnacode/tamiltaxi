// Driver sign-up (mock): after the OTP the D-07 registration page is the only page until approval. Step 1 runs
// D-04 → D-05 → D-06 and comes back; the documents open; once everything is in it is "Under review"; the approval
// opens Home. The sign-up step bar starts at the left edge.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_driver/features/home/d13_home_screen.dart';
import 'package:tamiltaxi_driver/features/onboarding/d04_work_type_screen.dart';
import 'package:tamiltaxi_driver/features/onboarding/d07_documents_screen.dart';
import 'package:tamiltaxi_driver/features/onboarding/widgets/signup_widgets.dart';
import 'package:tamiltaxi_driver/router/routes.dart';
import 'package:tamiltaxi_driver/state/driver_account.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import 'support/harness.dart';

Future<void> advance(WidgetTester tester, Duration total) async {
  for (var t = Duration.zero; t < total; t += const Duration(milliseconds: 100)) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Future<void> tapText(WidgetTester tester, String text) async {
  final f = find.text(text).hitTestable().first;
  await tester.ensureVisible(f);
  await tester.tap(f);
  await advance(tester, const Duration(milliseconds: 800));
}

void main() {
  testWidgets('registration page: details first, then documents, review, then Home', (tester) async {
    final container = await pumpRoute(tester, Routes.documents);
    container.read(demoSettingsProvider.notifier).update((s) => s.copyWith(fastMode: true));
    await advance(tester, const Duration(milliseconds: 500));

    expect(find.byType(D07DocumentsScreen), findsOneWidget);
    expect(find.text('Registration'), findsOneWidget);
    expect(find.text('0 of 5 done'), findsOneWidget);
    expect(find.text('Your vehicle'), findsOneWidget);
    // The documents wait for the details (they belong to the new driver).
    expect(find.text('Opens after your vehicle and details'), findsNWidgets(3));
    expect(find.text('Upload'), findsNothing);

    // Step 1: work type → vehicle → details → back here.
    await tapText(tester, 'Start');
    expect(find.byType(D04WorkTypeScreen), findsOneWidget);
    expect(find.text('Step 1 of 3'), findsOneWidget);
    await tapText(tester, 'Continue');
    expect(find.text('Step 2 of 3'), findsOneWidget);
    await tapText(tester, 'Continue');
    expect(find.text('Step 3 of 3'), findsOneWidget);
    await tapText(tester, 'Save and continue');
    await advance(tester, const Duration(seconds: 1));
    expect(find.byType(D07DocumentsScreen), findsOneWidget);
    expect(container.read(signupProvider).detailsSaved, isTrue);
    // The demo's RC is already uploaded (under review); the licence, Aadhaar and insurance are not.
    expect(find.text('2 of 5 done'), findsOneWidget);
    expect(find.text('Upload'), findsNWidgets(3));
    expect(find.text('Upload your driving licence'), findsOneWidget);

    // The licence and Aadhaar of the identity check by hand, then the documents (the mock camera's "Use photo") →
    // under review → approved → Home.
    await container.read(kycProvider.notifier).upload(KycDocType.drivingLicence);
    await container.read(kycProvider.notifier).upload(KycDocType.aadhaar);
    await advance(tester, const Duration(milliseconds: 300));
    expect(find.text('Upload your Vehicle insurance'), findsOneWidget);
    await container.read(kycProvider.notifier).upload(KycDocType.vehicleRc);
    await container.read(kycProvider.notifier).upload(KycDocType.insurance);
    await advance(tester, const Duration(milliseconds: 300));
    expect(find.text('All done, under review'), findsOneWidget);
    expect(find.text('Check status'), findsOneWidget);
    await advance(tester, const Duration(seconds: 6));
    expect(find.byType(D13HomeScreen), findsOneWidget);
  });

  testWidgets('live: a new phone (no driver yet) opens the registration page with the identity step locked',
      (tester) async {
    // A new phone's OTP gives a token but no driver, so there is no identity check to read yet.
    SharedPreferences.setMockInitialValues({'tamiltaxi.accessToken': 'token'});
    final api = ApiClient(baseUrl: 'http://localhost:1/v1', session: ApiSession(await SharedPreferences.getInstance()));
    await loadTestFonts();
    usePhone(tester);
    await tester.pumpWidget(ProviderScope(
      overrides: [
        isLiveApiProvider.overrideWithValue(true),
        apiClientProvider.overrideWithValue(api),
        driverRepositoryProvider.overrideWithValue(ApiDriverRepository(api)),
      ],
      child: MaterialApp(theme: TtTheme.light(), home: const D07DocumentsScreen()),
    ));
    await tester.pump();

    expect(tester.takeException(), isNull);
    expect(find.text('Registration'), findsOneWidget);
    expect(find.text('Add your vehicle and details'), findsOneWidget);
    expect(find.text('Driving licence and Aadhaar'), findsOneWidget);
    expect(find.text('0 of 6 done'), findsOneWidget);
  });

  testWidgets('a rejected document shows on the registration page with Re-upload', (tester) async {
    final container = await pumpRoute(tester, Routes.documents);
    container.read(demoSettingsProvider.notifier).update((s) => s.copyWith(fastMode: true, rejectKyc: true));
    container.read(signupProvider.notifier).update((d) => d.copyWith(detailsSaved: true));
    await container.read(kycProvider.notifier).upload(KycDocType.drivingLicence);
    await container.read(kycProvider.notifier).upload(KycDocType.aadhaar);
    await container.read(kycProvider.notifier).upload(KycDocType.vehicleRc);
    await container.read(kycProvider.notifier).upload(KycDocType.insurance);
    await advance(tester, const Duration(seconds: 6));

    expect(find.byType(D07DocumentsScreen), findsOneWidget);
    expect(find.text('1 error'), findsOneWidget);
    expect(find.text('Re-upload'), findsOneWidget);
    expect(find.text('Re-upload your Vehicle RC'), findsOneWidget);
  });

  testWidgets('the sign-up step bar starts at the left edge and spans the screen', (tester) async {
    await pumpRoute(tester, Routes.workType);
    final bar = find.descendant(of: find.byType(SignupAppBar), matching: find.byType(FractionallySizedBox));
    expect(bar, findsOneWidget);
    final coral = find.descendant(of: bar, matching: find.byType(ColoredBox));
    final rect = tester.getRect(coral.first);
    expect(rect.left, 0);
    expect(rect.width, closeTo(390 / 3, 1));
  });
}
