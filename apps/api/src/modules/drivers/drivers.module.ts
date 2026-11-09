import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { KycModule } from '../kyc/kyc.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { DriverEarningsService } from './driver-earnings.service.js';
import { MeterTripsService } from './meter-trips.service.js';
import { DriverLocationService } from './driver-location.service.js';
import { DriversController } from './drivers.controller.js';
import { DriversService } from './drivers.service.js';
import { TripDriversService } from './trip-drivers.service.js';

/** Driver registration, profile, KYC uploads, online status, earnings and live locations. */
@Module({
  imports: [AuthModule, SubscriptionsModule, KycModule],
  controllers: [DriversController],
  providers: [DriversService, DriverLocationService, DriverEarningsService, MeterTripsService, TripDriversService],
  exports: [DriversService, DriverLocationService, DriverEarningsService, TripDriversService],
})
export class DriversModule {}
