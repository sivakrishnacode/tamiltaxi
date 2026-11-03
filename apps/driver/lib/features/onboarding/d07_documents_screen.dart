import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../router/routes.dart';
import '../../state/driver_account.dart';
import '../../state/live_helpers.dart';
import 'widgets/identity_check_card.dart';
import 'widgets/profile_photo_card.dart';
import 'widgets/signup_widgets.dart';

/// D-07 Registration: the one page a driver sees from the OTP until an admin approves them (like Rapido's "My
/// vehicles" card). A vehicle card with the overall status and the next thing to do, then the checklist:
/// 1. vehicle and personal details (D-04 → D-05 → D-06, which creates the driver),
/// 2. the in-app identity check (driving licence + Aadhaar + selfie, by Didit) and the profile photo,
/// 3. one row per document to upload (RC, insurance) with its status.
/// Once everything is in, the page shows "Under review" and checks the application (live: every 30 s; mock: after
/// [SimTimings.applicationReview]); approved → Home (or D-11 when paid plans are on). A rejected document, a declined
/// identity check or a rejected photo shows on its row ("1 error") with Re-upload / Try again. The app opens here
/// on every start until the driver is approved ([applicationRoute]).
///
/// [readOnly] (Account → Documents) shows every document as verified, with no actions (live API: the real statuses,
/// with Re-upload for a rejected document).
class D07DocumentsScreen extends ConsumerStatefulWidget {
  const D07DocumentsScreen({super.key, this.readOnly = false, this.showcase = false});

  final bool readOnly;

  /// Opened on its own from the Design gallery: render seed state, start no timers.
  final bool showcase;

  @override
  ConsumerState<D07DocumentsScreen> createState() => _D07DocumentsScreenState();
}

class _D07DocumentsScreenState extends ConsumerState<D07DocumentsScreen> {
  Timer? _poll;
  Timer? _mockReview;
  bool _checking = false;
  bool _loggingOut = false;
  late final bool _live = !widget.showcase && ref.read(isLiveApiProvider);

  bool get _isHub => !widget.readOnly && !widget.showcase;

  @override
  void initState() {
    super.initState();
    if (!_isHub || !_live) return;
    // Live: the admin decides in the panel; check quietly now and every 30 s (a push also brings the driver here).
    WidgetsBinding.instance.addPostFrameCallback((_) => _check(silent: true));
    _poll = Timer.periodic(const Duration(seconds: 30), (_) => _check(silent: true));
  }

  @override
  void dispose() {
    _poll?.cancel();
    _mockReview?.cancel();
    super.dispose();
  }

  /// Plans on → D-11 choose a plan; the free app → straight to Home.
  Future<String> _approvedRoute() async =>
      (await ref.read(appConfigProvider.future)).driverPlansEnabled
      ? Routes.choosePlan
      : Routes.home;

  /// Asks whether the application is approved. [silent]: the background check (no spinner, no "still under
  /// review" snack).
  Future<void> _check({bool silent = false}) async {
    if (_checking || !mounted || ModalRoute.of(context)?.isCurrent == false) {
      return;
    }
    // Not created yet (new driver before D-06): nothing to check.
    if (_live && !ref.read(driverRepositoryProvider).isLoggedIn) return;
    if (!silent) setState(() => _checking = true);
    bool? ok;
    final identity = ref.read(identityProvider.notifier);
    try {
      ok = await ref.read(kycProvider.notifier).checkApplication();
      if (_live) await identity.refresh();
    } on Exception catch (e) {
      if (!mounted) return;
      setState(() => _checking = false);
      if (!silent) {
        showTtSnack(context, e is OfflineException ? "You're offline. We'll check again when you're back." : userMessage(e));
      }
      return;
    }
    if (!mounted) return;
    setState(() => _checking = false);
    if (ok == true) {
      _poll?.cancel();
      final route = await _approvedRoute();
      if (!mounted || ModalRoute.of(context)?.isCurrent == false) return;
      showTtSnack(
        context,
        "You're approved! Welcome to Tamil Taxi",
        success: true,
      );
      context.go(route);
      return;
    }
    if (!silent && ok == null) {
      showTtSnack(
        context,
        "Still under review. We'll let you know as soon as an admin approves your documents.",
      );
    }
  }

