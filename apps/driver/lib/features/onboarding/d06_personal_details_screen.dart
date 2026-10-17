import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../common/showcase.dart';
import '../../router/routes.dart';
import '../../state/driver_account.dart';
import '../../state/live_helpers.dart';
import 'widgets/signup_widgets.dart';

/// D-06 Personal details: photo, name, gender, city (locked), the vehicle's model,
/// colour and number plate, emergency contact and the UPI ID that receives fares. "Save and continue"
/// → D-07. Live API: this is where the driver account (with its free trial) is created; the API's
/// validation messages (plate, UPI ID) show in a snack bar.
class D06PersonalDetailsScreen extends ConsumerStatefulWidget {
  const D06PersonalDetailsScreen({super.key, this.showcase = false});

  /// Opened on its own from the Design gallery: render seed state, start no timers.
  final bool showcase;

  @override
  ConsumerState<D06PersonalDetailsScreen> createState() =>
      _D06PersonalDetailsScreenState();
}

class _D06PersonalDetailsScreenState
    extends ConsumerState<D06PersonalDetailsScreen> {
  late final SignupDraft _draft = ref.read(signupProvider);
  late final TextEditingController _name = TextEditingController(
    text: _draft.name,
  );
  late final TextEditingController _emergency = TextEditingController(
    text: _draft.emergencyContact.replaceFirst('+91', '').trim(),
  );
  late final TextEditingController _upi = TextEditingController(
    text: _draft.upiId,
  );
  late final bool _live = ref.read(isLiveApiProvider);

  /// Mock: the seed driver's vehicle for the chosen type unless the driver typed one.
  late final DriverProfile _seedDriver = _draft.vehicle.isGoods
      ? Seed.selvam
      : Seed.karthik;
  late final TextEditingController _model = TextEditingController(
    text: _draft.vehicleModel.isNotEmpty || _live
        ? _draft.vehicleModel
        : _seedDriver.vehicleModel,
  );
  late final TextEditingController _color = TextEditingController(
    text: _draft.vehicleColor.isNotEmpty || _live
        ? _draft.vehicleColor
        : _seedDriver.vehicleColor,
  );
  late final TextEditingController _plate = TextEditingController(
    text: _draft.plate.isNotEmpty || _live ? _draft.plate : _seedDriver.plate,
  );

  /// Live API: fields start empty, so errors show only after the first "Save and continue".
  bool _tried = false;
  late Gender _gender = _draft.gender;
  late bool _hasPhoto = _draft.hasPhoto;
  bool _saving = false;

  @override
  void dispose() {
    _name.dispose();
    _emergency.dispose();
    _upi.dispose();
    _model.dispose();
    _color.dispose();
    _plate.dispose();
    super.dispose();
  }

  bool get _upiValid {
    final v = _upi.text.trim();
    if (_live) return kUpiPattern.hasMatch(v);
    final at = v.indexOf('@');
    return at > 0 && at < v.length - 1;
  }

  bool get _modelValid => _model.text.trim().length >= 2;
  bool get _plateValid => kPlatePattern.hasMatch(_plate.text.trim());
  bool get _showErrors => !_live || _tried;

  bool get _valid =>
      _name.text.trim().length >= 2 &&
      _upiValid &&
      PhoneInput.digitsOf(_emergency.text).length == 10 &&
      _modelValid &&
      _plateValid;

  String get _initials {
    final parts = _name.text
        .trim()
        .split(RegExp(r'\s+'))
        .where((p) => p.isNotEmpty)
        .toList();
    if (parts.isEmpty) return 'D';
    return parts.take(2).map((p) => p[0].toUpperCase()).join();
  }

  Future<void> _save() async {
    if (widget.showcase) return showTtSnack(context, kPreviewNote);
    if (_saving) return;
    if (!_valid) {
      setState(() => _tried = true);
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() => _saving = true);
    final digits = PhoneInput.digitsOf(_emergency.text);
    ref
        .read(signupProvider.notifier)
        .update(
          (d) => d.copyWith(
            name: _name.text.trim(),
            gender: _gender,
            emergencyContact:
                '+91 ${digits.substring(0, 5)} ${digits.substring(5)}',
            upiId: _upi.text.trim(),
            hasPhoto: _hasPhoto,
            vehicleModel: _model.text.trim(),
            vehicleColor: _color.text.trim(),
            plate: _plate.text.trim().toUpperCase(),
          ),
        );
    try {
      await ref.read(signupProvider.notifier).commit();
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      showTtSnack(
        context,
        e is Exception ? userMessage(e) : 'Something went wrong. Try again.',
      );
      return;
    }
    if (!mounted) return;
    setState(() => _saving = false);
    // Back to the registration page, now with the documents open.
    context.go(Routes.documents);
  }

  /// The service city the driver signs up in (the API's cities; empty until they load).
  String get _city {
    final cities = ref.watch(serviceCitiesProvider).value ?? const <ServiceCity>[];
    return nearestCity(cities, CityDefaults.center)?.name ?? '';
  }

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Scaffold(
      backgroundColor: TtColors.surface,
      appBar: SignupAppBar(title: 'Personal details', step: 3, onBack: backOr(context, Routes.chooseVehicle)),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: SingleChildScrollView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.fromLTRB(TtSpacing.l, TtSpacing.l, TtSpacing.l, TtSpacing.l),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Live: the real profile photo is taken on D-07, after the identity check (it must match the selfie).
                  if (!ref.watch(isLiveApiProvider)) ...[
                    _photoRow(t),
                    const SizedBox(height: TtSpacing.l),
                  ],
                  TtTextField(
                    label: 'Full name (as on licence)',
                    controller: _name,
                    textCapitalization: TextCapitalization.words,
                    textInputAction: TextInputAction.next,
                    onChanged: (_) => setState(() {}),
                    errorText: _showErrors && _name.text.trim().length < 2
                        ? 'Enter your name as on your licence'
                        : null,
                  ),
                  const SizedBox(height: TtSpacing.l),
                  TtTextField(
                    // A field reads its initial value once; keyed by the city, it shows it when the cities load.
                    key: ValueKey(_city),
                    label: 'City',
                    initialValue: _city,
                    enabled: false,
                    suffix: const Icon(
                      Symbols.lock_rounded,
                      color: TtColors.navy500,
                    ),
                  ),
                  const SizedBox(height: TtSpacing.l),
                  TtTextField(
                    label: 'Vehicle model',
                    hint: _draft.vehicle.isGoods
                        ? 'Bajaj Maxima Cargo'
                        : 'Honda Activa',
                    controller: _model,
                    textCapitalization: TextCapitalization.words,
                    textInputAction: TextInputAction.next,
                    onChanged: (_) => setState(() {}),
                    errorText: _showErrors && !_modelValid
                        ? 'Enter the vehicle model'
                        : null,
                  ),
                  const SizedBox(height: TtSpacing.l),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: TtTextField(
                          label: 'Number plate',
                          hint: 'TN 37 AB 4521',
                          controller: _plate,
                          textCapitalization: TextCapitalization.characters,
                          textInputAction: TextInputAction.next,
                          onChanged: (_) => setState(() {}),
                          errorText: _showErrors && !_plateValid ? 'Like TN 37 AB 4521' : null,
                        ),
                      ),
                      const SizedBox(width: TtSpacing.m),
                      Expanded(
                        child: TtTextField(
                          label: 'Colour',
                          controller: _color,
                          textCapitalization: TextCapitalization.words,
                          textInputAction: TextInputAction.next,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: TtSpacing.l),
                  Text('Gender', style: t.bodySmallMedium.copyWith(color: TtColors.navy700)),
                  const SizedBox(height: 6),
                  ChoiceChips<Gender>(
                    options: const [Gender.male, Gender.female, Gender.preferNotToSay],
                    labelOf: (g) => switch (g) {
                      Gender.male => 'Male',
                      Gender.female => 'Female',
                      Gender.preferNotToSay => 'Other',
                    },
                    selected: {_gender},
                    onChanged: (g) => setState(() => _gender = g),
                  ),
                  const SizedBox(height: TtSpacing.l),
                  PhoneInput(
                    label: 'Emergency contact',
                    controller: _emergency,
                    onChanged: (_) => setState(() {}),
                    errorText: !_showErrors || PhoneInput.digitsOf(_emergency.text).length == 10 ? null : 'Enter a 10-digit number',
                  ),
                  const SizedBox(height: TtSpacing.l),
                  TtTextField(
                    label: 'UPI ID for receiving fares',
                    controller: _upi,
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.done,
                    onChanged: (_) => setState(() {}),
                    errorText: !_showErrors || _upiValid ? null : 'Enter a valid UPI ID, like name@bank',
                    suffix: _upiValid
                        ? const Icon(Symbols.check_circle_rounded,
                            color: TtColors.success, fill: 1, semanticLabel: 'Valid UPI ID')
                        : null,
                  ),
                  if (_upiValid && !_live) ...[
                    const SizedBox(height: 6),
                    Text('Verified · ${_name.text.trim().toUpperCase()}',
                        style: t.caption.copyWith(color: TtColors.successText, fontWeight: FontWeight.w600)),
                  ],
                ],
              ),
            ),
          ),
          BottomActions(
            children: [
              TtButton(label: 'Save and continue', loading: _saving, onPressed: _valid || _live ? _save : null),
            ],
          ),
        ],
      ),
    );
  }

  Widget _photoRow(TtTextStyles t) {
    return Semantics(
      button: true,
      label: _hasPhoto ? 'Remove profile photo' : 'Add profile photo',
      excludeSemantics: true,
      child: InkWell(
        borderRadius: TtRadii.cardRadius,
        onTap: () => setState(() => _hasPhoto = !_hasPhoto),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: TtSpacing.xs),
          child: Row(
            children: [
              SizedBox(
                width: 88,
                height: 88,
                child: Stack(
                  children: [
                    if (_hasPhoto)
                      TtAvatar(initials: _initials, size: 84, tone: AvatarTone.dark)
                    else
                      Container(
                        width: 84,
                        height: 84,
                        decoration: const BoxDecoration(color: TtColors.coral50, shape: BoxShape.circle),
                        child: const DashedRing(
                          size: 84,
                          color: TtColors.coral100,
                          strokeWidth: 2,
                          dash: 6,
                          gap: 5,
                          child: Icon(Symbols.person_rounded, color: TtColors.coral600, size: 36),
                        ),
                      ),
                    Positioned(
                      right: 0,
                      bottom: 0,
                      child: Container(
                        width: 32,
                        height: 32,
                        decoration: BoxDecoration(
                          color: TtColors.coral600,
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 2),
                        ),
                        child: Icon(_hasPhoto ? Symbols.edit_rounded : Symbols.photo_camera_rounded,
                            size: 16, color: Colors.white),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: TtSpacing.l),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(_hasPhoto ? 'Profile photo added' : 'Add profile photo', style: t.bodySemibold),
                    Text(_hasPhoto ? 'Tap to remove or retake.' : 'Riders see this. Clear face, no sunglasses.',
                        style: t.bodySmall.copyWith(color: TtColors.navy500)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
