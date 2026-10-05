import 'package:flutter/material.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

class _Section {
  const _Section(this.heading, this.body);
  final String heading;
  final String body;
}

// Shorter versions of the website's terms and privacy policy (apps/web/src/lib/legal.ts): keep them in line, with
// the same "Last updated" date (a website test checks it).
const _terms = [
  _Section(
    '1. About Tamil Taxi',
    'Tamil Taxi is a technology platform that connects riders and senders in the cities it serves with independent '
        'drivers of bikes, autos, cabs and goods vehicles, including movers for house shifting (Packers & Movers). '
        'Tamil Taxi does not own vehicles or employ drivers.',
  ),
  _Section(
    '2. Drivers are independent',
    'Every driver on Tamil Taxi is an independent service provider. Tamil Taxi is free for drivers: no subscription, and '
        'they keep 100% of every fare. Tamil Taxi takes 0% commission on rides and deliveries.',
  ),
  _Section(
    '3. Fares',
    'The fare shown before you book is locked at booking, and traffic does not change it. Peak-time pricing is capped '
        'at 1.5x and goes to your driver. Only these are added, each as its own line:\n'
        '• Waiting at the pickup after the free minutes, on city rides and parcels (up to ₹30 a trip).\n'
        '• The km (and, for rentals, the time) past the package on a rental or an outstation round trip.\n'
        '• An extra you choose to add while we look for a driver.\n'
        '• A cancellation fee from an earlier ride, if one applies.',
  ),
  _Section(
    '4. Paying your driver',
    'You pay the driver directly by cash or UPI; Tamil Taxi does not collect fares. Tolls, parking and permits on the '
        'way are yours.',
  ),
  _Section(
    '5. Cancellations',
    'You can cancel a request at any time before the ride starts. Tamil Taxi may switch on a small cancellation fee: '
        'if you cancel after your driver has arrived and waited past the free minutes, it is added to your next ride.',
  ),
  _Section(
    '6. Safety and conduct',
    'Please treat drivers with respect, wear a helmet on bike rides and never carry prohibited items. In an emergency, '
        'use SOS in the app or call 112. Repeated complaints or late cancellations may put an account on hold while '
        'we review them.',
  ),
  _Section(
    '7. Parcels and house moves',
    'You are responsible for what you send or move. Tamil Taxi connects you with drivers and movers and is not liable '
        'for lost or damaged goods. For parcels, loading and unloading is done by the sender and receiver.',
  ),
  _Section(
    '8. Service area',
    'Tamil Taxi operates in the cities shown in the app. Bookings with a pickup outside the service area cannot be made.',
  ),
  _Section(
    '9. Contact',
    'Questions about these terms? Use Help & support in the app or write to support@tamiltaxi.co.in. These terms are '
        'governed by the laws of India, with courts in Coimbatore, Tamil Nadu.',
  ),
];

const _privacy = [
  _Section(
    'What we collect',
    'Your mobile number, name and, if you add them, your email, gender (only if you choose to share it), saved places '
        'and emergency contacts; your trips, parcels and moves; a parcel photo or a support screenshot if you add one; '
        'your messages to Help & support and in the trip chat; and your device location while you book or ride.',
  ),
  _Section(
    'Identity check (optional)',
    'Didit scans your ID and takes a live selfie inside the app. We keep the result, your name and date of birth from '
        'the ID and its last 4 digits, never the full number. A passed check adds a Verified badge.',
  ),
  _Section(
    'How we use it',
    'To find nearby drivers, show your pickup to your driver, calculate fares, share your live trip with '
        'your emergency contacts when you ask us to, and help you if something goes wrong.',
  ),
  _Section(
    'What drivers see',
    'Your name, phone number, pickup and drop, and whether you are verified. Numbers are shared so you and your '
        'driver can call each other about the current trip. Your gender is never shown; if you ask for a woman '
        'driver (Pink Taxi), your driver sees that it is a Pink Taxi ride.',
  ),
  _Section(
    'Sharing',
    'We do not sell your data. We share it only with your driver for the current trip, with your emergency contacts '
        'when you share a trip or use SOS, with the police or emergency services when a safety incident needs it, with '
        'the services that run the app (AWS, Google Maps, Firebase, Didit and an SMS provider), and when the law '
        'requires it.',
  ),
  _Section(
    'Location and camera',
    'Tamil Taxi uses your location only while the app is open or a trip is in progress. You can turn it off in '
        'your phone settings and enter your pickup manually. The camera is used only for the identity check and the '
        'photos you choose to add.',
  ),
  _Section(
    'Keeping and deleting data',
    'Trip records are kept for safety, accounting and tax reasons. Trip chat messages are deleted a day after the last '
        'message. You can delete your account at any time from Account › Delete account: your name, number and email '
        'are removed, your saved places, emergency contacts and devices are deleted, and your trips are kept without '
        'your name.',
  ),
  _Section('Contact', 'Questions? Use Help & support in the app or write to support@tamiltaxi.co.in.'),
];

/// Terms of service and Privacy policy: a simple scrollable text screen.
class LegalScreen extends StatelessWidget {
  const LegalScreen({super.key, this.doc = 'terms', this.showcase = false});

  /// 'terms' or 'privacy'.
  final String doc;

  /// Opened on its own from the Design gallery: render seed state, start no timers.
  final bool showcase;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final isPrivacy = doc == 'privacy';
    final sections = isPrivacy ? _privacy : _terms;
    return Scaffold(
      backgroundColor: TtColors.surface,
      appBar: TtAppBar(title: isPrivacy ? 'Privacy policy' : 'Terms of service'),
      body: SafeArea(
        top: false,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(TtSpacing.l, TtSpacing.s, TtSpacing.l, TtSpacing.xxl),
          children: [
            Text('Last updated 3 October 2026', style: t.caption),
            const SizedBox(height: TtSpacing.m),
            Text(
              isPrivacy
                  ? 'Your privacy matters to us. This policy explains what Tamil Taxi collects and why.'
                  : 'These terms apply when you use the Tamil Taxi app to book rides, send parcels or move house.',
              style: t.body.copyWith(color: TtColors.navy700),
            ),
            for (final s in sections) ...[
              const SizedBox(height: TtSpacing.xl),
              Text(s.heading, style: t.h2),
              const SizedBox(height: TtSpacing.s),
              Text(s.body, style: t.body.copyWith(color: TtColors.navy700)),
            ],
          ],
        ),
      ),
    );
  }
}
