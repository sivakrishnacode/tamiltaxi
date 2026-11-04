import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { loadEnv } from './core/config/env.js';

/** Starts the Tamil Taxi API on /v1 (REST) and /rt (Socket.IO). */
async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('v1', { exclude: ['health', 'health/ready'] });
  app.enableCors({ origin: env.corsOrigins.includes('*') ? true : [...env.corsOrigins] });
  app.enableShutdownHooks();
  await app.listen(env.port, '0.0.0.0');
  // Keep idle connections open longer than any client (phones' HTTP pools, proxies) reuses them: with Node's 5 s
  // default a reused connection could be closed mid-request, which the apps showed as "You're offline".
  const server = app.getHttpServer() as import('node:http').Server;
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  Logger.log(`Tamil Taxi API listening on :${env.port} (${env.nodeEnv})`, 'Bootstrap');
}

// Safety net: a stray fire-and-forget promise (e.g. `void someAsync()`) that rejects is logged, not fatal. Node would
// otherwise exit on an unhandled rejection and drop every live trip socket with it.
process.on('unhandledRejection', (reason) => {
  const detail = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
  Logger.error(`Unhandled promise rejection: ${detail}`, undefined, 'Process');
});

await bootstrap();
