import { IsEnum } from 'class-validator';

import { PaymentMode } from '../../../generated/prisma/enums.js';

/** POST /trips/:id/payment body (D-19 / D-22b): how the rider paid the driver. */
export class RecordPaymentDto {
  @IsEnum(PaymentMode)
  mode: PaymentMode;
}
