import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsEnum, IsOptional, IsString, Length, ValidateIf } from 'class-validator';

import { AdminLevel, Role } from '../../../generated/prisma/enums.js';

/** PATCH /admin/users/:id body. */
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Length(2, 60)
  name?: string;

  /** null clears it. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsEmail({}, { message: 'Enter a valid email' })
  email?: string | null;

  /** Role, admin level and cities: owner admins only, never on their own account. */
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  /** ADMIN only. A user made ADMIN without one starts as SUPPORT. */
  @IsOptional()
  @IsEnum(AdminLevel)
  adminLevel?: AdminLevel;

  /** SUPPORT admins: the cities (City.id) they set up; [] = none. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @Length(1, 60, { each: true })
  adminCityIds?: string[];

  @IsOptional()
  @IsBoolean()
  isBlocked?: boolean;

  @IsOptional()
  @IsString()
  @Length(3, 200)
  blockedReason?: string;
}
