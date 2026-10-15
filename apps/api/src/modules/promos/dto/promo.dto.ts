import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUrl, Length, Max, Min } from 'class-validator';

import { PromoPlacement } from '../../../generated/prisma/enums.js';

/** POST /admin/promos (multipart: these fields + `image`). */
export class CreatePromoDto {
  @IsEnum(PromoPlacement)
  placement: PromoPlacement;

  @IsString()
  @Length(3, 80)
  title: string;

  /** Banners only: where a tap goes. */
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true }, { message: 'The link must start with https://' })
  @Length(1, 500)
  linkUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  sortOrder?: number;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;
}

/** PATCH /admin/promos/:id: show or hide, or move a banner. */
export class UpdatePromoDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  sortOrder?: number;
}
