import { IsDateString, IsIn, IsOptional, IsString, Length } from 'class-validator';

/** POST /admin/drivers/:id/documents/:type body. */
export class DocumentReviewDto {
  @IsIn(['VERIFIED', 'REJECTED'])
  status: 'VERIFIED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @Length(3, 200)
  reason?: string;

  /** VERIFIED: valid until this day ("2027-03-31", the date on the document); absent = no expiry date. */
  @IsOptional()
  @IsDateString({ strict: true })
  @Length(10, 10)
  expiresOn?: string;
}
