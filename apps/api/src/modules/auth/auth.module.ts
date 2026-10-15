import { Module } from '@nestjs/common';

import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { OtpService } from './otp.service.js';
import { WatxClient } from './watx.client.js';

/** OTP login (codes on WhatsApp) and token issuing. */
@Module({ controllers: [AuthController], providers: [AuthService, OtpService, WatxClient], exports: [AuthService] })
export class AuthModule {}
