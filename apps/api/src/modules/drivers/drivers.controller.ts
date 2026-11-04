import { Body, Controller, ForbiddenException, Get, HttpCode, Param, ParseEnumPipe, Patch, Post, Put, Query, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';

import type { AuthUser } from '../../core/auth/auth-user.js';
import { CurrentUser } from '../../core/auth/current-user.decorator.js';
import { Roles } from '../../core/auth/roles.decorator.js';
import { Needs } from '../../core/auth/permissions.js';
import { FileStorageService, MAX_UPLOAD_BYTES, type UploadedBlob } from '../../core/storage/file-storage.service.js';
import type { Driver, KycDocument } from '../../generated/prisma/client.js';
import { KycDocType, Role, TripKind } from '../../generated/prisma/enums.js';
import { type BookingPrefs, SERVICE_KEYS, type ServiceKey } from './booking-prefs.js';
import { DriverEarningsService, type Earnings } from './driver-earnings.service.js';
import { ADMIN_CANT_REGISTER, type DriverProfile, DriversService } from './drivers.service.js';
import { AuditInterceptor } from '../admin/audit.interceptor.js';
import { BookingPrefsDto, ServiceDto } from './dto/booking-prefs.dto.js';
import { EarningsQueryDto } from './dto/earnings-query.dto.js';
import { LocationDto } from './dto/location.dto.js';
import { NearbyQueryDto } from './dto/nearby-query.dto.js';
import { PARCEL_MAP_KINDS, RIDE_MAP_KINDS, type NearbyVehicle } from './nearby-vehicles.js';
import { RegisterDriverDto } from './dto/register-driver.dto.js';
import { ReviewPhotoDto } from './dto/review-photo.dto.js';
import { UpdateDriverDto } from './dto/update-driver.dto.js';

/** D-04 … D-10, D-13 / D-14, admin KYC review. */
@Controller()
export class DriversController {
  constructor(
    private readonly drivers: DriversService,
    private readonly earningsService: DriverEarningsService,
    private readonly files: FileStorageService,
  ) {}

  /**
   * Free vehicles around a pickup for the rider's map (P-07, P-10, P-12): up to 15 within 3 km, a few of each kind,
   * no ids, positions rounded to ~55 m. `trip=PARCEL` shows goods vehicles and two-wheelers.
   */
  @Get('drivers/nearby')
  nearby(@Query() q: NearbyQueryDto): Promise<{ vehicles: NearbyVehicle[] }> {
    return this.drivers.nearbyVehicles({ lat: q.lat, lng: q.lng }, q.trip === TripKind.PARCEL ? PARCEL_MAP_KINDS : RIDE_MAP_KINDS);
  }

  /** 201 with a new driver; 200 with the existing one when the user already registered (a retry). Admins → 403. */
  @Post('drivers')
  async register(
    @CurrentUser() user: AuthUser,
    @Body() body: RegisterDriverDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ driver: Driver; accessToken: string }> {
    if (user.role === Role.ADMIN) throw new ForbiddenException(ADMIN_CANT_REGISTER);
    const { driver, accessToken, isNew } = await this.drivers.register(user.userId, body);
    if (!isNew) res.status(200);
    return { driver, accessToken };
  }

  /** The driver and their account. */
  @Roles(Role.DRIVER)
  @Get('drivers/me')
  me(@CurrentUser() user: AuthUser): Promise<DriverProfile> {
    return this.drivers.me(DriversController.driverId(user));
  }

  @Roles(Role.DRIVER)
  @Patch('drivers/me')
  update(@CurrentUser() user: AuthUser, @Body() body: UpdateDriverDto): Promise<DriverProfile> {
    return this.drivers.update(DriversController.driverId(user), body);
  }

  /** Booking preferences: pickup distance, trip length, go-to destination (dispatch only offers trips that fit). */
  @Roles(Role.DRIVER)
  @Get('drivers/me/booking-preferences')
  bookingPrefs(@CurrentUser() user: AuthUser): Promise<BookingPrefs> {
    return this.drivers.bookingPrefs(DriversController.driverId(user));
  }

  @Roles(Role.DRIVER)
  @Put('drivers/me/booking-preferences')
  setBookingPrefs(@CurrentUser() user: AuthUser, @Body() body: BookingPrefsDto): Promise<BookingPrefs> {
    return this.drivers.setBookingPrefs(DriversController.driverId(user), body);
  }

  /** Services: switch one on, or pause it (for some minutes, or until started again). Returns the preferences. */
  @Roles(Role.DRIVER)
  @Put('drivers/me/services/:service')
  setService(
    @CurrentUser() user: AuthUser,
    @Param('service', new ParseEnumPipe(Object.fromEntries(SERVICE_KEYS.map((k) => [k, k])))) service: ServiceKey,
    @Body() body: ServiceDto,
  ): Promise<BookingPrefs> {
    return this.drivers.setService(DriversController.driverId(user), service, body);
  }

  /** D-23: ?period=today|week|month. */
  @Roles(Role.DRIVER)
  @Get('drivers/me/earnings')
  earnings(@CurrentUser() user: AuthUser, @Query() q: EarningsQueryDto): Promise<Earnings> {
    return this.earningsService.summary(DriversController.driverId(user), q.period ?? 'today');
  }

  @Roles(Role.DRIVER)
  @Get('drivers/me/documents')
  documents(@CurrentUser() user: AuthUser): Promise<KycDocument[]> {
    return this.drivers.documents(DriversController.driverId(user));
  }

  /** D-08: multipart/form-data with a `file` field (JPG, PNG, WebP or PDF, ≤ 8 MB). */
  @Roles(Role.DRIVER)
  @Post('drivers/me/documents/:type')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  upload(
    @CurrentUser() user: AuthUser,
    @Param('type', new ParseEnumPipe(KycDocType)) type: KycDocType,
    @UploadedFile() file?: UploadedBlob,
  ): Promise<KycDocument> {
    return this.drivers.uploadDocument({ driverId: DriversController.driverId(user), type, file });
  }

  @Roles(Role.DRIVER)
  @Post('drivers/me/online')
  @HttpCode(200)
  online(@CurrentUser() user: AuthUser, @Body() body: LocationDto): Promise<Driver> {
    return this.drivers.goOnline({ driverId: DriversController.driverId(user), ...body });
  }

  @Roles(Role.DRIVER)
  @Post('drivers/me/offline')
  @HttpCode(200)
  offline(@CurrentUser() user: AuthUser): Promise<Driver> {
    return this.drivers.goOffline(DriversController.driverId(user));
  }

  /** D-07 profile photo: multipart `file` (JPG / PNG / WebP ≤ 8 MB), waits for an admin. */
  @Roles(Role.DRIVER)
  @Post('drivers/me/photo')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  uploadPhoto(@CurrentUser() user: AuthUser, @UploadedFile() file?: UploadedBlob): Promise<{ status: 'APPROVED' | 'IN_REVIEW' }> {
    return this.drivers.uploadPhoto({ driverId: DriversController.driverId(user), file });
  }

  @Roles(Role.ADMIN)
  @Post('admin/drivers/:id/photo')
  @Needs('drivers.manage')
  @HttpCode(200)
  @UseInterceptors(AuditInterceptor)
  reviewPhoto(@Param('id') id: string, @Body() body: ReviewPhotoDto): Promise<Driver> {
    return this.drivers.reviewPhoto({ driverId: id, ...body });
  }

  /** The driver's profile photo (`?v=` = photo file, for caching). The driver, admins and their riders only. */
  @Get('drivers/:id/photo')
  async photo(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const name = await this.drivers.photo({ driverId: id, viewer: user });
    const f = await this.files.open(name);
    res.setHeader('cache-control', 'private, max-age=86400');
    return new StreamableFile(f.stream, { type: f.type, length: f.size || undefined, disposition: 'inline' });
  }

  private static driverId(user: AuthUser): string {
    if (!user.driverId) throw new ForbiddenException('Register as a driver first');
    return user.driverId;
  }
}
