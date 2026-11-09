// Live: a half-registered driver who restarts the app (blank sign-up draft) taps D-07 › Edit. D-06 must start from
// what is saved, and saving the other details must not replace the emergency contact.
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_driver/common/start_route.dart';
import 'package:tamiltaxi_driver/router/routes.dart';
import 'package:tamiltaxi_driver/state/driver_account.dart';

const _json = {'content-type': 'application/json'};

void main() {
  test('Edit after a restart starts from the saved driver; an unchanged contact is kept', () async {
    final calls = <String>[];
    final patches = <String>[];
    final client = MockClient((req) async {
      calls.add('${req.method} ${req.url.path}');
      if (req.method == 'PATCH') patches.add(req.body);
      if (req.method == 'GET' && req.url.path.endsWith('/drivers/me')) {
        return http.Response(
          '{"id":"d1","status":"PENDING","vehicleKind":"AUTO","vehicleModel":"Bajaj RE","vehicleColor":"Green",'
          '"plate":"TN 37 AB 4521","upiId":"selvi@okaxis","cityId":"cbe","user":{"name":"Selvi R","phone":"+919843012345","gender":"FEMALE"}}',
          200,
          headers: _json,
        );
      }
      if (req.method == 'GET' && req.url.path.endsWith('/me')) {
        return http.Response('{"emergencyContacts":[{"id":"c1","name":"Ravi","relation":"Husband","phone":"+919876512345"}]}', 200,
            headers: _json);
      }
      return http.Response(req.method == 'PATCH' ? '{"id":"d1","user":{}}' : '{}', 200, headers: _json);
    });
    SharedPreferences.setMockInitialValues({'tamiltaxi.accessToken': 'token', 'tamiltaxi.driverId': 'd1'});
    final api = ApiClient(baseUrl: 'http://api.test/v1', session: await ApiSession.load(), client: client);
    final c = ProviderContainer(overrides: [
      isLiveApiProvider.overrideWithValue(true),
      apiClientProvider.overrideWithValue(api),
      driverRepositoryProvider.overrideWithValue(ApiDriverRepository(api)),
    ]);
    addTearDown(c.dispose);

    expect(c.read(signupProvider).name, isEmpty, reason: 'a restart starts with a blank draft');
    await c.read(signupProvider.notifier).loadSaved();
    final d = c.read(signupProvider);
    expect(d.name, 'Selvi R');
    expect(d.gender, Gender.female);
    expect(d.vehicle, VehicleKind.auto);
    expect(d.plate, 'TN 37 AB 4521');
    expect(d.upiId, 'selvi@okaxis');
    expect(d.emergencyContact, '+919876512345');
    expect(d.cityId, 'cbe', reason: 'the city saved at sign-up');

    calls.clear();
    c.read(signupProvider.notifier).update((d) => d.copyWith(plate: 'TN 37 AB 4522'));
    await c.read(signupProvider.notifier).commit();
    expect(calls.where((x) => x.startsWith('PATCH')), ['PATCH /v1/drivers/me']);
    expect(calls.where((x) => x.contains('emergency-contacts')), isEmpty, reason: 'the contact is unchanged');
    expect(patches.last, contains('"cityId":"cbe"'), reason: 'the city goes with the details');

    // A city chosen on D-06 goes with them too.
    c.read(signupProvider.notifier).update((d) => d.copyWith(cityId: 'tpr'));
    await c.read(signupProvider.notifier).commit();
    expect(patches.last, contains('"cityId":"tpr"'));
  });

  test('start route: every signed-in driver opens Home (verify banner until approved); a lost session is rethrown',
      () async {
    Future<String> routeFor(String status, {int code = 200}) async {
      final client = MockClient((req) async => http.Response('{"id":"d1","status":"$status"}', code, headers: _json));
      SharedPreferences.setMockInitialValues({'tamiltaxi.accessToken': 'token', 'tamiltaxi.driverId': 'd1'});
      final api = ApiClient(baseUrl: 'http://api.test/v1', session: await ApiSession.load(), client: client);
      return driverStartRoute(ApiDriverRepository(api));
    }

    for (final status in ['APPROVED', 'ON_HOLD', 'PENDING', 'REJECTED']) {
      expect(await routeFor(status), Routes.home, reason: status);
    }
    expect(routeFor('APPROVED', code: 401), throwsA(isA<ApiException>()), reason: 'Splash then opens Welcome');
  });
}
