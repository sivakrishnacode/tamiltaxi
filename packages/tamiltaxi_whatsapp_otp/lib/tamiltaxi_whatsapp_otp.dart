import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/services.dart';

/// WhatsApp OTP autofill: Meta's zero-tap and one-tap authentication templates. Android only.
///
/// Call [expectCode] just before asking the API to send a login code. It is Meta's handshake: it tells WhatsApp
/// (and WhatsApp Business) that this app is waiting for a code. WhatsApp then hands the code to the app, which
/// arrives on [codes], instead of only showing Copy code. Elsewhere, or without WhatsApp, nothing happens.
abstract final class WhatsAppOtp {
  static const _methods = MethodChannel('tamiltaxi/whatsapp_otp');
  static const _events = EventChannel('tamiltaxi/whatsapp_otp/codes');

  /// The handshake. Never throws: autofill is a nicety, and sending the code must not fail because of it.
  static Future<void> expectCode() async {
    if (!Platform.isAndroid) return;
    try {
      await _methods.invokeMethod<void>('expectCode');
    } on Exception {
      // No WhatsApp, or the plugin isn't registered on this engine: the code is still sent; the user types it.
    }
  }

  /// Codes WhatsApp hands over: zero-tap, or its Autofill button (one-tap). Listen while the OTP screen is open.
  static Stream<String> get codes =>
      Platform.isAndroid ? _events.receiveBroadcastStream().map((code) => '$code') : const Stream.empty();
}
