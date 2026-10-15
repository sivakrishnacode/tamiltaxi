import { IsDateString, IsEnum, IsOptional, IsString, Length } from 'class-validator';

import { CampaignTarget } from '../../../generated/prisma/enums.js';

/** POST /admin/campaigns: a push to every passenger, now or at [sendAt]. */
export class CreateCampaignDto {
  @IsString()
  @Length(1, 65)
  title: string;

  @IsString()
  @Length(1, 180)
  body: string;

  /** The passenger screen a tap opens. Default HOME. */
  @IsOptional()
  @IsEnum(CampaignTarget)
  target?: CampaignTarget;

  /** ISO time to send at. Absent or within the next minute = now. */
  @IsOptional()
  @IsDateString()
  sendAt?: string;
}
