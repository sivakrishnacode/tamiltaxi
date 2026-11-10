// PlayReview asks Google Play for its review sheet only when Play can show it, and never throws.
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

const _channel = MethodChannel('dev.britannio.in_app_review');

/// Answers the plugin's calls like Play would and records them.
List<String> _play(TestWidgetsFlutterBinding binding, {required bool available, bool fail = false}) {
  final calls = <String>[];
  binding.defaultBinaryMessenger.setMockMethodCallHandler(_channel, (call) async {
    calls.add(call.method);
    if (call.method == 'isAvailable') return available;
    if (fail) throw PlatformException(code: 'error', message: 'Play said no');
    return null;
  });
  addTearDown(() => binding.defaultBinaryMessenger.setMockMethodCallHandler(_channel, null));
  return calls;
}

void main() {
  final binding = TestWidgetsFlutterBinding.ensureInitialized();

  test('Play can show it: asks for the sheet', () async {
    final calls = _play(binding, available: true);
    await PlayReview.ask();
    expect(calls, ['isAvailable', 'requestReview']);
  });

  test('Play unavailable (no Play Store, not installed from Play): asks nothing', () async {
    final calls = _play(binding, available: false);
    await PlayReview.ask();
    expect(calls, ['isAvailable']);
  });

  test('a failing sheet never throws', () async {
    final calls = _play(binding, available: true, fail: true);
    await expectLater(PlayReview.ask(), completes);
    expect(calls, ['isAvailable', 'requestReview']);
  });
}
