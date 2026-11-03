import { Body, Controller, Get, Headers, HttpCode, Inject, Post, Req, UnauthorizedException, type RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

import type { AuthUser } from '../../core/auth/auth-user.js';
import { CurrentUser } from '../../core/auth/current-user.decorator.js';
import { Public } from '../../core/auth/public.decorator.js';
import type { Env } from '../../core/config/env.js';
import { ENV } from '../../core/config/env.token.js';
import { isValidDiditSignature } from './didit.js';
import { type DiditWebhook, type IdentityView, KycService, type StartedSession } from './kyc.service.js';

/** Identity verification (Didit) for drivers and riders. */
@Controller('kyc')
export class KycController {
  constructor(
    private readonly kyc: KycService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** `x-app-version`: sent by driver apps from 0.1.2 (they can upload the licence, Aadhaar and selfie by hand). */
  @Get('me')
  me(@CurrentUser() user: AuthUser, @Headers('x-app-version') appVersion?: string): Promise<IdentityView> {
    return this.kyc.view(user.userId, appVersion?.slice(0, 20));
  }

  /** Returns a `sessionToken` for Didit's in-app SDK (`DiditSdk.startVerification`). */
  @Post('session')
  start(@CurrentUser() user: AuthUser, @Headers('x-app-version') appVersion?: string): Promise<StartedSession> {
    return this.kyc.start(user, appVersion?.slice(0, 20));
  }

  /** The app calls this when the SDK closes. */
  @Post('sync')
  @HttpCode(200)
  sync(@CurrentUser() user: AuthUser): Promise<IdentityView> {
    return this.kyc.sync(user.userId);
  }

  /** Didit → us. Signed with the destination secret (X-Signature-V2, or X-Signature over the raw body). */
  @Public()
  @Post('didit/webhook')
  @HttpCode(200)
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Body() body: DiditWebhook,
    @Headers('x-signature-v2') signatureV2?: string,
    @Headers('x-signature') signature?: string,
    @Headers('x-timestamp') timestamp?: string,
  ): Promise<{ ok: true }> {
    const isValid = isValidDiditSignature({ body, rawBody: req.rawBody, signatureV2, signature, timestamp, secret: this.env.didit.webhookSecret });
    if (!isValid) throw new UnauthorizedException('Invalid signature');
    await this.kyc.handleWebhook(body);
    return { ok: true };
  }
}
