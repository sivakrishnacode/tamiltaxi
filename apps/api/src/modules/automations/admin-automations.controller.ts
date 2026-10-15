import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseInterceptors } from '@nestjs/common';

import { Roles } from '../../core/auth/roles.decorator.js';
import type { Campaign } from '../../generated/prisma/client.js';
import { Role } from '../../generated/prisma/enums.js';
import { AuditInterceptor } from '../admin/audit.interceptor.js';
import { type AutomationStats, AutomationsService } from './automations.service.js';
import { CampaignsService } from './campaigns.service.js';
import { CreateCampaignDto } from './dto/campaign.dto.js';

/** Admin › Automations: how the reminder pushes do, and festival / weekend campaigns to every passenger. */
@Roles(Role.ADMIN)
@UseInterceptors(AuditInterceptor)
@Controller('admin')
export class AdminAutomationsController {
  constructor(
    private readonly automations: AutomationsService,
    private readonly campaigns: CampaignsService,
  ) {}

  @Get('automations')
  stats(): Promise<AutomationStats> {
    return this.automations.stats();
  }

  @Get('campaigns')
  list(): Promise<Campaign[]> {
    return this.campaigns.list();
  }

  @Post('campaigns')
  create(@Body() body: CreateCampaignDto): Promise<Campaign> {
    return this.campaigns.create(body);
  }

  /** 409 once it was sent or cancelled. */
  @Post('campaigns/:id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string): Promise<Campaign> {
    return this.campaigns.cancel(id);
  }

  @Delete('campaigns/:id')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.campaigns.remove(id);
  }
}
