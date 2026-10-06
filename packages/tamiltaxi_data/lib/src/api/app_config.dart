import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers.dart';

/// `GET /v1/app-config`: public settings both apps read at start-up.
@immutable
class AppConfig {
  const AppConfig({
    required this.driverPlansEnabled,
    required this.supportPhone,
    this.scheduledDispatchLeadMin = defaultDispatchLeadMin,
  });

  /// Off = the app is free: drivers see no plans and can always go online.
  final bool driverPlansEnabled;

  /// The support line (calls and WhatsApp). Empty when none is set up: the apps then offer no call.
  final String supportPhone;

  /// Minutes before its pickup time that a trip booked for later starts looking for a driver.
  final int scheduledDispatchLeadMin;

  /// The API's default lead, for servers that don't send it.
  static const defaultDispatchLeadMin = 30;

  /// A real support number is set up (not empty).
  bool get hasSupportPhone => supportPhone.replaceAll(RegExp(r'[^0-9]'), '').length >= 8;

  /// Used before the API answers and while it can't be reached: no support number (none is made up).
  static const fallback = AppConfig(driverPlansEnabled: false, supportPhone: '');

  /// Mock mode (seed data, Design gallery): a sample support number.
  static const demo = AppConfig(driverPlansEnabled: false, supportPhone: '+91 422 000 0000');

  factory AppConfig.fromJson(Map<String, dynamic> j) {
    final lead = j['scheduledDispatchLeadMin'];
    return AppConfig(
      driverPlansEnabled: j['driverPlansEnabled'] == true,
      supportPhone: j['supportPhone'] is String ? (j['supportPhone'] as String).trim() : fallback.supportPhone,
      scheduledDispatchLeadMin: lead is num && lead >= 0 ? lead.round() : defaultDispatchLeadMin,
    );
  }
}

/// `GET /app-config` itself. A failure is not kept: it is fetched again with [backgroundRetry].
final _appConfigFetchProvider = FutureProvider<AppConfig>((ref) async {
  final json = await ref.watch(apiClientProvider).get('/app-config');
  return AppConfig.fromJson((json as Map).cast<String, dynamic>());
}, retry: backgroundRetry);

/// Live API: `GET /app-config`, [AppConfig.fallback] while it can't be reached (the next successful fetch replaces it).
/// Mock: [AppConfig.demo].
final appConfigProvider = FutureProvider<AppConfig>((ref) async {
  if (!ref.watch(isLiveApiProvider)) return AppConfig.demo;
  final fetched = ref.watch(_appConfigFetchProvider);
  if (fetched case AsyncData(:final value)) return value;
  if (fetched.hasError) {
    // Failing (and being fetched again in the background): the fallback until a fetch works.
    debugPrint('App config unavailable: ${fetched.error}');
    return AppConfig.fallback;
  }
  return ref.watch(_appConfigFetchProvider.future);
});

/// Minutes before its time that a trip booked for later starts finding a driver (the API's, else 30).
final dispatchLeadMinProvider = Provider<int>(
  (ref) => ref.watch(appConfigProvider).value?.scheduledDispatchLeadMin ?? AppConfig.defaultDispatchLeadMin,
);

/// Paid driver plans on? False until the config loads, so plan screens never flash for a free app.
final driverPlansEnabledProvider = Provider<bool>((ref) => ref.watch(appConfigProvider).value?.driverPlansEnabled ?? false);
