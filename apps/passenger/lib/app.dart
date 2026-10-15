import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import 'common/trip_routes.dart';
import 'features/ride/p18_share_trip_sheet.dart';
import 'features/ride/safety_check_sheet.dart';
import 'router/app_router.dart';
import 'router/routes.dart';
import 'state/app_notice.dart';
import 'state/ride_flow.dart' show upcomingTripsProvider;
import 'state/session_actions.dart';
import 'state/trip_safety.dart';

/// The passenger app root. [router] is injectable for tests.
class TtPassengerApp extends ConsumerStatefulWidget {
  const TtPassengerApp({super.key, this.router});
  final GoRouter? router;

  @override
  ConsumerState<TtPassengerApp> createState() => _TtPassengerAppState();
}

class _TtPassengerAppState extends ConsumerState<TtPassengerApp> {
  late final GoRouter _router = widget.router ?? createPassengerRouter();
  StreamSubscription<void>? _unauthorized;
  StreamSubscription<PushData>? _pushTaps;
  StreamSubscription<SafetyCheck>? _safetyChecks;
  StreamSubscription<Map<String, dynamic>>? _tripUpdates;
  AppLifecycleListener? _lifecycle;
  ApiSession? _session;

  /// Safety checks already shown (the socket event and the push tap are the same check), and one at a time.
  final _shownChecks = <String>{};
  bool _isShowingCheck = false;

  @override
  void initState() {
    super.initState();
    // Service cities (names for messages, the maps' first view) come from the API; nothing is built in.
    ref.read(serviceCitiesProvider);
    // Live API: a rejected token (expired, or the account was blocked) sends the passenger to sign in.
    if (ref.read(isLiveApiProvider)) {
      _unauthorized = ref.read(apiClientProvider).onUnauthorized.listen((_) {
        if (!mounted) return;
        resetSignedInState(ref);
        ref.read(appNoticeProvider.notifier).show('Please sign in again', goTo: Routes.login);
      });
      // "Is everything OK?" while the app is open (socket), over whatever screen is up.
      _safetyChecks = ref.read(liveSafetyProvider).checks().listen((c) => _showSafetyCheck(c, openTrip: false));
      // Trips the app isn't following (one booked for later starting its search, a driver accepting it) arrive on
      // the rider's own room: follow them. The socket stays up while signed in for that.
      _tripUpdates = ref.read(realtimeProvider).on('trip.updated').listen(_onTripUpdated);
      _session = ref.read(apiClientProvider).session..tokenChanges.addListener(_connect);
      _connect();
      _lifecycle = AppLifecycleListener(onResume: _onResume);
      final push = ref.read(pushProvider);
      if (push != null) {
        // A trip's progress is already on screen while a flow follows it; any other trip's (and chat, announcements)
        // still shows.
        push.suppress = (data) => data['type'] == 'trip' && followedTripRoute(ref, data['tripId'] ?? '') != null;
        _pushTaps = push.taps.listen(_onPushTap);
        WidgetsBinding.instance.addPostFrameCallback((_) {
          final launch = push.takeLaunchTap();
          if (launch != null) _onPushTap(launch);
        });
      }
    }
  }

  /// Signed in: keep the socket up (the rider's room carries trips booked for later and their driver).
  void _connect() {
    if (ref.read(authRepositoryProvider).isLoggedIn) ref.read(realtimeProvider).connect();
  }

  /// A trip update on the rider's room. One no flow follows, now searching or with a driver, is followed and opened
  /// (unless another trip is on or being booked). Upcoming trips reload either way.
  void _onTripUpdated(Map<String, dynamic> json) {
    final id = json['id'];
    if (id is! String || !mounted) return;
    ref.invalidate(upcomingTripsProvider);
    if (followedTripRoute(ref, id) != null || isBusyWithTrip(ref)) return;
    if (!kOngoingStatuses.contains(json['status'])) return;
    final route = followTrip(ref, LiveTripUpdate.fromJson(json));
    if (route != null && !isSosOpen(_router)) _router.go(route);
  }

