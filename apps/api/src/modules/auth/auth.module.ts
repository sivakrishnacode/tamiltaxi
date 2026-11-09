import { Module } from '@nestjs/common';

import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { OtpService } from './otp.service.js';

/** OTP login (codes on WhatsApp through WatxClient, from the global WhatsAppModule) and token issuing. */
@Module({ controllers: [AuthController], providers: [AuthService, OtpService], exports: [AuthService] })
export class AuthModule {}
