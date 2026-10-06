import 'package:flutter/material.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import 'widgets/signup_widgets.dart';

/// Driver Terms / Privacy Policy: a simple scrollable text screen ([doc] is `terms` or `privacy`).
class LegalScreen extends StatelessWidget {
  const LegalScreen({super.key, this.doc = 'terms', this.showcase = false});

  final String doc;

  /// Opened on its own from the Design gallery: render seed state, start no timers.
  final bool showcase;

  // Shorter versions of the website's terms and privacy policy (apps/web/src/lib/legal.ts): keep them in line, with
  // the same "Last updated" date (a website test checks it).
  static const _terms = <(String, String)>[
    (
      'Free to use',
      'Tamil Taxi charges no commission and no subscription for any vehicle type.',
    ),
    (
      'You keep 100% of fares',
      'Riders pay you directly by cash or UPI. Tamil Taxi never takes a share of a fare, a waiting charge or an extra '
          'the rider adds.',
    ),
    (
      'Fares',
      "The rider's fare is locked at booking. Only these are added, each as its own line:\n"
          '• Waiting at the pickup after the free minutes, on city rides and parcels (up to ₹30 a trip).\n'
          '• The km (and, for rentals, the time) past the package on a rental or an outstation round trip.\n'
          '• An extra the rider adds while searching.\n'
          "• A cancellation fee from the rider's earlier ride, if one applies.",
    ),
    (
      'Identity and documents',
      'You must pass an identity check (your driving licence, Aadhaar and a live selfie, checked by Didit) and keep a '
          'valid vehicle RC and insurance. Before you go online we may ask for a quick selfie, compared with your '
          'identity-check selfie, to confirm it is you.',
    ),
    (
      'Conduct',
      'Treat riders and receivers with respect, follow traffic rules and never carry prohibited goods. Repeated '
          'complaints may put your account on hold while we review them.',
    ),
    (
      'Law',
      'You are an independent service provider, not an employee of Tamil Taxi. These terms are governed by the laws of '
          'India, with courts in Coimbatore, Tamil Nadu.',
    ),
  ];

  static const _privacy = <(String, String)>[
    (
      'What we collect',
      'Your name, phone number, gender, vehicle details, UPI ID and, if you add them, emergency contacts; photos of '
          'your RC and insurance; your profile photo; your identity check; your trips and ratings; and your location '
          'while you are online or on a job.',
    ),
    (
      'Identity check',
      'Didit scans your driving licence and Aadhaar and takes a live selfie. We keep the result, your name and date of '
          'birth from the ID, the last 4 digits of each number (never the full number) and the selfie. Your profile '
          'photo and the selfie before you go online are compared with it by Didit.',
    ),
    (
      'How we use it',
      'To verify you, match you with nearby requests, show riders your approach and keep everyone safe. During a trip '
          'the rider sees your name, photo, rating, phone number, vehicle, number plate and UPI ID. We do not sell '
          'your data.',
    ),
    (
      'Location',
      'We use your location while you are online or on a job, including when the app is in the background: a '
          'notification shows while it is on. Going offline stops location sharing.',
    ),
    (
      'Sharing',
      'Only with the rider on your trip, your emergency contacts when you use SOS, the police or emergency services '
          'when a safety incident needs it, the services that run the app (AWS, Google Maps, Firebase, Didit and an '
          'SMS provider), and when the law requires it.',
    ),
    (
      'Your choices',
      'You can update your details from Account. To close your account, raise a "Delete my account" ticket in '
          'Account › Help & support, or email us. We keep your details, documents, photos and trips for 6 months '
          'after that for police enquiries. Then your name, number and email are removed, your document photos, '
          'profile photo and selfie are deleted, and your trip records are kept without your name for safety and '
          'accounting.',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final privacy = doc == 'privacy';
    final sections = privacy ? _privacy : _terms;
    return Scaffold(
      backgroundColor: TtColors.surface,
      appBar: SignupAppBar(title: privacy ? 'Privacy Policy' : 'Driver Terms'),
      body: SafeArea(
        top: false,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(TtSpacing.l, TtSpacing.xl, TtSpacing.l, TtSpacing.xxl),
          children: [
            Text(privacy ? 'Tamil Taxi Driver Privacy Policy' : 'Tamil Taxi Driver Terms of Service', style: t.h1),
            const SizedBox(height: TtSpacing.xs),
            Text('Last updated 6 October 2026', style: t.caption.copyWith(color: TtColors.navy500)),
            for (final (title, body) in sections) ...[
              const SizedBox(height: TtSpacing.xl),
              Text(title, style: t.h2),
              const SizedBox(height: TtSpacing.s),
              Text(body, style: t.body.copyWith(color: TtColors.navy700)),
            ],
            const SizedBox(height: TtSpacing.xl),
            Text(
              'Questions? Write to support@tamiltaxi.co.in or use Help & support in the app.',
              style: t.bodySmall.copyWith(color: TtColors.navy500),
            ),
          ],
        ),
      ),
    );
  }
}
