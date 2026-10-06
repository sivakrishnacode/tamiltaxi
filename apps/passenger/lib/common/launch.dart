import 'package:flutter/material.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

/// Phone calls, SMS, WhatsApp and the system share sheet (url_launcher / share_plus). Each shows a snack
/// instead of failing when the phone has no app for it.

/// Dials [phone] in the phone app (the passenger presses call; no CALL_PHONE permission needed).
Future<void> callNumber(BuildContext context, String phone, {String? name}) async {
  final digits = phone.replaceAll(RegExp(r'[^\d+]'), '');
  if (digits.isEmpty) {
    showTtSnack(context, name == null ? 'No phone number available' : "$name's number isn't available");
    return;
  }
  await _open(context, Uri(scheme: 'tel', path: digits), 'Could not open the phone app');
}

/// Opens the SMS app with [body], addressed to [to] when given.
Future<void> openSms(BuildContext context, String body, {String? to}) async {
  final number = (to ?? '').replaceAll(RegExp(r'[^\d+]'), '');
  // Encoded by hand: Uri(queryParameters:) writes spaces as "+", which some SMS apps show literally.
  final uri = Uri.parse('sms:$number?body=${Uri.encodeComponent(body)}');
  await _open(context, uri, 'Could not open messages');
}

/// Opens WhatsApp's "send to…" picker with [text] (falls back to the browser's wa.me page).
Future<void> openWhatsApp(BuildContext context, String text) async {
  final uri = Uri.parse('https://wa.me/?text=${Uri.encodeComponent(text)}');
  await _open(context, uri, 'WhatsApp is not installed');
}

/// Opens a WhatsApp chat with [phone] (support), [text] typed in.
Future<void> openWhatsAppTo(
  BuildContext context,
  String phone,
  String text,
) async {
  var digits = phone.replaceAll(RegExp(r'\D'), '');
  if (digits.length == 10) digits = '91$digits';
  final uri = Uri.parse(
    'https://wa.me/$digits?text=${Uri.encodeComponent(text)}',
  );
  await _open(context, uri, 'WhatsApp is not installed');
}

/// Opens [uri] in the browser or the app that handles it (the Play Store listing).
Future<void> openLink(BuildContext context, Uri uri) =>
    _open(context, uri, 'Could not open the link');

/// The system share sheet ("More").
Future<void> shareText(
  BuildContext context,
  String text, {
  String? subject,
}) async {
  try {
    await SharePlus.instance.share(ShareParams(text: text, subject: subject));
  } catch (_) {
    if (context.mounted) showTtSnack(context, 'Could not open share options');
  }
}

Future<void> _open(BuildContext context, Uri uri, String failure) async {
  var ok = false;
  try {
    ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
  } catch (_) {
    ok = false;
  }
  if (!ok && context.mounted) showTtSnack(context, failure);
}

/// Text for "Share trip": who is driving (name, plate, vehicle), where to, and where the vehicle is now.
String tripShareText({
  required String riderName,
  required DriverProfile driver,
  required String vehicleLabel,
  required Place drop,
  LatLng? vehicleAt,
  String? status,
  bool parcel = false,
}) {
  final vehicle = [driver.vehicleColor, driver.vehicleModel].where((s) => s.trim().isNotEmpty).join(' ');
  final lines = [
    parcel ? "$riderName's Tamil Taxi parcel to ${drop.name}" : "$riderName's Tamil Taxi ride to ${drop.name}",
    'Driver: ${driver.name}',
    'Vehicle: ${vehicle.isEmpty ? vehicleLabel : '$vehicle ($vehicleLabel)'} · ${driver.plate}',
    if (drop.address.isNotEmpty) 'Drop: ${drop.address}',
    ?status,
    if (vehicleAt != null)
      'Now at: https://maps.google.com/?q=${vehicleAt.latitude.toStringAsFixed(5)},${vehicleAt.longitude.toStringAsFixed(5)}',
  ];
  return lines.join('\n');
}
