import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../router/routes.dart';
import '../../state/parcel_flow.dart';
import '../../state/passenger_session.dart';
import 'widgets/parcel_widgets.dart';

/// Sample landmark shown on PP-03.
const _sampleDropNote = 'House 14, near Race Course walking track';

/// Seeded phone contacts for "Choose from contacts".
const _contacts = [
  (name: Seed.receiverName, phone: Seed.receiverPhone),
  (name: 'Karthika Sundar', phone: '+91 98430 56712'),
  (name: 'Suresh Kumar', phone: '+91 99440 23581'),
];

/// What a drop can be saved as from PP-03 (a Shop is saved as an "other" place with that label).
enum _SaveAs {
  home('Home', Symbols.home_rounded, SavedPlaceKind.home),
  work('Work', Symbols.work_rounded, SavedPlaceKind.work),
  shop('Shop', Symbols.storefront_rounded, SavedPlaceKind.other);

  const _SaveAs(this.label, this.icon, this.kind);
  final String label;
  final IconData icon;
  final SavedPlaceKind kind;
}

/// PP-03 Drop / receiver details: the drop on a map (any town when sending to another town; move the map to
/// fine-tune the point), the receiver (or "I'm receiving it myself"), a landmark, and optionally save the drop as
/// Home / Work / Shop. Confirm → PP-06 choose vehicle and book.
class PP03DropDetailsScreen extends ConsumerStatefulWidget {
  const PP03DropDetailsScreen({super.key, this.onMap = false, this.showcase = false});

  /// Opened from "Set on map": the sheet starts pulled down, so the map is big for moving the pin.
  final bool onMap;

  /// Opened on its own from the Design gallery: render seed state, start no timers.
  final bool showcase;

  @override
  ConsumerState<PP03DropDetailsScreen> createState() => _PP03DropDetailsScreenState();
}

class _PP03DropDetailsScreenState extends ConsumerState<PP03DropDetailsScreen> {
  late final TextEditingController _name;
  late final TextEditingController _phone;
  late final TextEditingController _note;
  late Place _drop;
  String? _nameError;
  String? _phoneError;

  /// "I'm receiving it myself": the receiver is the sender.
  bool _self = false;

  /// [_self] with the rider's name and number known: shown as a card, nothing to type. Without them the fields
  /// stay so the rider can fill in what is missing.
  bool _selfCard = false;
  _SaveAs? _saveAs;

  /// The form is a sheet over the map: drag it down for more map to move the pin, up for the form.
  final _sheet = DraggableScrollableController();

  /// The sheet's size while it moves (a fraction of the body; null: where it started). The map follows it.
  final _sheetSize = ValueNotifier<double?>(null);

  /// Where the sheet came to rest, for the map's padding (null: where it started).
  double? _restSize;
  double _startSize = 0.62;
  Timer? _settle;

  /// The body's height in the last layout, and whether the sheet leaves enough map for the pin.
  double _bodyHeight = 0;
  final _pinShown = ValueNotifier<bool>(true);

  /// The keyboard is up: the sheet opened all the way, and goes back to [_beforeKeyboard] when it closes. Null
  /// until the first build: a keyboard still closing from the search that opened PP-03 changes nothing.
  bool? _keyboardUp;
  double? _beforeKeyboard;

  @override
  void initState() {
    super.initState();
    final s = ref.read(parcelFlowProvider);
    _drop = s.drop;
    _name = TextEditingController(text: s.details.receiverName);
    _phone = TextEditingController(text: localPhone(s.details.receiverPhone));
    final live = ref.read(isLiveApiProvider);
    _note = TextEditingController(text: s.details.dropNote.isEmpty && !live ? _sampleDropNote : s.details.dropNote);
    // A parcel coming to the rider (PP-01 Switch): the receiver is already them.
    final receiver = s.details.receiverPhone;
    _self = receiver.trim().isNotEmpty && apiPhone(receiver) == apiPhone(ref.read(currentProfileProvider).phone);
    _selfCard = _self && _name.text.trim().isNotEmpty;
  }

