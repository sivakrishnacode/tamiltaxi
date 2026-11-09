import { IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';

import { Gender, WorkType } from '../../../generated/prisma/enums.js';

/** PATCH /drivers/me body (D-25 profile). Vehicle kind is fixed once registered (plans are priced per vehicle). */
export class UpdateDriverDto {
  @IsOptional()
  @IsString()
  @Length(2, 60)
  name?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsEnum(WorkType)
  workType?: WorkType;

  @IsOptional()
  @IsString()
  @Length(2, 60)
  vehicleModel?: string;

  @IsOptional()
  @IsString()
  @Length(0, 30)
  vehicleColor?: string;

  @IsOptional()
  @Matches(/^[A-Z]{2}\s?\d{1,2}\s?[A-Z]{0,3}\s?\d{1,4}$/i, { message: 'Enter a valid number plate' })
  plate?: string;

  @IsOptional()
  @Matches(/^[\w.-]{2,}@[a-z]{2,}$/i, { message: 'Enter a valid UPI ID' })
  upiId?: string;

  /** D-06: the service city the driver works in (an active city's id; the app picks the one nearest the phone). */
  @IsOptional()
  @IsString()
  @Length(1, 40)
  cityId?: string;
}
