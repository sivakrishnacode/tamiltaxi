import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsHexColor, IsInt, IsNumber, IsOptional, IsString, Length, Max, Min, ValidateIf } from 'class-validator';

import { VehicleKind, ZoneKind } from '../../../generated/prisma/enums.js';

/** POST /admin/cities/:id/zones body. */
export class CreateZoneDto {
  @IsString()
  @Length(2, 60)
  name: string;

  @IsEnum(ZoneKind)
  kind: ZoneKind;

  @IsArray()
  @ArrayMaxSize(5_000)
  @IsString({ each: true })
  cells: string[];

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1.5)
  surgeMultiplier?: number;

  @IsOptional()
  @IsHexColor()
  color?: string;

  /** Days of the week it counts (0 = Sunday, IST); [] = every day. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  days?: number[];

  /** Minutes of the day (IST) it counts from and until; both null = all day; from after until runs past midnight. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(1439)
  startMinute?: number | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(1440)
  endMinute?: number | null;

  /** It counts only from / until then (ISO); null = open-ended. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsDateString()
  startsAt?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsDateString()
  endsAt?: string | null;

  /** SURGE: only these vehicles; [] = all. */
  @IsOptional()
  @IsArray()
  @IsEnum(VehicleKind, { each: true })
  vehicleKinds?: VehicleKind[];

  /** NO_SERVICE: stop pickups / drops inside (both by default). */
  @IsOptional()
  @IsBoolean()
  blockPickups?: boolean;

  @IsOptional()
  @IsBoolean()
  blockDrops?: boolean;
}

/** PATCH /admin/zones/:id body. */
export class UpdateZoneDto {
  @IsOptional()
  @IsString()
  @Length(2, 60)
  name?: string;

  @IsOptional()
  @IsEnum(ZoneKind)
  kind?: ZoneKind;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5_000)
  @IsString({ each: true })
  cells?: string[];

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1.5)
  surgeMultiplier?: number;

  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Days of the week it counts (0 = Sunday, IST); [] = every day. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  days?: number[];

  /** Minutes of the day (IST) it counts from and until; both null = all day; from after until runs past midnight. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(1439)
  startMinute?: number | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(1440)
  endMinute?: number | null;

  /** It counts only from / until then (ISO); null = open-ended. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsDateString()
  startsAt?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsDateString()
  endsAt?: string | null;

  /** SURGE: only these vehicles; [] = all. */
  @IsOptional()
  @IsArray()
  @IsEnum(VehicleKind, { each: true })
  vehicleKinds?: VehicleKind[];

  /** NO_SERVICE: stop pickups / drops inside (both by default). */
  @IsOptional()
  @IsBoolean()
  blockPickups?: boolean;

  @IsOptional()
  @IsBoolean()
  blockDrops?: boolean;
}

/** POST /admin/cities/:id/surge-now body: a surge for the next [hours], over the city or one zone's cells. */
export class SurgeNowDto {
  @IsOptional()
  @IsString()
  @Length(2, 60)
  name?: string;

  @IsNumber()
  @Min(1.05)
  @Max(1.5)
  multiplier: number;

  @IsInt()
  @Min(1)
  @Max(12)
  hours: number;

  /** The zone whose cells to cover; absent = the whole service area. */
  @IsOptional()
  @IsString()
  @Length(1, 40)
  zoneId?: string;

  /** Only these vehicles; [] or absent = all. */
  @IsOptional()
  @IsArray()
  @IsEnum(VehicleKind, { each: true })
  vehicleKinds?: VehicleKind[];

  /** Push the city's approved drivers that it's on. */
  @IsOptional()
  @IsBoolean()
  notifyDrivers?: boolean;
}
