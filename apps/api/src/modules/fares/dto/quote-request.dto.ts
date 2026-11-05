import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

import { RideMode, TripKind } from '../../../generated/prisma/enums.js';
import { PointDto } from './point.dto.js';

/** POST /fares/quote body. */
export class QuoteRequestDto {
  @ValidateNested()
  @Type(() => PointDto)
  pickup: PointDto;

  /** Required except for a rental quote. */
  @IsOptional()
  @ValidateNested()
  @Type(() => PointDto)
  drop?: PointDto;

  /** RIDE (bike/auto/cab) or PARCEL (goods vehicles). Default RIDE. */
  @IsOptional()
  @IsEnum(TripKind)
  kind?: TripKind;

  /** Butterfly "only": count only women drivers for each vehicle's pickup ETA. */
  @IsOptional()
  @IsBoolean()
  womenOnly?: boolean;

  /**
   * LOCAL (default), RENTAL (a cab by the hour) or OUTSTATION (a cab to another town; with kind PARCEL, goods to
   * another town by the goods trucks, one way).
   */
  @IsOptional()
  @IsEnum(RideMode)
  rideMode?: RideMode;

  /** RENTAL: the package ("1h" … "12h", GET /fares/rental-packages). */
  @IsOptional()
  @IsString()
  @MaxLength(8)
  rentalPackageId?: string;

  /** OUTSTATION: back to the pickup at [returnAt] (true) or one way (false, default). */
  @IsOptional()
  @IsBoolean()
  roundTrip?: boolean;

  /** OUTSTATION round trip: when the rider comes back (ISO); none = straight back (leaving + the drive both ways). */
  @IsOptional()
  @IsDateString()
  returnAt?: string;

  /** OUTSTATION: the leaving time (counts the round trip's days). Absent = now. */
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
