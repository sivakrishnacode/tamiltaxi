import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';
import 'package:tamiltaxi_whatsapp_otp/tamiltaxi_whatsapp_otp.dart';

import '../../router/routes.dart';
import '../../state/live_trip.dart';

/// P-03 Phone number: +91 input, "Send OTP" (enabled at 10 digits), Terms & Privacy links.
class P03PhoneScreen extends ConsumerStatefulWidget {
  const P03PhoneScreen({super.key, this.showcase = false});

  /// Opened on its own from the Design gallery: render seed state, start no timers.
  final bool showcase;

  @override
  ConsumerState<P03PhoneScreen> createState() => _P03PhoneScreenState();
}

class _P03PhoneScreenState extends ConsumerState<P03PhoneScreen> {
  /// Mock mode pre-fills the demo number; with the live API the passenger types their own.
  late final _controller = TextEditingController(text: ref.read(isLiveApiProvider) ? '' : '98765 43210');
  late final TapGestureRecognizer _terms = TapGestureRecognizer()..onTap = () => context.push(Routes.legal('terms'));
  late final TapGestureRecognizer _privacy = TapGestureRecognizer()
    ..onTap = () => context.push(Routes.legal('privacy'));
  bool _sending = false;

  String get _digits => PhoneInput.digitsOf(_controller.text);

  @override
  void dispose() {
    _controller.dispose();
    _terms.dispose();
    _privacy.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (_digits.length != 10 || _sending) return;
    FocusScope.of(context).unfocus();
    setState(() => _sending = true);
    final formatted = '${_digits.substring(0, 5)} ${_digits.substring(5)}';
    try {
      // WhatsApp hands the code straight to P-04 once it knows the app is waiting for one.
      await WhatsAppOtp.expectCode();
      // The API takes digits only; the OTP screen shows the formatted number.
      await ref.read(authRepositoryProvider).sendOtp(_digits);
    } catch (e) {
      if (mounted) {
        setState(() => _sending = false);
        showTtSnack(context, apiErrorMessage(e));
      }
      return;
    }
    if (!mounted) return;
    setState(() => _sending = false);
    context.push('${Routes.otp}?phone=${Uri.encodeQueryComponent(formatted)}');
  }

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final canPop = context.canPop();
    return Scaffold(
      backgroundColor: TtColors.surface,
      appBar: canPop ? const TtAppBar() : null,
      body: SafeArea(
        top: !canPop,
        child: Column(
          children: [
            Expanded(
              child: SingleChildScrollView(
                padding: EdgeInsets.fromLTRB(TtSpacing.l, canPop ? TtSpacing.l : 64, TtSpacing.l, TtSpacing.l),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Enter your WhatsApp number', style: t.display),
                    const SizedBox(height: TtSpacing.s),
                    Text("We'll send you a 6-digit OTP on WhatsApp", style: t.body.copyWith(color: TtColors.navy700)),
                    const SizedBox(height: TtSpacing.xxl),
                    ValueListenableBuilder(
                      valueListenable: _controller,
                      builder: (context, _, _) => PhoneInput(
                        controller: _controller,
                        label: 'WhatsApp number',
                        autofocus: !widget.showcase,
                        onSubmitted: (_) => _send(),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(TtSpacing.l, TtSpacing.s, TtSpacing.l, TtSpacing.l),
              child: Column(
                children: [
                  ValueListenableBuilder(
                    valueListenable: _controller,
                    builder: (context, _, _) => TtButton(
                      label: 'Send OTP',
                      loading: _sending,
                      onPressed: _digits.length == 10 ? _send : null,
                    ),
                  ),
                  const SizedBox(height: TtSpacing.m),
                  Text.rich(
                    TextSpan(
                      style: t.bodySmall.copyWith(color: TtColors.navy500),
                      children: [
                        const TextSpan(text: 'By continuing, you agree to our '),
                        TextSpan(
                          text: 'Terms',
                          recognizer: _terms,
                          style: const TextStyle(color: TtColors.coral600, fontWeight: FontWeight.w600),
                        ),
                        const TextSpan(text: ' & '),
                        TextSpan(
                          text: 'Privacy Policy',
                          recognizer: _privacy,
                          style: const TextStyle(color: TtColors.coral600, fontWeight: FontWeight.w600),
                        ),
                      ],
                    ),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
