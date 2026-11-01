import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsOptional, IsString, Length, Matches, ValidateIf } from 'class-validator';

import { AdminLevel } from '../../../generated/prisma/enums.js';

/** POST /admin/team/staff body: someone joins the team by phone (their account is made if they have none). */
export class AddStaffDto {
  @Matches(/^(\+91)?[6-9]\d{9}$/, { message: 'Enter a 10-digit Indian mobile number' })
  phone: string;

  @IsOptional()
  @IsString()
  @Length(2, 60)
  name?: string;

  @IsEnum(AdminLevel)
  level: AdminLevel;

  /** SUPPORT: their role. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @Length(1, 40)
  roleId?: string | null;

  /** A city-limited role: the cities they set up. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  cityIds?: string[];
}

/** PATCH /admin/team/staff/:userId body. */
export class UpdateStaffDto {
  @IsOptional()
  @IsString()
  @Length(2, 60)
  name?: string;

  @IsOptional()
  @IsEnum(AdminLevel)
  level?: AdminLevel;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @Length(1, 40)
  roleId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  cityIds?: string[];
}

/** POST /admin/team/roles body. */
export class StaffRoleDto {
  @IsString()
  @Length(2, 40)
  name: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @Length(0, 160)
  description?: string | null;

  /** Permission keys (core/auth/permissions.ts). */
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  permissions: string[];

  @IsOptional()
  @IsBoolean()
  isCityScoped?: boolean;
}

/** PATCH /admin/team/roles/:id body. */
export class UpdateStaffRoleDto {
  @IsOptional()
  @IsString()
  @Length(2, 40)
  name?: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @Length(0, 160)
  description?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  permissions?: string[];

  @IsOptional()
  @IsBoolean()
  isCityScoped?: boolean;
}
