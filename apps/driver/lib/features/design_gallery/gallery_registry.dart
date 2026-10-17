import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../state/driver_session.dart' show JobPhase;
import '../../router/routes.dart';
import '../account/d26_account_screen.dart';
import '../account/rate_card_screen.dart';
import '../account/services_screen.dart';
import '../earnings/d23_earnings_screen.dart';
import '../earnings/d23b_trip_detail_sheet.dart';
import '../home/d13_home_screen.dart';
import '../jobs/d15_ride_request_screen.dart';
import '../jobs/d16_navigate_pickup_screen.dart';
import '../jobs/d17_ride_otp_screen.dart';
import '../jobs/d18_ride_in_progress_screen.dart';
import '../jobs/d18b_driver_sos_screen.dart';
import '../jobs/d19_collect_payment_screen.dart';
import '../jobs/d20_delivery_request_screen.dart';
import '../jobs/d21_delivery_in_progress_screen.dart';
import '../jobs/d22_delivery_otp_screen.dart';
import '../onboarding/d01_splash_screen.dart';
import '../onboarding/d02_welcome_screen.dart';
import '../onboarding/d03_phone_screen.dart';
import '../onboarding/d03b_otp_screen.dart';
import '../onboarding/d03c_permissions_screen.dart';
import '../onboarding/d04_work_type_screen.dart';
import '../onboarding/d05_choose_vehicle_screen.dart';
import '../onboarding/d06_personal_details_screen.dart';
import '../onboarding/d07_documents_screen.dart';
import '../onboarding/d08_upload_document_screen.dart';
import '../onboarding/d09_selfie_screen.dart';
import '../onboarding/d11_choose_plan_screen.dart';
import '../onboarding/d12_autopay_screen.dart';
import '../onboarding/d12b_autopay_success_screen.dart';
import '../plan/d24_plan_screen.dart';
import '../states/s10_account_on_hold_screen.dart';
import '../states/s13_selfie_check_screen.dart';
import '../states/s14_payment_failed_dialog.dart';
import '../states/s15_empty_earnings_view.dart';

/// Whether a frame can be reached in the normal app flow.
enum GalleryTag {
  inFlow('In flow'),
  showcaseOnly('Showcase only');

  const GalleryTag(this.label);
  final String label;
}

/// One designed frame from docs/design/index.md and how to render it on its own.
class GalleryEntry {
  const GalleryEntry({
    required this.id,
    required this.name,
    required this.part,
    this.tag = GalleryTag.inFlow,
    required this.builder,
  });

  final String id;
  final String name;
  final String part;
  final GalleryTag tag;
  final WidgetBuilder builder;
}

const _ds = 'Design system';
const _p5 = 'Part 5 · Sign-up, KYC and plan';
const _p6 = 'Part 6 · Home, rides, deliveries, earnings';
const _p7 = 'Part 7 · Driver states';

GalleryEntry _e(String id, String name, String part, WidgetBuilder builder, {GalleryTag tag = GalleryTag.inFlow}) =>
    GalleryEntry(id: id, name: name, part: part, tag: tag, builder: builder);

