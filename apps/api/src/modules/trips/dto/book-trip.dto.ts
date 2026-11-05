import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsObject, IsOptional, IsString, Length, Matches, MaxLength, ValidateNested } from 'class-validator';

import { ParcelPayer, PaymentMode, RideMode, TripKind, VehicleKind, WomenDriverPref } from '../../../generated/prisma/enums.js';
import { PointDto } from '../../fares/dto/point.dto.js';
import { ShiftingDto } from '../../fares/dto/shifting.dto.js';

/** "Who's riding?": someone else takes the ride (rides only). */
export class RiderDto {
  @IsString()
  @Length(2, 60)
  name: string;

  @Matches(/^(\+91)?[6-9]\d{9}$/, { message: "Enter the rider's 10-digit mobile number" })
  phone: string;

  /** Lets the booking use Butterfly (women drivers). */
  @IsBoolean()
  isWoman: boolean;
}

/** POST /trips body (P-10 Book, PP-06 Book). */
export class BookTripDto {
  @IsEnum(TripKind)
  kind: TripKind;

  @IsEnum(VehicleKind)
  vehicleKind: VehicleKind;

  @ValidateNested()
  @Type(() => PointDto)
  pickup: PointDto;

  /** Required except for a rental (it starts and ends wherever the rider says on the way). */
  @IsOptional()
  @ValidateNested()
  @Type(() => PointDto)
  drop?: PointDto;

  @IsOptional()
  @IsEnum(PaymentMode)
  paymentMode?: PaymentMode;

  /** Parcel only: category, weight band, sender and receiver details. */
  @IsOptional()
  @IsObject()
  parcel?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(ParcelPayer)
  payer?: ParcelPayer;

  /** Butterfly (rides, women riders only): women drivers first (PREFERRED) or only (ONLY). Default NONE. */
  @IsOptional()
  @IsEnum(WomenDriverPref)
  womenDriver?: WomenDriverPref;

  /** "Near KG Hospital": the pickup's landmark from the reverse geocode (shown to the driver). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  pickupLandmark?: string;

  /** Booked for someone else: the driver sees and calls this person. Default: the account holder rides. */
  @IsOptional()
  @ValidateNested()
  @Type(() => RiderDto)
  rider?: RiderDto;

  /** LOCAL (default), RENTAL (a cab by the hour) or OUTSTATION (a cab to another town). Cab tiers only for the last two. */
  @IsOptional()
  @IsEnum(RideMode)
  rideMode?: RideMode;

  /** RENTAL: the package ("1h" … "12h", GET /fares/rental-packages). */
  @IsOptional()
  @IsString()
  @MaxLength(8)
  rentalPackageId?: string;

  /** OUTSTATION: back to the pickup at [returnAt] (true) or one way (false, default). */
  @IsOptional()
  @IsBoolean()
  roundTrip?: boolean;

  /** OUTSTATION round trip: when the rider comes back (ISO); none = straight back (leaving + the drive both ways). */
  @IsOptional()
  @IsDateString()
  returnAt?: string;

  /**
   * RENTAL / OUTSTATION: the pickup time for a trip booked for later (ISO, up to 7 days ahead). Absent = now.
   * House shifting: the slot start (required).
   */
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  /** House shifting (PARCEL by a goods truck): home size, typed items, floors and lifts, packing and extras. */
  @IsOptional()
  @ValidateNested()
  @Type(() => ShiftingDto)
  shifting?: ShiftingDto;
}
