package com.tamiltaxi.whatsapp_otp;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Zero-tap: WhatsApp broadcasts the code straight to the app. */
public class OtpCodeReceiver extends BroadcastReceiver {
  @Override
  public void onReceive(Context context, Intent intent) {
    WhatsAppOtpPlugin.deliver(intent);
  }
}
