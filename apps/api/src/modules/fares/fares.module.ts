import { Module } from '@nestjs/common';

import { AutomationsModule } from '../automations/automations.module.js';
import { DriversModule } from '../drivers/drivers.module.js';
import { MapsModule } from '../maps/maps.module.js';
import { FaresController } from './fares.controller.js';
import { FaresService } from './fares.service.js';

/** Fare engine and quote endpoint. */
@Module({ imports: [MapsModule, DriversModule, AutomationsModule], controllers: [FaresController], providers: [FaresService], exports: [FaresService] })
export class FaresModule {}
