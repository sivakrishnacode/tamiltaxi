import { Global, Module } from '@nestjs/common';

import { AdminWhatsAppController } from './admin-whatsapp.controller.js';
import { WatxClient } from './watx.client.js';
import { WelcomeService } from './welcome.service.js';

/**
 * WhatsApp through WATX: the client (login codes use it too) and the welcome messages with their admin page. The
 * welcomes listen to domain events (rider.signed-up, driver.registered, driver.approved); global for the OTP sender.
 */
@Global()
@Module({ controllers: [AdminWhatsAppController], providers: [WatxClient, WelcomeService], exports: [WatxClient, WelcomeService] })
export class WhatsAppModule {}
