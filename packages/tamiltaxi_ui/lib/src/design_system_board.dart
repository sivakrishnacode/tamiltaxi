import 'package:flutter/material.dart';
import 'package:material_symbols_icons/symbols.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';

import 'format.dart';
import 'illustrations/tt_illustration.dart';
import 'theme/tt_colors.dart';
import 'theme/tt_tokens.dart';
import 'vehicle_ui.dart';
import 'widgets/choice_chips.dart';
import 'widgets/commission_badge.dart';
import 'widgets/countdown_ring.dart';
import 'widgets/driver_info_card.dart';
import 'widgets/empty_state.dart';
import 'widgets/fare_breakdown.dart';
import 'widgets/location_markers.dart';
import 'widgets/location_row.dart';
import 'widgets/map_bottom_sheet.dart';
import 'widgets/map_markers.dart';
import 'widgets/number_plate.dart';
import 'widgets/otp_display.dart';
import 'widgets/otp_input.dart';
import 'widgets/phone_input.dart';
import 'widgets/pickup_drop_connector.dart';
import 'widgets/rating_stars.dart';
import 'widgets/tt_app_bar.dart';
import 'widgets/tt_avatar.dart';
import 'widgets/tt_banner.dart';
import 'widgets/tt_bottom_nav.dart';
import 'widgets/tt_button.dart';
import 'widgets/tt_card.dart';
import 'widgets/tt_dialogs.dart';
import 'widgets/tt_list_tile.dart';
import 'widgets/tt_map.dart';
import 'widgets/tt_segmented.dart';
import 'widgets/tt_text_field.dart';
import 'widgets/tt_wordmark.dart';
import 'widgets/search_field.dart';
import 'widgets/skeleton_box.dart';
import 'widgets/sos_button.dart';
import 'widgets/status_pill.dart';
import 'widgets/stepper_timeline.dart';
import 'widgets/swipe_to_confirm.dart';
import 'widgets/vehicle_option_card.dart';

/// Live design-system board for the Design gallery "Design system" entry: brand, colour
/// tokens, type scale, spacing/radius/elevation and every shared widget in its states,
/// grouped like docs/design/system/DS-01…DS-07. A scrollable screen body (put it in a Scaffold).
class DesignSystemBoard extends StatefulWidget {
  const DesignSystemBoard({super.key});

  @override
  State<DesignSystemBoard> createState() => _DesignSystemBoardState();
}

class _DesignSystemBoardState extends State<DesignSystemBoard> {
  VehicleKind _vehicle = VehicleKind.bike;
  final Set<String> _filters = {'Bike', 'Parcel'};
  String _payment = 'UPI';
  String _segment = 'Today';
  int _navIndex = 0;
  int _rating = 4;
  int _swipeKey = 0;
  bool _swiped = false;
  bool _loadingDemo = false;

