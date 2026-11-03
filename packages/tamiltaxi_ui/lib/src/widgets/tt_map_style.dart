/// Light Google map style matching the Tamil Taxi design: land #EEF0F3, white roads, water #D5E5F1,
/// parks #DDEBD8, muted labels, no POI / transit clutter. Built-up areas and buildings (`landscape.man_made`) are not
/// drawn: on Android they came out dark grey at mid zoom (about 12–15, where Google draws towns as areas), though
/// styled #EAECF0, so a route across Coimbatore showed dark patches (3 Nov 2026).
const ttGoogleMapStyle = '''
[
  {"elementType": "geometry", "stylers": [{"color": "#eef0f3"}]},
  {"elementType": "labels.icon", "stylers": [{"visibility": "off"}]},
  {"elementType": "labels.text.fill", "stylers": [{"color": "#64748b"}]},
  {"elementType": "labels.text.stroke", "stylers": [{"color": "#ffffff"}, {"weight": 3}]},
  {"featureType": "administrative", "elementType": "geometry", "stylers": [{"visibility": "off"}]},
  {"featureType": "administrative.land_parcel", "stylers": [{"visibility": "off"}]},
  {"featureType": "administrative.neighborhood", "elementType": "labels.text.fill", "stylers": [{"color": "#94a3b8"}]},
  {"featureType": "landscape.man_made", "elementType": "geometry", "stylers": [{"visibility": "off"}]},
  {"featureType": "poi", "stylers": [{"visibility": "off"}]},
  {"featureType": "poi.park", "stylers": [{"visibility": "on"}]},
  {"featureType": "poi.park", "elementType": "geometry", "stylers": [{"color": "#ddebd8"}]},
  {"featureType": "poi.park", "elementType": "labels", "stylers": [{"visibility": "off"}]},
  {"featureType": "road", "elementType": "geometry.fill", "stylers": [{"color": "#ffffff"}]},
  {"featureType": "road", "elementType": "geometry.stroke", "stylers": [{"color": "#e2e8f0"}]},
  {"featureType": "road.local", "elementType": "labels", "stylers": [{"visibility": "off"}]},
  {"featureType": "road.arterial", "elementType": "labels.text.fill", "stylers": [{"color": "#94a3b8"}]},
  {"featureType": "road.highway", "elementType": "geometry.fill", "stylers": [{"color": "#ffffff"}]},
  {"featureType": "road.highway", "elementType": "geometry.stroke", "stylers": [{"color": "#dbe1e8"}]},
  {"featureType": "transit", "stylers": [{"visibility": "off"}]},
  {"featureType": "water", "elementType": "geometry", "stylers": [{"color": "#d5e5f1"}]},
  {"featureType": "water", "elementType": "labels", "stylers": [{"visibility": "off"}]}
]
''';
