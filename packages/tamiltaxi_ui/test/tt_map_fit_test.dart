import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

void main() {
  setUp(() => TtMap.tilesEnabled = false);

  testWidgets('the camera re-fits when the fit points change (route arrived, next trip phase)', (tester) async {
    TtCamera? last;
    Widget map(List<LatLng> fit) => MaterialApp(
          theme: TtTheme.light(),
          home: SizedBox(
            width: 360,
            height: 640,
            child: TtMap(fitPoints: fit, onPositionChanged: (camera, _) => last = camera),
          ),
        );

    const a = [LatLng(11.00, 76.95), LatLng(11.02, 76.97)];
    const b = [LatLng(11.30, 77.30), LatLng(11.32, 77.32)];
    await tester.pumpWidget(map(a));
    await tester.pumpWidget(map(b));
    await tester.pump();

    expect(last, isNotNull);
    expect(last!.center.latitude, closeTo(11.31, 0.01));
    expect(last!.center.longitude, closeTo(77.31, 0.01));

    // The same points in a fresh list leave the camera alone.
    last = null;
    await tester.pumpWidget(map([...b]));
    await tester.pump();
    expect(last, isNull);
  });

  testWidgets('the controller fits points on demand (an area picked in a list)', (tester) async {
    TtCamera? last;
    final controller = TtMapController();
    addTearDown(controller.dispose);
    await tester.pumpWidget(MaterialApp(
      theme: TtTheme.light(),
      home: SizedBox(
        width: 360,
        height: 640,
        child: TtMap(
          controller: controller,
          fitPoints: const [LatLng(11.00, 76.95), LatLng(11.02, 76.97)],
          onPositionChanged: (camera, _) => last = camera,
        ),
      ),
    ));
    await tester.pump();
    controller.fitTo(const [LatLng(11.30, 77.30), LatLng(11.32, 77.32)]);
    await tester.pump();
    expect(last!.center.latitude, closeTo(11.31, 0.01));
    expect(last!.center.longitude, closeTo(77.31, 0.01));
    controller.fitTo(const [LatLng(11.30, 77.30)]);
    await tester.pump();
    expect(last!.center.latitude, closeTo(11.31, 0.01), reason: 'one point: nothing to fit');
  });
}