  void _snack(String message) => showTtSnack(context, message);

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(TtSpacing.gutter, TtSpacing.l, TtSpacing.gutter, TtSpacing.xxl),
      children: [
        _header(context),
        _Section(number: '01', title: 'Brand', children: _brand(context)),
        _Section(
          number: '02',
          title: 'Colours',
          subtitle: 'Every TtColors token',
          children: _colours(context),
        ),
        _Section(
          number: '03',
          title: 'Typography',
          subtitle: 'Poppins for headings · Inter for body and UI',
          children: _typography(context),
        ),
        _Section(number: '04', title: 'Spacing, radius and elevation', children: _spacing(context)),
        _Section(
          number: '05',
          title: 'Components',
          subtitle: 'Live: tap, type and swipe',
          children: _components(context),
        ),
        _Section(number: '06', title: 'Map style and markers', children: _map(context)),
        _Section(
          number: '07',
          title: 'Illustrations',
          subtitle: 'Flat fills, 2–3 palette colours',
          children: _illustrations(context),
        ),
      ],
    );
  }

  // ------------------------------------------------------------------ header
  Widget _header(BuildContext context) {
    final t = context.type;
    return Padding(
      padding: const EdgeInsets.only(bottom: TtSpacing.s),
      child: Row(
        children: [
          const TtWordmark(size: 22),
          const SizedBox(width: TtSpacing.m),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Design system', style: t.h2),
                Text('Tokens and components shared by both apps', style: t.caption.copyWith(color: TtColors.navy500)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ------------------------------------------------------------------- brand
  List<Widget> _brand(BuildContext context) {
    final t = context.type;
    Widget principle(String title, String body) => Padding(
          padding: const EdgeInsets.only(top: TtSpacing.m),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: t.bodySemibold),
              const SizedBox(height: 2),
              Text(body, style: t.bodySmall.copyWith(color: TtColors.navy700)),
            ],
          ),
        );
    // The real launcher icons (kolam set), copied from the apps' mipmap-xxxhdpi/ic_launcher.png.
    Widget launcher(String label, String asset) => Column(
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: const BoxDecoration(shape: BoxShape.circle, boxShadow: TtShadows.soft),
              child: ClipOval(child: Image.asset(asset, package: 'tamiltaxi_ui', width: 64, height: 64)),
            ),
            const SizedBox(height: 6),
            SizedBox(
              width: 96,
              child: Text(label,
                  textAlign: TextAlign.center, maxLines: 2, style: t.caption.copyWith(color: TtColors.navy900)),
            ),
          ],
        );
    return [
      TtCard(
        padding: const EdgeInsets.all(TtSpacing.xl),
        child: Column(
          children: [
            const TtWordmark(size: 72),
            const SizedBox(height: TtSpacing.m),
            Text(
              'Primary logo · Manrope ExtraBold · the x is a flyover road',
              textAlign: TextAlign.center,
              style: t.caption.copyWith(color: TtColors.navy500),
            ),
          ],
        ),
      ),
      const SizedBox(height: TtSpacing.m),
      TtCard(
        color: TtColors.navy900,
        borderColor: null,
        padding: const EdgeInsets.all(TtSpacing.xl),
        child: Column(
          children: [
            const TtWordmark(size: 56, color: Colors.white, roadColor: TtColors.coral500),
            const SizedBox(height: TtSpacing.xs),
            Text('DRIVER', style: t.overline.copyWith(color: Colors.white, letterSpacing: 2)),
            const SizedBox(height: TtSpacing.m),
            Text('Reversed · Driver app', style: t.caption.copyWith(color: Colors.white70)),
          ],
        ),
      ),
      const SizedBox(height: TtSpacing.m),
      TtCard(
        color: TtColors.coral50,
        borderColor: null,
        padding: const EdgeInsets.all(TtSpacing.xl),
        child: Column(
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              // Top-aligned: a label that wraps to two lines must not lift its icon above the other.
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                launcher('Tamil Taxi', 'assets/brand/launcher_rider.png'),
                const SizedBox(width: TtSpacing.xl),
                launcher('Tamil Taxi Driver', 'assets/brand/launcher_driver.png'),
              ],
            ),
            const SizedBox(height: TtSpacing.m),
            Text('Launcher icons · தமிழ் / Taxi in a pulli-kolam ring', style: t.caption.copyWith(color: TtColors.navy700)),
          ],
        ),
      ),
      principle('Friendly', 'Talk like a helpful neighbour. "Karthik is 2 min away", not "Driver ETA: 120s".'),
      principle('Simple', 'One primary action per screen. Large type, 48px targets, clear labels.'),
      principle('Trustworthy', 'Show the full fare upfront. Show the driver\'s plate the way it looks on the road.'),
      principle('Local', 'Coimbatore places, ₹ with Indian grouping, autos as first-class vehicles.'),
    ];
  }

  // ----------------------------------------------------------------- colours
  List<Widget> _colours(BuildContext context) {
    return const [
      _SwatchGroup('Primary · coral', [
        _Swatch('coral-500', TtColors.coral500, 'Logo, illustrations, route line, active icons'),
        _Swatch('coral-600', TtColors.coral600, 'Primary: button fills, coral text, links'),
        _Swatch('coral-700', TtColors.coral700, 'Pressed state'),
        _Swatch('coral-100', TtColors.coral100, 'Borders of selected cards and chips'),
        _Swatch('coral-50', TtColors.coral50, 'Tinted fills, selected cards, chips'),
      ]),
      _SwatchGroup('Secondary · navy', [
        _Swatch('navy-900', TtColors.navy900, 'Headings, main text, dark buttons, driver header'),
        _Swatch('navy-700', TtColors.navy700, 'Secondary text'),
        _Swatch('navy-500', TtColors.navy500, 'Hints, captions, inactive icons'),
        _Swatch('navy-300', TtColors.navy300, 'Disabled icons, subtle strokes'),
      ]),
      _SwatchGroup('Neutrals', [
        _Swatch('surface', TtColors.surface, 'Cards, sheets, app bar'),
        _Swatch('background', TtColors.background, 'Scaffold background'),
        _Swatch('divider', TtColors.divider, 'Dividers, card outlines'),
        _Swatch('input-bg', TtColors.inputBg, 'Field fill, icon wells'),
      ]),
      _SwatchGroup('Status', [
        _Swatch('success', TtColors.success, 'Online, completed, paid, verified'),
        _Swatch('warning', TtColors.warning, 'Grace period, pending review. Never for text'),
        _Swatch('error', TtColors.error, 'Errors, rejected, danger buttons'),
        _Swatch('sos', TtColors.sos, 'SOS button only. Never reuse elsewhere'),
      ]),
      _SwatchGroup('Status tints and text', [
        _Swatch('success-tint', TtColors.successTint, 'Success banner and pill fill'),
        _Swatch('success-text', TtColors.successText, 'Small text on success tint'),
        _Swatch('warning-tint', TtColors.warningTint, 'Warning banner and pill fill'),
        _Swatch('warning-text', TtColors.warningText, 'Small text on warning tint'),
        _Swatch('error-tint', TtColors.errorTint, 'Error banner and pill fill'),
        _Swatch('info-tint', TtColors.infoTint, 'Neutral info fill'),
      ]),
      _SwatchGroup('Map', [
        _Swatch('map-land', TtColors.mapLand, 'Land'),
        _Swatch('map-road', TtColors.mapRoad, 'Roads'),
        _Swatch('map-water', TtColors.mapWater, 'Water'),
        _Swatch('map-park', TtColors.mapPark, 'Parks'),
      ]),
      _SwatchGroup('Other', [
        _Swatch('skin', TtColors.skin, 'Illustration skin tone'),
        _Swatch('shadow', TtColors.shadow, 'Soft shadow, navy at 8%'),
        _Swatch('scrim', TtColors.scrim, 'Behind dialogs and full sheets'),
      ]),
    ];
  }

  // -------------------------------------------------------------- typography
  List<Widget> _typography(BuildContext context) {
    final t = context.type;
    final styles = <(String, TextStyle, String)>[
      ('Display', t.display, 'Where to, Priya?'),
      ('H1', t.h1, 'Choose a ride'),
      ('H2', t.h2, 'Gandhipuram → Brookefields'),
      ('Body', t.body, 'Drivers keep 100% of every fare.'),
      ('Body medium', t.bodyMedium, 'Karthik is 2 min away'),
      ('Body semibold', t.bodySemibold, 'Brookefields Mall'),
      ('Body small', t.bodySmall, '100 Feet Road, Gandhipuram, Coimbatore 641012'),
      ('Body small medium', t.bodySmallMedium, 'Honda Activa · Grey'),
      ('Caption', t.caption, 'Fare includes taxes · 4.2 km · 14 min'),
      ('Button', t.button, 'Confirm Bike'),
      ('Overline', t.overline, 'RECENT TRIP'),
      ('Hero', t.hero, formatInr(38)),
      ('Hero small', t.heroSmall, formatInr(1420)),
      ('OTP', t.otp, '4 8 2 9'),
    ];
    return [
      for (final (name, style, sample) in styles)
        Container(
          padding: const EdgeInsets.symmetric(vertical: TtSpacing.m),
          decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: TtColors.divider))),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.baseline,
                textBaseline: TextBaseline.alphabetic,
                children: [
                  Text(name, style: t.bodySmallMedium),
                  const SizedBox(width: TtSpacing.s),
                  Expanded(child: Text(_styleSpec(style), style: t.caption.copyWith(color: TtColors.navy500))),
                ],
              ),
              const SizedBox(height: TtSpacing.xs),
              Text(sample, style: style, maxLines: 2, overflow: TextOverflow.ellipsis),
            ],
          ),
        ),
      const SizedBox(height: TtSpacing.l),
      TtCard(
        color: TtColors.background,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('TABULAR NUMBERS · FONTFEATURE.TABULARFIGURES()', style: t.overline.copyWith(color: TtColors.navy500)),
            const SizedBox(height: TtSpacing.s),
            _numRow(context, 'Fare', formatInr(145), t.h1),
            _numRow(context, 'Today', formatInr(1420), t.h2),
            _numRow(context, 'This month', formatInr(35000), t.h2),
            _numRow(context, 'OTP', '4 8 2 9', t.otp),
            _numRow(context, 'Resend in', formatCountdown(const Duration(seconds: 29)), TtTextStyles.tabular(t.bodySemibold)),
          ],
        ),
      ),
      const SizedBox(height: TtSpacing.m),
      TtCard(
        color: TtColors.coral50,
        borderColor: null,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Currency rule', style: t.bodySmallMedium.copyWith(color: TtColors.coral600)),
            const SizedBox(height: TtSpacing.xs),
            Text(
              'Always "₹" + Indian grouping (${formatInr(100000)}). No space after ₹, no ".00" unless paise are non-zero.',
              style: t.bodySmall.copyWith(color: TtColors.navy900),
            ),
          ],
        ),
      ),
    ];
  }

  Widget _numRow(BuildContext context, String label, String value, TextStyle style) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            Expanded(child: Text(label, style: context.type.bodySmall.copyWith(color: TtColors.navy700))),
            Text(value, style: TtTextStyles.tabular(style)),
          ],
        ),
      );

  static String _styleSpec(TextStyle s) {
    final family = (s.fontFamily ?? '').split('_').first;
    final size = s.fontSize ?? 14;
    final lh = s.height == null ? '' : '/${(s.height! * size).round()}';
    final weight = s.fontWeight?.value ?? 400;
    return '$family $weight · ${size.round()}$lh';
  }

  // ----------------------------------------------------------------- spacing
  List<Widget> _spacing(BuildContext context) {
    final t = context.type;
    const scale = <(double, String)>[
      (TtSpacing.xs, 'xs · icon ↔ label'),
      (TtSpacing.s, 's · chip gap'),
      (TtSpacing.m, 'm · list rows'),
      (TtSpacing.l, 'l · side padding'),
      (TtSpacing.xl, 'xl · between groups'),
      (TtSpacing.xxl, 'xxl · section breaks'),
    ];
    Widget radiusBox(String label, BorderRadius r, double w) => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: w,
              height: 64,
              decoration: BoxDecoration(
                color: TtColors.coral50,
                borderRadius: r,
                border: Border.all(color: TtColors.coral100),
              ),
            ),
            const SizedBox(height: TtSpacing.xs),
            Text(label, style: t.caption.copyWith(color: TtColors.navy900)),
          ],
        );
    return [
      const _SubLabel('8pt scale'),
      for (final (v, label) in scale)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Row(
            children: [
              SizedBox(
                width: 40,
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Container(width: v, height: 20, color: TtColors.coral500),
                ),
              ),
              Text('${v.round()} · $label', style: t.bodySmall),
            ],
          ),
        ),
      const _SubLabel('Radius'),
      Wrap(
        spacing: TtSpacing.l,
        runSpacing: TtSpacing.m,
        children: [
          radiusBox('12 · cards, inputs', TtRadii.cardRadius, 72),
          radiusBox('16 · sheets, dialogs', TtRadii.sheetTop, 72),
          radiusBox('full · buttons, chips, pills', TtRadii.pillRadius, 160),
        ],
      ),
      const _SubLabel('Elevation'),
      Container(
        height: 72,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: TtColors.surface,
          borderRadius: TtRadii.cardRadius,
          boxShadow: TtShadows.soft,
        ),
        child: Text('soft · y 2 · blur 8 · navy 8%', style: t.bodySmall),
      ),
      const SizedBox(height: TtSpacing.m),
      Container(
        height: 72,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: TtColors.surface,
          borderRadius: TtRadii.cardRadius,
          boxShadow: TtShadows.raised,
        ),
        child: Text('raised · y 4 · blur 16 · map controls', style: t.bodySmall),
      ),
      const _SubLabel('Tap target and icons'),
      Row(
        children: [
          Container(
            width: 48,
            height: 48,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: TtColors.coral500),
            ),
            child: const Icon(Symbols.call_rounded, size: 24, color: TtColors.navy900),
          ),
          const SizedBox(width: TtSpacing.m),
          Expanded(
            child: Text(
              '48 × 48 minimum hit area · 24px Rounded outline icon. Active icons may use FILL 1.',
              style: t.caption.copyWith(color: TtColors.navy700),
            ),
          ),
        ],
      ),
      const SizedBox(height: TtSpacing.m),
      const Wrap(
        spacing: TtSpacing.m,
        runSpacing: TtSpacing.s,
        children: [
          Icon(Symbols.home_rounded, color: TtColors.navy900),
          Icon(Symbols.two_wheeler_rounded, color: TtColors.navy900),
          Icon(Symbols.electric_rickshaw_rounded, color: TtColors.navy900),
          Icon(Symbols.local_taxi_rounded, color: TtColors.navy900),
          Icon(Symbols.package_2_rounded, color: TtColors.navy900),
          Icon(Symbols.account_balance_wallet_rounded, color: TtColors.navy900),
          Icon(Symbols.person_rounded, color: TtColors.navy900),
          Icon(Symbols.location_on_rounded, color: TtColors.coral500, fill: 1),
        ],
      ),
    ];
  }

  // -------------------------------------------------------------- components
  List<Widget> _components(BuildContext context) {
    final t = context.type;
    final quote = FareEngine.quote(Seed.bike, FareEngine.estimate(Seed.gandhipuram, Seed.brookefields));
    final rideQuotes = FareEngine.quoteAll(Seed.rideVehicles, FareEngine.estimate(Seed.gandhipuram, Seed.brookefields));
    Widget caption(String s) => Padding(
          padding: const EdgeInsets.only(top: TtSpacing.xs, bottom: TtSpacing.m),
          child: Text(s, style: t.caption.copyWith(color: TtColors.navy500)),
        );
    const gap = SizedBox(height: TtSpacing.m);

    return [
      // Buttons
      _Group(title: 'Buttons', children: [
        TtButton(label: 'Book Bike · ${formatInr(38)}', onPressed: () => _snack('Primary button tapped')),
        caption('Primary · 52px · coral-600'),
        TtButton.secondary(label: 'Schedule for later', onPressed: () => _snack('Secondary button tapped')),
        caption('Secondary · navy-900 outline'),
        TtButton(
          label: 'Go online',
          variant: TtButtonVariant.dark,
          onPressed: () => _snack('Dark button tapped'),
        ),
        caption('Dark · navy-900 fill (driver app)'),
        Row(
          children: [
            TtButton.text(label: 'Add stop', onPressed: () => _snack('Text button tapped')),
            const SizedBox(width: TtSpacing.s),
            Expanded(child: TtButton.danger(label: 'Cancel ride', onPressed: () => _snack('Danger button tapped'))),
          ],
        ),
        Align(
          alignment: Alignment.centerLeft,
          child: TtButton(
            label: 'Leave anyway',
            variant: TtButtonVariant.dangerText,
            expand: false,
            onPressed: () => _snack('Danger text button tapped'),
          ),
        ),
        caption('Text · Danger (error fill) · Danger text'),
        const TtButton(label: 'Enter drop location', onPressed: null),
        const SizedBox(height: TtSpacing.s),
        const TtButton.secondary(label: 'Disabled secondary', onPressed: null),
        caption('Disabled · divider fill, navy-500 text'),
        TtButton(
          label: _loadingDemo ? 'Please wait' : 'Tap to see loading',
          loading: _loadingDemo,
          onPressed: () async {
            setState(() => _loadingDemo = true);
            await Future<void>.delayed(const Duration(seconds: 2));
            if (mounted) setState(() => _loadingDemo = false);
          },
        ),
        const SizedBox(height: TtSpacing.s),
        const TtButton(label: 'Please wait', loading: true, onPressed: null),
        caption('Loading · 20px spinner, label kept, not tappable'),
      ]),

      // Inputs
      _Group(title: 'Inputs', children: [
        const PhoneInput(),
        caption('Phone input · default'),
        const PhoneInput(errorText: 'Enter a 10-digit mobile number'),
        caption('Phone input · error'),
        const TtTextField(label: 'Full name', initialValue: 'Priya Raman'),
        caption('Text field'),
        const TtTextField(label: 'Email', hint: 'name@example.com', errorText: 'Enter a valid email'),
        caption('Text field · error'),
        const TtTextField(label: 'Vehicle number', initialValue: 'TN 37 AB 4521', enabled: false),
        caption('Text field · disabled'),
        const SearchField(hint: 'Where to?'),
        caption('Search · location icon leading, voice trailing'),
        const SearchField(hint: 'Search for a place', large: true, showMic: false, leadingIcon: Symbols.search_rounded),
        caption('Search · large, no mic'),
      ]),

      // OTP
      _Group(title: 'OTP input', children: [
        const OtpInput(length: 4, autofocus: false, initialValue: '48'),
        caption('4-box · ride start OTP'),
        const OtpInput(length: 6, autofocus: false),
        caption('6-box · login OTP'),
        const OtpInput(length: 6, autofocus: false, initialValue: '000000', hasError: true),
        Padding(
          padding: const EdgeInsets.only(top: TtSpacing.s),
          child: Row(
            children: [
              Expanded(child: Text('Incorrect OTP', style: t.caption.copyWith(color: TtColors.error))),
              Text('Resend in ${formatCountdown(const Duration(seconds: 29))}', style: TtTextStyles.tabular(t.caption)),
            ],
          ),
        ),
        caption('6-box · error'),
        const _AtWidth(child: OtpDisplay(label: 'Share this OTP with your driver', code: '4829', caption: 'Driver enters it to start')),
        gap,
        const _AtWidth(child: OtpDisplay(label: 'Delivery OTP', code: '7315', emphasised: true)),
        caption('OTP display · normal and emphasised'),
      ]),

      // Swipe
      _Group(title: 'Swipe to confirm', children: [
        SwipeToConfirm(
          key: ValueKey(_swipeKey),
          label: _swiped ? 'Ride started' : 'Swipe to start ride',
          onConfirmed: () {
            setState(() => _swiped = true);
            _snack('Swipe confirmed');
          },
        ),
        gap,
        const SwipeToConfirm(label: 'Swipe disabled', enabled: false, onConfirmed: _noop),
        Row(
          children: [
            Expanded(child: caption('Release past 85% to confirm; else springs back.')),
            TtButton.text(
              label: 'Reset',
              onPressed: () => setState(() {
                _swipeKey++;
                _swiped = false;
              }),
            ),
          ],
        ),
      ]),

      // Location rows
      _Group(title: 'Location row', children: [
        TtCard(
          child: PickupDropConnector(
            pickupLabel: 'Pickup',
            pickupTitle: Seed.gandhipuram.name,
            pickupSubtitle: Seed.gandhipuram.address,
            dropLabel: 'Drop',
            dropTitle: Seed.brookefields.name,
            dropSubtitle: Seed.brookefields.address,
            onPickupTap: () => _snack('Pickup tapped'),
            onDropTap: () => _snack('Drop tapped'),
          ),
        ),
        caption('Connected pair · pickup dot → dotted line → drop pin'),
        for (final kind in LocationRowKind.values)
          LocationRow(
            kind: kind,
            title: switch (kind) {
              LocationRowKind.pickup => Seed.gandhipuram.name,
              LocationRowKind.drop => Seed.brookefields.name,
              LocationRowKind.recent => Seed.psgTech.name,
              LocationRowKind.saved => 'Home',
              LocationRowKind.landmark => Seed.airport.name,
              LocationRowKind.search => Seed.prozone.name,
            },
            subtitle: '${kind.name} row',
            trailingText: kind == LocationRowKind.recent ? '6.1 km' : null,
            showChevron: kind == LocationRowKind.saved,
            onTap: () => _snack('${kind.name} row tapped'),
          ),
        caption('Every LocationRowKind: pickup, drop, recent, saved, landmark, search'),
      ]),

      // Vehicle cards
      _Group(title: 'Vehicle option card', children: [
        for (final q in rideQuotes) ...[
          VehicleOptionCard(
            icon: q.vehicle.kind.icon,
            art: VehicleArt(q.vehicle.kind),
            name: q.vehicle.kind.label,
            subtitle: '${q.vehicle.etaMin} min away',
            capacity: q.vehicle.capacityLabel,
            fare: q.total,
            selected: _vehicle == q.vehicle.kind,
            badge: q.vehicle.badge,
            badgeTone: q.vehicle.badge == 'Comfort' ? VehicleBadgeTone.navy : VehicleBadgeTone.coral,
            onTap: () => setState(() => _vehicle = q.vehicle.kind),
          ),
          const SizedBox(height: TtSpacing.s),
        ],
        VehicleOptionCard(
          icon: VehicleKind.suv.icon,
          art: const VehicleArt(VehicleKind.suv),
          name: 'SUV',
          subtitle: 'Not available now',
          fare: 210,
          disabledReason: 'No drivers nearby',
        ),
        caption('Selected / unselected (tap) · disabled'),
      ]),

      // Chips and pills
      _Group(title: 'Chips and status pills', children: [
        Text('Filter chips · multi-select', style: t.caption.copyWith(color: TtColors.navy500)),
        const SizedBox(height: TtSpacing.s),
        ChoiceChips<String>(
          options: const ['Bike', 'Auto', 'Cab', 'Parcel'],
          labelOf: (s) => s,
          selected: _filters,
          showCheck: true,
          onChanged: (s) => setState(() => _filters.contains(s) ? _filters.remove(s) : _filters.add(s)),
        ),
        gap,
        Text('Choice chips · single-select (solid)', style: t.caption.copyWith(color: TtColors.navy500)),
        const SizedBox(height: TtSpacing.s),
        ChoiceChips<String>(
          options: const ['Cash', 'UPI'],
          labelOf: (s) => s,
          iconOf: (s) => s == 'Cash' ? Symbols.payments_rounded : Symbols.qr_code_2_rounded,
          selected: {_payment},
          solid: true,
          onChanged: (s) => setState(() => _payment = s),
        ),
        gap,
        Wrap(
          spacing: TtSpacing.s,
          runSpacing: TtSpacing.s,
          children: [
            TtChip(label: 'Selected', selected: true, onTap: () => _snack('Chip tapped')),
            TtChip(label: 'Unselected', selected: false, onTap: () => _snack('Chip tapped')),
            TtChip(label: 'With icon', icon: Symbols.home_rounded, selected: false, onTap: () => _snack('Chip tapped')),
            const TtChip(label: 'Disabled', selected: false, onTap: null),
          ],
        ),
        caption('TtChip states'),
        Wrap(
          spacing: TtSpacing.s,
          runSpacing: TtSpacing.s,
          children: [for (final k in StatusKind.values) StatusPill(k)],
        ),
        const SizedBox(height: TtSpacing.s),
        const Wrap(
          spacing: TtSpacing.s,
          runSpacing: TtSpacing.s,
          children: [StatusPill(StatusKind.online, large: true), StatusPill(StatusKind.pending, label: 'Under review')],
        ),
        caption('Every StatusKind · large · custom label'),
        const Wrap(
          spacing: TtSpacing.m,
          runSpacing: TtSpacing.s,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [CommissionBadge(), CommissionBadge(large: true)],
        ),
        caption('Commission badge · small and large'),
        TtSegmented<String>(
          options: const ['Today', 'This week', 'This month'],
          labelOf: (s) => s,
          selected: _segment,
          onChanged: (s) => setState(() => _segment = s),
        ),
        gap,
        Container(
          padding: const EdgeInsets.all(TtSpacing.s),
          decoration: const BoxDecoration(color: TtColors.navy900, borderRadius: TtRadii.cardRadius),
          child: TtSegmented<String>(
            options: const ['Today', 'This week', 'This month'],
            labelOf: (s) => s,
            selected: _segment,
            dark: true,
            onChanged: (s) => setState(() => _segment = s),
          ),
        ),
        caption('Segmented · light and dark'),
      ]),

      // Driver info
      _Group(title: 'Driver info card', children: [
        _AtWidth(child: DriverInfoCard(
          name: Seed.karthik.name,
          initials: 'KS',
          rating: Seed.karthik.rating,
          vehicle: '${Seed.karthik.vehicleModel} · ${Seed.karthik.vehicleColor}',
          plate: Seed.karthik.plate,
          vehicleKind: Seed.karthik.vehicleKind,
          statusText: '2 min away',
          onCall: () => _snack('Calling Karthik'),
          onChat: () => _snack('Opening chat'),
        )),
        gap,
        _AtWidth(child: DriverInfoCard(
          name: Seed.murugan.name,
          initials: 'MP',
          rating: Seed.murugan.rating,
          vehicle: '${Seed.murugan.vehicleModel} · ${Seed.murugan.vehicleColor}',
          plate: Seed.murugan.plate,
          vehicleKind: Seed.murugan.vehicleKind,
          rides: formatInr(Seed.murugan.rides).replaceAll('₹', ''),
          statusText: 'Arrived',
          onCall: () => _snack('Calling Murugan'),
          onChat: () => _snack('Opening chat'),
        )),
        gap,
        Wrap(
          spacing: TtSpacing.m,
          runSpacing: TtSpacing.s,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            NumberPlate(plate: Seed.karthik.plate, vehicle: Seed.karthik.vehicleKind),
            NumberPlate(plate: Seed.arun.plate, vehicle: Seed.arun.vehicleKind, large: true),
          ],
        ),
        caption('Number plate · white for bikes and scooters, yellow T-board for the rest; normal and large'),
      ]),

      // Fare breakdown
      _Group(title: 'Fare breakdown', children: [
        _AtWidth(child: TtCard(
          child: FareBreakdown.fromQuote(
            quote,
            title: 'Bike · ${quote.distanceKm} km',
            subtitle: 'Gandhipuram → Brookefields',
            footer: const Row(children: [
              Icon(Symbols.qr_code_2_rounded, size: 20, color: TtColors.navy700),
              SizedBox(width: TtSpacing.s),
              Expanded(child: Text('Paid via UPI')),
              StatusPill(StatusKind.paid),
            ]),
          ),
        )),
        caption('FareBreakdown.fromQuote(bike) · only the total is bold'),
      ]),

      // Banners
      _Group(title: 'Banners', children: [
        const TtBanner(
          type: TtBannerType.info,
          title: 'Airport pickups are at Gate 2',
          message: 'Walk to the Tamil Taxi zone opposite arrivals.',
        ),
        const SizedBox(height: TtSpacing.s),
        TtBanner(
          type: TtBannerType.warning,
          title: 'Plan in grace period · 2 days left',
          message: 'Renew for ${formatInr(2000)} to keep getting rides.',
          actionLabel: 'Renew now',
          onAction: () => _snack('Renew tapped'),
        ),
        const SizedBox(height: TtSpacing.s),
        const TtBanner(type: TtBannerType.success, title: 'Documents verified', message: 'You can go online now.'),
        const SizedBox(height: TtSpacing.s),
        TtBanner(
          type: TtBannerType.error,
          title: 'Payment failed',
          message: 'UPI request timed out.',
          actionLabel: 'Retry',
          inlineAction: true,
          onAction: () => _snack('Retry tapped'),
        ),
        caption('Info · warning · success · error'),
      ]),

      // App bars and bottom nav
      _Group(title: 'Top app bar · bottom nav', children: [
        _BarPreview(
          bar: TtAppBar(
            title: 'Choose a ride',
            onBack: () => _snack('Back tapped'),
            actions: [
              IconButton(
                tooltip: 'Help',
                icon: const Icon(Symbols.help_rounded),
                onPressed: () => _snack('Help tapped'),
              ),
            ],
          ),
        ),
        caption('Passenger · white, 64px, back + H2 title'),
        const _AtWidth(child: _BarPreview(
          bar: TtAppBar.driver(
            showWordmark: true,
            actions: [
              Center(child: CommissionBadge()),
              SizedBox(width: TtSpacing.s),
              Center(child: StatusPill(StatusKind.online)),
              SizedBox(width: TtSpacing.s),
            ],
          ),
        )),
        const SizedBox(height: TtSpacing.s),
        const _BarPreview(bar: TtAppBar.driver(title: 'Earnings', subtitle: 'This week')),
        caption('Driver · navy-900, wordmark or title'),
        ClipRRect(
          borderRadius: TtRadii.cardRadius,
          child: TtBottomNav(
            items: const [
              TtNavItem(icon: Symbols.home_rounded, label: 'Home'),
              TtNavItem(icon: Symbols.receipt_long_rounded, label: 'Rides'),
              TtNavItem(icon: Symbols.package_2_rounded, label: 'Parcels'),
              TtNavItem(icon: Symbols.person_rounded, label: 'Account'),
            ],
            currentIndex: _navIndex,
            onTap: (i) => setState(() => _navIndex = i),
          ),
        ),
        caption('Active: coral-50 indicator, filled icon + label'),
      ]),

      // List tiles, avatars, rating
      _Group(title: 'List tile · avatar · rating', children: [
        TtListGroup(children: [
          TtListTile(
            icon: Symbols.account_balance_wallet_rounded,
            title: 'Payment methods',
            subtitle: 'UPI · priya@okaxis',
            onTap: () => _snack('Payment methods tapped'),
          ),
          TtListTile(
            icon: Symbols.bookmark_rounded,
            title: 'Saved places',
            subtitle: 'Home, Work · Tidel Park',
            onTap: () => _snack('Saved places tapped'),
          ),
          TtListTile(
            icon: Symbols.notifications_rounded,
            title: 'Trip alerts',
            showChevron: false,
            trailing: const StatusPill(StatusKind.active, label: 'On'),
            onTap: () => _snack('Trip alerts tapped'),
          ),
          TtListTile(
            icon: Symbols.logout_rounded,
            title: 'Log out',
            destructive: true,
            showChevron: false,
            onTap: () => _snack('Log out tapped'),
          ),
        ]),
        gap,
        const Wrap(
          spacing: TtSpacing.m,
          runSpacing: TtSpacing.s,
          crossAxisAlignment: WrapCrossAlignment.end,
          children: [
            TtAvatar(initials: 'PR', size: 32),
            TtAvatar(initials: 'PR', size: 40),
            TtAvatar(initials: 'MP', size: 56, tone: AvatarTone.navy),
            TtAvatar(initials: 'AK', size: 80, tone: AvatarTone.dark, online: true),
          ],
        ),
        caption('Avatar tones: coral, navy, dark (+ online dot)'),
        Row(
          children: [
            const RatingStars(value: 4.5),
            const SizedBox(width: TtSpacing.s),
            Flexible(child: Text('4.8 (1,240 rides) · display', style: t.caption)),
          ],
        ),
        gap,
        TtCard(
          child: Column(
            children: [
              Text('How was your ride with Karthik?', style: t.bodySemibold, textAlign: TextAlign.center),
              const SizedBox(height: TtSpacing.s),
              FittedBox(
                fit: BoxFit.scaleDown,
                child: RatingStars.input(value: _rating.toDouble(), onChanged: (v) => setState(() => _rating = v)),
              ),
              Text(RatingStars.labels[(_rating - 1).clamp(0, 4)], style: t.bodySmallMedium),
            ],
          ),
        ),
        caption('Rating input · tap a star'),
      ]),

      // Timers and progress
      _Group(title: 'Countdown · stepper · SOS', children: [
        Row(
          children: [
            CountdownRing(
              duration: const Duration(seconds: 15),
              running: false,
              size: 96,
              strokeWidth: 8,
              color: TtColors.coral500,
              trackColor: TtColors.divider,
              child: Text('15', style: t.otp),
            ),
            const SizedBox(width: TtSpacing.l),
            Expanded(child: Text('Countdown ring · request timer (paused here)', style: t.caption.copyWith(color: TtColors.navy500))),
          ],
        ),
        const SizedBox(height: TtSpacing.l),
        const StepperTimeline(steps: ['Picked up', 'In transit', 'Delivered'], currentIndex: 1),
        caption('Stepper · horizontal'),
        const StepperTimeline(
          axis: Axis.vertical,
          steps: ['Documents submitted', 'Under review', 'Approved'],
          subtitles: ['Today, 10:12 am', 'Usually 2 minutes', null],
          currentIndex: 1,
        ),
        caption('Stepper · vertical'),
        Row(
          children: [
            SosButton(onPressed: () => _snack('SOS: long-press in the app to trigger')),
            const SizedBox(width: TtSpacing.l),
            Expanded(
              child: Text(
                'SOS · 64px filled sos-red circle. Always top-right on the live trip map.',
                style: t.caption.copyWith(color: TtColors.navy500),
              ),
            ),
          ],
        ),
        gap,
        Wrap(
          spacing: TtSpacing.s,
          runSpacing: TtSpacing.s,
          children: [
            TtButton.secondary(
              label: 'Show snackbar',
              expand: false,
              onPressed: () => showTtSnack(context, 'Ride booked. Karthik is on the way.', success: true),
            ),
            TtButton.secondary(
              label: 'Show dialog',
              expand: false,
              onPressed: () => showTtConfirm(
                context,
                title: 'Cancel this ride?',
                message: 'Karthik is 2 min away. Cancelling now is free.',
                confirmLabel: 'Yes, cancel ride',
                cancelLabel: 'Keep my ride',
                destructive: true,
              ),
            ),
            TtButton.secondary(
              label: 'Show sheet',
              expand: false,
              onPressed: () => showTtSheet<void>(
                context,
                builder: (c) => Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('Bottom sheet', style: c.type.h2),
                    const SizedBox(height: TtSpacing.s),
                    Text('16px top radius, handle, scrim navy 32%.', style: c.type.bodySmall),
                    const SizedBox(height: TtSpacing.l),
                    TtButton(label: 'Close', onPressed: () => Navigator.of(c).pop()),
                  ],
                ),
              ),
            ),
          ],
        ),
        caption('Snackbar · dialog · bottom sheet (live)'),
      ]),

      // Empty, skeleton
      _Group(title: 'Empty state · skeleton', children: [
        EmptyState(
          illustration: const TtIllustration(IllustrationKind.emptyTrips, width: 160, height: 120),
          title: 'No trips yet',
          message: 'Your rides and parcels will show up here.',
          actionLabel: 'Book a ride',
          onAction: () => _snack('Book a ride tapped'),
        ),
        gap,
        const SkeletonShimmer(
          child: Row(
            children: [
              SkeletonBox(width: 48, height: 48, circle: true),
              SizedBox(width: TtSpacing.m),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SkeletonBox(height: 14),
                    SizedBox(height: TtSpacing.s),
                    SkeletonBox(width: 120, height: 12),
                  ],
                ),
              ),
            ],
          ),
        ),
        caption('Skeleton with shimmer (S-07)'),
      ]),
    ];
  }

  // --------------------------------------------------------------------- map
  List<Widget> _map(BuildContext context) {
    final t = context.type;
    final from = Seed.gandhipuram.location;
    final to = Seed.brookefields.location;
    Widget legend(Widget marker, String title, String body) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Row(
            children: [
              SizedBox(width: 56, height: 48, child: Center(child: marker)),
              const SizedBox(width: TtSpacing.m),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: t.bodySmallMedium),
                    Text(body, style: t.caption.copyWith(color: TtColors.navy500)),
                  ],
                ),
              ),
            ],
          ),
        );
    return [
      ClipRRect(
        borderRadius: TtRadii.cardRadius,
        child: SizedBox(
          height: 240,
          child: Stack(
            children: [
              TtMap(
                interactive: false,
                pickup: from,
                drop: to,
                route: [from, LatLng(11.0140, 76.9660), to],
                vehicles: [
                  MapVehicle(position: LatLng(11.0165, 76.9700), type: MapVehicleType.bike, heading: 230),
                  MapVehicle(position: LatLng(11.0120, 76.9690), type: MapVehicleType.car, heading: 110),
                ],
                center: LatLng((from.latitude + to.latitude) / 2, (from.longitude + to.longitude) / 2),
                zoom: 14.2,
                // A demand hex (res 7) with its busy nested hexes (res 8), as on the driver map.
                polygons: [
                  MapPolygon(
                    points: hexagonAround(from, HexRes.r7),
                    fillColor: TtColors.coral500.withValues(alpha: 0.12),
                    strokeColor: TtColors.coral500.withValues(alpha: 0.85),
                    strokeWidth: 2,
                  ),
                  for (final (i, c) in hexDisk(from, HexRes.r8, 1, rotation: HexRes.childRotation).indexed)
                    MapPolygon(
                      points: hexagonAround(c, HexRes.r8, rotation: HexRes.childRotation),
                      fillColor: TtColors.coral500.withValues(alpha: i == 0 ? 0.3 : 0.12),
                      strokeColor: TtColors.coral500.withValues(alpha: 0.45),
                      strokeWidth: 1,
                      zIndex: 1,
                    ),
                ],
              ),
              Positioned(
                right: TtSpacing.m,
                top: TtSpacing.m,
                child: MapCircleButton(
                  icon: Symbols.my_location_rounded,
                  tooltip: 'Recentre',
                  onPressed: () => _snack('Recentre tapped'),
                ),
              ),
              const Positioned(left: TtSpacing.m, bottom: TtSpacing.xl, child: DemandLabel(text: 'High demand · Gandhipuram')),
            ],
          ),
        ),
      ),
      const SizedBox(height: TtSpacing.m),
      legend(const PickupDot(), 'Pickup', 'Green ring, white centre, white edge + soft shadow'),
      legend(const DropDot(), 'Drop', 'Red ring, white centre (lists: red pin)'),
      legend(
        Container(
          width: 40,
          height: 5,
          decoration: const BoxDecoration(color: TtColors.navy900, borderRadius: TtRadii.pillRadius),
        ),
        'Route',
        'navy-900 (near black) · 5px · round caps and joins',
      ),
      legend(
        const SizedBox(width: 48, height: 48, child: PulseRing(animate: false, size: 48)),
        'Pulse ring',
        'Searching for a driver (animated in the flow)',
      ),
      legend(
        CustomPaint(size: const Size(40, 40), painter: _HexSwatchPainter()),
        'Areas are hexes',
        'Service area, demand and search areas are H3 hexes, never a circle with a radius (the search pulse stays round)',
      ),
      legend(const DemandLabel(text: '1.1x'), 'Demand label', 'Callout on the busiest demand hexes'),
      const _SubLabel('Driver vehicle · top-down, rotates with heading'),
      Wrap(
        spacing: TtSpacing.xl,
        runSpacing: TtSpacing.m,
        children: [
          for (final type in MapVehicleType.values)
            Column(
              children: [
                SizedBox(width: 56, height: 48, child: Center(child: VehicleMarker(type: type))),
                const SizedBox(height: TtSpacing.xs),
                Text(type.name, style: t.caption),
              ],
            ),
          Column(
            children: [
              const SizedBox(width: 72, height: 48, child: Center(child: VehicleMarker(type: MapVehicleType.car, large: true, heading: 45))),
              const SizedBox(height: TtSpacing.xs),
              Text('large · 45°', style: t.caption),
            ],
          ),
        ],
      ),
      const _SubLabel('Map colours'),
      const _SwatchGroup(null, [
        _Swatch('Land', TtColors.mapLand, null),
        _Swatch('Roads', TtColors.mapRoad, null),
        _Swatch('Water', TtColors.mapWater, null),
        _Swatch('Parks', TtColors.mapPark, null),
      ]),
    ];
  }

  // ----------------------------------------------------------- illustrations
  List<Widget> _illustrations(BuildContext context) {
    final t = context.type;
    return [
      LayoutBuilder(
        builder: (context, c) {
          final cols = c.maxWidth >= 520 ? 4 : 3;
          final w = (c.maxWidth - (cols - 1) * TtSpacing.m) / cols;
          return Wrap(
            spacing: TtSpacing.m,
            runSpacing: TtSpacing.m,
            children: [
              for (final kind in IllustrationKind.values)
                SizedBox(
                  width: w,
                  child: Column(
                    children: [
                      TtIllustration(kind, width: w, height: 88),
                      const SizedBox(height: TtSpacing.xs),
                      Text(
                        kind.name,
                        style: t.caption.copyWith(color: TtColors.navy700),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
            ],
          );
        },
      ),
      const SizedBox(height: TtSpacing.l),
      TtCard(
        color: TtColors.background,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Rules', style: t.bodySemibold),
            const SizedBox(height: TtSpacing.s),
            const Row(
              children: [
                _Dot(TtColors.coral500),
                _Dot(TtColors.navy900),
                _Dot(TtColors.coral50),
                _Dot(TtColors.skin),
              ],
            ),
            const SizedBox(height: TtSpacing.s),
            for (final r in const [
              'Flat fills, no gradients, no outlines',
              '2–3 palette colours per piece + one skin tone',
              'Rounded, geometric shapes echoing the wordmark',
              'Built in Flutter with widgets / CustomPainter, no image files',
            ])
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text('• $r', style: t.bodySmall),
              ),
          ],
        ),
      ),
    ];
  }
}

