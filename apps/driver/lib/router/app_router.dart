import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';

import '../common/driver_shell.dart';
import '../features/account/booking_preferences_screen.dart';
import '../features/account/d26_account_screen.dart';
import '../features/account/driver_emergency_contact_screen.dart';
import '../features/account/driver_help_screen.dart';
import '../features/account/driver_new_ticket_screen.dart';
import '../features/account/rate_card_screen.dart';
import '../features/account/services_screen.dart';
import '../features/account/upi_id_screen.dart';
import '../features/account/vehicle_details_screen.dart';
import '../features/design_gallery/design_gallery_screen.dart';
import '../features/design_gallery/gallery_registry.dart';
import '../features/earnings/d23_earnings_screen.dart';
import '../features/home/d13_home_screen.dart';
import '../features/jobs/d15_ride_request_screen.dart';
import '../features/jobs/d16_navigate_pickup_screen.dart';
import '../features/jobs/d17_ride_otp_screen.dart';
import '../features/jobs/d18_ride_in_progress_screen.dart';
import '../features/jobs/d18b_driver_sos_screen.dart';
import '../features/jobs/d19_collect_payment_screen.dart';
import '../features/jobs/d20_delivery_request_screen.dart';
import '../features/jobs/d21_delivery_in_progress_screen.dart';
import '../features/jobs/d22_delivery_otp_screen.dart';
import '../features/jobs/driver_chat_screen.dart';
import '../features/onboarding/d01_splash_screen.dart';
import '../features/onboarding/d02_welcome_screen.dart';
import '../features/onboarding/d03_phone_screen.dart';
import '../features/onboarding/d03b_otp_screen.dart';
import '../features/onboarding/d04_work_type_screen.dart';
import '../features/onboarding/d05_choose_vehicle_screen.dart';
import '../features/onboarding/d06_personal_details_screen.dart';
import '../features/onboarding/d07_documents_screen.dart';
import '../features/onboarding/d08_upload_document_screen.dart';
import '../features/onboarding/profile_photo_screen.dart';
import '../features/onboarding/d09_selfie_screen.dart';
import '../features/onboarding/d11_choose_plan_screen.dart';
import '../features/onboarding/d12_autopay_screen.dart';
import '../features/onboarding/d12b_autopay_success_screen.dart';
import '../features/onboarding/legal_screen.dart';
import '../features/plan/d24_plan_screen.dart';
import '../features/states/s10_account_on_hold_screen.dart';
import '../features/states/s13_selfie_check_screen.dart';
import 'routes.dart';

final rootNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'root');

/// Full-screen route above the tab shell (no bottom nav).
GoRoute _full(
  String path,
  Widget Function(GoRouterState s) builder, {
  bool fullscreenDialog = false,
}) => GoRoute(
  path: path,
  parentNavigatorKey: rootNavigatorKey,
  pageBuilder: (context, s) => MaterialPage(
    key: s.pageKey,
    fullscreenDialog: fullscreenDialog,
    child: builder(s),
  ),
);

bool _signup(GoRouterState s) => s.uri.queryParameters['mode'] != 'login';
String _purpose(GoRouterState s) => s.uri.queryParameters['purpose'] ?? 'setup';

