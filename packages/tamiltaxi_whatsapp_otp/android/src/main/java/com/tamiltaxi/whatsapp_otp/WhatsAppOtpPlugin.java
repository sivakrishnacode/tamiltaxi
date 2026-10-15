package com.tamiltaxi.whatsapp_otp;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import androidx.annotation.NonNull;

import java.util.Arrays;
import java.util.List;

import io.flutter.embedding.engine.plugins.FlutterPlugin;
import io.flutter.plugin.common.EventChannel;
import io.flutter.plugin.common.MethodCall;
import io.flutter.plugin.common.MethodChannel;

/**
 * Meta's WhatsApp OTP handshake, and the codes WhatsApp hands back: by broadcast (zero-tap, {@link OtpCodeReceiver})
 * or by opening {@link OtpCodeActivity} from its Autofill button (one-tap).
 */
public class WhatsAppOtpPlugin implements FlutterPlugin, MethodChannel.MethodCallHandler, EventChannel.StreamHandler {
  private static final List<String> WHATSAPP_PACKAGES = Arrays.asList("com.whatsapp", "com.whatsapp.w4b");

  /** The OTP screen listening, if any. */
  private static EventChannel.EventSink sink;
  /** A code that came while nothing listened, e.g. between sending it and the OTP screen opening. */
  private static String pending;

  private Context context;
  private MethodChannel methods;
  private EventChannel events;

  @Override
  public void onAttachedToEngine(@NonNull FlutterPluginBinding binding) {
    context = binding.getApplicationContext();
    methods = new MethodChannel(binding.getBinaryMessenger(), "tamiltaxi/whatsapp_otp");
    methods.setMethodCallHandler(this);
    events = new EventChannel(binding.getBinaryMessenger(), "tamiltaxi/whatsapp_otp/codes");
    events.setStreamHandler(this);
  }

  @Override
  public void onDetachedFromEngine(@NonNull FlutterPluginBinding binding) {
    methods.setMethodCallHandler(null);
    events.setStreamHandler(null);
  }

  @Override
  public void onMethodCall(@NonNull MethodCall call, @NonNull MethodChannel.Result result) {
    if (!call.method.equals("expectCode")) {
      result.notImplemented();
      return;
    }
    pending = null; // A new code is coming; an older one would only fail.
    // The PendingIntent tells WhatsApp which app asked (its creator package), so it can check the template's
    // package name and signature hash against this app.
    PendingIntent ci = PendingIntent.getActivity(context, 0, new Intent(), PendingIntent.FLAG_IMMUTABLE);
    for (String whatsApp : WHATSAPP_PACKAGES) {
      Intent intent = new Intent("com.whatsapp.otp.OTP_REQUESTED").setPackage(whatsApp).putExtra("_ci_", ci);
      context.sendBroadcast(intent);
    }
    result.success(null);
  }

  @Override
  public void onListen(Object arguments, EventChannel.EventSink events) {
    sink = events;
    if (pending != null) {
      events.success(pending);
      pending = null;
    }
  }

  @Override
  public void onCancel(Object arguments) {
    sink = null;
  }

  /** Passes on the code in [intent], only if WhatsApp sent it (it signs with its own PendingIntent, `_ci_`). */
  static void deliver(Intent intent) {
    PendingIntent ci = Build.VERSION.SDK_INT >= 33
        ? intent.getParcelableExtra("_ci_", PendingIntent.class)
        : legacyPendingIntent(intent);
    String code = intent.getStringExtra("code");
    if (ci == null || code == null || !WHATSAPP_PACKAGES.contains(ci.getCreatorPackage())) return;
    new Handler(Looper.getMainLooper()).post(() -> {
      if (sink != null) {
        sink.success(code);
      } else {
        pending = code;
      }
    });
  }

  @SuppressWarnings("deprecation")
  private static PendingIntent legacyPendingIntent(Intent intent) {
    return intent.getParcelableExtra("_ci_");
  }
}
