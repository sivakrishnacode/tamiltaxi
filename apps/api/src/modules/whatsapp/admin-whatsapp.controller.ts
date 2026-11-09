import { BadGatewayException, Body, Controller, Get, HttpCode, Post, UseInterceptors } from '@nestjs/common';

import type { AuthUser } from '../../core/auth/auth-user.js';
import { CurrentUser } from '../../core/auth/current-user.decorator.js';
import { NeedsArea } from '../../core/auth/permissions.js';
import { Roles } from '../../core/auth/roles.decorator.js';
import { Role } from '../../generated/prisma/enums.js';
import { AuditInterceptor } from '../admin/audit.interceptor.js';
import { TestWelcomeDto } from './dto/test-welcome.dto.js';
import { type WelcomeOverview, WelcomeService } from './welcome.service.js';

/** Admin › Automations › WhatsApp: the welcome messages (their switches and template names are settings). */
@Roles(Role.ADMIN)
@NeedsArea('engage')
@UseInterceptors(AuditInterceptor)
@Controller('admin/welcome-messages')
export class AdminWhatsAppController {
  constructor(private readonly welcome: WelcomeService) {}

  /** Is WATX set up, each trigger's last 7 days and the newest messages. */
  @Get()
  overview(): Promise<WelcomeOverview> {
    return this.welcome.overview();
  }

  /** A trigger's template to the signed-in admin's own WhatsApp: 200, 502 with WhatsApp's reason, 409 without WATX. */
  @Post('test')
  @HttpCode(200)
  async test(@CurrentUser() user: AuthUser, @Body() body: TestWelcomeDto): Promise<{ ok: true }> {
    const error = await this.welcome.test(user.userId, body.trigger, body.template);
    if (error !== null) throw new BadGatewayException(error);
    return { ok: true };
  }
}
