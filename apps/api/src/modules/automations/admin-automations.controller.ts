import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseInterceptors } from '@nestjs/common';

import { Roles } from '../../core/auth/roles.decorator.js';
import { NeedsArea } from '../../core/auth/permissions.js';
import type { Campaign, ReminderMessage } from '../../generated/prisma/client.js';
import { Role } from '../../generated/prisma/enums.js';
import { AuditInterceptor } from '../admin/audit.interceptor.js';
import { type AutomationStats, AutomationsService } from './automations.service.js';
import { CampaignsService } from './campaigns.service.js';
import { CreateCampaignDto } from './dto/campaign.dto.js';
import { CreateReminderMessageDto, UpdateReminderMessageDto } from './dto/reminder-message.dto.js';
import { type ReminderMessageWithStats, ReminderMessagesService } from './reminder-messages.service.js';

/** Admin › Engage: how the reminder pushes do, their messages, and festival / weekend campaigns to every passenger. */
@Roles(Role.ADMIN)
@NeedsArea('engage')
@UseInterceptors(AuditInterceptor)
@Controller('admin')
export class AdminAutomationsController {
  constructor(
    private readonly automations: AutomationsService,
    private readonly campaigns: CampaignsService,
    private readonly messages: ReminderMessagesService,
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

  /** Every reminder message with its 30 days' sends and bookings; each send picks one of its kind's active ones at random. */
  @Get('reminder-messages')
  reminderMessages(): Promise<ReminderMessageWithStats[]> {
    return this.messages.list();
  }

  /** 400 for a word the reminder can't fill (e.g. {time} on "Didn't book"). */
  @Post('reminder-messages')
  createReminderMessage(@Body() body: CreateReminderMessageDto): Promise<ReminderMessage> {
    return this.messages.create(body);
  }

  @Patch('reminder-messages/:id')
  updateReminderMessage(@Param('id') id: string, @Body() body: UpdateReminderMessageDto): Promise<ReminderMessage> {
    return this.messages.update(id, body);
  }

  @Delete('reminder-messages/:id')
  @HttpCode(204)
  removeReminderMessage(@Param('id') id: string): Promise<void> {
    return this.messages.remove(id);
  }
}
