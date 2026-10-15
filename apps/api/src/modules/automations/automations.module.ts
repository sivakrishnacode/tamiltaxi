import { Module } from '@nestjs/common';

import { AdminAutomationsController } from './admin-automations.controller.js';
import { AutomationsService } from './automations.service.js';
import { CampaignsService } from './campaigns.service.js';

/** Reminder pushes to riders (a quote left unbooked, a usual trip coming up) and admin campaigns. */
@Module({ controllers: [AdminAutomationsController], providers: [AutomationsService, CampaignsService], exports: [AutomationsService] })
export class AutomationsModule {}
