import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseInterceptors } from '@nestjs/common';

import type { AuthUser } from '../../core/auth/auth-user.js';
import { CurrentUser } from '../../core/auth/current-user.decorator.js';
import { Roles } from '../../core/auth/roles.decorator.js';
import { Needs } from '../../core/auth/permissions.js';
import type { KycDocument, User } from '../../generated/prisma/client.js';
import { Role } from '../../generated/prisma/enums.js';
import { type ActivityEntry, type AdminNoteView, AdminPeopleService } from './admin-people.service.js';
import { AdminUsersService } from './admin-users.service.js';
import { RideOtpService } from '../trips/ride-otp.service.js';
import { AccountDeletionService } from '../users/account-deletion.service.js';
import type { Paged } from './admin.types.js';
import { AuditInterceptor } from './audit.interceptor.js';
import { ListQueryDto } from './dto/list-query.dto.js';
import { CreateNoteDto, MessageDto, RideOtpDto } from './dto/people.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

/** User management (with notes, history and a direct push per person) and the KYC review queue. */
@Roles(Role.ADMIN)
@UseInterceptors(AuditInterceptor)
@Controller('admin')
export class AdminUsersController {
  constructor(
    private readonly users: AdminUsersService,
    private readonly people: AdminPeopleService,
    private readonly deletion: AccountDeletionService,
    private readonly rideOtps: RideOtpService,
  ) {}

  /** ?role=PASSENGER|DRIVER|ADMIN&blocked=true|false&q=… */
  @Get('users')
  @Needs('riders.view')
  list(@Query() q: ListQueryDto): Promise<Paged<User>> {
    return this.users.users(q);
  }

  @Get('users/:id')
  @Needs('riders.view', 'drivers.view')
  get(@Param('id') id: string): Promise<User> {
    return this.users.user(id);
  }

  @Patch('users/:id')
  @Needs('riders.manage', 'drivers.manage')
  update(@Param('id') id: string, @Body() body: UpdateUserDto, @CurrentUser() user: AuthUser): Promise<User> {
    return this.users.update(id, body, user);
  }

  /** Deletes the person's account like DELETE /me does (204; 409 while a trip is unfinished; not your own). Audited. */
  @Delete('users/:id')
  @Needs('accounts.delete')
  @HttpCode(204)
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<void> {
    return this.deletion.delete(id, { kind: 'admin', adminId: user.userId });
  }

  /**
   * A new ride OTP for the rider (when theirs was overheard): [RideOtpDto.otp] or a random one. Their rides that
   * haven't started move to it and their app is told. Audited.
   */
  @Post('users/:id/ride-otp')
  @Needs('riders.manage')
  @HttpCode(200)
  async rideOtp(@Param('id') id: string, @Body() body: RideOtpDto): Promise<{ rideOtp: string }> {
    return { rideOtp: await this.rideOtps.change(id, body.otp) };
  }

  /** Internal notes on the person (driver or rider), newest first. */
  @Get('users/:id/notes')
  @Needs('riders.view', 'drivers.view')
  notes(@Param('id') id: string): Promise<AdminNoteView[]> {
    return this.people.notes(id);
  }

  @Post('users/:id/notes')
  @Needs('riders.manage', 'drivers.manage')
  addNote(@Param('id') id: string, @Body() body: CreateNoteDto, @CurrentUser() user: AuthUser): Promise<AdminNoteView> {
    return this.people.addNote(id, user.userId, body.body);
  }

  @Delete('notes/:id')
  @Needs('riders.manage', 'drivers.manage')
  @HttpCode(204)
  removeNote(@Param('id') id: string): Promise<void> {
    return this.people.removeNote(id);
  }

  /**
   * Admin changes to this person (account + driver profile), newest first, with who made them. ?limit ≤ 200;
   * `?side=rider` leaves the driver profile's changes out (the rider page).
   */
  @Get('users/:id/activity')
  @Needs('riders.view', 'drivers.view')
  activity(@Param('id') id: string, @Query('limit') limit?: string, @Query('side') side?: string): Promise<ActivityEntry[]> {
    return this.people.activity(id, Number(limit) > 0 ? Number(limit) : 50, side === 'rider');
  }

  /** A push to this person's phone; `devices` = phones it went to (0 = nothing sent). */
  @Post('users/:id/message')
  @Needs('riders.manage', 'drivers.manage')
  @HttpCode(200)
  message(@Param('id') id: string, @Body() body: MessageDto): Promise<{ devices: number }> {
    return this.people.message(id, body);
  }

  /** ?status=UNDER_REVIEW (default) | REJECTED | NOT_UPLOADED | VERIFIED */
  @Get('kyc')
  @Needs('drivers.view')
  kyc(@Query() q: ListQueryDto): Promise<Paged<KycDocument>> {
    return this.users.kycQueue(q);
  }
}
