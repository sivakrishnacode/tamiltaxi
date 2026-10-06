import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';

void main() {
  test('parses GET /app-config: the plans switch and the support number', () {
    final c = AppConfig.fromJson({'driverPlansEnabled': true, 'supportPhone': ' +91 422 111 2222 '});
    expect(c.driverPlansEnabled, isTrue);
    expect(c.supportPhone, '+91 422 111 2222');
    expect(AppConfig.fromJson(const {}).driverPlansEnabled, isFalse, reason: 'plans stay off unless the server says so');
  });

  test('the dispatch lead and the support number come from the server; none is made up', () {
    final c = AppConfig.fromJson({'scheduledDispatchLeadMin': 45, 'supportPhone': '+91 98430 12345'});
    expect(c.scheduledDispatchLeadMin, 45);
    expect(c.hasSupportPhone, isTrue);
    final old = AppConfig.fromJson(const {});
    expect(old.scheduledDispatchLeadMin, 30, reason: 'older servers: the default lead');
    expect(old.supportPhone, isEmpty);
    expect(old.hasSupportPhone, isFalse);
    expect(AppConfig.fallback.hasSupportPhone, isFalse, reason: 'no fake number when the API is unreachable');
  });

  testWidgets('a failed app config or city list is fetched again, not kept for the session', (tester) async {
    final calls = <String, int>{};
    SharedPreferences.setMockInitialValues({});
    final session = await ApiSession.load();
    final api = ApiClient(
      baseUrl: 'http://api.test/v1',
      session: session,
      client: MockClient((req) async {
        // Each path fails twice (the request and its one retry): offline at first.
        final n = calls[req.url.path] = (calls[req.url.path] ?? 0) + 1;
        if (n <= 2) throw http.ClientException('no network');
        return req.url.path.endsWith('/cities')
            ? http.Response('[{"id":"c1","name":"Madurai","state":"Tamil Nadu","centerLat":9.93,"centerLng":78.12}]', 200)
            : http.Response('{"supportPhone":"+91 98430 12345","scheduledDispatchLeadMin":40}', 200);
      }),
    );
    final container = ProviderContainer(overrides: [isLiveApiProvider.overrideWithValue(true), apiClientProvider.overrideWithValue(api)]);
    Future<void> settle() async {
      for (var i = 0; i < 3; i++) {
        await tester.pump(const Duration(milliseconds: 10));
      }
    }

    container.listen(appConfigProvider, (_, _) {});
    await settle();
    expect(container.read(appConfigProvider).value?.hasSupportPhone, isFalse, reason: 'offline: the fallback');
    await tester.pump(const Duration(seconds: 30));
    await settle();
    expect(container.read(appConfigProvider).value?.supportPhone, '+91 98430 12345');
    expect(container.read(dispatchLeadMinProvider), 40);

    container.listen(serviceCitiesProvider, (_, _) {});
    await settle();
    expect(container.read(serviceCitiesProvider).value, isEmpty);
    await tester.pump(const Duration(seconds: 30));
    await settle();
    expect(container.read(serviceCitiesProvider).value?.single.name, 'Madurai');
    container.dispose();
  });
}
