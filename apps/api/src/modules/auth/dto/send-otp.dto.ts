import { Transform } from 'class-transformer';
import { IsIn, IsOptional, Matches } from 'class-validator';

import { NormalizePhone } from '../../../core/validation/normalize-phone.js';
import { LOGIN_APPS, type LoginApp } from './verify-otp.dto.js';

/** POST /auth/otp body. Indian mobile number, 10 digits (with or without +91). */
export class SendOtpDto {
  @NormalizePhone()
  @Matches(/^(\+91)?[6-9]\d{9}$/, { message: 'Enter a valid 10-digit Indian mobile number' })
  phone: string;

  /** Which app asks (`passenger`, `driver` or `admin`): picks the WhatsApp template. Older app builds don't send it. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value))
  @IsIn(LOGIN_APPS, { message: 'app must be passenger, driver or admin' })
  app?: LoginApp;
}
