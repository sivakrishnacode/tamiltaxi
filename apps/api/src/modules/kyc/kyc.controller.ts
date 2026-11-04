import { Controller, Get, Headers } from '@nestjs/common';

import type { AuthUser } from '../../core/auth/auth-user.js';
import { CurrentUser } from '../../core/auth/current-user.decorator.js';
import { type IdentityView, KycService } from './kyc.service.js';

/** The user's identity check: drivers' licence and Aadhaar, checked by an admin with the profile photo. */
@Controller('kyc')
export class KycController {
  constructor(private readonly kyc: KycService) {}

  /** `x-app-version`: sent by driver apps from 0.1.2 (they can upload the licence and Aadhaar). */
  @Get('me')
  me(@CurrentUser() user: AuthUser, @Headers('x-app-version') appVersion?: string): Promise<IdentityView> {
    return this.kyc.view(user.userId, appVersion?.slice(0, 20));
  }
}
