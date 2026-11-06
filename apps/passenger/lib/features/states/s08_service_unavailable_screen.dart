import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart' show Marker;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../router/routes.dart';

/// S-08 Service not available: the pin is outside every service city.
class S08ServiceUnavailableScreen extends StatelessWidget {
  const S08ServiceUnavailableScreen({super.key, this.showcase = false, this.pin});

  /// Opened on its own from the Design gallery: render seed state, start no timers.
  final bool showcase;

  /// The point that is outside (route `extra`); the demo pin when not given.
  final LatLng? pin;

  @override
  Widget build(BuildContext context) =>
      Scaffold(backgroundColor: TtColors.surface, body: S08ServiceUnavailableView(pin: pin));
}

/// The service-area outline: live, the real H3 outline from the public `/demand/hotspots` (none if it can't be
/// loaded, rather than a made-up area); mock, the demo hex outline.
final _serviceAreaProvider = FutureProvider.autoDispose<List<List<LatLng>>>((ref) async {
  if (!ref.watch(isLiveApiProvider)) return DemandMap.demo().serviceArea;
  try {
    final json = await ref.watch(apiClientProvider).get('/demand/hotspots');
    return DemandMap.fromJson((json as Map).cast<String, dynamic>()).serviceArea;
  } catch (_) {
    return const [];
  }
});

/// The S-08 body (map with the service area + explanation sheet). Also embedded by P-07
/// Home when Demo control "Outside service area" is on.
///
/// "Change location" clears that demo switch, then goes back to where the pin was chosen
/// (or to Home when shown there).
class S08ServiceUnavailableView extends ConsumerWidget {
  const S08ServiceUnavailableView({super.key, this.pin});

  /// The point that is outside; the demo pin when null.
  final LatLng? pin;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.type;
    final pin =
        this.pin ??
        (ref.watch(isLiveApiProvider)
            ? CityDefaults.center
            : Seed.outsideArea.location);
    final cities =
        ref.watch(serviceCitiesProvider).value ?? const <ServiceCity>[];
    // The nearest service city (from the API; the demo city in mock mode).
    final centre = nearestCity(cities, pin)?.center ?? CityDefaults.center;
    final area =
        ref.watch(_serviceAreaProvider).value ?? const <List<LatLng>>[];
    return LayoutBuilder(
      builder: (context, c) {
        const sheetMin = 330.0;
        final mapBottom = (c.maxHeight - sheetMin).clamp(160.0, c.maxHeight);
        return Stack(
          children: [
            Positioned(
              left: 0,
              right: 0,
              top: 0,
              height: mapBottom + TtSpacing.xl,
              child: TtMap(
                center: centre,
                zoom: 10,
                fitPoints: [pin, centre, for (final ring in area) ...ring],
                // The pin's label draws ~70 px above its point: leave room for it below the status bar.
                fitPadding: EdgeInsets.fromLTRB(
                  32,
                  MediaQuery.paddingOf(context).top + 96,
                  32,
                  56,
                ),
                // The service area as its H3 outline (hexes, never a circle).
                polygons: [
                  for (final ring
                      in ref.watch(_serviceAreaProvider).value ??
                          const <List<LatLng>>[])
                    MapPolygon(
                      points: ring,
                      fillColor: TtColors.coral500.withValues(alpha: 0.14),
                      strokeColor: TtColors.coral500.withValues(alpha: 0.6),
                      strokeWidth: 1.5,
                    ),
                ],
                extraMarkers: [
                  Marker(
                    point: centre,
                    width: 200,
                    height: 40,
                    child: MapBadge(
                      look: 'service-area-label',
                      child: Center(
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: TtSpacing.m, vertical: 6),
                          decoration: const BoxDecoration(
                            color: TtColors.surface,
                            borderRadius: TtRadii.pillRadius,
                            boxShadow: TtShadows.soft,
                          ),
                          child: Text(
                            'Tamil Taxi service area',
                            style: t.bodySmallMedium.copyWith(color: TtColors.coral600, fontWeight: FontWeight.w600),
                          ),
                        ),
                      ),
                    ),
                  ),
                  Marker(
                    point: pin,
                    width: 120,
                    height: 100,
                    alignment: Alignment.topCenter,
                    child: MapBadge(
                      look: 'your-pin',
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: TtSpacing.m, vertical: TtSpacing.xs),
                            decoration: const BoxDecoration(
                              color: TtColors.navy900,
                              borderRadius: TtRadii.pillRadius,
                            ),
                            child: Text('Your pin', style: t.bodySmallMedium.copyWith(color: TtColors.surface)),
                          ),
                          const Icon(Symbols.location_on_rounded, fill: 1, size: 44, color: TtColors.navy900),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              top: mapBottom,
              child: DecoratedBox(
                decoration: const BoxDecoration(
                  color: TtColors.surface,
                  borderRadius: TtRadii.sheetTop,
                  boxShadow: TtShadows.raised,
                ),
                child: SafeArea(
                  top: false,
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(TtSpacing.l, 0, TtSpacing.l, TtSpacing.l),
                    child: Column(
                      children: [
                        const SheetHandle(),
                        Container(
                          width: 112,
                          height: 112,
                          decoration: const BoxDecoration(color: TtColors.coral50, shape: BoxShape.circle),
                          child: const Icon(Symbols.wrong_location_rounded, size: 52, color: TtColors.coral500),
                        ),
                        const SizedBox(height: TtSpacing.l),
                        Text("Tamil Taxi isn't in this area yet", style: t.h1, textAlign: TextAlign.center),
                        const SizedBox(height: TtSpacing.s),
                        Text(
                          "We're live in ${ref.watch(serviceCitiesLabelProvider)}. More cities coming soon.",
                          style: t.body.copyWith(color: TtColors.navy700),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: TtSpacing.xl),
                        TtButton(
                          label: 'Change location',
                          onPressed: () {
                            ref
                                .read(demoSettingsProvider.notifier)
                                .update((s) => s.copyWith(outsideServiceArea: false));
                            showTtSnack(context, 'Choose a place inside ${ref.read(serviceCitiesLabelProvider)}');
                            if (context.canPop()) {
                              context.pop();
                            } else {
                              context.go(Routes.ride);
                            }
                          },
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}