  /// Mock: everything is in, so the simulated review starts (approve, or reject the RC with Demo control
  /// "Reject KYC").
  void _startMockReview() {
    if (_live || _mockReview != null) return;
    _mockReview = Timer(ref.read(simTimingProvider)(SimTimings.applicationReview), () {
      _mockReview = null;
      _check(silent: true);
    });
  }

  /// Step 1's Start / Edit. Live, once the driver exists, D-06 opens with what is saved (the draft is blank after a
  /// restart).
  Future<void> _editDetails(bool existing) async {
    if (!existing) {
      context.push(Routes.workType);
      return;
    }
    try {
      await ref.read(signupProvider.notifier).loadSaved();
    } on Exception catch (e) {
      if (mounted) showTtSnack(context, userMessage(e));
      return;
    }
    if (mounted) context.push(Routes.personalDetails);
  }

  Future<void> _logout() async {
    final ok = await showTtConfirm(
      context,
      title: 'Log out?',
      message: 'Your progress is saved. Log in again with your phone number and OTP to carry on.',
      confirmLabel: 'Log out',
      cancelLabel: 'Stay',
      icon: Symbols.logout_rounded,
    );
    if (!ok || !mounted) return;
    setState(() => _loggingOut = true);
    await signOutDriver(ref);
    if (mounted) context.go(Routes.welcome);
  }

  @override
  Widget build(BuildContext context) => widget.readOnly ? _readOnlyView(context) : _hubView(context);

  // ------------------------------------------------------------------------------------------- registration

