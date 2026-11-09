import { IsDateString, IsEnum, IsInt, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

import { VehicleKind } from '../../../generated/prisma/enums.js';

/** POST /drivers/me/meter-trips: a finished meter trip (D-42) from the driver's phone. */
export class MeterTripDto {
  /** The phone's id for the trip: sending it again returns the stored trip (a retry after a lost reply). */
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  clientId: string;

  @IsEnum(VehicleKind)
  vehicleKind: VehicleKind;

  @IsDateString()
  startedAt: string;

  @IsDateString()
  endedAt: string;

  @IsNumber()
  @Min(0)
  @Max(1000)
  distanceKm: number;

  /** Rupees, as the meter showed them. */
  @IsInt()
  @Min(0)
  @Max(100_000)
  fare: number;

  /** The night fare multiplier (1 = none). */
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(3)
  night?: number;

  @IsLatitude()
  startLat: number;

  @IsLongitude()
  startLng: number;

  /** The start's address as the phone showed it (missing: no internet then). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  startName?: string;
}
