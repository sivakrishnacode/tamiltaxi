import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';

const _distance = Distance();
double _m(LatLng a, LatLng b) => _distance.as(LengthUnit.Meter, a, b);

void main() {
  // A road going east 1 km, then north 1 km (an L), like a leg to the pickup.
  const start = LatLng(11.0, 76.95);
  final corner = offsetPoint(start, 1000, 90);
  final end = offsetPoint(corner, 1000, 0);
  final road = [start, corner, end];

  late DateTime now;
  late VehicleGlide glide;

  setUp(() {
    now = DateTime(2026, 10, 6, 9);
    glide = VehicleGlide(autoTick: false, now: () => now);
  });
  tearDown(() => glide.dispose());

  void wait(int ms) => now = now.add(Duration(milliseconds: ms));

  group('PathRuler', () {
    final ruler = PathRuler(road);

    test('measures, projects and places points along the road', () {
      expect(ruler.length, closeTo(2000, 5));
      final p = ruler.project(offsetPoint(start, 400, 90));
      expect(p.along, closeTo(400, 2));
      expect(p.off, lessThan(1));
      // 30 m beside the road still projects onto it, 30 m off.
      final beside = ruler.project(offsetPoint(offsetPoint(start, 400, 90), 30, 0));
      expect(beside.along, closeTo(400, 2));
      expect(beside.off, closeTo(30, 2));
      expect(_m(ruler.pointAt(1500), offsetPoint(corner, 500, 0)), lessThan(2));
    });

    test('heading follows the road; progress is the vertex fraction the screens use', () {
      expect(ruler.headingAt(500), closeTo(90, 0.5));
      expect(ruler.headingAt(1500), closeTo(0, 0.5));
      expect(ruler.progressAt(0), 0);
      expect(ruler.progressAt(1000), closeTo(0.5, 0.01));
      expect(ruler.progressAt(1500), closeTo(0.75, 0.01));
      expect(ruler.progressAt(5000), 1);
    });
  });

  test('the first fix shows at once, on the road', () {
    expect(glide.vehicle.value, isNull);
    glide.addFix(offsetPoint(offsetPoint(start, 200, 90), 15, 180), path: road);
    final fix = glide.vehicle.value!;
    expect(_m(fix.position, offsetPoint(start, 200, 90)), lessThan(2), reason: 'snapped onto the road line');
    expect(fix.heading, closeTo(90, 0.5));
    expect(fix.target, isNotNull);
  });

  test('glides along the road at an even speed over the gap between fixes, round the corner', () {
    glide.addFix(offsetPoint(start, 800, 90), path: road);
    wait(5000);
    // 5 s later: 400 m further, past the corner.
    final next = offsetPoint(corner, 200, 0);
    glide.addFix(next, path: road);
    expect(_m(glide.sample()!.position, offsetPoint(start, 800, 90)), lessThan(2), reason: 'starts where it was shown');
    wait(2500);
    final half = glide.sample()!;
    // Half way along the road (1000 m from the start: the corner), not half way along the straight line.
    expect(_m(half.position, corner), lessThan(3));
    wait(2500);
    expect(_m(glide.sample()!.position, next), lessThan(2));
    expect(glide.sample()!.heading, closeTo(0, 0.5), reason: 'facing up the second street');
  });

  test('keeps going at the last speed for a moment when the next fix is late, then stops', () {
    glide.addFix(offsetPoint(start, 100, 90), path: road);
    wait(5000);
    glide.addFix(offsetPoint(start, 150, 90), path: road); // 10 m/s
    wait(5000);
    expect(glide.sample()!.position.longitude, closeTo(offsetPoint(start, 150, 90).longitude, 1e-5));
    wait(1000);
    expect(_m(glide.sample()!.position, offsetPoint(start, 160, 90)), lessThan(2), reason: 'coasting at 10 m/s');
    wait(10000);
    expect(_m(glide.sample()!.position, offsetPoint(start, 180, 90)), lessThan(2), reason: 'at most 3 s of coasting');
  });

  test('never coasts past the end of the leg (the pickup)', () {
    glide.addFix(offsetPoint(corner, 900, 0), path: road);
    wait(2000);
    glide.addFix(offsetPoint(corner, 990, 0), path: road); // 45 m/s is too fast to trust: no coasting at all
    wait(1000);
    glide.addFix(offsetPoint(corner, 998, 0), path: road);
    wait(20000);
    expect(_m(glide.sample()!.position, end), lessThan(3));
  });

  test('a fix a little behind (it coasted ahead) holds the car instead of sliding it back', () {
    glide.addFix(offsetPoint(start, 100, 90), path: road);
    wait(5000);
    glide.addFix(offsetPoint(start, 200, 90), path: road);
    wait(8000); // glided to 200, coasted to 260
    final ahead = glide.sample()!.position;
    glide.addFix(offsetPoint(start, 240, 90), path: road);
    wait(1000);
    expect(_m(glide.sample()!.position, ahead), lessThan(1));
  });

  test('off the road line it glides straight and faces where the phone says', () {
    glide.addFix(offsetPoint(start, 300, 90), path: road);
    wait(5000);
    final detour = offsetPoint(offsetPoint(start, 400, 90), 200, 180); // 200 m south of the road
    glide.addFix(detour, heading: 160, path: road);
    wait(2500);
    final mid = glide.sample()!;
    final straightMid = LatLng(
      (offsetPoint(start, 300, 90).latitude + detour.latitude) / 2,
      (offsetPoint(start, 300, 90).longitude + detour.longitude) / 2,
    );
    expect(_m(mid.position, straightMid), lessThan(2));
    expect(mid.heading, 160);
  });

  test('no road line yet: straight glides, heading from the movement', () {
    glide.addFix(start);
    wait(4000);
    glide.addFix(offsetPoint(start, 80, 45));
    wait(2000);
    final mid = glide.sample()!;
    expect(_m(mid.position, offsetPoint(start, 40, 45)), lessThan(2));
    expect(mid.heading, closeTo(45, 1));
  });

  test('a jump of more than 1.5 km is shown at once', () {
    glide.addFix(start, path: road);
    wait(5000);
    final far = offsetPoint(start, 3000, 0);
    glide.addFix(far, path: road);
    expect(_m(glide.sample()!.position, far), lessThan(2));
  });

  test('the same fix with the real road line moves the car onto it without restarting the glide', () {
    final guess = [start, end]; // a straight first guess
    glide.addFix(start, path: guess);
    wait(5000);
    final p = offsetPoint(start, 300, 90);
    glide.addFix(p, path: guess);
    wait(1000);
    glide.addFix(p, path: road); // the road path arrived: same fix
    wait(4500);
    final fix = glide.sample()!;
    expect(_m(fix.position, p), lessThan(2));
    expect(fix.progress, closeTo(0.15, 0.01), reason: 'progress is now along the real road (300 m of 2 km, vertex units)');
  });

  test('the icon turns smoothly towards the road, the shortest way round', () {
    glide.addFix(offsetPoint(start, 900, 90), path: road);
    expect(glide.vehicle.value!.heading, closeTo(90, 0.5));
    wait(4000);
    glide.addFix(offsetPoint(corner, 300, 0), path: road);
    wait(3500); // past the corner: the road now points north
    glide.tick();
    final first = glide.vehicle.value!.heading;
    expect(first, inExclusiveRange(1, 89), reason: 'part of the way, not snapped');
    for (var i = 0; i < 20; i++) {
      wait(80);
      glide.tick();
    }
    expect(glide.vehicle.value!.heading, closeTo(0, 1));
  });

  test('clear removes the car; a fix after dispose is ignored', () {
    glide.addFix(start, path: road);
    glide.clear();
    expect(glide.vehicle.value, isNull);
    final other = VehicleGlide(autoTick: false, now: () => now)..dispose();
    other.addFix(start); // no throw
  });
}