void _noop() {}

/// One numbered board section ("01 Brand").
class _Section extends StatelessWidget {
  const _Section({required this.number, required this.title, this.subtitle, required this.children});

  final String number;
  final String title;
  final String? subtitle;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Container(
      margin: const EdgeInsets.only(top: TtSpacing.l),
      padding: const EdgeInsets.all(TtSpacing.l),
      decoration: BoxDecoration(
        color: TtColors.surface,
        borderRadius: TtRadii.cardRadius,
        border: Border.all(color: TtColors.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(number, style: t.bodySmallMedium.copyWith(color: TtColors.coral600)),
              const SizedBox(width: TtSpacing.m),
              Expanded(child: Text(title, style: t.h1)),
            ],
          ),
          if (subtitle != null)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(subtitle!, style: t.caption.copyWith(color: TtColors.navy500)),
            ),
          const SizedBox(height: TtSpacing.m),
          ...children,
        ],
      ),
    );
  }
}

/// A labelled component group inside the Components section.
class _Group extends StatelessWidget {
  const _Group({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: TtSpacing.l),
        padding: const EdgeInsets.all(TtSpacing.m),
        decoration: BoxDecoration(
          color: TtColors.background,
          borderRadius: TtRadii.cardRadius,
          border: Border.all(color: TtColors.divider),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.only(bottom: TtSpacing.m),
              child: Text(title.toUpperCase(), style: context.type.overline.copyWith(color: TtColors.navy500)),
            ),
            ...children,
          ],
        ),
      );
}

