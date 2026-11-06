import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';

void main() {
  test('a prompt waits until the one asked before it is answered', () async {
    final notification = Completer<String>();
    final log = <String>[];
    final first = PermissionPrompts.run(() {
      log.add('notifications asked');
      return notification.future;
    });
    final second = PermissionPrompts.run(() async {
      log.add('location asked');
      return 'location';
    });
    await pumpEventQueue();
    expect(log, ['notifications asked']);
    notification.complete('notifications');
    expect(await first, 'notifications');
    expect(await second, 'location');
    expect(log, ['notifications asked', 'location asked']);
  });

  test('a prompt that fails does not hold up the next one', () async {
    final failed = PermissionPrompts.run<String>(() async => throw StateError('no activity'));
    final next = PermissionPrompts.run(() async => 'location');
    await expectLater(failed, throwsStateError);
    expect(await next, 'location');
  });

  test('one that never finishes holds the next only until the wait runs out', () async {
    unawaited(PermissionPrompts.run(() => Completer<void>().future));
    final next = PermissionPrompts.run(() async => 'location', wait: const Duration(milliseconds: 20));
    expect(await next, 'location');
  });
}
