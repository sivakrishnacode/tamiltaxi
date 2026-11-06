import 'dart:async';

/// Runtime permission prompts, one at a time. Android shows one permission dialog at a time and cancels a request
/// made while another is open: it comes back as "denied" without the user ever seeing it. Both apps ask through
/// this, so the notification prompt after sign-in and Home's location prompt follow each other instead.
abstract final class PermissionPrompts {
  static Future<void> _tail = Future.value();

  /// Runs [ask] once the prompts asked before it are answered (or after [wait], should one never finish).
  static Future<T> run<T>(Future<T> Function() ask, {Duration wait = const Duration(minutes: 2)}) {
    final before = _tail;
    final done = Completer<void>();
    _tail = done.future;
    return before.timeout(wait, onTimeout: () {}).then((_) => ask()).whenComplete(done.complete);
  }
}
