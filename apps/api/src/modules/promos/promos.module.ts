import { Module } from '@nestjs/common';

import { AdminPromosController } from './admin-promos.controller.js';
import { PromosController } from './promos.controller.js';
import { PromosService } from './promos.service.js';

/** The passenger app's splash and Home banners, and the admin pages that manage them (6j). */
@Module({ controllers: [PromosController, AdminPromosController], providers: [PromosService] })
export class PromosModule {}
