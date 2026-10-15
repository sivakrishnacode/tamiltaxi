import { Body, Controller, HttpCode, Post } from '@nestjs/common';

import { Public } from '../../core/auth/public.decorator.js';
import { LIMITS, RateLimit } from '../../core/rate-limit/rate-limit.decorator.js';
import { AuthService, LoginResult } from './auth.service.js';
import { SendOtpDto } from './dto/send-otp.dto.js';
import { VerifyOtpDto } from './dto/verify-otp.dto.js';
import { OtpService } from './otp.service.js';

/** P-03 / P-04 and D-03a / D-03b. */
@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly otp: OtpService,
    private readonly auth: AuthService,
  ) {}

  /** Per IP on top of the per-phone limits (OtpService). */
  @RateLimit(LIMITS.authOtp)
  @Post('otp')
  @HttpCode(200)
  send(@Body() body: SendOtpDto): Promise<{ expiresInSeconds: number }> {
    return this.otp.send(AuthService.normalise(body.phone), body.app);
  }

  @RateLimit(LIMITS.authVerify)
  @Post('verify')
  @HttpCode(200)
  verify(@Body() body: VerifyOtpDto): Promise<LoginResult> {
    return this.auth.verify({ phone: body.phone, code: body.code, app: body.app });
  }
}
