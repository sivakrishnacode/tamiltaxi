package com.tamiltaxi.whatsapp_otp;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

/** One-tap: WhatsApp's Autofill button opens this; it passes the code on and brings the app (its OTP screen) back. */
public class OtpCodeActivity extends Activity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    WhatsAppOtpPlugin.deliver(getIntent());
    Intent app = getPackageManager().getLaunchIntentForPackage(getPackageName());
    if (app != null) startActivity(app);
    finish();
  }
}
