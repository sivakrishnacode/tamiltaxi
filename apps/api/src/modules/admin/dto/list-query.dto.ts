import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { Gender, VehicleKind } from '../../../generated/prisma/enums.js';
import { LIST_SORTS, RIDER_SIGNUPS } from '../list-filters.js';

/** Common list query: ?page=1&pageSize=20&q=…&status=… */
export class ListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  kind?: string;

  /** Users list: PASSENGER | DRIVER | ADMIN. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  role?: string;

  /** Users list: "true" | "false". */
  @IsOptional()
  @IsString()
  @MaxLength(5)
  blocked?: string;

  /** Trips list: "true" = only trips flagged for review (e.g. running far too long). */
  @IsOptional()
  @IsString()
  @MaxLength(5)
  review?: string;

  /** Drivers: newest | oldest | rating | trips | name; riders: newest | oldest | trips | name; trips: newest | oldest | fare. */
  @IsOptional()
  @IsIn(LIST_SORTS)
  sort?: string;

  /** Drivers: home city id, or "none" for drivers without one. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  city?: string;

  /** Drivers and trips: one vehicle kind. */
  @IsOptional()
  @IsEnum(VehicleKind)
  vehicle?: VehicleKind;

  /** Drivers: "true" = online now, "false" = offline. */
  @IsOptional()
  @IsIn(['true', 'false'])
  online?: string;

  /** Drivers: FEMALE for the women drivers (Butterfly rides). */
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  /** Riders: done (default) | unfinished (no name yet) | deleted. */
  @IsOptional()
  @IsIn(RIDER_SIGNUPS)
  signup?: string;

    /** Riders: "true" = prefers women drivers. */
  @IsOptional()
  @IsIn(['true'])
  women?: string;

  /** Trips: booked from / before (ISO dates). */
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
