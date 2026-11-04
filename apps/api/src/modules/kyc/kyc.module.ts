import { Module } from '@nestjs/common';

import { DocumentExpiryService } from './document-expiry.service.js';
import { DriverApprovalService } from './driver-approval.service.js';
import { KycController } from './kyc.controller.js';
import { KycService } from './kyc.service.js';

/** Driver identity checks by hand (licence, Aadhaar and profile photo), the approval rules and document expiry. */
@Module({
  controllers: [KycController],
  providers: [KycService, DriverApprovalService, DocumentExpiryService],
  exports: [DriverApprovalService],
})
export class KycModule {}
