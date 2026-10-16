import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';
import 'package:tamiltaxi_whatsapp_otp/tamiltaxi_whatsapp_otp.dart';

import '../../common/showcase.dart';
import '../../router/routes.dart';
import '../../state/driver_account.dart';
import '../../state/live_helpers.dart';
import 'widgets/signup_widgets.dart';

/// D-03a Phone number: +91 input; "Send OTP" (enabled at 10 digits) → D-03b.
class D03PhoneScreen extends ConsumerStatefulWidget {
  const D03PhoneScreen({super.key, this.signup = true, this.showcase = false});

  final bool signup;

  /// Opened on its own from the Design gallery: render seed state, start no timers.
  final bool showcase;

  @override
  ConsumerState<D03PhoneScreen> createState() => _D03PhoneScreenState();
}

class _D03PhoneScreenState extends ConsumerState<D03PhoneScreen> {
  late final TextEditingController _phone = TextEditingController(text: widget.showcase ? '98940 56721' : '');
  late final TapGestureRecognizer _terms = TapGestureRecognizer()..onTap = () => context.push(Routes.legal('terms'));
  late final TapGestureRecognizer _privacy = TapGestureRecognizer()
    ..onTap = () => context.push(Routes.legal('privacy'));
  bool _sending = false;

  String get _digits => PhoneInput.digitsOf(_phone.text);

  @override
  void dispose() {
    _phone.dispose();
    _terms.dispose();
    _privacy.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (widget.showcase) return showTtSnack(context, kPreviewNote);
    if (_digits.length != 10 || _sending) return;
    final formatted = '${_digits.substring(0, 5)} ${_digits.substring(5)}';
    setState(() => _sending = true);
    try {
      // WhatsApp hands the code straight to D-03b once it knows the app is waiting for one.
      await WhatsAppOtp.expectCode();
      // The API wants +91 and 10 digits; the seed repository takes the formatted number.
      await ref.read(driverRepositoryProvider).sendOtp(ref.read(isLiveApiProvider) ? apiPhone(formatted) : formatted);
    } on Exception catch (e) {
      if (!mounted) return;
      setState(() => _sending = false);
      showTtSnack(context, userMessage(e));
      return;
    }
    if (!mounted) return;
    setState(() => _sending = false);
    if (widget.signup) {
      ref.read(signupProvider.notifier).update((d) => d.copyWith(phone: formatted));
    }
    context.push(Routes.otp(phone: formatted, signup: widget.signup));
  }

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Scaffold(
      backgroundColor: TtColors.surface,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AuthHeader(
            title: widget.signup ? 'Enter your WhatsApp number' : 'Welcome back',
            subtitle: Text(
              widget.signup
                  ? "We'll send you a 6-digit OTP on WhatsApp"
                  : "Log in with your registered WhatsApp number. We'll send a 6-digit OTP on WhatsApp",
              style: t.body.copyWith(color: TtColors.navy300),
            ),
          ),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(TtSpacing.l, TtSpacing.xl, TtSpacing.l, TtSpacing.l),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  PhoneInput(
                    controller: _phone,
                    label: 'WhatsApp number',
                    autofocus: !widget.showcase,
                    onChanged: (_) => setState(() {}),
                    onSubmitted: (_) => _send(),
                  ),
                  const SizedBox(height: TtSpacing.s),
                  Text('Use the number linked to your UPI for faster payouts',
                      style: t.caption.copyWith(color: TtColors.navy500)),
                ],
              ),
            ),
          ),
          BottomActions(
            children: [
              TtButton(
                label: 'Send OTP',
                loading: _sending,
                onPressed: _digits.length == 10 ? _send : null,
              ),
              const SizedBox(height: TtSpacing.xs),
              // Inline links (as on P-03): 48 px link boxes in a Wrap left a big gap when "Privacy Policy" wrapped.
              Padding(
                padding: const EdgeInsets.symmetric(vertical: TtSpacing.s),
                child: Text.rich(
                  TextSpan(
                    style: t.caption.copyWith(color: TtColors.navy500),
                    children: [
                      const TextSpan(text: 'By continuing, you agree to the '),
                      TextSpan(text: 'Driver Terms', recognizer: _terms, style: _linkStyle),
                      const TextSpan(text: ' & '),
                      TextSpan(text: 'Privacy Policy', recognizer: _privacy, style: _linkStyle),
                    ],
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

const _linkStyle = TextStyle(color: TtColors.coral600, fontWeight: FontWeight.w600);