class _SubLabel extends StatelessWidget {
  const _SubLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: TtSpacing.l, bottom: TtSpacing.s),
        child: Text(text.toUpperCase(), style: context.type.overline.copyWith(color: TtColors.navy500)),
      );
}

class _Swatch {
  const _Swatch(this.name, this.color, this.usage);
  final String name;
  final Color color;
  final String? usage;
}

/// A titled grid of colour swatches with name, hex and usage.
class _SwatchGroup extends StatelessWidget {
  const _SwatchGroup(this.title, this.swatches);

  final String? title;
  final List<_Swatch> swatches;

  static String hex(Color c) {
    final v = c.toARGB32();
    final a = (v >> 24) & 0xFF;
    final rgb = (v & 0xFFFFFF).toRadixString(16).padLeft(6, '0').toUpperCase();
    return a == 0xFF ? '#$rgb' : '#${a.toRadixString(16).padLeft(2, '0').toUpperCase()}$rgb';
  }

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (title != null) _SubLabel(title!),
        LayoutBuilder(
          builder: (context, c) {
            final cols = c.maxWidth >= 560 ? 4 : 2;
            final w = (c.maxWidth - (cols - 1) * TtSpacing.m) / cols;
            return Wrap(
              spacing: TtSpacing.m,
              runSpacing: TtSpacing.m,
              children: [
                for (final s in swatches)
                  SizedBox(
                    width: w,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          height: 56,
                          decoration: BoxDecoration(
                            color: s.color,
                            borderRadius: TtRadii.cardRadius,
                            border: Border.all(color: TtColors.divider),
                          ),
                        ),
                        const SizedBox(height: TtSpacing.xs),
                        Text(s.name, style: t.bodySmallMedium, maxLines: 1, overflow: TextOverflow.ellipsis),
                        Text(hex(s.color), style: TtTextStyles.tabular(t.caption.copyWith(color: TtColors.navy700))),
                        if (s.usage != null)
                          Text(s.usage!, style: t.caption.copyWith(color: TtColors.navy500), maxLines: 3),
                      ],
                    ),
                  ),
              ],
            );
          },
        ),
      ],
    );
  }
}

