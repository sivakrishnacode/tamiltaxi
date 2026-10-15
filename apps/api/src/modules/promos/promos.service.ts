import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { UploadedBlob } from '../../core/storage/file-storage.service.js';
import { PromoPlacement } from '../../generated/prisma/enums.js';
import type { CreatePromoDto, UpdatePromoDto } from './dto/promo.dto.js';
import { MAX_PROMO_BYTES, pickPromos, sniffImageType, toView, type PromoRow, type PromoView, type Promos } from './promos.js';

/** Every column but the picture's bytes. */
const ROW = {
  id: true,
  placement: true,
  title: true,
  linkUrl: true,
  sortOrder: true,
  isActive: true,
  startsAt: true,
  endsAt: true,
  createdAt: true,
} as const;

/** An admin list row: the app's view plus what the admin sees and changes. */
export interface AdminPromo extends PromoView {
  readonly placement: PromoPlacement;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly createdAt: string;
}

/** The passenger app's splash and Home banners (6j). */
@Injectable()
export class PromosService {
  constructor(private readonly prisma: PrismaService) {}

  async live(now = new Date()): Promise<Promos> {
    const rows = await this.prisma.promo.findMany({
      where: { isActive: true, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      select: ROW,
    });
    return pickPromos(rows, now);
  }

  async image(id: string): Promise<{ bytes: Uint8Array; type: string }> {
    const p = await this.prisma.promo.findUnique({ where: { id }, select: { image: true, imageType: true } });
    if (!p) throw new NotFoundException('Picture not found');
    return { bytes: p.image, type: p.imageType };
  }

  async list(): Promise<AdminPromo[]> {
    const rows = await this.prisma.promo.findMany({ select: ROW, orderBy: [{ placement: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }] });
    return rows.map(toAdmin);
  }

  async create(dto: CreatePromoDto, file: UploadedBlob | undefined): Promise<AdminPromo> {
    if (!file?.buffer?.length) throw new BadRequestException('Attach the picture');
    if (file.size > MAX_PROMO_BYTES) throw new BadRequestException('The picture is larger than 2 MB');
    const imageType = sniffImageType(file.buffer);
    if (!imageType) throw new BadRequestException('Upload a JPG, PNG or WebP picture');
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : new Date();
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (endsAt && endsAt <= startsAt) throw new BadRequestException('The end must be after the start');
    const isBanner = dto.placement === PromoPlacement.BANNER;
    const row = await this.prisma.promo.create({
      data: {
        placement: dto.placement,
        title: dto.title.trim(),
        image: new Uint8Array(file.buffer),
        imageType,
        // A splash is never tapped (it is gone in 2 s) and has no place in the banner row.
        linkUrl: isBanner ? dto.linkUrl?.trim() || null : null,
        sortOrder: isBanner ? (dto.sortOrder ?? 0) : 0,
        startsAt,
        endsAt,
      },
      select: ROW,
    });
    return toAdmin(row);
  }

  async update(id: string, dto: UpdatePromoDto): Promise<AdminPromo> {
    await this.exists(id);
    const row = await this.prisma.promo.update({ where: { id }, data: dto, select: ROW });
    return toAdmin(row);
  }

  async remove(id: string): Promise<void> {
    await this.exists(id);
    await this.prisma.promo.delete({ where: { id } });
  }

  private async exists(id: string): Promise<void> {
    if (!(await this.prisma.promo.findUnique({ where: { id }, select: { id: true } }))) throw new NotFoundException('Picture not found');
  }
}

function toAdmin(p: PromoRow): AdminPromo {
  return { ...toView(p), placement: p.placement, sortOrder: p.sortOrder, isActive: p.isActive, createdAt: p.createdAt.toISOString() };
}
