import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart' show LatLng, Trip;

import '../common/passenger_shell.dart';
import '../features/account/about_screen.dart';
import '../features/account/verify_identity_screen.dart';
import '../features/account/p23_account_screen.dart';
import '../features/account/p23b_saved_place_editor_screen.dart';
import '../features/account/p24_emergency_contacts_screen.dart';
import '../features/account/p25_help_screen.dart';
import '../features/account/p25b_new_ticket_screen.dart';
import '../features/account/safety_preferences_screen.dart';
import '../features/account/saved_places_screen.dart';
import '../features/activity/p21_activity_screen.dart';
import '../features/activity/p22_trip_details_screen.dart';
import '../features/design_gallery/design_gallery_screen.dart';
import '../features/design_gallery/gallery_registry.dart';
import '../features/onboarding/legal_screen.dart';
import '../features/onboarding/p01_splash_screen.dart';
import '../features/onboarding/p02_welcome_screen.dart';
import '../features/onboarding/p03_phone_screen.dart';
import '../features/onboarding/p04_otp_screen.dart';
import '../features/onboarding/p05_profile_setup_screen.dart';
import '../features/onboarding/p06_location_permission_screen.dart';
import '../features/parcel/pp01_parcel_home_screen.dart';
import '../features/parcel/pp02_pickup_details_screen.dart';
import '../features/parcel/pp03_drop_details_screen.dart';
import '../features/parcel/pp04_parcel_details_screen.dart';
import '../features/parcel/pp06_choose_goods_vehicle_screen.dart';
import '../features/parcel/pp07_finding_goods_driver_screen.dart';
import '../features/parcel/pp08_parcel_driver_assigned_screen.dart';
import '../features/parcel/pp09_parcel_in_transit_screen.dart';
import '../features/parcel/pp10_parcel_delivered_screen.dart';
import '../features/shifting/ph01_moving_details_screen.dart';
import '../features/shifting/ph02_items_screen.dart';
import '../features/shifting/ph03_schedule_screen.dart';
import '../features/shifting/ph04_review_screen.dart';
import '../features/ride/p07_home_screen.dart';
import '../features/ride/p08_search_screen.dart';
import '../features/ride/p09_pin_on_map_screen.dart';
import '../features/ride/p10_choose_vehicle_screen.dart';
import '../features/ride/p12_finding_driver_screen.dart';
import '../features/ride/p13_driver_assigned_screen.dart';
import '../features/ride/p14_chat_screen.dart';
import '../features/ride/p15_driver_arrived_screen.dart';
import '../features/ride/p16_ride_in_progress_screen.dart';
import '../features/ride/p17_sos_screen.dart';
import '../features/ride/p19_ride_completed_screen.dart';
import '../features/ride/p20_rate_driver_screen.dart';
import '../features/states/s01_no_drivers_screen.dart';
import '../features/states/s02_driver_cancelled_screen.dart';
import '../features/states/s05_location_denied_screen.dart';
import '../features/ride/p34_rental_screen.dart';
import '../features/ride/p35_outstation_screen.dart';
import '../features/ride/p35b_outstation_search_screen.dart';
import '../features/ride/p36_booked_later_screen.dart';
import '../features/states/s08_service_unavailable_screen.dart';
import 'routes.dart';

final rootNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'root');

/// Full-screen route above the tab shell (no bottom nav).
GoRoute _full(String path, Widget Function(GoRouterState s) builder, {bool fullscreenDialog = false}) => GoRoute(
  path: path,
  parentNavigatorKey: rootNavigatorKey,
  pageBuilder: (context, s) => MaterialPage(key: s.pageKey, fullscreenDialog: fullscreenDialog, child: builder(s)),
);

/// Child path of a tab shown full-screen: `_sub('search', …)` under `/ride` → `/ride/search`.
GoRoute _sub(String path, Widget Function(GoRouterState s) builder) => _full(path, builder);

