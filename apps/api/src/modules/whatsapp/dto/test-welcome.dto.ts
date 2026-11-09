import { IsEnum, IsOptional, Matches } from 'class-validator';

import { WelcomeTrigger } from '../../../generated/prisma/enums.js';

/** POST /admin/welcome-messages/test: a trigger's WhatsApp template to the admin's own number. */
export class TestWelcomeDto {
  @IsEnum(WelcomeTrigger)
  trigger: WelcomeTrigger;

  /** A template name to try before saving it (WATX names: lowercase letters, digits and _). Absent = the saved one. */
  @IsOptional()
  @Matches(/^[a-z0-9_]{1,512}$/, { message: 'A template name has only lowercase letters, digits and _' })
  template?: string;
}