/// Every driver frame in docs/design/index.md, including variants, grouped by part.
final List<GalleryEntry> galleryEntries = [
  _e('DS', 'Design system', _ds, (_) => const DesignSystemScreen(), tag: GalleryTag.showcaseOnly),
  // Part 5
  _e('D-01', 'Splash', _p5, (_) => const D01SplashScreen(showcase: true)),
  _e('D-02', 'Welcome', _p5, (_) => const D02WelcomeScreen(showcase: true)),
  _e('D-03a', 'Phone number', _p5, (_) => const D03PhoneScreen(showcase: true)),
  _e('D-03b', 'OTP verification', _p5, (_) => const D03bOtpScreen(showcase: true)),
  _e('D-03c', 'Permissions', _p5, (_) => const D03cPermissionsScreen(showcase: true)),
  _e('D-04', 'Choose work type', _p5, (_) => const D04WorkTypeScreen(showcase: true)),
  _e('D-05', 'Choose vehicle', _p5, (_) => const D05ChooseVehicleScreen(showcase: true)),
  _e('D-06', 'Personal details', _p5, (_) => const D06PersonalDetailsScreen(showcase: true)),
  _e('D-07', 'Registration · vehicle card + checklist', _p5, (_) => const D07DocumentsScreen(showcase: true)),
  _e('D-08a', 'Upload document · before capture', _p5,
      (_) => const D08UploadDocumentScreen(type: KycDocType.drivingLicence, captured: false, showcase: true)),
  _e('D-08b', 'Upload document · captured', _p5,
      (_) => const D08UploadDocumentScreen(type: KycDocType.drivingLicence, captured: true, showcase: true)),
  _e('D-09', 'Selfie verification', _p5, (_) => const D09SelfieScreen(showcase: true)),
  _e('D-11', 'Choose plan · start free trial', _p5, (_) => const D11ChoosePlanScreen(showcase: true)),
  _e('D-12a', 'UPI Autopay setup', _p5, (_) => const D12AutopayScreen(showcase: true)),
  _e('D-12b', 'Autopay success', _p5, (_) => const D12bAutopaySuccessScreen(showcase: true)),
  // Part 6
  _e('D-13', 'Home · offline', _p6, (_) => const D13HomeScreen(variant: HomeVariant.offline, showcase: true)),
  _e('D-14', 'Home · online, waiting', _p6, (_) => const D13HomeScreen(variant: HomeVariant.online, showcase: true)),
  _e('D-14b', 'Home · trip in progress banner', _p6,
      (_) => const D13HomeScreen(variant: HomeVariant.tripBanner, showcase: true)),
  _e('D-15', 'Incoming ride request', _p6, (_) => const D15RideRequestScreen(showcase: true)),
  _e('D-15c', 'Incoming request · rental', _p6,
      (_) => const D15RideRequestScreen(showcase: true, sample: Seed.rentalRequest)),
  _e('D-15d', 'Incoming request · outstation, booked ahead', _p6,
      (_) => D15RideRequestScreen(showcase: true, sample: Seed.outstationRequest)),
  _e('D-16', 'Navigate to pickup', _p6, (_) => const D16NavigateToPickupScreen(showcase: true)),
  _e('D-17', 'Enter ride OTP', _p6, (_) => const D17RideOtpScreen(showcase: true)),
  _e('D-17-error', 'Enter ride OTP · error state', _p6, (_) => const D17RideOtpScreen(showError: true, showcase: true)),
  _e('D-18', 'Ride in progress', _p6, (_) => const D18RideInProgressScreen(showcase: true)),
  _e('D-18c', 'Rental in progress', _p6,
      (_) => const D18RideInProgressScreen(showcase: true, sample: Seed.rentalRequest)),
  _e('D-18b', 'Driver SOS', _p6, (_) => const D18bDriverSosScreen(showcase: true)),
  _e('D-19', 'Collect payment', _p6, (_) => const D19CollectPaymentScreen(showcase: true)),
  _e('D-19c', 'Collect payment · rental with extra km and time', _p6,
      (_) => D19CollectPaymentScreen(showcase: true, sample: _settledRental())),
  _e('D-20', 'Incoming delivery request', _p6, (_) => const D20DeliveryRequestScreen(showcase: true)),
  _e('D-20c', 'Incoming request · Packers & Movers', _p6,
      (_) => D20DeliveryRequestScreen(showcase: true, sample: Seed.shiftingRequest)),
  _e('D-21', 'Delivery in progress', _p6, (_) => const D21DeliveryInProgressScreen(showcase: true)),
  _e('D-21c', 'Packers & Movers · at the pickup', _p6,
      (_) => D21DeliveryInProgressScreen(showcase: true, sample: Seed.shiftingRequest, samplePhase: JobPhase.atPickup)),
  _e('D-22a', 'Complete delivery with OTP', _p6, (_) => const D22DeliveryOtpScreen(showcase: true)),
  _e('D-22b', 'Collect from receiver', _p6, (_) => const D19CollectPaymentScreen(delivery: true, showcase: true)),
  _e('D-22c', 'Collect · Packers & Movers', _p6,
      (_) => D19CollectPaymentScreen(delivery: true, showcase: true, sample: Seed.shiftingRequest)),
  _e('D-23', 'Earnings', _p6, (_) => const D23EarningsScreen(showcase: true)),
  _e('D-23b', 'Earnings · trip detail sheet', _p6,
      (_) => const ShowcaseFrame.sheet(title: 'D-23b Trip detail', child: D23bTripDetailSheet(showcase: true))),
  _e('D-24', 'Plan · active', _p6, (_) => const D24PlanScreen(previewStatus: PlanStatus.active, showcase: true)),
  _e('D-24b', 'Plan · paused', _p6, (_) => const D24PlanScreen(previewStatus: PlanStatus.paused, showcase: true)),
  _e('D-24c', 'Plan · cancelled', _p6, (_) => const D24PlanScreen(previewStatus: PlanStatus.cancelled, showcase: true)),
  _e('D-25a', 'Home · grace period', _p6, (_) => const D13HomeScreen(variant: HomeVariant.grace, showcase: true)),
  _e('D-25b', 'Home · plan expired', _p6, (_) => const D13HomeScreen(variant: HomeVariant.expired, showcase: true)),
  _e('D-26', 'Driver account', _p6, (_) => const D26AccountScreen(showcase: true)),
  _e('D-40', 'Services', _p6, (_) => const ServicesScreen(showcase: true)),
  _e('D-40b', 'Services · pause sheet', _p6,
      (_) => const ShowcaseFrame.sheet(
            title: 'D-40b Pause a service',
            child: PauseServiceSheet(title: 'Parcels', reasons: ['Too far', 'Long waits', 'Low pay', 'Other']),
          )),
  _e('D-41', 'Rate card', _p6, (_) => const RateCardScreen(showcase: true)),
  // Part 7
  _e('S-10', 'Account on hold', _p7, (_) => const S10AccountOnHoldScreen(showcase: true)),
  _e('S-10b', 'Paused for cancellations', _p7,
      (_) => S10AccountOnHoldScreen(showcase: true, pausedUntil: DateTime.now().add(const Duration(hours: 24)))),
  _e('S-11', 'Missed ride request', _p7, (_) => const D13HomeScreen(variant: HomeVariant.missedRequest, showcase: true)),
  _e('S-12', 'No ride requests yet', _p7, (_) => const D13HomeScreen(variant: HomeVariant.quiet, showcase: true)),
  _e('S-13', 'Selfie check before going online', _p7, (_) => const S13SelfieCheckScreen(showcase: true)),
  _e('S-14', 'Autopay payment failed', _p7,
      (_) => const ShowcaseFrame.dialog(title: 'S-14 Payment failed', child: S14PaymentFailedDialog(showcase: true))),
  _e('S-15', 'Empty earnings', _p7, (_) => const _EmptyEarningsFrame()),
  _e('S-16', 'GPS weak / location off', _p7, (_) => const D13HomeScreen(variant: HomeVariant.gpsLost, showcase: true)),
  _e('S-17', 'Cancellation rate warning', _p7,
      (_) => const D13HomeScreen(variant: HomeVariant.cancelWarning, showcase: true)),
];

