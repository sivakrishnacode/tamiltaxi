import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import type { JwtPayload } from '../../core/auth/auth-user.js';
import { UserAccessService } from '../../core/auth/user-access.service.js';
import type { Env } from '../../core/config/env.js';
import { ENV } from '../../core/config/env.token.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { User } from '../../generated/prisma/client.js';
import { Role } from '../../generated/prisma/enums.js';
import type { LoginApp } from './dto/verify-otp.dto.js';
import { OtpService } from './otp.service.js';

/** Result of a successful OTP login. */
export interface LoginResult {
  readonly accessToken: string;
  readonly isNewUser: boolean;
  readonly user: User;
  readonly driverId?: string;
}

/**
 * The role a login's token carries. ADMIN only for the admin panel ([app] `admin`), or, for older clients that name
 * no app, when the account has no driver profile. An admin signing in to the driver app is their DRIVER self (with a
 * driver profile; else a PASSENGER, who can register one), to the passenger app a PASSENGER: one phone can be an
 * admin and a driver. Every explicit passenger login acts as PASSENGER, including registered drivers.
 * [promote]: an ADMIN_PHONES number on an admin login becomes ADMIN in the database.
 */
export function loginRole(p: { app?: LoginApp; role: Role; isAdminPhone: boolean; hasDriver: boolean }): { role: Role; promote: boolean } {
  if (p.app === 'passenger') return { role: Role.PASSENGER, promote: false };
  const isAdminLogin = p.app === 'admin' || (p.app === undefined && !p.hasDriver);
  const promote = p.isAdminPhone && isAdminLogin && p.role !== Role.ADMIN;
  const role = promote ? Role.ADMIN : p.role;
  if (role !== Role.ADMIN || isAdminLogin) return { role, promote };
  return { role: p.hasDriver ? Role.DRIVER : Role.PASSENGER, promote };
}

/** Phone + OTP sign-in for both apps and the admin panel; issues JWTs. */
@Injectable()
export class AuthService {
  constructor(
    private readonly otp: OtpService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly access: UserAccessService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  static normalise(phone: string): string {
    return `+91${phone.replace(/^\+91/, '')}`;
  }

  async verify(params: { phone: string; code: string; app?: LoginApp }): Promise<LoginResult> {
    const phone = AuthService.normalise(params.phone);
    if (!(await this.otp.verify(phone, params.code))) throw new UnauthorizedException('Incorrect OTP');
    const existing = await this.prisma.user.findUnique({ where: { phone }, include: { driver: true } });
    if (existing?.isBlocked) throw new ForbiddenException(existing.blockedReason ?? 'Your account is blocked. Contact support.');
    const created = existing ?? (await this.prisma.user.create({ data: { phone }, include: { driver: true } }));
    const { role, promote } = loginRole({ app: params.app, role: created.role, isAdminPhone: this.env.adminPhones.includes(phone), hasDriver: !!created.driver });
    const user = promote ? await this.prisma.user.update({ where: { id: created.id }, data: { role: Role.ADMIN }, include: { driver: true } }) : created;
    // A passenger token never acts as the account's driver profile.
    const driverId = role === Role.PASSENGER ? undefined : user.driver?.id;
    const accessToken = await this.issueToken({ sub: user.id, role, driverId, app: params.app });
    return { accessToken, isNewUser: !existing || !existing.name, user, driverId };
  }

  /**
   * Signs a JWT (also used after a role change, e.g. driver registration). The account's cached role is dropped first,
   * so the new token (and any older one) is checked against the account as it is now.
   */
  async issueToken(payload: JwtPayload): Promise<string> {
    await this.access.invalidate(payload.sub);
    return this.jwt.signAsync({ ...payload });
  }

  /**
   * Call after changing a user's role (or anything else about their account's access): their tokens act with the new
   * role from the next request, no new sign-in needed.
   */
  invalidateRole(userId: string): Promise<void> {
    return this.access.invalidate(userId);
  }
}