  Widget _hubView(BuildContext context) {
    final t = context.type;
    final showcase = widget.showcase;
    final live = _live;
    final signup = ref.watch(signupProvider);
    // Live: a new driver has no account until D-06 saves, so nothing is loaded from the API before that.
    final loggedIn = !live || ref.read(driverRepositoryProvider).isLoggedIn;
    final kyc = live && loggedIn ? ref.watch(kycProvider) : null;
    final identityState = live && loggedIn ? ref.watch(identityProvider) : null;
    if (kyc != null && (kyc.isLoading || identityState!.isLoading)) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (kyc != null && (kyc.hasError || identityState!.hasError)) {
      return Scaffold(
        appBar: const TtAppBar(title: 'Registration'),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Could not load your documents. Try again.'),
              TextButton(
                onPressed: () {
                  ref.invalidate(kycProvider);
                  ref.invalidate(identityProvider);
                },
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }
    final allDocs = showcase || !loggedIn
        ? Seed.kycFresh
        : live
        ? (kyc?.value ?? const <KycDocument>[])
        : (ref.watch(kycProvider).value ?? Seed.kycFresh);
    final docs = [
      for (final d in allDocs)
        if (driverUploadDocs.contains(d.type)) d,
    ];
    final identity = showcase || !loggedIn
        ? null
        : ref.watch(identityProvider).value;
    final profile = live && loggedIn
        ? ref.watch(driverProfileProvider).value
        : null;

    // 1. Vehicle and personal details: live, the driver exists once D-06 has saved; mock, once D-06 committed.
    final detailsDone = showcase || signup.detailsSaved || (live && loggedIn);
    // 2. Identity check (not asked = nothing to do; live before D-06 it shows locked) and, once it is approved, the
    // profile photo. By hand (the server asks for it, Didit answered IDENTITY_MANUAL, or one is already uploaded):
    // the licence and Aadhaar, each checked by an admin, with the profile photo as the matching face.
    bool isIn(KycDocument d) =>
        d.status == KycStatus.verified || d.status == KycStatus.underReview;
    final idDocs = [
      for (final type in identityUploadDocs)
        allDocs.where((d) => d.type == type).firstOrNull ?? KycDocument(type: type, status: KycStatus.notUploaded),
    ];
    final hasIdentity = identity?.isRequired ?? live;
    final isManualId = hasIdentity && ((identity?.isManual ?? false) || idDocs.any((d) => d.isUploaded));
    final identityApproved = identity?.isApproved ?? false;
    final identityDone = !hasIdentity ||
        identityApproved ||
        (isManualId ? idDocs.every(isIn) : (identity?.isSubmitted ?? false));
    final idErrors = isManualId ? idDocs.where((d) => d.status == KycStatus.rejected).length : 0;
    final identityError = hasIdentity &&
        (isManualId ? idErrors > 0 : identity?.status == IdentityStatus.declined);
    final needsPhoto = live && hasIdentity;
    // The photo can be taken any time (an admin approves each), not only after the identity check.
    final photoDone =
        !needsPhoto ||
        profile?.photoPath != null ||
        (profile?.hasPendingPhoto ?? false);
    final photoError =
        needsPhoto &&
        profile != null &&
        profile.photoRejectReason != null &&
        profile.photoPath == null &&
        !profile.hasPendingPhoto;
    // 3. Documents.
    final docsDone = docs.where(isIn).length;
    final docErrors = docs.where((d) => d.status == KycStatus.rejected).length;

    // By hand the identity is three steps (one per document), with Didit one.
    final idSteps = !hasIdentity ? 0 : (isManualId ? idDocs.length : 1);
    final idDone = !hasIdentity
        ? 0
        : isManualId
        ? (identityApproved ? idDocs.length : idDocs.where(isIn).length)
        : (identityDone ? 1 : 0);
    final steps = 1 + idSteps + (needsPhoto ? 1 : 0) + docs.length;
    // Steps after the details only count once they are open.
    final done = detailsDone
        ? 1 +
              idDone +
              (needsPhoto && photoDone ? 1 : 0) +
              docsDone
        : 0;
    final errors = docErrors + (isManualId ? idErrors : (identityError ? 1 : 0)) + (photoError ? 1 : 0);
    final allIn =
        detailsDone && identityDone && photoDone && docsDone == docs.length;
    if (allIn && errors == 0 && !showcase) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _startMockReview());
    }

    final kind = profile?.vehicleKind ?? signup.vehicle;
    final plate = (profile?.plate ?? signup.plate).trim();
    final name = (profile?.name ?? signup.name).trim();
    final phone = (profile?.phone ?? signup.phone).trim();

    // The card's status pill and the next thing to do (its navy band).
    final (String pill, Color pillBg, Color pillFg) = errors > 0
        ? (
            errors == 1 ? '1 error' : '$errors errors',
            TtColors.error,
            Colors.white,
          )
        : allIn
        ? ('Under review', TtColors.warning, TtColors.navy900)
        : ('${steps - done} to do', TtColors.navy900, Colors.white);
    final firstRejected = [...docs, if (isManualId) ...idDocs]
        .where((d) => d.status == KycStatus.rejected)
        .firstOrNull;
    final firstMissing = docs
        .where((d) => d.status == KycStatus.notUploaded)
        .firstOrNull;
    final firstMissingId = idDocs.where((d) => d.status == KycStatus.notUploaded).firstOrNull;
    final (String next, VoidCallback? onNext) = !detailsDone
        ? ('Add your vehicle and details', () => context.push(Routes.workType))
        : firstRejected != null
        ? (
            'Re-upload your ${firstRejected.type.label}',
            () => _upload(firstRejected.type),
          )
        : hasIdentity && !identityDone && isManualId && firstMissingId != null
        ? ('Upload your ${firstMissingId.type.label.toLowerCase()}', () => _upload(firstMissingId.type))
        : hasIdentity && !identityDone && !isManualId
        ? (
            'Verify your licence and Aadhaar',
            () async {
              final error = await ref.read(identityProvider.notifier).verify();
              if (context.mounted && error != null) {
                showTtSnack(context, error);
              }
            },
          )
        : !photoDone
        ? ('Take your profile photo', () => context.push(Routes.profilePhoto))
        : firstMissing != null
        ? (
            'Upload your ${firstMissing.type.label}',
            () => _upload(firstMissing.type),
          )
        : ("Under review · we'll notify you", null);

    return Scaffold(
      backgroundColor: TtColors.background,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          DocsHeader(
            title: 'Registration',
            showBack: false,
            summary: allIn && errors == 0 ? 'All done, under review' : '$done of $steps done',
            segments: [(done / steps, errors > 0 ? TtColors.error : TtColors.coral500)],
            onHelp: showcase ? null : () => context.push(Routes.help),
          ),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(TtSpacing.l),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _VehicleCard(
                    kind: kind,
                    isSet: detailsDone,
                    plate: plate,
                    line: [if (name.isNotEmpty) name, if (phone.isNotEmpty) phone].join(', '),
                    pill: pill,
                    pillBg: pillBg,
                    pillFg: pillFg,
                    next: next,
                    onNext: showcase ? null : onNext,
                  ),
                  const SizedBox(height: TtSpacing.xl),
                  Text('Complete these to start driving', style: t.bodySemibold.copyWith(fontSize: 17)),
                  const SizedBox(height: TtSpacing.m),
                  _StepRow(
                    icon: Symbols.directions_car_rounded,
                    title: 'Vehicle and personal details',
                    subtitle: detailsDone
                        ? [kind == VehicleKind.truck ? 'Truck' : kind.label, if (plate.isNotEmpty) plate, if (name.isNotEmpty) name]
                            .join(' · ')
                        : 'Your work, vehicle, name and UPI ID',
                    status: detailsDone ? KycStatus.verified : KycStatus.notUploaded,
                    doneLabel: 'Done',
                    actionLabel: detailsDone ? 'Edit' : 'Start',
                    // Live: the vehicle type is fixed once the driver exists, so editing opens the details only.
                    onTap: showcase ? null : () => _editDetails(live && detailsDone),
                  ),
                  const SizedBox(height: TtSpacing.m),
                  if (hasIdentity) ...[
                    if (!detailsDone)
                      const _LockedRow(title: 'Licence, Aadhaar and selfie')
                    else if (isManualId) ...[
                      // The identity check by hand: an admin checks the licence and Aadhaar (and the photo below).
                      for (final (i, doc) in idDocs.indexed) ...[
                        if (i > 0) const SizedBox(height: TtSpacing.m),
                        _DocRow(doc: doc, readOnly: false, live: live, onUpload: () => _upload(doc.type)),
                      ],
                    ] else
                      IdentityCheckCard(showcase: showcase),
                    const SizedBox(height: TtSpacing.m),
                    if (needsPhoto && detailsDone) ...[
                      const ProfilePhotoCard(),
                      const SizedBox(height: TtSpacing.m),
                    ],
                  ],
                  // One card per document, outlined by its status (green once done), like Namma Yatri's checklist.
                  for (final doc in docs) ...[
                    if (detailsDone)
                      _DocRow(doc: doc, readOnly: false, live: live, onUpload: () => _upload(doc.type))
                    else
                      _LockedRow(title: doc.type.label),
                    const SizedBox(height: TtSpacing.m),
                  ],
                  const SizedBox(height: TtSpacing.s),
                  const _PhotoTip(),
                  const SizedBox(height: TtSpacing.m),
                  if (!showcase)
                    Center(
                      child: TextButton.icon(
                        onPressed: _loggingOut ? null : _logout,
                        icon: _loggingOut
                            ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
                            : const Icon(Symbols.logout_rounded, size: 20),
                        label: Text(_loggingOut ? 'Logging out…' : 'Log out'),
                        style: TextButton.styleFrom(foregroundColor: TtColors.navy700, minimumSize: const Size(48, 48)),
                      ),
                    ),
                ],
              ),
            ),
          ),
          if (allIn && errors == 0)
            BottomActions(
              color: TtColors.surface,
              children: [
                TtButton(label: 'Check status', loading: _checking, onPressed: showcase ? null : _check),
                const SizedBox(height: TtSpacing.s),
                Text(
                  "An admin checks your documents, usually within 24 hours. We'll notify you when you can start.",
                  textAlign: TextAlign.center,
                  style: t.bodySmall.copyWith(color: TtColors.navy500),
                ),
              ],
            ),
        ],
      ),
    );
  }

  /// Opens the camera for [type]; mock: clears Demo control "Reject KYC" first so the re-upload passes.
  void _upload(KycDocType type) {
    if (!_live) ref.read(demoSettingsProvider.notifier).update((s) => s.copyWith(rejectKyc: false));
    context.push(Routes.uploadDocument(type.name));
  }

  // ------------------------------------------------------------------------------------------ Account view

  Widget _readOnlyView(BuildContext context) {
    final t = context.type;
    final showcase = widget.showcase;
    final live = _live;
    final allDocs = !live
        ? Seed.kycAllVerified
        : (ref.watch(kycProvider).value ?? const <KycDocument>[]);
    final docs = [
      for (final d in allDocs)
        if (isShownDoc(d)) d,
    ];
    final identity = showcase ? null : ref.watch(identityProvider).value;
    // Done by hand: the licence and Aadhaar are listed with the documents instead of the Didit card.
    final hasIdentity = (identity?.isEnabled ?? showcase) && !docs.any((d) => identityUploadDocs.contains(d.type));
    // Count what the page shows: each document, the Didit card, and the profile photo (shown wherever the identity
    // step applies). An identity done by hand is its documents, not one more step.
    final profile = live && !showcase ? ref.watch(driverProfileProvider).value : null;
    final hasPhoto = profile != null && (identity?.isRequired ?? false);
    final verified = docs.where((d) => d.status == KycStatus.verified).length;
    final steps = docs.length + (hasIdentity ? 1 : 0) + (hasPhoto ? 1 : 0);
    final stepsVerified = verified +
        (hasIdentity && identity?.isApproved == true ? 1 : 0) +
        (hasPhoto && profile.photoPath != null ? 1 : 0);

    return Scaffold(
      backgroundColor: TtColors.background,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          DocsHeader(
            title: 'Documents',
            summary: '$stepsVerified of $steps verified',
            segments: [(stepsVerified / steps, TtColors.success)],
            onHelp: showcase ? null : () => context.push(Routes.help),
          ),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(TtSpacing.l),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (hasIdentity) ...[
                    IdentityCheckCard(showcase: showcase),
                    const SizedBox(height: TtSpacing.l),
                  ],
                  // Shown whenever the identity step applies (by hand too); hidden when it isn't asked.
                  if (!showcase) ...[
                    const ProfilePhotoCard(),
                    const SizedBox(height: TtSpacing.l),
                  ],
                  for (final doc in docs) ...[
                    _DocRow(
                      doc: doc,
                      // Live: a rejected document can be re-uploaded from Account too.
                      readOnly: !(live && doc.status == KycStatus.rejected),
                      live: live,
                      onUpload: () => _upload(doc.type),
                    ),
                    const SizedBox(height: TtSpacing.m),
                  ],
                  const SizedBox(height: TtSpacing.l),
                  Text(
                      // Counts the identity check too: a declined check is never "all verified".
                      identity?.status == IdentityStatus.declined
                          ? 'Your identity check needs another try. Fix the points above, then tap Try again.'
                          : stepsVerified == steps
                              ? 'All your documents are verified. Contact support if something changes, like a new RC.'
                              : 'An admin checks each document, usually within 24 hours. Contact support if you need help.',
                      style: t.bodySmall.copyWith(color: TtColors.navy500)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// The registration's vehicle card: plate (or "Your vehicle"), name and phone, the vehicle art, a status pill and a
/// navy band with the next thing to do.
class _VehicleCard extends StatelessWidget {
  const _VehicleCard({
    required this.kind,
    required this.isSet,
    required this.plate,
    required this.line,
    required this.pill,
    required this.pillBg,
    required this.pillFg,
    required this.next,
    required this.onNext,
  });

  final VehicleKind kind;
  final bool isSet;
  final String plate;
  final String line;
  final String pill;
  final Color pillBg;
  final Color pillFg;
  final String next;
  final VoidCallback? onNext;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Material(
      color: TtColors.surface,
      borderRadius: TtRadii.cardRadius,
      clipBehavior: Clip.antiAlias,
      elevation: 1,
      shadowColor: TtColors.shadow,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(TtSpacing.l, TtSpacing.l, TtSpacing.m, TtSpacing.l),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        isSet && plate.isNotEmpty ? plate : 'Your vehicle',
                        style: t.h2.copyWith(letterSpacing: isSet && plate.isNotEmpty ? 0.5 : 0),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      if (line.isNotEmpty)
                        Text(line, style: t.bodySmall.copyWith(color: TtColors.navy500), maxLines: 1, overflow: TextOverflow.ellipsis),
                      const SizedBox(height: TtSpacing.s),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(color: pillBg, borderRadius: TtRadii.pillRadius),
                        child: Text(pill, style: t.caption.copyWith(color: pillFg, fontWeight: FontWeight.w700)),
                      ),
                    ],
                  ),
                ),
                VehicleArt(kind, width: 88, height: 56),
              ],
            ),
          ),
          InkWell(
            onTap: onNext,
            child: Container(
              color: TtColors.navy900,
              constraints: const BoxConstraints(minHeight: 52),
              padding: const EdgeInsets.symmetric(horizontal: TtSpacing.l, vertical: TtSpacing.m),
              child: Row(
                children: [
                  Expanded(
                    child: Text(next, style: t.bodySemibold.copyWith(color: Colors.white), maxLines: 2),
                  ),
                  if (onNext != null) const Icon(Symbols.arrow_forward_rounded, color: Colors.white),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// A checklist row that opens a screen: icon tile, title, subtitle, and a Done pill or an action button.
class _StepRow extends StatelessWidget {
  const _StepRow({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.status,
    required this.doneLabel,
    required this.actionLabel,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final KycStatus status;
  final String doneLabel;
  final String actionLabel;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final done = status == KycStatus.verified;
    return Container(
      padding: const EdgeInsets.all(TtSpacing.l),
      decoration: BoxDecoration(
        color: TtColors.surface,
        borderRadius: TtRadii.cardRadius,
        border: Border.all(
          color: done ? TtColors.success.withValues(alpha: 0.55) : TtColors.divider,
          width: done ? 1.5 : 1,
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(color: done ? TtColors.successTint : TtColors.inputBg, borderRadius: TtRadii.cardRadius),
            child: Icon(icon, color: done ? TtColors.successText : TtColors.navy700, size: 22),
          ),
          const SizedBox(width: TtSpacing.m),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: t.bodySemibold),
                Text(subtitle,
                    style: t.bodySmall.copyWith(color: TtColors.navy500), maxLines: 2, overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
          const SizedBox(width: TtSpacing.s),
          if (done && onTap == null)
            IconPill(label: doneLabel, icon: Symbols.check_circle_rounded, bg: TtColors.successTint, fg: TtColors.successText)
          else if (done)
            TextButton(
              onPressed: onTap,
              style: TextButton.styleFrom(minimumSize: const Size(48, 48), foregroundColor: TtColors.coral600),
              child: Text(actionLabel),
            )
          else
            _UploadButton(label: actionLabel, icon: Symbols.arrow_forward_rounded, onTap: onTap),
        ],
      ),
    );
  }
}

/// A step that opens after "Vehicle and personal details" (the documents belong to the new driver).
class _LockedRow extends StatelessWidget {
  const _LockedRow({required this.title});
  final String title;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Container(
      padding: const EdgeInsets.all(TtSpacing.l),
      decoration: BoxDecoration(
        color: TtColors.surface,
        borderRadius: TtRadii.cardRadius,
        border: Border.all(color: TtColors.divider),
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: const BoxDecoration(color: TtColors.inputBg, borderRadius: TtRadii.cardRadius),
            child: const Icon(Symbols.lock_rounded, color: TtColors.navy500, size: 22),
          ),
          const SizedBox(width: TtSpacing.m),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: t.bodySemibold.copyWith(color: TtColors.navy700)),
                Text('Opens after your vehicle and details', style: t.bodySmall.copyWith(color: TtColors.navy500)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// "Clear photos get approved faster" tip.
class _PhotoTip extends StatelessWidget {
  const _PhotoTip();

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Container(
      padding: const EdgeInsets.all(TtSpacing.l),
      decoration: const BoxDecoration(color: TtColors.navy900, borderRadius: TtRadii.cardRadius),
      child: Row(
        children: [
          const Icon(Symbols.lightbulb_rounded, color: Colors.white),
          const SizedBox(width: TtSpacing.m),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Clear photos get approved faster', style: t.bodySemibold.copyWith(color: Colors.white)),
                Text('Good light, all 4 corners visible, no glare.', style: t.bodySmall.copyWith(color: TtColors.navy300)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Icon, sample detail line and verified subtitle for each document.
(IconData, String, String) _docInfo(KycDocType type) => switch (type) {
      KycDocType.drivingLicence => (Symbols.id_card_rounded, 'Front and back of your licence', 'TN37 •••• 2345'),
      KycDocType.aadhaar => (Symbols.fingerprint_rounded, 'Front and back', '•••• •••• 7781'),
      KycDocType.vehicleRc => (Symbols.description_rounded, 'Registration certificate', 'TN 37 AB 4521'),
      KycDocType.insurance => (Symbols.shield_rounded, 'Policy page with dates', 'Valid till 12 Mar 2027'),
      KycDocType.policeVerification => (Symbols.local_police_rounded, 'From TN Police eServices', 'Verified by TN Police'),
    };

class _DocRow extends StatelessWidget {
  const _DocRow({required this.doc, required this.readOnly, required this.onUpload, this.live = false});

  final KycDocument doc;
  final bool readOnly;
  final VoidCallback onUpload;

  /// Real statuses: no sample document numbers or upload times.
  final bool live;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final (icon, hint, verifiedLine) = _docInfo(doc.type);
    final (Color tileBg, Color tileFg) = switch (doc.status) {
      KycStatus.verified => (TtColors.successTint, TtColors.successText),
      KycStatus.underReview => (TtColors.warningTint, TtColors.warningText),
      KycStatus.rejected => (TtColors.errorTint, TtColors.error),
      KycStatus.notUploaded => (TtColors.inputBg, TtColors.navy700),
    };
    final subtitle = switch (doc.status) {
      KycStatus.verified => live ? 'Verified by Tamil Taxi' : verifiedLine,
      KycStatus.underReview when live => 'Uploaded · an admin is checking it',
      KycStatus.underReview => doc.type == KycDocType.vehicleRc ? 'Uploaded 10:08 AM' : 'Uploaded just now',
      KycStatus.rejected => doc.rejectReason ?? Seed.kycRejectReason,
      KycStatus.notUploaded => hint,
    };
    final Widget trailing = switch (doc.status) {
      KycStatus.verified => const IconPill(
          label: 'Verified',
          icon: Symbols.check_circle_rounded,
          bg: TtColors.successTint,
          fg: TtColors.successText),
      KycStatus.underReview => const IconPill(
          label: 'Under review',
          icon: Symbols.schedule_rounded,
          bg: TtColors.warningTint,
          fg: TtColors.warningText),
      KycStatus.rejected => _UploadButton(label: 'Re-upload', onTap: onUpload),
      KycStatus.notUploaded => _UploadButton(label: 'Upload', onTap: onUpload),
    };
    final shownVerified = readOnly && !live;
    final outline = shownVerified
        ? TtColors.success
        : switch (doc.status) {
            KycStatus.verified => TtColors.success,
            KycStatus.underReview => TtColors.warning,
            KycStatus.rejected => TtColors.error,
            KycStatus.notUploaded => TtColors.divider,
          };
    return Container(
      padding: const EdgeInsets.all(TtSpacing.l),
      decoration: BoxDecoration(
        color: TtColors.surface,
        borderRadius: TtRadii.cardRadius,
        border: Border.all(
          color: outline.withValues(alpha: outline == TtColors.divider ? 1 : 0.55),
          width: outline == TtColors.divider ? 1 : 1.5,
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(color: tileBg, borderRadius: TtRadii.cardRadius),
            child: Icon(icon, color: tileFg, size: 22),
          ),
          const SizedBox(width: TtSpacing.m),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(doc.type.label, style: t.bodySemibold),
                Text(
                  subtitle,
                  style: t.bodySmall.copyWith(
                      color: doc.status == KycStatus.rejected ? TtColors.error : TtColors.navy500),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          const SizedBox(width: TtSpacing.s),
          if (shownVerified)
            const IconPill(
                label: 'Verified', icon: Symbols.check_circle_rounded, bg: TtColors.successTint, fg: TtColors.successText)
          else
            trailing,
        ],
      ),
    );
  }
}

class _UploadButton extends StatelessWidget {
  const _UploadButton({required this.label, required this.onTap, this.icon = Symbols.upload_rounded});
  final String label;
  final VoidCallback? onTap;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Material(
        color: TtColors.coral600,
        shape: const StadiumBorder(),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 48, minWidth: 48),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(icon, color: Colors.white, size: 20),
                  const SizedBox(width: 6),
                  Text(label, style: context.type.button.copyWith(color: Colors.white)),
                ],
              ),
            ),
          ),
        ),
      );
}
