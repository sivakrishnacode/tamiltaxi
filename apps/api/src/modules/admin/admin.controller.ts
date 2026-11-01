import { Body, Controller, Get, HttpCode, Param, ParseEnumPipe, Patch, Post, Query, UseInterceptors } from '@nestjs/common';

import type { AuthUser } from '../../core/auth/auth-user.js';
import { CurrentUser } from '../../core/auth/current-user.decorator.js';
import { OwnerOnly, Roles } from '../../core/auth/roles.decorator.js';
import type { Driver, DriverBlock, KycDocument, Plan, SupportTicket, Trip, User } from '../../generated/prisma/client.js';
import { KycDocType, Role } from '../../generated/prisma/enums.js';
import type { ApprovalChecklist } from '../kyc/driver-approval.js';
import { SettingsService } from '../settings/settings.service.js';
import { type CancelRateStats, DriverBlocksService } from '../trips/driver-blocks.service.js';
import { DriverOfferStatsService } from '../trips/driver-offer-stats.service.js';
import { driverOfferStats, type DriverOfferStats } from '../trips/driver-rank.js';
import { AdminApprovalsService, type ApprovalsPage } from './admin-approvals.service.js';
import { AdminPeopleService } from './admin-people.service.js';
import { AdminSearchService, type SearchResults } from './admin-search.service.js';
import { AdminStatsService } from './admin-stats.service.js';
import { AdminService } from './admin.service.js';
import type { AdminStats, Paged } from './admin.types.js';
import { AuditInterceptor } from './audit.interceptor.js';
import { ApprovalsQueryDto, ApproveDriversDto } from './dto/approvals.dto.js';
import { DocumentReviewDto } from './dto/document-review.dto.js';
import { AdminDriverProfileDto } from './dto/people.dto.js';
import { DriverStatusDto } from './dto/driver-status.dto.js';
import { ListQueryDto } from './dto/list-query.dto.js';
import { TicketStatusDto } from './dto/ticket-status.dto.js';
import { TripReviewDto } from './dto/trip-review.dto.js';
import { UpdatePlanDto } from './dto/update-plan.dto.js';

/** Admin panel API. Sign in with a phone listed in ADMIN_PHONES. */
@Roles(Role.ADMIN)
@UseInterceptors(AuditInterceptor)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly statsService: AdminStatsService,
    private readonly blocks: DriverBlocksService,
    private readonly offerStats: DriverOfferStatsService,
    private readonly settings: SettingsService,
    private readonly approvals: AdminApprovalsService,
    private readonly people: AdminPeopleService,
    private readonly searcher: AdminSearchService,
  ) {}

  @Get('stats')
  stats(): Promise<AdminStats> {
    return this.statsService.stats();
  }

  /** Global search (Ctrl+K in the panel): up to 5 drivers, people without a driver profile and trips. ?q ≥ 2 chars. */
  @Get('search')
  search(@Query('q') q?: string): Promise<SearchResults> {
    return this.searcher.search(q);
  }

  /** ?status&vehicle&online&gender&q&sort=newest|oldest|rating|trips|name, plus `counts` per status (the other filters applied). */
  @Get('drivers')
  drivers(@Query() q: ListQueryDto): ReturnType<AdminService['drivers']> {
    return this.admin.drivers(q);
  }

  /** Approvals queue: ?stage=ready (default) | documents | identity | driver | photos, with counts per stage. */
  @Get('approvals')
  approvalQueue(@Query() q: ApprovalsQueryDto): Promise<ApprovalsPage> {
    return this.approvals.list(q);
  }

  /** Approves several ready drivers (pending, every check done); the others come back in `skipped`. */
  @Post('drivers/approve')
  @HttpCode(200)
  approveDrivers(@Body() body: ApproveDriversDto, @CurrentUser() user: AuthUser): Promise<{ approved: string[]; skipped: { id: string; reason: string }[] }> {
    return this.approvals.approveMany(body.ids, user.userId);
  }

  @Get('drivers/:id')
  driver(@Param('id') id: string): Promise<Driver & { cancelRate: CancelRateStats; checklist: ApprovalChecklist; identityRequired: boolean }> {
    return this.admin.driver(id);
  }

  /** The driver's offers over 7 days (offered, accepted, declined, ignored, cancelled after accepting), used in ranking. */
  @Get('drivers/:id/offer-stats')
  async driverOfferStats(@Param('id') id: string): Promise<DriverOfferStats> {
    const [stats, s] = await Promise.all([this.offerStats.forDriver(id), this.settings.all()]);
    return driverOfferStats(stats, s);
  }

  /** Ends the driver's current cancellation pause now (audit logged). 409 when they aren't paused. */
  @Post('drivers/:id/lift-block')
  liftBlock(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<DriverBlock> {
    return this.blocks.lift(id, user.userId);
  }

  @Patch('drivers/:id')
  setDriverStatus(@Param('id') id: string, @Body() body: DriverStatusDto): Promise<Driver> {
    return this.admin.setDriverStatus(id, body.status, body.reason);
  }

  /** Fix the driver's vehicle / payout details (vehicle kind only while offline; plate must be unique → 409). */
  @Patch('drivers/:id/profile')
  updateDriverProfile(@Param('id') id: string, @Body() body: AdminDriverProfileDto): Promise<Driver> {
    return this.people.updateDriverProfile(id, body);
  }

  /** Takes an online driver offline now. 409 when already offline. */
  @Post('drivers/:id/offline')
  @HttpCode(200)
  takeOffline(@Param('id') id: string): Promise<Driver> {
    return this.people.takeOffline(id);
  }

  @Post('drivers/:id/documents/:type')
  reviewDocument(
    @Param('id') id: string,
    @Param('type', new ParseEnumPipe(KycDocType)) type: KycDocType,
    @Body() body: DocumentReviewDto,
  ): Promise<KycDocument[]> {
    return this.admin.reviewDocument({ driverId: id, type, ...body });
  }

  @Get('trips')
  trips(@Query() q: ListQueryDto): Promise<Paged<Omit<Trip, 'pathPolyline' | 'routePolyline'>>> {
    return this.admin.trips(q);
  }

  @Get('trips/:id')
  trip(@Param('id') id: string): Promise<Trip> {
    return this.admin.trip(id);
  }

  /** Clears (or sets) the needs-review flag; a note is added to the review note. */
  @Patch('trips/:id/review')
  reviewTrip(@Param('id') id: string, @Body() body: TripReviewDto): Promise<Trip> {
    return this.admin.reviewTrip(id, body);
  }

  @Get('passengers')
  passengers(@Query() q: ListQueryDto): Promise<Paged<User>> {
    return this.admin.passengers(q);
  }

  @Get('plans')
  plans(): Promise<Plan[]> {
    return this.admin.plans();
  }

  @Patch('plans/:id')
  @OwnerOnly()
  updatePlan(@Param('id') id: string, @Body() body: UpdatePlanDto): Promise<Plan> {
    return this.admin.updatePlan(id, body);
  }

  @Get('tickets')
  tickets(@Query() q: ListQueryDto): Promise<Paged<SupportTicket>> {
    return this.admin.tickets(q);
  }

  @Patch('tickets/:id')
  setTicketStatus(@Param('id') id: string, @Body() body: TicketStatusDto): Promise<SupportTicket> {
    return this.admin.setTicketStatus(id, body.status);
  }
}
