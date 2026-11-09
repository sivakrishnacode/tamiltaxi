import { IsBoolean, IsEnum, IsOptional, IsString, Length } from 'class-validator';

import { ReminderMessageKind } from '../../../generated/prisma/enums.js';

/** POST /admin/reminder-messages: one more wording for a reminder ({name}, {drop}, {time}, {vehicle} allowed). */
export class CreateReminderMessageDto {
  @IsEnum(ReminderMessageKind)
  kind: ReminderMessageKind;

  @IsString()
  @Length(1, 65)
  title: string;

  @IsString()
  @Length(1, 180)
  body: string;
}

/** PATCH /admin/reminder-messages/:id: new wording, or on / off. */
export class UpdateReminderMessageDto {
  @IsOptional()
  @IsString()
  @Length(1, 65)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(1, 180)
  body?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
