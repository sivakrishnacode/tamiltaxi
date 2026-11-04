import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString } from 'class-validator';

import { ListQueryDto } from './list-query.dto.js';

/**
 * Buckets of the Approvals queue. Pending drivers sit in exactly one: ready (every check done), documents (an
 * upload waits for an admin), identity (licence and Aadhaar verified, the profile photo still to approve or take),
 * driver (waiting on the driver). photos: any
 * driver with a profile photo waiting for review.
 */
export const APPROVAL_STAGES = ['ready', 'documents', 'identity', 'driver', 'photos'] as const;
export type ApprovalStage = (typeof APPROVAL_STAGES)[number];

/** GET /admin/approvals query. */
export class ApprovalsQueryDto extends ListQueryDto {
  @IsOptional()
  @IsIn(APPROVAL_STAGES)
  stage?: ApprovalStage;
}

/** POST /admin/drivers/approve body: approve several ready drivers at once. */
export class ApproveDriversDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  ids: string[];
}