/// Every passenger route is defined here and nowhere else.
GoRouter createPassengerRouter({String initialLocation = Routes.splash}) => GoRouter(
  navigatorKey: rootNavigatorKey,
  initialLocation: initialLocation,
  routes: [
    _full(Routes.splash, (_) => const P01SplashScreen()),
    _full(Routes.onboarding, (_) => const P02WelcomeScreen()),
    _full(Routes.login, (_) => const P03PhoneScreen()),
    _full(Routes.otp, (s) => P04OtpScreen(phone: s.uri.queryParameters['phone'] ?? '98765 43210')),
    _full(Routes.profileSetup, (_) => const P05ProfileSetupScreen()),
    _full(Routes.locationPermission, (_) => const P06LocationPermissionScreen()),
    _full(Routes.locationDenied, (_) => const S05LocationDeniedScreen()),
    _full(Routes.serviceUnavailable, (s) => S08ServiceUnavailableScreen(pin: s.extra is LatLng ? s.extra as LatLng : null)),
    _full('/legal/:doc', (s) => LegalScreen(doc: s.pathParameters['doc'] ?? 'terms')),
    _full(Routes.sos, (_) => const P17SosScreen(), fullscreenDialog: true),
    _full('/help', (s) => P25HelpScreen(tripId: s.uri.queryParameters['trip'])),
    _full(
      '/help/new-ticket',
      (s) => P25bNewTicketScreen(topic: s.uri.queryParameters['topic'], tripId: s.uri.queryParameters['trip']),
    ),
    _full(Routes.gallery, (_) => const DesignGalleryScreen()),
    _full('/gallery/view/:frameId', (s) => GalleryFrameView(frameId: s.pathParameters['frameId']!)),
    StatefulShellRoute.indexedStack(
      builder: (context, state, shell) => PassengerShell(navigationShell: shell),
      branches: [
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: Routes.ride,
              builder: (_, _) => const P07HomeScreen(),
              routes: [
                _sub('search', (_) => const P08SearchScreen()),
                _sub(
                  'pin',
                  (s) => P09PinOnMapScreen(
                    forPickup: s.uri.queryParameters['for'] == 'pickup',
                    pickOnly: s.uri.queryParameters['for'] == 'pick',
                  ),
                ),
                _sub('choose-vehicle', (_) => const P10ChooseVehicleScreen()),
                _sub('rental', (_) => const P34RentalScreen()),
                _sub('outstation', (_) => const P35OutstationScreen()),
                _sub('outstation-where', (_) => const P35bOutstationSearchScreen()),
                _sub('booked', (s) => P36BookedLaterScreen(trip: s.extra is Trip ? s.extra as Trip : null)),
                _sub('finding', (_) => const P12FindingDriverScreen()),
                _sub('driver', (_) => const P13DriverAssignedScreen()),
                _sub('chat', (_) => const P14ChatScreen()),
                _sub('arrived', (_) => const P15DriverArrivedScreen()),
                _sub('trip', (_) => const P16RideInProgressScreen()),
                _sub('completed', (_) => const P19RideCompletedScreen()),
                _sub('rate', (_) => const P20RateDriverScreen()),
                _sub('no-drivers', (_) => const S01NoDriversScreen()),
                _sub('driver-cancelled', (_) => const S02DriverCancelledScreen()),
                _sub('saved-place', (s) => P23bSavedPlaceEditorScreen(placeId: s.uri.queryParameters['id'])),
              ],
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: Routes.parcel,
              builder: (_, _) => const PP01ParcelHomeScreen(),
              routes: [
                _sub('pickup', (_) => const PP02PickupDetailsScreen()),
                _sub('drop', (s) => PP03DropDetailsScreen(onMap: s.uri.queryParameters['map'] == '1')),
                _sub('details', (_) => const PP04ParcelDetailsScreen()),
                _sub('review', (_) => const PP06ChooseGoodsVehicleScreen()),
                _sub('finding', (_) => const PP07FindingGoodsDriverScreen()),
                _sub('assigned', (_) => const PP08ParcelDriverAssignedScreen()),
                _sub('chat', (_) => const P14ChatScreen(forParcel: true)),
                _sub('in-transit', (_) => const PP09ParcelInTransitScreen()),
                _sub('delivered', (_) => const PP10ParcelDeliveredScreen()),
                _sub('booked', (s) => P36BookedLaterScreen(trip: s.extra is Trip ? s.extra as Trip : null)),
                GoRoute(
                  path: 'shifting',
                  parentNavigatorKey: rootNavigatorKey,
                  pageBuilder: (context, s) => MaterialPage(key: s.pageKey, child: const PH01MovingDetailsScreen()),
                  routes: [
                    GoRoute(
                      path: 'items',
                      parentNavigatorKey: rootNavigatorKey,
                      pageBuilder: (context, s) => MaterialPage(key: s.pageKey, child: const PH02ItemsScreen()),
                      routes: [
                        GoRoute(
                          path: 'day',
                          parentNavigatorKey: rootNavigatorKey,
                          pageBuilder: (context, s) => MaterialPage(key: s.pageKey, child: const PH03ScheduleScreen()),
                          routes: [_sub('review', (_) => const PH04ReviewScreen())],
                        ),
                      ],
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: Routes.activity,
              builder: (_, _) => const P21ActivityScreen(),
              routes: [
                GoRoute(
                  path: 'trip/:id',
                  builder: (_, s) => P22TripDetailsScreen(tripId: s.pathParameters['id']!),
                ),
              ],
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: Routes.account,
              builder: (_, _) => const P23AccountScreen(),
              routes: [
                GoRoute(path: 'edit-profile', builder: (_, _) => const P05ProfileSetupScreen(editing: true)),
                GoRoute(path: 'saved-places', builder: (_, _) => const SavedPlacesScreen()),
                GoRoute(path: 'safety', builder: (_, _) => const SafetyPreferencesScreen()),
                GoRoute(path: 'about', builder: (_, _) => const AboutScreen()),
                GoRoute(path: 'verify-identity', builder: (_, _) => const VerifyIdentityScreen()),
                GoRoute(path: 'emergency-contacts', builder: (_, _) => const P24EmergencyContactsScreen()),
              ],
            ),
          ],
        ),
      ],
    ),
  ],
);
