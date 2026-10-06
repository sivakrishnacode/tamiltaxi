import { Controller, Get } from '@nestjs/common';

import { Public } from '../../core/auth/public.decorator.js';
import { SettingsService } from '../settings/settings.service.js';

export interface AppConfig {
  driverPlansEnabled: boolean;
  supportPhone: string;
  /** A trip booked for later starts looking for a driver this many minutes before its pickup time. */
  scheduledDispatchLeadMin: number;
  /** Drivers take a daily selfie before going online (GET /drivers/me says when it is due). */
  dailySelfieCheckEnabled: boolean;
}

/** Public settings both apps read at start-up: plans, support phone, booking lead time, selfie check. */
@Public()
@Controller('app-config')
export class AppConfigController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  async get(): Promise<AppConfig> {
    const s = await this.settings.all();
    return {
      driverPlansEnabled: s.driverPlansEnabled,
      supportPhone: s.supportPhone,
      scheduledDispatchLeadMin: s.scheduledDispatchLeadMin,
      dailySelfieCheckEnabled: s.dailySelfieCheckEnabled,
    };
  }
}
