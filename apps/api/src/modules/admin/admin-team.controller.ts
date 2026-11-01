import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseInterceptors } from '@nestjs/common';

import type { AuthUser } from '../../core/auth/auth-user.js';
import { CurrentUser } from '../../core/auth/current-user.decorator.js';
import { OwnerOnly, Roles } from '../../core/auth/roles.decorator.js';
import type { StaffRole } from '../../generated/prisma/client.js';
import { Role } from '../../generated/prisma/enums.js';
import { AdminTeamService, type AdminMe, type StaffMember, type StaffRoleWithCount } from './admin-team.service.js';
import { AuditInterceptor } from './audit.interceptor.js';
import { AddStaffDto, StaffRoleDto, UpdateStaffDto, UpdateStaffRoleDto } from './dto/team.dto.js';

/** The signed-in admin's own access (any admin): the panel builds its sidebar and buttons from it. */
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminMeController {
  constructor(private readonly team: AdminTeamService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<AdminMe> {
    return this.team.me(user);
  }
}

/** Admin Team › Staff and Roles. Owners only. Audited. */
@Roles(Role.ADMIN)
@OwnerOnly()
@UseInterceptors(AuditInterceptor)
@Controller('admin/team')
export class AdminTeamController {
  constructor(private readonly team: AdminTeamService) {}

  @Get()
  list(): Promise<{ staff: StaffMember[]; roles: StaffRoleWithCount[] }> {
    return this.team.team();
  }

  @Post('staff')
  addStaff(@Body() body: AddStaffDto): Promise<StaffMember> {
    return this.team.addStaff(body);
  }

  @Patch('staff/:userId')
  updateStaff(@CurrentUser() user: AuthUser, @Param('userId') userId: string, @Body() body: UpdateStaffDto): Promise<StaffMember> {
    return this.team.updateStaff(user, userId, body);
  }

  @Delete('staff/:userId')
  @HttpCode(204)
  removeStaff(@CurrentUser() user: AuthUser, @Param('userId') userId: string): Promise<void> {
    return this.team.removeStaff(user, userId);
  }

  @Get('roles')
  roles(): Promise<StaffRoleWithCount[]> {
    return this.team.roles();
  }

  @Post('roles')
  createRole(@Body() body: StaffRoleDto): Promise<StaffRole> {
    return this.team.createRole(body);
  }

  @Patch('roles/:id')
  updateRole(@Param('id') id: string, @Body() body: UpdateStaffRoleDto): Promise<StaffRole> {
    return this.team.updateRole(id, body);
  }

  @Delete('roles/:id')
  @HttpCode(204)
  deleteRole(@Param('id') id: string): Promise<void> {
    return this.team.deleteRole(id);
  }
}
