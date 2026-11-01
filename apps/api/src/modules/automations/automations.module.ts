import { Module } from '@nestjs/common';

import { AdminAutomationsController } from './admin-automations.controller.js';
import { AutomationsService } from './automations.service.js';
import { CampaignsService } from './campaigns.service.js';
import { ZoneNudgesService } from './zone-nudges.service.js';

/** Reminder pushes to riders (a quote left unbooked, a usual trip coming up), admin campaigns and busy-zone nudges to drivers. */
@Module({ controllers: [AdminAutomationsController], providers: [AutomationsService, CampaignsService, ZoneNudgesService], exports: [AutomationsService] })
export class AutomationsModule {}
