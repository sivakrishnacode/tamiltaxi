import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { Roles } from '../../core/auth/roles.decorator.js';
import type { UploadedBlob } from '../../core/storage/file-storage.service.js';
import { Role } from '../../generated/prisma/enums.js';
import { AuditInterceptor } from '../admin/audit.interceptor.js';
import { CreatePromoDto, UpdatePromoDto } from './dto/promo.dto.js';
import { MAX_PROMO_BYTES } from './promos.js';
import { type AdminPromo, PromosService } from './promos.service.js';

/** Admin › Splash & banners: upload, show or hide, order and delete the passenger app's pictures. */
@Roles(Role.ADMIN)
@UseInterceptors(AuditInterceptor)
@Controller('admin/promos')
export class AdminPromosController {
  constructor(private readonly promos: PromosService) {}

  @Get()
  list(): Promise<AdminPromo[]> {
    return this.promos.list();
  }

  /** Multipart: the fields of [CreatePromoDto] and the picture as `image`. */
  @Post()
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_PROMO_BYTES } }))
  create(@Body() body: CreatePromoDto, @UploadedFile() image?: UploadedBlob): Promise<AdminPromo> {
    return this.promos.create(body, image);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdatePromoDto): Promise<AdminPromo> {
    return this.promos.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.promos.remove(id);
  }
}
