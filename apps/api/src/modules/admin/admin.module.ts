import { Module } from '@nestjs/common';

import { AdminApprovalsService } from './admin-approvals.service.js';
import { AdminPeopleService } from './admin-people.service.js';
import { AdminSearchService } from './admin-search.service.js';
import { AdminCitiesController } from './admin-cities.controller.js';
import { AdminCitiesService } from './admin-cities.service.js';
import { AdminCityStatsService } from './admin-city-stats.service.js';
import { AdminHeatmapService } from './admin-heatmap.service.js';
import { AdminMissedService } from './admin-missed.service.js';
import { AdminSystemService } from './admin-system.service.js';
import { AdminMeController, AdminTeamController } from './admin-team.controller.js';
import { AdminTeamService } from './admin-team.service.js';
import { AdminOpsController } from './admin-ops.controller.js';
import { AdminOpsService } from './admin-ops.service.js';
import { AdminStatsService } from './admin-stats.service.js';
import { AdminUsersController } from './admin-users.controller.js';
import { AdminUsersService } from './admin-users.service.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { AnnouncementsController } from './announcements.controller.js';
import { AuditInterceptor } from './audit.interceptor.js';
import { DriverStatusSync } from './driver-status-sync.service.js';
import { DriversModule } from '../drivers/drivers.module.js';
import { KycModule } from '../kyc/kyc.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { UsersModule } from '../users/users.module.js';
import { TripsModule } from '../trips/trips.module.js';

/** Admin panel API (ADMIN role only) and public announcements. */
@Module({
  imports: [KycModule, TripsModule, DriversModule, RealtimeModule, UsersModule],
  controllers: [AdminController, AdminMeController, AdminTeamController, AdminCitiesController, AdminUsersController, AdminOpsController, AnnouncementsController],
  providers: [AdminService, AdminApprovalsService, AdminPeopleService, AdminSearchService, AdminStatsService, AdminCitiesService, AdminCityStatsService, AdminUsersService, AdminOpsService, AdminHeatmapService, AdminMissedService, AdminSystemService, AdminTeamService, AuditInterceptor, DriverStatusSync],
})
export class AdminModule {}
