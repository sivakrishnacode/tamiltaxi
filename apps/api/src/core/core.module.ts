import { Global, Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { JwtModule } from '@nestjs/jwt';

import { JwtAuthGuard } from './auth/jwt-auth.guard.js';
import { RolesGuard } from './auth/roles.guard.js';
import { UserAccessService } from './auth/user-access.service.js';
import { loadEnv } from './config/env.js';
import { EnvModule } from './config/env.module.js';
import { DriverStateCache } from './driver-state/driver-state.cache.js';
import { AllExceptionsFilter } from './filters/all-exceptions.filter.js';
import { JobsModule } from './jobs/jobs.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RateLimitGuard } from './rate-limit/rate-limit.guard.js';
import { RedisModule } from './redis/redis.module.js';
import { FileStorageService } from './storage/file-storage.service.js';
import { UsageService } from './usage/usage.service.js';

const env = loadEnv();

/** Cross-cutting setup: config, database, Redis, durable jobs, domain events (events/domain-events.ts), the driver state cache, JWT and the per-request account lookup, file storage, usage counters, global guards (JWT, roles, rate limits), validation and error filter. */
@Global()
@Module({
  imports: [
    EnvModule,
    PrismaModule,
    RedisModule,
    JobsModule,
    EventEmitterModule.forRoot(),
    JwtModule.register({ global: true, secret: env.jwtSecret, signOptions: { expiresIn: env.jwtExpiresIn as never } }),
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // After the JWT guard, so a signed-in caller is limited per user (else per IP).
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_PIPE, useValue: new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }) },
    FileStorageService,
    DriverStateCache,
    UserAccessService,
    UsageService,
  ],
  exports: [EnvModule, FileStorageService, DriverStateCache, UserAccessService, UsageService],
})
export class CoreModule {}
