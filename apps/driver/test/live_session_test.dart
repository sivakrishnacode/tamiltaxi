// The live (API) branch of DriverSessionController against fake LiveJobs / realtime / GPS: going online
// needs a fix, offers become the request card with the server's countdown, accept / arrived / start
// (server-checked OTP) / complete, GPS uploads, a passenger cancellation, and errors from the API.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_driver/app.dart';
import 'package:tamiltaxi_driver/features/jobs/d15_ride_request_screen.dart';
import 'package:tamiltaxi_driver/state/request_voice.dart';
import 'package:tamiltaxi_driver/state/driver_location.dart';
import 'package:tamiltaxi_driver/state/driver_session.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/live_fakes.dart';

void main() {
  late FakeJobs jobs;
  late FakeRealtime realtime;
  late FakeLocator locator;
  late ProviderContainer container;

  DriverSessionController session() =>
      container.read(driverSessionProvider.notifier);
  DriverSessionState state() => container.read(driverSessionProvider);

  setUp(() async {
    RoadRouter.enabled = false;
    SharedPreferences.setMockInitialValues({});
    final api = ApiClient(
      baseUrl: 'http://localhost:1/v1',
      session: ApiSession(await SharedPreferences.getInstance()),
    );
    realtime = FakeRealtime(api);
    jobs = FakeJobs(api, realtime);
    locator = FakeLocator();
    container = ProviderContainer(
      overrides: [
        isLiveApiProvider.overrideWithValue(true),
        apiClientProvider.overrideWithValue(api),
        realtimeProvider.overrideWithValue(realtime),
        liveJobsProvider.overrideWithValue(jobs),
        driverLocatorProvider.overrideWithValue(locator),
        requestSpeakerProvider.overrideWithValue(SilentSpeaker()),
      ],
    );
    // Keep the provider alive between reads.
    container.listen(driverSessionProvider, (_, _) {});
  });

  tearDown(() => container.dispose());

  test('a disappeared stacked offer never accepts the focused trip', () async {
    await session().goOnline();
    jobs.offersCtl.add(liveOffer('focus'));
    await pumpEventQueue();
    await session().acceptOffer('withdrawn');
    expect(state().incoming?.id, 'focus');
    expect(jobs.calls, isNot(contains('accept')));
  });

  test(
    'a cancellation pause arriving during a job applies after it ends',
    () async {
      await session().goOnline();
      jobs.offersCtl.add(liveOffer('t1'));
      await pumpEventQueue();
      await session().acceptRequest();
      jobs.pausesCtl.add(DateTime.now().add(const Duration(minutes: 20)));
      await pumpEventQueue();
      expect(state().job, isNotNull);
      jobs.updatesCtl.add(liveUpdate('t1', 'CANCELLED'));
      await pumpEventQueue();
      expect(state().job, isNull);
      expect(state().online, isFalse);
      expect(state().notice?.message, contains('paused'));
    },
  );

  test('a pause during a completed job applies after collecting payment', () async {
    await session().goOnline();
    jobs.offersCtl.add(liveOffer('t1'));
    await pumpEventQueue();
    await session().acceptRequest();
    jobs.pausesCtl.add(DateTime.now().add(const Duration(minutes: 20)));
    await pumpEventQueue();
    await session().collectPayment(PaymentMode.cash);
    expect(state().job, isNull);
    expect(state().online, isFalse);
    expect(state().notice?.message, contains('paused'));
  });

  test('pending review during a job routes to documents after payment', () async {
    await session().goOnline();
    jobs.offersCtl.add(liveOffer('t1'));
    await pumpEventQueue();
    await session().acceptRequest();
    realtime.statusCtl.add({'status': 'PENDING', 'isOnline': false});
    await pumpEventQueue();
    expect(state().job, isNotNull);
    expect(state().notice?.goTo, isNull);
    expect(container.read(apiClientProvider).session.lastDriverStatus, 'PENDING');
    await session().collectPayment(PaymentMode.cash);
    expect(state().online, isFalse);
    expect(state().notice?.goTo, '/signup/documents');
  });

  test('live state starts with no seed earnings', () {
    expect(state().todayEarnings, 0);
    expect(state().todayRides, 0);
  });

  test(
    'going online needs a GPS fix; a location problem keeps the driver offline',
    () async {
      locator.problem = const LocationProblem('Turn on Location to go online');
      await expectLater(session().goOnline(), throwsA(isA<LocationProblem>()));
      expect(state().online, isFalse);
      expect(state().goingOnline, isFalse);
      expect(jobs.calls, isEmpty);
    },
  );

  test(
    'an API refusal (plan expired) keeps the driver offline with the message',
    () async {
      jobs.onlineError = const ApiException(
        403,
        'Plan expired. Renew to go online again',
      );
      await expectLater(
        session().goOnline(),
        throwsA(
          isA<ApiException>().having(
            (e) => e.message,
            'message',
            'Plan expired. Renew to go online again',
          ),
        ),
      );
      expect(state().online, isFalse);
    },
  );

  test(
    'paused for cancellations: going online is refused with the end time',
    () async {
      final until = DateTime.utc(2026, 9, 29, 10, 10);
      jobs.onlineError = ApiException(
        403,
        "You cancelled too many rides, so you can't go online until 3:40 pm",
        code: 'DRIVER_TEMP_BLOCKED',
        details: {'until': until.toIso8601String()},
      );
      await expectLater(
        session().goOnline(),
        throwsA(
          isA<ApiException>().having(
            (e) => e.tempBlockedUntil,
            'tempBlockedUntil',
            until.toLocal(),
          ),
        ),
      );
      expect(state().online, isFalse);
    },
  );

  test(
    'a pause from the server while online takes the driver offline with a notice',
    () async {
      await session().goOnline();
      expect(state().online, isTrue);
      jobs.pausesCtl.add(DateTime.now().add(const Duration(hours: 24)));
      await Future<void>.delayed(Duration.zero);
      expect(state().online, isFalse);
      expect(state().notice?.message, contains('paused'));
    },
  );

  test(
    'stacked requests: the second waits behind the first; decline, close and switch move between them',
    () async {
      await session().goOnline();
      jobs.offersCtl
        ..add(liveOffer('t1', seconds: 12))
        ..add(liveOffer('t2', seconds: 14))
        ..add(liveOffer('t3', seconds: 14));
      await pumpEventQueue();
      expect(state().incoming?.id, 't1');
      expect(state().queued.map((q) => q.request.id), ['t2', 't3']);

      // Switch to t3: t1 waits in the stack with its own time left.
      session().focusQueued('t3');
      expect(state().incoming?.id, 't3');
      expect(state().queued.map((q) => q.request.id), ['t1', 't2']);

      // t2 taken elsewhere: its chip goes. Then the focused one closes: the next comes in.
      jobs.closedCtl.add('t2');
      await pumpEventQueue();
      expect(state().queued.map((q) => q.request.id), ['t1']);
      jobs.closedCtl.add('t3');
      await pumpEventQueue();
      expect(state().incoming?.id, 't1');
      expect(state().queued, isEmpty);

      // Declining the last one leaves nothing.
      session().declineRequest();
      await pumpEventQueue();
      expect(state().incoming, isNull);
      expect(jobs.calls, ['online', 'decline']);
    },
  );

  test(
    'stacked requests: accepting one clears the rest; a failed accept moves to the next',
    () async {
      await session().goOnline();
      jobs.offersCtl
        ..add(liveOffer('t1'))
        ..add(liveOffer('t2'));
      await pumpEventQueue();
      jobs.acceptError = const ApiException(
        409,
        'This request is no longer available',
      );
      await expectLater(
        session().acceptRequest(),
        throwsA(isA<ApiException>()),
      );
      expect(state().incoming?.id, 't2');

      jobs.acceptError = null;
      jobs.offersCtl.add(liveOffer('t3'));
      await pumpEventQueue();
      expect(state().queued.map((q) => q.request.id), ['t3']);
      await session().acceptRequest();
      expect(state().job?.id, 't2');
      expect(state().incoming, isNull);
      expect(state().queued, isEmpty);
    },
  );

  test(
    'the rider adds extra: the request on screen and the one stacked behind get the new fare, same countdown',
    () async {
      await session().goOnline();
      jobs.offersCtl
        ..add(liveOffer('t1'))
        ..add(liveOffer('t2'));
      await pumpEventQueue();
      final focusEnds = state().incomingExpiresAt;
      final stackedEnds = state().queued.single.expiresAt;
      final fare = Seed.rideRequest.fare;
      jobs.offersCtl
        ..add(
          LiveOffer(
            liveOffer('t1').request.copyWith(fare: fare + 20, extra: 20),
            4,
          ),
        )
        ..add(
          LiveOffer(
            liveOffer('t2').request.copyWith(fare: fare + 10, extra: 10),
            4,
          ),
        );
      await pumpEventQueue();
      expect(state().incoming?.fare, fare + 20);
      expect(state().incoming?.extra, 20);
      expect(state().incomingExpiresAt, focusEnds);
      expect(state().queued.single.request.extra, 10);
      expect(state().queued.single.expiresAt, stackedEnds);
    },
  );

  test(
    'going offline declines every open request; a resume recovers all of them',
    () async {
      await session().goOnline();
      jobs.openOffers.addAll([liveOffer('t1'), liveOffer('t2')]);
      session().onAppResumed();
      await pumpEventQueue();
      expect(state().incoming?.id, 't1');
      expect(state().queued.single.request.id, 't2');
      await session().goOffline();
      expect(jobs.calls.where((c) => c == 'decline'), hasLength(2));
      expect(state().queued, isEmpty);
    },
  );

  test(
    'ride: offer → accept → arrived → wrong OTP → start → complete → collect',
    () async {
      await session().goOnline();
      expect(state().online, isTrue);
      expect(jobs.calls, ['online']);

      jobs.offersCtl.add(liveOffer('t1', seconds: 12));
      await pumpEventQueue();
      expect(state().incoming?.id, 't1');
      expect(session().incomingCountdown.inSeconds, inInclusiveRange(10, 12));

      await session().acceptRequest();
      expect(state().incoming, isNull);
      expect(state().job?.id, 't1');
      expect(state().job?.customerPhone, '+919876543210');
      expect(state().phase, JobPhase.toPickup);
      expect(state().route, isNotEmpty);

      // Another offer while on a job is ignored.
      jobs.offersCtl.add(liveOffer('t2'));
      await pumpEventQueue();
      expect(state().incoming, isNull);

      await session().arrivedAtPickup();
      expect(state().phase, JobPhase.atPickup);

      await expectLater(
        session().startTrip(otp: '9999'),
        throwsA(
          isA<ApiException>().having(
            (e) => e.message,
            'message',
            'Wrong OTP, please try again',
          ),
        ),
      );
      expect(state().phase, JobPhase.atPickup);

      await session().startTrip(otp: '1234');
      expect(state().phase, JobPhase.toDrop);
      expect(state().etaMin, greaterThan(0));

      await session().endRide();
      expect(state().phase, JobPhase.collect);

      await session().collectPayment(PaymentMode.cash);
      expect(state().job, isNull);
      expect(state().online, isTrue);
      expect(jobs.calls, [
        'online',
        'accept',
        'arrived',
        'start:9999',
        'start:1234',
        'complete',
        'payment:cash',
      ]);
    },
  );

  test(
    '"Received on UPI" is stored on the trip; offline keeps the driver on D-19, a refusal moves on',
    () async {
      Future<void> toCollect(String id) async {
        jobs.offersCtl.add(liveOffer(id));
        await pumpEventQueue();
        await session().acceptRequest();
        await session().arrivedAtPickup();
        await session().startTrip(otp: '1234');
        await session().endRide();
        expect(state().phase, JobPhase.collect);
      }

      await session().goOnline();
      await toCollect('t1');
      jobs.paymentError = const OfflineException();
      await expectLater(session().collectPayment(PaymentMode.upi), throwsA(isA<OfflineException>()));
      expect(state().job?.id, 't1');
      expect(state().phase, JobPhase.collect);
      expect(state().todayRides, 0);
      await session().collectPayment(PaymentMode.upi);
      expect(state().job, isNull);
      expect(state().todayRides, 1);
      expect(jobs.calls.where((c) => c.startsWith('payment:')), ['payment:upi', 'payment:upi']);

      // The server refuses (the trip changed meanwhile): nothing to retry, the driver is back online.
      await toCollect('t2');
      jobs.paymentError = const ApiException(400, 'End the trip before collecting the payment');
      await session().collectPayment(PaymentMode.cash);
      expect(state().job, isNull);
      expect(state().online, isTrue);
      expect(state().todayRides, 2);
    },
  );

  test(
    'GPS fixes move the marker and go up over the socket (throttled)',
    () async {
      await session().goOnline();
      final next = offsetPoint(kHere, 50, 0);
      locator.fixes.add(GpsFix(next, at: DateTime.now()));
      await pumpEventQueue();
      expect(session().vehicle.value?.position, next);
      expect(realtime.sent, [next]);
      // A second fix right away is not uploaded.
      locator.fixes.add(GpsFix(offsetPoint(next, 5, 0), at: DateTime.now()));
      await pumpEventQueue();
      expect(realtime.sent, hasLength(1));
    },
  );

  test(
    'fixes carry time, accuracy, speed, heading and the mock flag',
    () async {
      await session().goOnline();
      final at = DateTime.fromMillisecondsSinceEpoch(1800000000000);
      locator.fixes.add(
        GpsFix(
          offsetPoint(kHere, 50, 0),
          at: at,
          accuracy: 6.44,
          speed: 7.5,
          heading: 92.26,
          isMocked: true,
        ),
      );
      await pumpEventQueue();
      expect(realtime.payloads.single, {
        'lat': realtime.sent.single.latitude,
        'lng': realtime.sent.single.longitude,
        'ts': 1800000000000,
        'acc': 6.4,
        'spd': 7.5,
        'hdg': 92.3,
        'mock': true,
      });
    },
  );

  test(
    'socket down: fixes are buffered, then flushed as one batch on reconnect (kept if the flush fails)',
    () async {
      await session().goOnline();
      realtime.connected = false;
      final next = offsetPoint(kHere, 100, 0);
      locator.fixes.add(GpsFix(next, at: DateTime.now(), accuracy: 5));
      await pumpEventQueue();
      expect(
        realtime.sent,
        isEmpty,
        reason: 'nothing goes up while the socket is down',
      );

      realtime.batchAck = false;
      realtime.connected = true;
      realtime.connectionCtl.add(true);
      await pumpEventQueue();
      expect(realtime.batches, hasLength(1));
      expect(realtime.batches.single.single, containsPair('acc', 5.0));

      realtime.batchAck = true;
      realtime.connectionCtl.add(true);
      await pumpEventQueue();
      expect(realtime.batches, hasLength(2));
      expect(
        realtime.batches.last,
        hasLength(1),
        reason: 'a failed flush keeps the fixes for the next one',
      );
      expect(realtime.batches.last.single['lat'], next.latitude);
      expect(realtime.sent, isEmpty);

      realtime.connectionCtl.add(true);
      await pumpEventQueue();
      expect(
        realtime.batches,
        hasLength(2),
        reason: 'the buffer is empty after a flush the server took',
      );
    },
  );

  test(
    'GPS lost while Location is on: Fix now restarts the stream and a fresh fix clears the banner',
    () async {
      await session().goOnline();
      expect(locator.gpsListens, 1);
      locator.currentFixCalls = 0;
      session().restartGps();
      await pumpEventQueue();
      expect(
        locator.gpsListens,
        2,
        reason: 'the GPS stream is subscribed again',
      );
      expect(
        locator.currentFixCalls,
        1,
        reason: 'a one-shot fix does not wait for the stream',
      );
      expect(state().gpsLost, isFalse);
      // The restarted stream keeps delivering.
      final next = offsetPoint(kHere, 80, 0);
      locator.fixes.add(GpsFix(next, at: DateTime.now()));
      await pumpEventQueue();
      expect(session().vehicle.value?.position, next);
    },
  );

  test('decline and timeout clear the card; a declined trip comes back only with more money, a timed-out one can be '
      're-offered', () async {
    await session().goOnline();
    jobs.offersCtl.add(liveOffer('t1'));
    await pumpEventQueue();
    session().declineRequest();
    expect(state().incoming, isNull);
    await pumpEventQueue();
    expect(jobs.calls.last, 'decline');
    jobs.offersCtl.add(liveOffer('t1'));
    await pumpEventQueue();
    expect(state().incoming, isNull, reason: 'declined: the same offer is not shown again');
    // The rider added extra: the server offers it to everyone again, this driver included.
    jobs.offersCtl.add(liveOffer('t1', fare: Seed.rideRequest.fare + 20));
    await pumpEventQueue();
    expect(state().incoming?.id, 't1');
    expect(state().incoming?.fare, Seed.rideRequest.fare + 20);
    session().declineRequest();
    await pumpEventQueue();

    jobs.offersCtl.add(liveOffer('t2'));
    await pumpEventQueue();
    session().requestTimedOut();
    expect(state().missedRequest, isTrue);
    expect(state().incoming, isNull);
    // Dispatch re-offers a timed-out trip to the same driver when nobody else is around.
    jobs.offersCtl.add(liveOffer('t2'));
    await pumpEventQueue();
    expect(state().incoming?.id, 't2');
  });

  test('accepting a request someone else took clears it with a clear message', () async {
    await session().goOnline();
    jobs.acceptError = const ApiException(409, 'Trip is not open');
    jobs.offersCtl.add(liveOffer('t1'));
    await pumpEventQueue();
    await expectLater(
      session().acceptRequest(),
      throwsA(isA<ApiException>().having((e) => e.message, 'message', 'This request is no longer available')),
    );
    expect(state().incoming, isNull);
    expect(state().job, isNull);
  });

  test('the passenger cancelling ends the job with a notice', () async {
    await session().goOnline();
    jobs.offersCtl.add(liveOffer('t1'));
    await pumpEventQueue();
    await session().acceptRequest();
    jobs.updatesCtl.add(liveUpdate('t1', 'CANCELLED'));
    await pumpEventQueue();
    expect(state().job, isNull);
    expect(state().phase, JobPhase.none);
    expect(state().notice?.jobEnded, isTrue);
    expect(state().notice?.message, 'Priya cancelled the ride');
  });

  test('the server giving the ride to another driver ends the job with its own notice', () async {
    await session().goOnline();
    jobs.offersCtl.add(liveOffer('t1'));
    await pumpEventQueue();
    await session().acceptRequest();
    jobs.nudgesCtl.add(const TripNudge(tripId: 't1', kind: 'NOT_MOVING', title: 'Are you on the way?', message: 'Please head to the pickup'));
    await pumpEventQueue();
    expect(state().job, isNotNull);
    expect(state().notice?.message, 'Are you on the way? Please head to the pickup');
    jobs.updatesCtl.add(liveUpdate('t1', 'SEARCHING'));
    await pumpEventQueue();
    expect(state().job, isNull);
    expect(state().notice?.message, contains('went to another driver'));
  });

  test('a system cancel (never started) says so', () async {
    await session().goOnline();
    jobs.offersCtl.add(liveOffer('t1'));
    await pumpEventQueue();
    await session().acceptRequest();
    jobs.updatesCtl.add(liveUpdate('t1', 'CANCELLED', extra: {'cancelledBy': 'SYSTEM', 'cancelCode': 'STUCK'}));
    await pumpEventQueue();
    expect(state().notice?.message, "The ride didn't start in time, so it was cancelled");
  });

  test('arriving stores when a no-show cancel is allowed', () async {
    await session().goOnline();
    jobs.offersCtl.add(liveOffer('t1'));
    await pumpEventQueue();
    await session().acceptRequest();
    await session().arrivedAtPickup();
    expect(state().noShowAt, isNotNull);
    expect(state().noShowAt!.difference(DateTime.now()).inSeconds, greaterThan(200));
  });

  test('after a cancel the job steps refuse instead of carrying on without a job', () async {
    await session().goOnline();
    jobs.offersCtl.add(liveOffer('t1'));
    await pumpEventQueue();
    await session().acceptRequest();
    jobs.updatesCtl.add(liveUpdate('t1', 'CANCELLED'));
    await pumpEventQueue();
    final gone = throwsA(isA<ApiException>().having((e) => e.message, 'message', 'This trip was cancelled'));
    await expectLater(session().arrivedAtPickup(), gone);
    await expectLater(session().startTrip(otp: '1234'), gone);
    await expectLater(session().endRide(), gone);
    await expectLater(session().completeDelivery(otp: '1234'), gone);
    expect(jobs.calls.where((c) => c.startsWith('start') || c.startsWith('complete') || c.startsWith('arrived')), isEmpty);
  });

  testWidgets('requests arriving one after another join the same request screen', (tester) async {
    final m = tester.binding.defaultBinaryMessenger;
    m.setMockMethodCallHandler(const MethodChannel('x-slayer/overlay_channel'), (_) async => null);
    m.setMockMessageHandler('x-slayer/overlay_messenger', (_) async => null);
    final router = GoRouter(initialLocation: '/home', routes: [
      GoRoute(path: '/home', builder: (_, _) => const Text('Home screen')),
      GoRoute(path: '/driver/request', builder: (_, _) => const D15RideRequestScreen()),
    ]);
    LiveOffer offer(String id, int fare) =>
        LiveOffer(Seed.rideRequest.copyWith(id: id, fare: fare, customerName: 'Rider $id', otp: ''), 30);
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: TtDriverApp(router: router)));
    await tester.runAsync(() async {
      await session().goOnline();
      jobs.offersCtl.add(offer('t1', 232));
      await pumpEventQueue();
    });
    router.push('/driver/request');
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(find.text('New ride request'), findsOneWidget);
    final screen = tester.state(find.byType(D15RideRequestScreen));

    // A few seconds later a second one arrives: same screen, now a list of two.
    await tester.pump(const Duration(seconds: 3));
    jobs.offersCtl.add(offer('t2', 253));
    await tester.pump();
    await tester.pump();
    expect(find.text('2 ride requests'), findsOneWidget);
    expect(find.text('₹232'), findsWidgets);
    expect(find.text('₹253'), findsWidgets);
    expect(identical(tester.state(find.byType(D15RideRequestScreen)), screen), isTrue, reason: 'not a new screen');

    // A third, then the driver declines one: still the same screen.
    jobs.offersCtl.add(offer('t3', 217));
    await tester.pump();
    await tester.pump();
    expect(find.text('3 ride requests'), findsOneWidget);
    await tester.tap(find.bySemanticsLabel('Decline ₹253 request'));
    await tester.pump();
    await tester.pump();
    expect(find.text('2 ride requests'), findsOneWidget);
    expect(identical(tester.state(find.byType(D15RideRequestScreen)), screen), isTrue);
    expect(jobs.calls, contains('decline'));

    await tester.runAsync(() => session().goOffline());
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 40));
  });

  testWidgets('Go To / Stay In can be changed on the request screen; the sheet closes with the requests', (tester) async {
    final m = tester.binding.defaultBinaryMessenger;
    m.setMockMethodCallHandler(const MethodChannel('x-slayer/overlay_channel'), (_) async => null);
    m.setMockMessageHandler('x-slayer/overlay_messenger', (_) async => null);
    const home = SavedArea(name: 'Home', location: LatLng(11.08, 77));
    jobs.prefs = const BookingPrefs(areas: [home]).goingTo(home);
    final router = GoRouter(initialLocation: '/home', routes: [
      GoRoute(path: '/home', builder: (_, _) => const Text('Home screen')),
      GoRoute(path: '/driver/request', builder: (_, _) => const D15RideRequestScreen()),
    ]);
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: TtDriverApp(router: router)));
    await tester.runAsync(() async {
      await session().goOnline();
      jobs.offersCtl.add(liveOffer('t1'));
      await pumpEventQueue();
    });
    router.push('/driver/request');
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    // What is on is at the top of the requests, and opens the Go To / Stay In sheet.
    expect(find.text('Change'), findsOneWidget);
    await tester.tap(find.bySemanticsLabel(RegExp('^Towards Home')));
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(find.text('Where do you want trips?'), findsOneWidget);

    // The request is withdrawn while the sheet is up: sheet and request screen both go.
    jobs.closedCtl.add('t1');
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(find.text('Where do you want trips?'), findsNothing);
    expect(find.text('Home screen'), findsOneWidget);

    await tester.runAsync(() => session().goOffline());
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 40));
  });

  testWidgets('the passenger cancelling closes the job screens and returns Home', (tester) async {
    // The overlay plugin's channels answer nothing (no bubble in tests).
    final m = tester.binding.defaultBinaryMessenger;
    m.setMockMethodCallHandler(const MethodChannel('x-slayer/overlay_channel'), (_) async => null);
    m.setMockMessageHandler('x-slayer/overlay_messenger', (_) async => null);
    final router = GoRouter(initialLocation: '/home', routes: [
      GoRoute(path: '/home', builder: (_, _) => const Text('Home screen')),
      GoRoute(path: '/driver/pickup', builder: (_, _) => const Text('Pickup screen')),
    ]);
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: TtDriverApp(router: router)));
    await tester.runAsync(() async {
      await session().goOnline();
      jobs.offersCtl.add(liveOffer('t1'));
      await pumpEventQueue();
      await session().acceptRequest();
    });
    // Job screens are pushed over Home, like the app does (the router's path stays /home).
    router.push('/driver/pickup');
    await tester.pumpAndSettle();
    expect(find.text('Pickup screen'), findsOneWidget);

    jobs.updatesCtl.add(liveUpdate('t1', 'CANCELLED'));
    await tester.pump();
    await tester.pumpAndSettle();
    expect(find.text('Pickup screen'), findsNothing);
    expect(find.text('Home screen'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 10));
  });

  test('the driver cancelling calls the API with the reason', () async {
    await session().goOnline();
    jobs.offersCtl.add(liveOffer('t1'));
    await pumpEventQueue();
    await session().acceptRequest();
    await session().cancelJob(code: CancelCode.vehicleIssue);
    expect(state().job, isNull);
    expect(jobs.calls.last, 'cancel:VEHICLE_ISSUE');
  });

  test('a lost accept answer: the server did assign the trip, so the job carries on', () async {
    await session().goOnline();
    jobs.offersCtl.add(liveOffer('t1'));
    await pumpEventQueue();
    jobs.acceptAssignsThenFails = true;
    await session().acceptRequest();
    expect(state().job?.id, 't1');
    expect(state().phase, JobPhase.toPickup);
    expect(state().incoming, isNull);
  });

  test('a lost accept answer for a trip that went elsewhere still fails', () async {
    await session().goOnline();
    jobs.offersCtl.add(liveOffer('t1'));
    await pumpEventQueue();
    jobs.acceptError = const OfflineException();
    await expectLater(session().acceptRequest(), throwsA(isA<OfflineException>()));
    expect(state().job, isNull);
  });

  test('a job step refused because the trip was cancelled meanwhile ends the job', () async {
    await session().goOnline();
    jobs.offersCtl.add(liveOffer('t1'));
    await pumpEventQueue();
    await session().acceptRequest();
    // The passenger cancelled while the socket was down: the server no longer has this job for the driver.
    jobs.current = null;
    jobs.tooFar = false;
    final before = jobs.activeChecks;
    await expectLater(session().startTrip(otp: '0000'), throwsA(isA<ApiException>()));
    await pumpEventQueue();
    expect(jobs.activeChecks, greaterThan(before));
    expect(state().job, isNull);
    expect(state().notice?.jobEnded, isTrue);
  });

  test("the driver's own cancel refused with 404 (already gone) ends the job; a lost one checks with the server", () async {
    await session().goOnline();
    jobs.offersCtl.add(liveOffer('t1'));
    await pumpEventQueue();
    await session().acceptRequest();
    jobs.cancelError = const ApiException(404, 'Trip not found');
    await session().cancelJob(code: CancelCode.vehicleIssue);
    expect(state().job, isNull);

    jobs.offersCtl.add(liveOffer('t2'));
    await pumpEventQueue();
    await session().acceptRequest();
    jobs
      ..cancelError = const OfflineException()
      ..current = null; // The cancel went through; only its answer was lost.
    await expectLater(session().cancelJob(code: CancelCode.vehicleIssue), throwsA(isA<OfflineException>()));
    await pumpEventQueue();
    expect(state().job, isNull);
  });

  test('going offline stops offers and tells the API', () async {
    await session().goOnline();
    await session().goOffline();
    expect(state().online, isFalse);
    expect(jobs.calls.last, 'offline');
    jobs.offersCtl.add(liveOffer('t1'));
    await pumpEventQueue();
    expect(state().incoming, isNull);
  });

  group('too far from the stop', () {
    Future<void> onJob() async {
      await session().goOnline();
      jobs.offersCtl.add(liveOffer('t1'));
      await pumpEventQueue();
      await session().acceptRequest();
    }

    test('arrived: sends the GPS fix; TOO_FAR keeps the phase until a reason is given', () async {
      await onJob();
      jobs.tooFar = true;
      await expectLater(
        session().arrivedAtPickup(),
        throwsA(isA<ApiException>()
            .having((e) => e.tooFar?.stop, 'stop', 'pickup')
            .having((e) => e.tooFar?.distanceM, 'distance', 850)
            .having((e) => e.tooFar?.reasons, 'reasons', ['GPS is wrong', 'Passenger moved'])
            .having((e) => e.message, 'message', "You're 850 m from the pickup point")),
      );
      expect(state().phase, JobPhase.toPickup);
      expect(jobs.positions.last, kHere);

      await session().arrivedAtPickup(farReason: 'Passenger moved');
      expect(state().phase, JobPhase.atPickup);
      expect(jobs.calls.last, 'arrived:Passenger moved');
    });

    test('end ride: TOO_FAR stays in the ride; with a reason it goes to collect', () async {
      await onJob();
      await session().arrivedAtPickup();
      await session().startTrip(otp: '1234');
      jobs.tooFar = true;
      await expectLater(session().endRide(), throwsA(isA<ApiException>().having((e) => e.tooFar?.stop, 'stop', 'drop')));
      expect(state().phase, JobPhase.toDrop);
      await session().endRide(farReason: 'GPS is wrong');
      expect(state().phase, JobPhase.collect);
      expect(jobs.calls.last, 'complete:GPS is wrong');
    });

    test('delivery: a wrong OTP is reported before the distance', () async {
      await onJob();
      jobs.tooFar = true;
      await expectLater(
        session().completeDelivery(otp: '0000'),
        throwsA(isA<ApiException>().having((e) => e.tooFar, 'tooFar', isNull).having((e) => e.status, 'status', 400)),
      );
      await expectLater(
        session().completeDelivery(otp: '5678'),
        throwsA(isA<ApiException>().having((e) => e.tooFar?.distanceM, 'distance', 1200)),
      );
      await session().completeDelivery(otp: '5678', farReason: 'Receiver asked to meet here');
      expect(state().phase, JobPhase.collect);
    });
  });

  test('opening the app never goes online by itself: a stale online state on the API is turned off', () async {
    SharedPreferences.setMockInitialValues({'tamiltaxi.accessToken': 'token', 'tamiltaxi.driverId': 'd1'});
    final api = ApiClient(
      baseUrl: 'http://api.test/v1',
      session: ApiSession(await SharedPreferences.getInstance()),
      client: MockClient((req) async => req.url.path.endsWith('/drivers/me')
          ? http.Response('{"id":"d1","isOnline":true,"status":"APPROVED"}', 200)
          : http.Response('{"total":0,"rides":0,"bars":[],"trips":[]}', 200)),
    );
    final rt = FakeRealtime(api);
    final fakeJobs = FakeJobs(api, rt);
    final c = ProviderContainer(overrides: [
      isLiveApiProvider.overrideWithValue(true),
      apiClientProvider.overrideWithValue(api),
      realtimeProvider.overrideWithValue(rt),
      liveJobsProvider.overrideWithValue(fakeJobs),
      driverLocatorProvider.overrideWithValue(FakeLocator()),
      driverRepositoryProvider.overrideWithValue(ApiDriverRepository(api)),
    ]);
    addTearDown(c.dispose);
    c.listen(driverSessionProvider, (_, _) {});
    await c.read(driverSessionProvider.notifier).attach();
    await pumpEventQueue();
    expect(c.read(driverSessionProvider).online, isFalse);
    expect(fakeJobs.calls, contains('offline'));
    expect(fakeJobs.calls, isNot(contains('online')));
  });

  test('offline, the car shows the real position (last known, then the preview stream) and nothing is uploaded', () async {
    await session().locateHere();
    await pumpEventQueue();
    expect(container.read(locationAccessProvider), LocationAccess.granted);
    expect(locator.asked, 1);
    expect(session().vehicle.value?.position, offsetPoint(kHere, 300, 90), reason: 'the last known fix shows at once');
    locator.previewFixes.add(GpsFix(kHere, at: DateTime.now()));
    await pumpEventQueue();
    expect(session().vehicle.value?.position, kHere, reason: 'the offline preview stream keeps it current');
    expect(state().online, isFalse);
    expect(realtime.sent, isEmpty);
    expect(jobs.calls, isNot(contains('online')));
  });

  test('location not allowed: the banner state is set and no position is made up', () async {
    locator.accessResult = LocationAccess.deniedForever;
    await session().locateHere();
    await pumpEventQueue();
    expect(container.read(locationAccessProvider), LocationAccess.deniedForever);
    expect(session().vehicle.value, isNull, reason: 'no Gandhipuram placeholder in live mode');
  });

  test('approximate location only: the car shows offline, going online asks for the precise location', () async {
    locator.accessResult = LocationAccess.approximate;
    await session().locateHere();
    await pumpEventQueue();
    expect(container.read(locationAccessProvider), LocationAccess.approximate);
    expect(session().vehicle.value, isNotNull, reason: 'approximate is enough for the offline car');
    locator.problem = const LocationProblem('Turn on "Use precise location"', fix: LocationFix.appSettings);
    await expectLater(session().goOnline(), throwsA(isA<LocationProblem>()),
        reason: 'checked even with a recent offline fix');
    expect(state().online, isFalse);
  });

  test('indoors: a recent offline position is enough to go online (no waiting for a fresh GPS fix)', () async {
    await session().locateHere();
    await pumpEventQueue();
    locator.currentFixCalls = 0;
    await session().goOnline();
    expect(state().online, isTrue);
    expect(locator.currentFixCalls, 0);
    expect(jobs.calls, contains('online'));
  });
}
