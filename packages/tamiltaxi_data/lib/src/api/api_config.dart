/// Tamil Taxi backend base URL (the `/v1` REST prefix). Override per build:
/// `--dart-define=TT_API_URL=https://api.example.com/v1`.
///
/// Default: the server on AWS over HTTPS (Caddy + Let's Encrypt on the domain). Apps up to 0.1.1 call the older
/// `https://api.65-0-233-253.sslip.io/v1`, which the server still serves. Release builds allow HTTPS only
/// (`network_security_config.xml`); the old `http://65.0.233.253:3000/v1` address works only in debug builds.
const String kApiBaseUrl = String.fromEnvironment('TT_API_URL', defaultValue: 'https://api.tamiltaxi.co.in/v1');

/// true (default) = the apps talk to the backend; false = in-app seed data and the trip simulator
/// (design gallery, widget tests, offline demos): `--dart-define=TT_LIVE_API=false`.
const bool kUseLiveApi = bool.fromEnvironment('TT_LIVE_API', defaultValue: true);
