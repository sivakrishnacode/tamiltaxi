import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_driver/state/app_permissions.dart';

class FakeChecker extends AppPermissionChecker {
  final granted = <AppPermission>{};
  final requested = <AppPermission>[];

  @override
  Future<bool> isGranted(AppPermission p) async => granted.contains(p);

  @override
  Future<void> request(AppPermission p) async => requested.add(p);
}

void main() {
  late FakeChecker checker;
  late ProviderContainer container;

  setUp(() {
    checker = FakeChecker();
    container = ProviderContainer(overrides: [appPermissionCheckerProvider.overrideWithValue(checker)]);
    container.listen(missingPermissionsProvider, (_, _) {});
  });

  tearDown(() => container.dispose());

  List<AppPermission> missing() => container.read(missingPermissionsProvider);
  MissingPermissionsController ctrl() => container.read(missingPermissionsProvider.notifier);

  test('lists every missing permission, most important first', () async {
    checker.granted.add(AppPermission.overlay);
    await ctrl().refresh();
    expect(missing(), [
      AppPermission.location,
      AppPermission.notifications,
      AppPermission.fullScreen,
      AppPermission.battery,
    ]);
  });

  test('stays until allowed: a refused request keeps the banner, allowing it later removes it', () async {
    await ctrl().refresh();
    await ctrl().fix(AppPermission.notifications);
    expect(checker.requested, [AppPermission.notifications]);
    expect(missing(), contains(AppPermission.notifications), reason: 'still refused');
    checker.granted.addAll(AppPermission.values);
    await ctrl().refresh(); // back from settings
    expect(missing(), isEmpty);
  });
}