  /// Back in the app: a trip that started (or got a driver) meanwhile opens; the Upcoming list reloads.
  Future<void> _onResume() async {
    if (!ref.read(authRepositoryProvider).isLoggedIn) return;
    _connect();
    ref.invalidate(upcomingTripsProvider);
    if (followedTripRoute(ref) != null || isBusyWithTrip(ref)) return;
    final route = await restoreActiveTrip(ref);
    if (mounted && route != null && !isSosOpen(_router)) _router.go(route);
  }

  /// A tapped notification: a trip, its chat or a reminder about it opens that trip's screen (a finished one its
  /// rating or details); a safety check opens its sheet; an identity result opens Verify identity; a trip suggestion
  /// opens that trip ready to book; a campaign opens the screen it names.
  Future<void> _onPushTap(PushData data) async {
    switch (data['type']) {
      case 'safety':
        final check = SafetyCheck.fromJson(data);
        return _showSafetyCheck(check, openTrip: !check.isArrival);
      case 'identity':
        if (ref.read(authRepositoryProvider).isLoggedIn) _router.go(Routes.verifyIdentity);
      case 'trip' || 'chat' || 'nudge':
        final route = await routeForTripPush(ref, data);
        if (mounted && route != null && !isSosOpen(_router)) _router.go(route);
      case 'suggest':
        final route = routeForSuggestionPush(ref, data);
        if (route != null && !isSosOpen(_router)) _router.go(route);
      case 'campaign':
        if (ref.read(authRepositoryProvider).isLoggedIn && !isBusyWithTrip(ref) && !isSosOpen(_router)) {
          _router.go(routeForCampaignPush(data));
        }
    }
  }

  /// The I'm OK / Get help sheet for [check] (once per check); "Get help" opens the SOS screen. A night-start
  /// reminder opens the share sheet instead. [openTrip]: go to the ride first (a tapped push while the app was
  /// elsewhere).
  Future<void> _showSafetyCheck(SafetyCheck check, {required bool openTrip}) async {
    final key = check.eventId ?? '${check.tripId}:${check.kind}';
    if (_isShowingCheck || _shownChecks.contains(key)) return;
    _isShowingCheck = true;
    _shownChecks.add(key);
    try {
      if (openTrip) {
        final route = await restoreActiveTrip(ref);
        if (mounted && route != null) _router.go(route);
        await WidgetsBinding.instance.endOfFrame;
      }
      final context = rootNavigatorKey.currentContext;
      if (context == null || !context.mounted) return;
      // Night ride start: "Share your trip with a friend?" opens the share sheet (once per trip).
      if (check.isShareReminder) {
        if (ref.read(autoSharePromptedProvider.notifier).claim(check.tripId)) await P18ShareTripSheet.show(context);
        return;
      }
      final answer = await SafetyCheckSheet.show(context, check);
      if (answer == SafetyAnswer.help && mounted) unawaited(_router.push(Routes.sos));
    } finally {
      _isShowingCheck = false;
    }
  }

  @override
  void dispose() {
    _session?.tokenChanges.removeListener(_connect);
    _lifecycle?.dispose();
    _tripUpdates?.cancel();
    _safetyChecks?.cancel();
    _unauthorized?.cancel();
    _pushTaps?.cancel();
    super.dispose();
  }

  void _showNotice(AppNotice notice) {
    final goTo = notice.goTo;
    // Not while SOS is open: it shows the trip's current screen when it closes.
    if (goTo != null && !isSosOpen(_router)) _router.go(goTo);
    final context = rootNavigatorKey.currentContext;
    if (context != null) showTtSnack(context, notice.message);
  }

  @override
  Widget build(BuildContext context) {
    // Messages from controllers (e.g. the server cancelled the trip), shown wherever the passenger is.
    ref.listen(appNoticeProvider, (_, next) {
      if (next != null) _showNotice(next);
    });
    return MaterialApp.router(
      title: 'Tamil Taxi',
      debugShowCheckedModeBanner: false,
      theme: TtTheme.light(),
      themeMode: ThemeMode.light,
      routerConfig: _router,
    );
  }
}
