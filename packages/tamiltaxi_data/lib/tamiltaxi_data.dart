/// Tamil Taxi models, the API client and repositories, seed data, fare engine, mock repositories and the trip simulator.
library;

export 'package:latlong2/latlong.dart' show LatLng;

export 'src/api/api_client.dart';
export 'src/api/api_config.dart';
export 'src/api/api_mappers.dart'
    show
        apiPhone,
        parcelFromJson,
        enumToApi,
        rideRequestFromOffer,
        rideRequestFromTrip,
        shiftingQuoteFromJson,
        tripFromJson,
        vehicleKindFromApi,
        womenDriverFromApi;
export 'src/api/api_repositories.dart';
export 'src/api/app_config.dart';
export 'src/api/demand_map.dart';
export 'src/api/live_services.dart';
export 'src/api/push.dart';
export 'src/api/realtime_client.dart';
export 'src/api/safety.dart';
export 'src/api/service_cities.dart';
export 'src/demo_settings.dart';
export 'src/fare_engine.dart';
export 'src/geo/hex_grid.dart';
export 'src/goods_modes.dart';
export 'src/identity/identity.dart';
export 'src/maps/google_http.dart' show GoogleApiException;
export 'src/maps/google_maps_config.dart';
export 'src/maps/google_places_client.dart';
export 'src/maps/polyline_codec.dart';
export 'src/mock/mock_database.dart';
export 'src/mock/mock_repositories.dart';
export 'src/models/booking_prefs.dart';
export 'src/models/cancellation.dart';
export 'src/models/driver.dart';
export 'src/models/driver_fix.dart';
export 'src/models/people.dart';
export 'src/models/place.dart';
export 'src/models/trip.dart';
export 'src/models/vehicle.dart';
export 'src/pricing.dart';
export 'src/rate_card.dart';
export 'src/providers.dart';
export 'src/repositories/repositories.dart';
export 'src/ride_modes.dart';
export 'src/seed.dart';
export 'src/simulation/trip_simulator.dart';
export 'src/simulation/vehicle_glide.dart';
export 'src/simulation/road_router.dart';