/// Looks up a frame by its ID ("P-10"); null when unknown.
GalleryEntry? galleryEntryById(String id) {
  for (final e in galleryEntries) {
    if (e.id == id) return e;
  }
  return null;
}

/// The "Design system" gallery entry: the live board under an app bar.
class DesignSystemScreen extends StatelessWidget {
  const DesignSystemScreen({super.key});

  @override
  Widget build(BuildContext context) => const Scaffold(
        backgroundColor: TtColors.background,
        appBar: TtAppBar.driver(title: 'Design system', subtitle: 'Tamil Taxi Driver · live board', showBack: true),
        body: DesignSystemBoard(),
      );
}

/// Opens one designed frame on its own with seed data.
class GalleryFrameView extends StatelessWidget {
  const GalleryFrameView({super.key, required this.frameId});
  final String frameId;

  @override
  Widget build(BuildContext context) {
    final entry = galleryEntryById(frameId);
    if (entry == null) return _FrameNotFound(frameId: frameId);
    return entry.builder(context);
  }
}

class _FrameNotFound extends StatelessWidget {
  const _FrameNotFound({required this.frameId});
  final String frameId;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: const TtAppBar.driver(title: 'Frame not found', showBack: true),
        body: EmptyState(
          illustration: const TtIllustration(IllustrationKind.emptyTrips, width: 200, height: 160),
          title: 'Frame not found',
          message: 'There is no designed frame called "$frameId".',
          actionLabel: 'Back to gallery',
          onAction: () => context.canPop() ? context.pop() : context.go(Routes.gallery),
        ),
      );
}

/// S-15 shown inside the Earnings tab body, as in the flow.
class _EmptyEarningsFrame extends StatelessWidget {
  const _EmptyEarningsFrame();

  @override
  Widget build(BuildContext context) => const Scaffold(
        backgroundColor: TtColors.background,
        appBar: TtAppBar.driver(title: 'Earnings', showBack: true),
        body: S15EmptyEarningsView(showcase: true),
      );
}

/// The 4 h rental after 4 h 12 min and 46 km: 6 km and 12 min past the package (₹84 + ₹30).
RideRequest _settledRental() {
  const r = Seed.rentalRequest;
  final terms = r.modeTerms! as RentalTerms;
  final base = RideModeRates.quote(Seed.vehicle(r.vehicle), terms, distanceKm: 46, durationMin: 252);
  final q = base.copyWith(extraKmCharge: 84, extraTimeCharge: 30, total: base.total + 114);
  return r.copyWith(fare: q.total, quote: q);
}
