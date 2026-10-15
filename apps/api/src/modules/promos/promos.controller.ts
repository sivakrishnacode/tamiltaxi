import { Controller, Get, Header, Param, StreamableFile } from '@nestjs/common';

import { Public } from '../../core/auth/public.decorator.js';
import type { Promos } from './promos.js';
import { PromosService } from './promos.service.js';

/** The passenger app's splash and Home banners (6j). Public: they are shown before sign-in too. */
@Public()
@Controller('promos')
export class PromosController {
  constructor(private readonly promos: PromosService) {}

  @Get()
  live(): Promise<Promos> {
    return this.promos.live();
  }

  /** A promo's picture never changes (a new picture is a new promo), so phones keep it for a year. */
  @Get(':id/image')
  @Header('cache-control', 'public, max-age=31536000, immutable')
  @Header('x-content-type-options', 'nosniff')
  async image(@Param('id') id: string): Promise<StreamableFile> {
    const { bytes, type } = await this.promos.image(id);
    return new StreamableFile(bytes, { type, length: bytes.length });
  }
}
