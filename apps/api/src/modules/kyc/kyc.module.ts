import { Module } from '@nestjs/common';

import { DiditClient } from './didit.client.js';
import { DocumentExpiryService } from './document-expiry.service.js';
import { DriverApprovalService } from './driver-approval.service.js';
import { KycController } from './kyc.controller.js';
import { KycService } from './kyc.service.js';

/** Identity checks with Didit (in-app SDK + webhooks), the driver approval rules that depend on them and document expiry. */
@Module({
  controllers: [KycController],
  providers: [DiditClient, KycService, DriverApprovalService, DocumentExpiryService],
  exports: [DiditClient, DriverApprovalService],
})
export class KycModule {}
