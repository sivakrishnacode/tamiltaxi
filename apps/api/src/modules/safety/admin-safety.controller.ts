import { Body, Controller, Get, HttpCode, Param, Post, Query, UseInterceptors } from '@nestjs/common';

import type { AuthUser } from '../../core/auth/auth-user.js';
import { CurrentUser } from '../../core/auth/current-user.decorator.js';
import { Roles } from '../../core/auth/roles.decorator.js';
import { NeedsArea } from '../../core/auth/permissions.js';
import type { Sos } from '../../generated/prisma/client.js';
import { Role } from '../../generated/prisma/enums.js';
import { AuditInterceptor } from '../admin/audit.interceptor.js';
import { ListQueryDto } from '../admin/dto/list-query.dto.js';
import { ResolveSosDto } from './dto/sos.dto.js';
import { SosService } from './sos.service.js';

/** Admin SOS queue (the admin page polls it). Acknowledge / resolve are audit logged. */
@Roles(Role.ADMIN)
@NeedsArea('support')
@UseInterceptors(AuditInterceptor)
@Controller('admin/sos')
export class AdminSafetyController {
  constructor(private readonly sos: SosService) {}

  /** ?status=OPEN|ACKNOWLEDGED|RESOLVED|FALSE_ALARM|active&page&pageSize; `open` = open SOS count (sidebar badge). */
  @Get()
  list(@Query() q: ListQueryDto): ReturnType<SosService['list']> {
    return this.sos.list(q);
  }

  @Post(':id/ack')
  @HttpCode(200)
  acknowledge(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<Sos> {
    return this.sos.acknowledge(id, user.userId);
  }

  @Post(':id/resolve')
  @HttpCode(200)
  resolve(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() body: ResolveSosDto): Promise<Sos> {
    return this.sos.resolve(id, user.userId, body);
  }
}
