import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const HEATMAP_METRICS = ['pickups', 'drops', 'unmet', 'fares'] as const;
export type HeatmapMetric = (typeof HEATMAP_METRICS)[number];

/** GET /admin/heatmap query. */
export class HeatmapQueryDto {
  /** pickups (booked), drops, unmet (missed: no driver found, or cancelled while searching), fares (₹ from finished trips). */
  @IsOptional()
  @IsIn(HEATMAP_METRICS)
  metric?: HeatmapMetric;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsIn(['RIDE', 'PARCEL'])
  kind?: 'RIDE' | 'PARCEL';

  @IsOptional()
  @IsString()
  @MaxLength(20)
  vehicleKind?: string;

  /** Hour of day in IST, 0–23 (inclusive range with hourTo). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  hourFrom?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  hourTo?: number;

  /** Aggregate to a coarser resolution (5–8) for city-wide views. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(8)
  resolution?: number;
}
