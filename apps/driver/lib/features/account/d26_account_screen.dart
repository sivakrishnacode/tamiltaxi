import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../common/flags.dart';
import '../../common/showcase.dart';
import '../../router/routes.dart';
import '../../state/booking_prefs.dart';
import '../../state/driver_account.dart';
import '../../state/live_helpers.dart';
import '../home/widgets/navy_header.dart';
import 'account_providers.dart';
import 'services_screen.dart';

/// D-26 Driver account: profile header, Documents, Vehicle details, Services, Rate card, Booking preferences, UPI ID,
/// Emergency contact, Help & support, Terms, Design gallery (dev builds) and Log out. No Delete account:
/// a driver's records are kept at least 6 months for police enquiries, so drivers ask support to close it.
class D26AccountScreen extends ConsumerStatefulWidget {
  const D26AccountScreen({super.key, this.showcase = false});

  /// Opened on its own from the Design gallery: render seed state, start no timers.
  final bool showcase;

  @override
  ConsumerState<D26AccountScreen> createState() => _D26AccountScreenState();
}

class _D26AccountScreenState extends ConsumerState<D26AccountScreen> {
  /// Logging out: the row shows a spinner and can't be tapped twice.
  bool _leaving = false;

  Future<void> _logout() async {
    if (_leaving) return;
    final ok = await showTtConfirm(
      context,
      title: 'Log out?',
      message: "You'll go offline. Log in again with your phone number and OTP.",
      confirmLabel: 'Log out',
      cancelLabel: 'Stay logged in',
      destructive: true,
      icon: Symbols.logout_rounded,
    );
    if (!ok || !mounted) return;
    setState(() => _leaving = true);
    await signOutDriver(ref);
    if (mounted) context.go(Routes.welcome);
  }

  static const _spinner = SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2, color: TtColors.error));

  @override
  Widget build(BuildContext context) {
    // Design gallery frame: rows show a note instead of logging out or opening real screens.
    VoidCallback? act(VoidCallback? action) => unlessShowcase(context, widget.showcase, action);
    final live = !widget.showcase && ref.watch(isLiveApiProvider);
    final profileAsync = ref.watch(driverProfileProvider);
    // Live: the real profile or nothing (a skeleton, then Retry): never the seed driver.
    final DriverProfile? profile =
        widget.showcase ? Seed.karthik : (live ? profileAsync.value : (profileAsync.value ?? Seed.karthik));
    final profileFailed = profile == null && profileAsync.hasError;
    final contactAsync = ref.watch(driverEmergencyContactProvider);
    final contact = contactAsync.value;
    final loadedPrefs = ref.watch(bookingPrefsProvider).value;
    final prefs = loadedPrefs == null ? null : withoutExpired(loadedPrefs, DateTime.now());
    final prefsSub = prefs == null || !prefs.hasFilters ? 'Every request · voice, Go To, Stay In' : _cap(prefs.summary);
    // Counted as Account › Documents (D-07 read-only) counts them: the uploads plus the identity check, from the
    // same source (mock: every upload verified). It used to count every KYC record and skip the identity step.
    final kyc = ref.watch(isLiveApiProvider) ? ref.watch(kycProvider).value : Seed.kycAllVerified;
    final identity = ref.watch(identityProvider).value;
    final uploads = kyc?.where((d) => driverUploadDocs.contains(d.type)).toList();
    final steps = (uploads?.length ?? 0) + (identity?.isEnabled == true ? 1 : 0);
    final verified = (uploads?.where((d) => d.status == KycStatus.verified).length ?? 0) +
        (identity?.isApproved == true ? 1 : 0);
    final docsSub = uploads == null
        ? 'Driving licence, RC, insurance…'
        : verified == steps
            ? 'All $steps verified'
            : '$verified of $steps verified';

    return Scaffold(
      backgroundColor: TtColors.background,
      body: Column(children: [
        NavyHeader(
          padding: const EdgeInsets.fromLTRB(TtSpacing.gutter, TtSpacing.l, TtSpacing.gutter, TtSpacing.xl),
          child: profile != null
              ? _ProfileHeader(profile: profile)
              : _ProfileHeaderPlaceholder(
                  error: profileFailed ? profileAsync.error : null,
                  onRetry: () => ref.invalidate(driverProfileProvider),
                ),
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(TtSpacing.gutter, TtSpacing.l, TtSpacing.gutter, TtSpacing.xl),
            children: [
              TtListGroup(children: [
                TtListTile(
                  icon: Symbols.folder_shared_rounded,
                  title: 'Documents',
                  subtitle: docsSub,
                  onTap: act(() => context.push(Routes.accountDocuments)),
                ),
                TtListTile(
                  icon: profile?.vehicleKind.icon ?? Symbols.directions_car_rounded,
                  title: 'Vehicle details',
                  subtitle: profile?.vehicleLabel ?? (profileFailed ? 'Not loaded' : 'Loading…'),
                  onTap: act(() => context.push(Routes.vehicleDetails)),
                ),
                TtListTile(
                  icon: Symbols.apps_rounded,
                  title: 'Services',
                  subtitle: profile == null ? 'Loading…' : servicesSummary(profile.vehicleKind, prefs ?? const BookingPrefs(), DateTime.now()),
                  onTap: act(() => context.push(Routes.services)),
                ),
                TtListTile(
                  icon: Symbols.receipt_long_rounded,
                  title: 'Rate card',
                  subtitle: 'What each trip pays',
                  onTap: act(() => context.push(Routes.rateCard)),
                ),
                TtListTile(
                  icon: Symbols.tune_rounded,
                  title: 'Booking preferences',
                  subtitle: prefsSub,
                  onTap: act(() => context.push(Routes.bookingPreferences)),
                ),
                TtListTile(
                  icon: Symbols.account_balance_rounded,
                  title: 'UPI ID',
                  subtitle: profile?.upiId ?? (profileFailed ? 'Not loaded' : 'Loading…'),
                  onTap: act(() => context.push(Routes.upiId)),
                ),
                TtListTile(
                  icon: Symbols.contact_emergency_rounded,
                  title: 'Emergency contact',
                  subtitle: contact == null
                      ? (contactAsync.hasError ? "Couldn't load it. Tap to try again" : 'Loading…')
                      : emergencyContactLabel(contact).isEmpty
                          ? 'Add someone to alert in an emergency'
                          : emergencyContactLabel(contact),
                  onTap: act(() {
                    if (contactAsync.hasError) ref.invalidate(driverEmergencyContactProvider);
                    context.push(Routes.emergencyContact);
                  }),
                ),
                TtListTile(
                  icon: Symbols.support_agent_rounded,
                  title: 'Help & support',
                  subtitle: 'Chat, call, tickets',
                  onTap: act(() => context.push(Routes.help)),
                ),
                TtListTile(
                  icon: Symbols.policy_rounded,
                  title: 'Terms',
                  subtitle: 'Driver terms & privacy',
                  onTap: act(() => context.push(Routes.legal('terms'))),
                ),
                if (kShowDesignGallery)
                  TtListTile(
                    icon: Symbols.palette_rounded,
                    title: 'Design gallery',
                    subtitle: 'Every screen and demo controls',
                    onTap: act(() => context.push(Routes.gallery)),
                  ),
              ]),
              const SizedBox(height: TtSpacing.m),
              TtListGroup(children: [
                TtListTile(
                  icon: Symbols.logout_rounded,
                  title: _leaving ? 'Logging out…' : 'Log out',
                  destructive: true,
                  showChevron: false,
                  trailing: _leaving ? _spinner : null,
                  onTap: act(_leaving ? null : _logout),
                ),
              ]),
            ],
          ),
        ),
      ]),
    );
  }
}

