import 'package:flutter/widgets.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';
import 'package:url_launcher/url_launcher.dart';

/// Opens the phone dialer with [phone] (a customer, the emergency contact or 112).
/// Shows a snack when there is no number or no dialer.
Future<void> dialNumber(BuildContext context, String phone, {String? name}) async {
  final number = phone.replaceAll(RegExp(r'[^\d+]'), '');
  if (number.isEmpty) {
    showTtSnack(context, name == null ? 'No phone number' : 'No phone number for $name');
    return;
  }
  var opened = false;
  try {
    opened = await launchUrl(Uri(scheme: 'tel', path: number));
  } catch (_) {
    opened = false;
  }
  if (!opened && context.mounted) showTtSnack(context, 'Could not open the dialer. Call $number');
}

/// Turn-by-turn navigation to [to] in Google Maps (or the browser). The app itself never calls a
/// routing API on a timer.
Future<void> openNavigation(BuildContext context, LatLng to) async {
  final uri = Uri.https('www.google.com', '/maps/dir/', {
    'api': '1',
    'destination': '${to.latitude},${to.longitude}',
    'travelmode': 'driving',
  });
  var opened = false;
  try {
    opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
  } catch (_) {
    opened = false;
  }
  if (!opened && context.mounted) showTtSnack(context, 'Could not open Google Maps');
}

Future<bool> _launch(Uri uri) async {
  try {
    return await launchUrl(uri, mode: LaunchMode.externalApplication);
  } catch (_) {
    return false;
  }
}

/// A WhatsApp chat with [phone] (support), through wa.me so it also works from the browser.
Future<void> openWhatsAppChat(BuildContext context, String phone) async {
  final digits = phone.replaceAll(RegExp(r'\D'), '');
  if (digits.isEmpty) {
    showTtSnack(context, 'No WhatsApp number');
    return;
  }
  final opened = await _launch(Uri.parse('https://wa.me/$digits'));
  if (!opened && context.mounted) showTtSnack(context, 'Could not open WhatsApp. Message $phone');
}

/// WhatsApp's "send to…" picker with [text]; the wa.me page when the app isn't there.
Future<void> shareOnWhatsApp(BuildContext context, String text) async {
  final encoded = Uri.encodeComponent(text);
  var opened = await _launch(Uri.parse('whatsapp://send?text=$encoded'));
  if (!opened) opened = await _launch(Uri.parse('https://wa.me/?text=$encoded'));
  if (!opened && context.mounted) showTtSnack(context, 'WhatsApp is not installed');
}

/// The SMS app with [body], for the driver to pick who to send it to.
Future<void> shareBySms(BuildContext context, String body) async {
  // Encoded by hand: Uri(queryParameters:) writes spaces as "+", which some SMS apps show literally.
  final opened = await _launch(Uri.parse('sms:?body=${Uri.encodeComponent(body)}'));
  if (!opened && context.mounted) showTtSnack(context, 'Could not open Messages');
}
