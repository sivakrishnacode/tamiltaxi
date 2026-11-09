import { IsEnum, IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';

import { Gender, VehicleKind, WorkType } from '../../../generated/prisma/enums.js';
import { DRIVER_VEHICLE_KINDS } from '../vehicle-match.js';

/** POST /drivers body (D-04 … D-06). */
export class RegisterDriverDto {
  @IsString()
  @Length(2, 60)
  name: string;

  @IsEnum(WorkType)
  workType: WorkType;

  /** Any vehicle except booking tiers (Auto Priority is served by autos). */
  @IsIn(DRIVER_VEHICLE_KINDS, { message: 'Choose your vehicle' })
  vehicleKind: VehicleKind;

  @IsString()
  @Length(2, 60)
  vehicleModel: string;

  @IsString()
  @Length(0, 30)
  vehicleColor: string;

  /** Indian plate, e.g. "TN 37 AB 4521". */
  @Matches(/^[A-Z]{2}\s?\d{1,2}\s?[A-Z]{0,3}\s?\d{1,4}$/i, { message: 'Enter a valid number plate' })
  plate: string;

  @Matches(/^[\w.-]{2,}@[a-z]{2,}$/i, { message: 'Enter a valid UPI ID' })
  upiId: string;

  /** D-06 gender (stored on the user). FEMALE drivers get Butterfly (women-only) requests. */
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  /** D-06: the service city the driver works in (an active city's id; the app picks the one nearest the phone). */
  @IsOptional()
  @IsString()
  @Length(1, 40)
  cityId?: string;
}
