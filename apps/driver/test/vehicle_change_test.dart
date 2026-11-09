// Account › Vehicle details (live): a new number plate asks first, then the driver is back under review on the
// registration page; a plate someone else has is refused clearly; the model needs 2–60 characters.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:tamiltaxi_driver/features/account/vehicle_details_screen.dart';
import 'package:tamiltaxi_driver/features/home/d13_home_screen.dart';
import 'package:tamiltaxi_driver/router/routes.dart';

import 'support/harness.dart';
import 'support/live_fakes.dart';

const _signedIn = {'tamiltaxi.accessToken': 'token', 'tamiltaxi.driverId': 'd1'};

Map<String, Object?> _driver(String plate, String status) => {
      'id': 'd1',
      'status': status,
      'vehicleKind': 'BIKE',
      'vehicleModel': 'Splendor',
      'vehicleColor': 'Black',
      'plate': plate,
      'upiId': 'anbu@okaxis',
      'user': {'name': 'Anbu R', 'phone': '+919843012345'},
    };

http.Response _json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

class _Api {
  String plate = 'TN 37 AB 4521';
  String status = 'APPROVED';
  final patches = <Map<String, dynamic>>[];

  MockClient get client => MockClient((req) async {
        final path = req.url.path;
        if (path == '/v1/drivers/me' && req.method == 'PATCH') {
          final body = jsonDecode(req.body) as Map<String, dynamic>;
          patches.add(body);
          if (body['plate'] == 'TN 38 ZZ 9999') return _json({'message': 'Conflict'}, 409);
          if (body['plate'] != plate) status = 'PENDING';
          plate = body['plate'] as String;
          return _json(_driver(plate, status));
        }
        if (path == '/v1/drivers/me') return _json(_driver(plate, status));
        if (path == '/v1/drivers/me/documents') {
          return _json([
            {'type': 'VEHICLE_RC', 'status': 'NOT_UPLOADED', 'rejectReason': 'Upload the RC of your new vehicle ($plate)'},
          ]);
        }
        if (path == '/v1/me') return _json({'emergencyContacts': []});
        if (path == '/v1/kyc/me') return _json({'isEnabled': false, 'status': 'NOT_STARTED'});
        return _json({'message': 'Not here'}, 404);
      });
}

Future<void> _advance(WidgetTester tester, [Duration total = const Duration(seconds: 1)]) async {
  for (var t = Duration.zero; t < total; t += const Duration(milliseconds: 100)) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

/// The form's fields in order: Model, Colour, Number plate.
Future<void> _type(WidgetTester tester, String label, String text) async {
  final index = const ['Model', 'Colour', 'Number plate'].indexOf(label);
  await tester.enterText(find.byType(TextField).at(index), text);
  await tester.pump();
}

void main() {
  testWidgets('a new plate asks first, then Home (back under review)', (tester) async {
    final api = _Api();
    final rig = await LiveRig.create(prefs: _signedIn, client: api.client);
    final container = await pumpRoute(tester, Routes.vehicleDetails, overrides: rig.overrides);
    await _advance(tester);
    expect(find.byType(VehicleDetailsScreen), findsOneWidget);

    await _type(tester, 'Number plate', 'TN 38 CD 1234');
    await tester.tap(find.text('Save'));
    await _advance(tester);
    expect(find.text('Change the number plate?'), findsOneWidget);
    expect(find.textContaining("You can't go online until an admin verifies it"), findsOneWidget);
    await tester.tap(find.text('Change plate'));
    await _advance(tester, const Duration(seconds: 2));

    expect(api.patches.single['plate'], 'TN 38 CD 1234');
    expect(find.byType(D13HomeScreen), findsOneWidget, reason: "Home, where the verify banner leads to the RC");
    await closeApp(tester, container);
  });

  testWidgets("a plate that's taken says so; a one-letter model is refused before saving", (tester) async {
    final api = _Api();
    final rig = await LiveRig.create(prefs: _signedIn, client: api.client);
    final container = await pumpRoute(tester, Routes.vehicleDetails, overrides: rig.overrides);
    await _advance(tester);

    await _type(tester, 'Model', 'X');
    await tester.tap(find.text('Save'));
    await _advance(tester);
    expect(find.text('Enter the vehicle model (2 to 60 letters)'), findsOneWidget);
    expect(api.patches, isEmpty);

    await _type(tester, 'Model', 'Splendor Plus');
    await _type(tester, 'Number plate', 'TN 38 ZZ 9999');
    await tester.tap(find.text('Save'));
    await _advance(tester);
    await tester.tap(find.text('Change plate'));
    await _advance(tester);
    expect(find.text('This number plate is already registered'), findsOneWidget);
    expect(find.byType(VehicleDetailsScreen), findsOneWidget);
    await closeApp(tester, container);
  });
}