  @override
  void dispose() {
    _settle?.cancel();
    _sheet.dispose();
    _sheetSize.dispose();
    _pinShown.dispose();
    _name.dispose();
    _phone.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _changePlace() async {
    // Else the field typed in last takes the focus back when search closes, and its keyboard hides the map.
    FocusScope.of(context).unfocus();
    final outstation = ref.read(parcelFlowProvider).outstation;
    final p = await showParcelPlacePicker(context, title: outstation ? 'Deliver to (any town)' : 'Deliver to', current: _drop, anywhere: outstation);
    if (p == null || !mounted) return;
    _setDrop(p);
  }

  void _setDrop(Place p) {
    setState(() => _drop = p);
    ref.read(parcelFlowProvider.notifier).setDrop(p);
  }

  Future<void> _pickContact() async {
    final picked = await showTtSheet<({String name, String phone})>(
      context,
      builder: (ctx) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('Choose a contact', style: ctx.type.h2),
          const SizedBox(height: 8),
          for (final c in _contacts)
            InkWell(
              onTap: () => Navigator.of(ctx).pop(c),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 10),
                child: Row(
                  children: [
                    TtAvatar(initials: _initials(c.name), size: 44),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(c.name, style: ctx.type.bodyMedium),
                          Text(c.phone, style: TtTextStyles.tabular(ctx.type.bodySmall.copyWith(color: TtColors.navy500))),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
    if (picked == null || !mounted) return;
    setState(() {
      _name.text = picked.name;
      _phone.text = localPhone(picked.phone);
      _nameError = null;
      _phoneError = null;
    });
  }

  static String _initials(String name) {
    final p = name.trim().split(RegExp(r'\s+'));
    return (p.first.substring(0, 1) + (p.length > 1 ? p[1].substring(0, 1) : '')).toUpperCase();
  }

  void _setSelf(bool v) {
    final d = ref.read(parcelFlowProvider).details;
    final me = ref.read(passengerProfileProvider).value;
    final name = d.senderName.trim().isNotEmpty ? d.senderName : (me?.name ?? '');
    final phone = d.senderPhone.trim().isNotEmpty ? d.senderPhone : (me?.phone ?? '');
    setState(() {
      _self = v;
      _selfCard = v && name.trim().isNotEmpty && phoneDigits(localPhone(phone)).length == 10;
      _nameError = null;
      _phoneError = null;
      if (v) {
        _name.text = name;
        _phone.text = localPhone(phone);
      } else {
        _name.clear();
        _phone.clear();
      }
    });
  }

  /// Saves the drop as [_saveAs] (one Home and one Work: a new one replaces the old). Fire and forget.
  void _saveDrop() {
    final as = _saveAs;
    if (as == null) return;
    final saved = ref.read(passengerProfileProvider).value?.savedPlaces ?? const <SavedPlace>[];
    final same = as.kind == SavedPlaceKind.other ? null : saved.where((s) => s.kind == as.kind).firstOrNull;
    final place = SavedPlace(
      id: same?.id ?? 'sp-${DateTime.now().microsecondsSinceEpoch}',
      label: as.label,
      kind: as.kind,
      place: _drop,
    );
    ref.read(passengerProfileProvider.notifier).saveSavedPlace(place).then((ok) {
      if (ok && mounted) showTtSnack(context, '${_drop.name} saved as ${as.label}', success: true);
    });
  }

  void _confirm() {
    final name = _name.text.trim();
    final digits = phoneDigits(_phone.text);
    setState(() {
      _nameError = name.isEmpty ? 'Enter the receiver’s name' : null;
      _phoneError = digits.length != 10 ? 'Enter a 10-digit mobile number' : null;
    });
    if (_nameError != null || _phoneError != null) {
      // The sheet was pulled down to the map: bring the receiver fields and their message back into view.
      if (_sheet.isAttached && _sheet.size < _startSize) _moveSheet(_startSize);
      return;
    }
    final ctrl = ref.read(parcelFlowProvider.notifier);
    ctrl.setDrop(_drop);
    final d = ref.read(parcelFlowProvider).details;
    ctrl.updateDetails(d.copyWith(receiverName: name, receiverPhone: fullPhone(digits), dropNote: _note.text.trim()));
    _saveDrop();
    context.push(Routes.parcelReview);
  }

  void _moveSheet(double size) =>
      _sheet.animateTo(size, duration: const Duration(milliseconds: 250), curve: Curves.easeOutCubic);

  /// The keyboard came up (the form takes the whole body, as the map used to fold away) or went down (back to
  /// where the sheet was).
  void _followKeyboard(bool up) {
    if (up == _keyboardUp) return;
    final first = _keyboardUp == null;
    _keyboardUp = up;
    if (first) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_sheet.isAttached) return;
      if (up) {
        _beforeKeyboard = _sheet.size;
        _moveSheet(1);
      } else if (_beforeKeyboard case final size?) {
        _beforeKeyboard = null;
        _moveSheet(size);
      }
    });
  }

  /// The sheet moved: once it rests, the map's padding follows (not every frame: the native map would re-lay out).
  bool _onSheetMoved(DraggableScrollableNotification n) {
    _sheetSize.value = n.extent;
    _pinShown.value = _bodyHeight * (1 - n.extent) >= 120;
    _settle?.cancel();
    _settle = Timer(const Duration(milliseconds: 180), () {
      if (mounted && n.extent != _restSize) setState(() => _restSize = n.extent);
    });
    return false;
  }

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final firstName = _name.text.trim().isEmpty ? 'The receiver' : _name.text.trim().split(' ').first;
    _followKeyboard(MediaQuery.viewInsetsOf(context).bottom > 0);
    return Scaffold(
      backgroundColor: TtColors.surface,
      appBar: const TtAppBar(title: 'Drop details'),
      body: Column(
        children: [
          Expanded(
            child: LayoutBuilder(
              builder: (context, box) {
                final h = box.maxHeight;
                // The sizes come from the height without the keyboard, so they hold still while it opens or closes.
                final full = h + MediaQuery.viewInsetsOf(context).bottom;
                // At rest the map shows ~220 px above the form; pulled down, the sheet keeps the drop's card.
                final minSize = (150 / full).clamp(0.15, 0.5);
                _startSize = (1 - 220 / full).clamp(minSize, 0.85);
                final firstSize = widget.onMap ? minSize : _startSize;
                _bodyHeight = h;
                // The map is as tall as the most of it the sheet ever shows (pulled down to the drop's card). It
                // slides half as far as the sheet: its middle, where the pin is, stays the middle of the map that
                // shows, and pin and map move together, so the point under the pin never changes.
                final mapHeight = full * (1 - minSize);
                double shown(double? size) => h * (1 - (size ?? firstSize));
                return Stack(
                  children: [
                    Positioned(
                      left: 0,
                      right: 0,
                      top: 0,
                      height: mapHeight,
                      child: ValueListenableBuilder<double?>(
                        valueListenable: _sheetSize,
                        builder: (context, size, map) =>
                            Transform.translate(offset: Offset(0, (shown(size) - mapHeight) / 2), child: map),
                        child: ParcelPinMap(
                          place: _drop,
                          isPickup: false,
                          height: mapHeight,
                          // Once the sheet rests: the Google logo just above it.
                          visibleHeight: math.min(shown(_restSize), mapHeight),
                          pinShown: _pinShown,
                          interactive: !widget.showcase,
                          onMoved: _setDrop,
                        ),
                      ),
                    ),
                    NotificationListener<DraggableScrollableNotification>(
                      onNotification: _onSheetMoved,
                      child: MapBottomSheet(
                        controller: _sheet,
                        initialSize: firstSize,
                        minSize: minSize,
                        maxSize: 1,
                        // Settles at the map (drop card), the form or full height, never half way. The keyboard's
                        // moves (animateTo) don't snap.
                        snap: true,
                        snapSizes: [_startSize],
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                        builder: (context) => [_form(t, firstName)],
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              child: TtButton(label: 'Confirm drop', onPressed: _confirm),
            ),
          ),
        ],
      ),
    );
  }

  /// The sheet's content: the drop, the receiver, a landmark and "Save this address".
  Widget _form(TtTextStyles t, String firstName) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ParcelLocationCard(place: _drop, isPickup: false, onChange: _changePlace),
        const SizedBox(height: 12),
        _SelfToggle(value: _self, onChanged: _setSelf),
        const SizedBox(height: 12),
        // The rider is the receiver: their name and number as they are, not greyed-out locked fields
        // (the name used to look like an empty field's hint).
        if (_selfCard)
          _SelfReceiver(name: _name.text.trim(), phone: _phone.text, initials: _initials(_name.text))
        else ...[
          TtTextField(
            label: 'Receiver name',
            controller: _name,
            errorText: _nameError,
            textCapitalization: TextCapitalization.words,
            textInputAction: TextInputAction.next,
            onChanged: (_) => setState(() => _nameError = null),
          ),
          const SizedBox(height: 16),
          ParcelPhoneField(
            label: 'Receiver phone',
            controller: _phone,
            errorText: _phoneError,
            onChanged: (_) {
              if (_phoneError != null) setState(() => _phoneError = null);
            },
            // The contact list is seeded demo data; the live app has no contacts permission.
            suffix: ref.watch(isLiveApiProvider) || _self
                ? null
                : IconButton(
                    tooltip: 'Choose from contacts',
                    onPressed: _pickContact,
                    icon: const Icon(Symbols.contact_page_rounded, color: TtColors.coral600),
                  ),
          ),
        ],
        const SizedBox(height: 6),
        Text(_self ? 'You get the delivery OTP in the app' : '$firstName gets the delivery OTP and a tracking link by SMS',
            style: t.caption.copyWith(color: TtColors.navy500)),
        const SizedBox(height: 16),
        Text.rich(
          TextSpan(children: [
            const TextSpan(text: 'Landmark '),
            TextSpan(text: '(optional)', style: t.bodySmall.copyWith(color: TtColors.navy500)),
          ]),
          style: t.bodySmallMedium.copyWith(color: TtColors.navy700),
        ),
        const SizedBox(height: 6),
        TtTextField(
          hint: 'House number, nearby landmark',
          controller: _note,
          textCapitalization: TextCapitalization.sentences,
        ),
        const SizedBox(height: 20),
        Text.rich(
          TextSpan(children: [
            const TextSpan(text: 'Save this address '),
            TextSpan(text: '(optional)', style: t.bodySmall.copyWith(color: TtColors.navy500)),
          ]),
          style: t.bodySmallMedium.copyWith(color: TtColors.navy700),
        ),
        const SizedBox(height: 8),
        ChoiceChips<_SaveAs>(
          options: _SaveAs.values,
          labelOf: (a) => a.label,
          iconOf: (a) => a.icon,
          selected: {?_saveAs},
          onChanged: (a) => setState(() => _saveAs = _saveAs == a ? null : a),
        ),
      ],
    );
}

/// The receiver when it is the rider: "Receiver", then their initials, name and number.
class _SelfReceiver extends StatelessWidget {
  const _SelfReceiver({required this.name, required this.phone, required this.initials});
  final String name;

  /// "98765 43210"
  final String phone;
  final String initials;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Receiver', style: t.bodySmallMedium.copyWith(color: TtColors.navy700)),
        const SizedBox(height: 6),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: TtColors.inputBg, borderRadius: TtRadii.cardRadius),
          child: Row(
            children: [
              TtAvatar(initials: initials, size: 44),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(name, style: t.bodySemibold, maxLines: 1, overflow: TextOverflow.ellipsis),
                    Text('+91 $phone', style: TtTextStyles.tabular(t.bodySmall.copyWith(color: TtColors.navy500))),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// "I'm receiving it myself".
class _SelfToggle extends StatelessWidget {
  const _SelfToggle({required this.value, required this.onChanged});
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Material(
      color: value ? TtColors.coral50 : TtColors.inputBg,
      borderRadius: TtRadii.cardRadius,
      child: InkWell(
        borderRadius: TtRadii.cardRadius,
        onTap: () => onChanged(!value),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 4, 4, 4),
          child: Row(
            children: [
              Icon(Symbols.person_pin_circle_rounded, color: value ? TtColors.coral600 : TtColors.navy700),
              const SizedBox(width: 10),
              Expanded(child: Text("I'm receiving it myself", style: t.bodyMedium)),
              Checkbox(value: value, onChanged: (v) => onChanged(v ?? false)),
            ],
          ),
        ),
      ),
    );
  }
}
