import { Module } from '@nestjs/common';

import { AppConfigController } from './app-config.controller.js';

/** Public app configuration (plans switch, support phone). */
@Module({ controllers: [AppConfigController] })
export class AppConfigModule {}