/// Every driver route is defined here and nowhere else.
GoRouter createDriverRouter({
  String initialLocation = Routes.splash,
}) => GoRouter(
  navigatorKey: rootNavigatorKey,
  initialLocation: initialLocation,
  routes: [
    _full(Routes.splash, (_) => const D01SplashScreen()),
    _full(Routes.welcome, (_) => const D02WelcomeScreen()),
    _full('/auth/phone', (s) => D03PhoneScreen(signup: _signup(s))),
    _full(
      '/auth/otp',
      (s) => D03bOtpScreen(
        phone: s.uri.queryParameters['phone'] ?? '98430 12345',
        signup: _signup(s),
      ),
    ),
    _full(Routes.workType, (_) => const D04WorkTypeScreen()),
    _full(Routes.chooseVehicle, (_) => const D05ChooseVehicleScreen()),
    _full(Routes.personalDetails, (_) => const D06PersonalDetailsScreen()),
    _full(Routes.documents, (_) => const D07DocumentsScreen()),
    _full(
      '/signup/documents/upload/:type',
      (s) => D08UploadDocumentScreen(
        type: KycDocType.values.firstWhere(
          (t) => t.name == s.pathParameters['type'],
          orElse: () => KycDocType.insurance,
        ),
      ),
    ),
    _full(Routes.profilePhoto, (_) => const ProfilePhotoScreen()),
    _full(Routes.choosePlan, (_) => const D11ChoosePlanScreen()),
    _full('/autopay', (s) => D12AutopayScreen(purpose: _purpose(s))),
    _full(
      '/autopay/success',
      (s) => D12bAutopaySuccessScreen(purpose: _purpose(s)),
    ),
    _full(Routes.accountOnHold, (_) => const S10AccountOnHoldScreen()),
    _full(
      Routes.accountPausedPath,
      (s) => S10AccountOnHoldScreen(
        pausedUntil: DateTime.tryParse(
          s.uri.queryParameters['until'] ?? '',
        )?.toLocal(),
      ),
    ),
    _full(Routes.selfieCheck, (_) => const S13SelfieCheckScreen()),
    _full(Routes.dailySelfie, (_) => const D09SelfieScreen(dailyCheck: true)),
    _full(
      '/legal/:doc',
      (s) => LegalScreen(doc: s.pathParameters['doc'] ?? 'terms'),
    ),
    // Jobs
    _full(Routes.request, (_) => const D15RideRequestScreen()),
    _full('/driver/delivery-request', (_) => const D20DeliveryRequestScreen()),
    _full(Routes.pickup, (_) => const D16NavigateToPickupScreen()),
    _full(Routes.rideOtp, (_) => const D17RideOtpScreen()),
    _full(Routes.trip, (_) => const D18RideInProgressScreen()),
    _full(
      Routes.sos,
      (_) => const D18bDriverSosScreen(),
      fullscreenDialog: true,
    ),
    _full(
      Routes.collect,
      (s) => D19CollectPaymentScreen(
        delivery: s.uri.queryParameters['delivery'] == '1',
      ),
    ),
    _full(Routes.delivery, (_) => const D21DeliveryInProgressScreen()),
    _full(Routes.deliveryOtp, (_) => const D22DeliveryOtpScreen()),
    _full(Routes.chat, (_) => const DriverChatScreen()),
    _full(Routes.help, (_) => const DriverHelpScreen()),
    _full(
      '/help/new-ticket',
      (s) => DriverNewTicketScreen(
        topic: s.uri.queryParameters['topic'],
        tripId: s.uri.queryParameters['tripId'],
      ),
    ),
    _full(Routes.gallery, (_) => const DesignGalleryScreen()),
    _full(
      '/gallery/view/:frameId',
      (s) => GalleryFrameView(frameId: s.pathParameters['frameId']!),
    ),
    StatefulShellRoute.indexedStack(
      builder: (context, state, shell) => DriverShell(navigationShell: shell),
      branches: [
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: Routes.home,
              builder: (_, _) => const D13HomeScreen(),
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: Routes.earnings,
              builder: (_, _) => const D23EarningsScreen(),
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: Routes.plan,
              builder: (_, _) => const D24PlanScreen(),
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: Routes.account,
              builder: (_, _) => const D26AccountScreen(),
              routes: [
                GoRoute(
                  path: 'documents',
                  builder: (_, _) => const D07DocumentsScreen(readOnly: true),
                ),
                GoRoute(
                  path: 'vehicle',
                  builder: (_, _) => const VehicleDetailsScreen(),
                ),
                GoRoute(path: 'upi', builder: (_, _) => const UpiIdScreen()),
                GoRoute(
                  path: 'booking-preferences',
                  builder: (_, _) => const BookingPreferencesScreen(),
                ),
                GoRoute(path: 'services', builder: (_, _) => const ServicesScreen()),
                GoRoute(path: 'rate-card', builder: (_, _) => const RateCardScreen()),
                GoRoute(
                  path: 'emergency-contact',
                  builder: (_, _) => const DriverEmergencyContactScreen(),
                ),
              ],
            ),
          ],
        ),
      ],
    ),
  ],
);
