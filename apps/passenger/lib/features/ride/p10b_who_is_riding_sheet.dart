import 'package:flutter/material.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

/// P-10b "Who's riding?" (bottom sheet over P-10): me, or someone else with their name, mobile number and
/// "She's a woman" (which lets the ride use Butterfly). The driver sees and calls the rider; the ride OTP stays in
/// this app, so the account holder shares it with them.
class P10bWhoIsRidingSheet extends StatefulWidget {
  const P10bWhoIsRidingSheet({super.key, required this.me, this.current});

  /// The account holder's first name ("Me · Ravi").
  final String me;
  final OtherRider? current;

  /// Opens the sheet. Returns null when dismissed, else the choice: `(rider: null)` = me.
  static Future<({OtherRider? rider})?> show(BuildContext context, {required String me, OtherRider? current}) =>
      showTtSheet<({OtherRider? rider})>(context, builder: (_) => P10bWhoIsRidingSheet(me: me, current: current));

  @override
  State<P10bWhoIsRidingSheet> createState() => _P10bWhoIsRidingSheetState();
}

class _P10bWhoIsRidingSheetState extends State<P10bWhoIsRidingSheet> {
  late bool _other = widget.current != null;
  late final TextEditingController _name = TextEditingController(text: widget.current?.name ?? '');
  late final TextEditingController _phone = TextEditingController(text: _pretty(widget.current?.phone ?? ''));
  late bool _isWoman = widget.current?.isWoman ?? false;
  bool _tried = false;

  static String _pretty(String d) => d.length > 5 ? '${d.substring(0, 5)} ${d.substring(5)}' : d;

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    super.dispose();
  }

  String get _digits => PhoneInput.digitsOf(_phone.text);
  String? get _nameError => _name.text.trim().length < 2 ? 'Enter their name' : null;
  String? get _phoneError => RegExp(r'^[6-9]\d{9}$').hasMatch(_digits) ? null : 'Enter their 10-digit mobile number';

  void _done() {
    if (!_other) {
      Navigator.of(context).pop((rider: null));
      return;
    }
    setState(() => _tried = true);
    if (_nameError != null || _phoneError != null) return;
    Navigator.of(context).pop((rider: OtherRider(name: _name.text.trim(), phone: _digits, isWoman: _isWoman)));
  }

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text("Who's riding?", style: t.h2),
        const SizedBox(height: TtSpacing.m),
        RadioGroup<bool>(
          groupValue: _other,
          onChanged: (v) => setState(() => _other = v ?? false),
          child: Column(children: [
            RadioListTile<bool>(
              value: false,
              contentPadding: EdgeInsets.zero,
              title: Text('Me', style: t.bodySemibold),
              subtitle: Text(widget.me, style: t.bodySmall.copyWith(color: TtColors.navy500)),
            ),
            RadioListTile<bool>(
              value: true,
              contentPadding: EdgeInsets.zero,
              title: Text('Someone else', style: t.bodySemibold),
              subtitle: Text('Family or a friend. The driver will call them.',
                  style: t.bodySmall.copyWith(color: TtColors.navy500)),
            ),
          ]),
        ),
        if (_other) ...[
          const SizedBox(height: TtSpacing.s),
          TtTextField(
            label: 'Their name',
            hint: 'e.g. Anjali',
            controller: _name,
            textCapitalization: TextCapitalization.words,
            textInputAction: TextInputAction.next,
            errorText: _tried ? _nameError : null,
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: TtSpacing.m),
          PhoneInput(
            label: 'Their mobile number',
            controller: _phone,
            errorText: _tried ? _phoneError : null,
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: TtSpacing.s),
          MergeSemantics(
            child: Row(children: [
              const ButterflyMark(size: 28),
              const SizedBox(width: TtSpacing.m),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text("She's a woman", style: t.bodyMedium),
                  Text('Lets you book a Pink Taxi (women drivers) for her',
                      style: t.bodySmall.copyWith(color: TtColors.navy500)),
                ]),
              ),
              Switch(value: _isWoman, onChanged: (v) => setState(() => _isWoman = v)),
            ]),
          ),
          const SizedBox(height: TtSpacing.s),
          Text(
            "The ride OTP shows in your app. Share it with them so they can start the ride.",
            style: t.bodySmall.copyWith(color: TtColors.navy700),
          ),
        ],
        const SizedBox(height: TtSpacing.l),
        TtButton(label: 'Done', onPressed: _done),
      ],
    );
  }
}
