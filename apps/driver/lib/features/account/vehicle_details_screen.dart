import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../router/routes.dart';
import '../../state/driver_account.dart';
import '../../state/driver_session.dart';
import '../../state/live_helpers.dart';
import '../../state/registration.dart';
import 'widgets/edit_form_scaffold.dart';

/// Account › Vehicle details: model, colour and number plate (prefilled from the loaded profile; a spinner, then
/// Retry, until it loads), Save → back.
class VehicleDetailsScreen extends ConsumerStatefulWidget {
  const VehicleDetailsScreen({super.key, this.showcase = false});

  /// Opened on its own from the Design gallery: render seed state, start no timers.
  final bool showcase;

  @override
  ConsumerState<VehicleDetailsScreen> createState() => _VehicleDetailsScreenState();
}

class _VehicleDetailsScreenState extends ConsumerState<VehicleDetailsScreen> {
  final _model = TextEditingController();
  final _color = TextEditingController();
  final _plate = TextEditingController();

  /// The profile the form was filled from (null until it loads: nothing seeded is shown or saved).
  DriverProfile? _p;
  bool _saving = false;
  bool _tried = false;

  @override
  void initState() {
    super.initState();
    final p = widget.showcase ? Seed.karthik : ref.read(driverProfileProvider).value;
    if (p != null) _fill(p);
  }

  void _fill(DriverProfile p) {
    _p = p;
    _model.text = p.vehicleModel;
    _color.text = p.vehicleColor;
    _plate.text = p.plate;
  }

  @override
  void dispose() {
    _model.dispose();
    _color.dispose();
    _plate.dispose();
    super.dispose();
  }

  bool get _plateOk => kPlatePattern.hasMatch(_plate.text.trim());

  /// The API takes 2–60 characters.
  bool get _modelOk {
    final n = _model.text.trim().length;
    return n >= 2 && n <= 60;
  }

  static String _plateKey(String plate) => plate.replaceAll(RegExp(r'\s'), '').toUpperCase();

  /// Saves. Live, a new number plate needs a new RC check: the driver confirms first; once saved the API puts them
  /// back under review (offline, RC to upload again), so the app goes offline and opens the registration page.
  Future<void> _save() async {
    setState(() => _tried = true);
    if (!_modelOk || !_plateOk) return;
    if (widget.showcase) {
      showTtSnack(context, 'Design preview: nothing is saved');
      return;
    }
    final current = ref.read(driverProfileProvider).value;
    if (current == null) return;
    final plate = _plate.text.trim().toUpperCase();
    final newPlate = ref.read(isLiveApiProvider) && _plateKey(plate) != _plateKey(current.plate);
    if (newPlate) {
      final ok = await showTtConfirm(
        context,
        title: 'Change the number plate?',
        message: "Changing the number plate needs a new RC check. You can't go online until an admin verifies it.",
        confirmLabel: 'Change plate',
        cancelLabel: 'Keep the old plate',
        icon: Symbols.directions_car_rounded,
      );
      if (!ok || !mounted) return;
    }
    setState(() => _saving = true);
    try {
      await ref.read(driverProfileProvider.notifier).save(current.copyWith(
            vehicleModel: _model.text.trim(),
            vehicleColor: _color.text.trim(),
            plate: plate,
          ));
    } on Exception catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      showTtSnack(context, e is ApiException && e.status == 409 ? 'This number plate is already registered' : userMessage(e));
      return;
    }
    if (!mounted) return;
    if (newPlate) {
      // Under review again: offline here too (the server already is); Home's verify banner leads to the RC to upload.
      ref
        ..invalidate(driverProfileProvider)
        ..invalidate(kycProvider)
        ..invalidate(driverApprovalProvider);
      await ref.read(driverSessionProvider.notifier).goOffline(tellServer: false);
      if (!mounted) return;
      context.go(Routes.home);
      showTtSnack(context, 'Plate saved. Upload the RC of your new vehicle');
      return;
    }
    showTtSnack(context, 'Vehicle details saved', success: true);
    context.pop();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final profile = widget.showcase ? const AsyncData(Seed.karthik) : ref.watch(driverProfileProvider);
    if (_p == null && profile.value != null) _fill(profile.value!);
    final p = _p;
    if (p == null) {
      return EditFormScaffold(
        title: 'Vehicle details',
        loading: true,
        error: profile.hasError ? profile.error : null,
        what: 'your vehicle',
        onRetry: () => ref.invalidate(driverProfileProvider),
        onSave: null,
        children: const [],
      );
    }
    return EditFormScaffold(
      title: 'Vehicle details',
      saving: _saving,
      onSave: _save,
      children: [
        Text('Vehicle type', style: t.bodyMedium.copyWith(color: TtColors.navy700)),
        const SizedBox(height: TtSpacing.s),
        TtCard(
          child: Row(children: [
            Icon(p.vehicleKind.icon, color: TtColors.coral600),
            const SizedBox(width: TtSpacing.m),
            Expanded(child: Text(p.vehicleKind.label, style: t.bodySemibold)),
            Text('Set at sign-up', style: t.caption),
          ]),
        ),
        const SizedBox(height: TtSpacing.l),
        TtTextField(
          label: 'Model',
          controller: _model,
          textCapitalization: TextCapitalization.words,
          errorText: _tried && !_modelOk ? 'Enter the vehicle model (2 to 60 letters)' : null,
        ),
        const SizedBox(height: TtSpacing.l),
        TtTextField(label: 'Colour', controller: _color, textCapitalization: TextCapitalization.words),
        const SizedBox(height: TtSpacing.l),
        TtTextField(
          label: 'Number plate',
          controller: _plate,
          textCapitalization: TextCapitalization.characters,
          errorText: _tried && !_plateOk ? 'Use the format TN 37 AB 4521' : null,
        ),
        const SizedBox(height: TtSpacing.m),
        Text('A new number plate needs a new RC check before you can go online.', style: t.caption),
      ],
    );
  }
}