/// Photo, name, rating, vehicle and plate.
class _ProfileHeader extends StatelessWidget {
  const _ProfileHeader({required this.profile});
  final DriverProfile profile;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Row(children: [
      DriverAvatar(driver: profile, size: 76, tone: AvatarTone.dark, ringColor: TtColors.coral500),
      const SizedBox(width: TtSpacing.l),
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Flexible(
              child: Text(profile.name,
                  style: t.display.copyWith(color: Colors.white), maxLines: 1, overflow: TextOverflow.ellipsis),
            ),
            const SizedBox(width: TtSpacing.s),
            const Icon(Symbols.star_rounded, fill: 1, color: TtColors.warning, size: 20),
            Text(profile.rating.toStringAsFixed(1), style: t.bodySemibold.copyWith(color: Colors.white)),
          ]),
          const SizedBox(height: TtSpacing.xs),
          Row(children: [
            Text('${profile.vehicleKind.label} · ', style: t.body.copyWith(color: Colors.white70)),
            Flexible(child: FittedBox(fit: BoxFit.scaleDown, child: NumberPlate(plate: profile.plate, vehicle: profile.vehicleKind))),
          ]),
        ]),
      ),
    ]);
  }
}

/// Live, before the profile has loaded: grey shapes where the photo and name go; if it failed, why and Retry.
class _ProfileHeaderPlaceholder extends StatelessWidget {
  const _ProfileHeaderPlaceholder({required this.error, required this.onRetry});
  final Object? error;
  final VoidCallback onRetry;

  static final _shade = Colors.white.withValues(alpha: 0.12);

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final failed = error;
    return Row(children: [
      Container(
        width: 76,
        height: 76,
        decoration: BoxDecoration(color: _shade, shape: BoxShape.circle),
        child: failed == null ? null : const Icon(Symbols.person_rounded, size: 40, color: Colors.white54),
      ),
      const SizedBox(width: TtSpacing.l),
      Expanded(
        child: failed == null
            ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Container(width: 160, height: 28, decoration: BoxDecoration(color: _shade, borderRadius: TtRadii.pillRadius)),
                const SizedBox(height: TtSpacing.s),
                Container(width: 120, height: 20, decoration: BoxDecoration(color: _shade, borderRadius: TtRadii.pillRadius)),
              ])
            : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text("Profile didn't load",
                    style: t.bodySemibold.copyWith(color: Colors.white, fontSize: 17), maxLines: 1, overflow: TextOverflow.ellipsis),
                Text(failed is OfflineException ? "You're offline" : userMessage(failed),
                    style: t.bodySmall.copyWith(color: Colors.white70), maxLines: 2, overflow: TextOverflow.ellipsis),
              ]),
      ),
      if (failed != null)
        TextButton(
          onPressed: onRetry,
          style: TextButton.styleFrom(foregroundColor: Colors.white, minimumSize: const Size(48, 48)),
          child: const Text('Retry'),
        ),
    ]);
  }
}

String _cap(String s) => s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);