/// Lays [child] out at the designed 358px content width, scaling it down on narrower
/// boards (the board is nested inside cards, so it is narrower than a screen).
class _AtWidth extends StatelessWidget {
  const _AtWidth({required this.child});
  final Widget child;
  static const double width = 358;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (context, c) => c.maxWidth >= width
            ? child
            : FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.topLeft,
                child: SizedBox(width: width, child: child),
              ),
      );
}

/// Renders an app bar at its preferred height inside the board.
class _BarPreview extends StatelessWidget {
  const _BarPreview({required this.bar});
  final PreferredSizeWidget bar;

  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: TtRadii.cardRadius,
        child: MediaQuery.removePadding(
          context: context,
          removeTop: true,
          child: SizedBox(height: bar.preferredSize.height, child: bar),
        ),
      );
}

class _Dot extends StatelessWidget {
  const _Dot(this.color);
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
        width: 28,
        height: 28,
        margin: const EdgeInsets.only(right: TtSpacing.s),
        decoration: BoxDecoration(color: color, shape: BoxShape.circle, border: Border.all(color: TtColors.divider)),
      );
}

/// A demand hex swatch for the map legend.
class _HexSwatchPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final path = hexagonPath(size.center(Offset.zero), size.width / 2 - 2);
    canvas.drawPath(path, Paint()..color = TtColors.coral500.withValues(alpha: 0.18));
    canvas.drawPath(
      path,
      Paint()
        ..color = TtColors.coral500
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..strokeJoin = StrokeJoin.round,
    );
  }

  @override
  bool shouldRepaint(covariant _HexSwatchPainter oldDelegate) => false;
}
