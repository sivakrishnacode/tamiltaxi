import { Body, Controller, ForbiddenException, Get, HttpCode, Param, Post } from '@nestjs/common';

import type { AuthUser } from '../../core/auth/auth-user.js';
import { CurrentUser } from '../../core/auth/current-user.decorator.js';
import { Roles } from '../../core/auth/roles.decorator.js';
import type { Trip } from '../../generated/prisma/client.js';
import { Role } from '../../generated/prisma/enums.js';
import { AddExtraDto } from './dto/add-extra.dto.js';
import { AddVehicleDto } from './dto/add-vehicle.dto.js';
import { BookTripDto } from './dto/book-trip.dto.js';
import { CancelTripDto } from './dto/cancel-trip.dto.js';
import { ChatMessageDto } from './dto/chat-message.dto.js';
import { DispatchService, type OfferDetails } from './dispatch.service.js';
import { OtpDto } from './dto/otp.dto.js';
import { CompleteTripDto, PositionCheckDto } from './dto/position-check.dto.js';
import { RateTripDto } from './dto/rate-trip.dto.js';
import { RecordPaymentDto } from './dto/record-payment.dto.js';
import { type ChatMessage, TripChatService } from './trip-chat.service.js';
import { TripsService, type VehicleAlternative } from './trips.service.js';

/** Passenger: P-10 … P-22, PP-06 … PP-10. Driver: D-15 … D-22. */
@Controller('trips')
export class TripsController {
  constructor(
    private readonly trips: TripsService,
    private readonly chat: TripChatService,
    private readonly dispatch: DispatchService,
  ) {}

  @Roles(Role.PASSENGER)
  @Post()
  book(@CurrentUser() user: AuthUser, @Body() body: BookTripDto): Promise<Trip> {
    return this.trips.book(user.userId, body);
  }

  @Get()
  history(@CurrentUser() user: AuthUser): Promise<Trip[]> {
    return this.trips.history(user);
  }

  /** Passenger: trips booked for later (rentals, outstation), soonest first. */
  @Get('upcoming')
  upcoming(@CurrentUser() user: AuthUser): Promise<Trip[]> {
    return this.trips.upcoming(user.userId);
  }

  /** The caller's unfinished trip, or null. */
  @Get('active')
  active(@CurrentUser() user: AuthUser): Promise<Trip | null> {
    return this.trips.active(user);
  }

  /** Driver: the request currently offered to me (also pushed as `trip.offer`), or null. */
  @Roles(Role.DRIVER)
  @Get('offer')
  offer(@CurrentUser() user: AuthUser): Promise<(OfferDetails & { expiresInSeconds: number }) | null> {
    return this.dispatch.currentOffer(TripsController.driverId(user));
  }

  /** Driver: every request open for me right now, oldest first (stacked on the request screen). */
  @Roles(Role.DRIVER)
  @Get('offers')
  offers(@CurrentUser() user: AuthUser): Promise<(OfferDetails & { expiresInSeconds: number })[]> {
    return this.dispatch.currentOffers(TripsController.driverId(user));
  }

  /** Passenger, while searching: other vehicles with drivers in range and their fares ("Book any"). */
  @Roles(Role.PASSENGER)
  @Get(':id/alternatives')
  alternatives(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<VehicleAlternative[]> {
    return this.trips.alternatives(user.userId, id);
  }

  /** Passenger, while searching: also look for [AddVehicleDto.vehicleKind]; its drivers get the offer at its fare. */
  @Roles(Role.PASSENGER)
  @Post(':id/also')
  @HttpCode(200)
  addVehicle(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: AddVehicleDto): Promise<Trip> {
    return this.trips.addVehicle(user.userId, id, body.vehicleKind);
  }

  /** Passenger, while searching: the extra in all on top of the quote (+₹10, +₹20…); drivers see "₹50 + ₹20". */
  @Roles(Role.PASSENGER)
  @Post(':id/extra')
  @HttpCode(200)
  addExtra(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: AddExtraDto): Promise<Trip> {
    return this.trips.addExtra(user.userId, id, body.amount);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<Trip> {
    return this.trips.get(user, id);
  }

  /** In-trip chat (both sides). New messages are also pushed as `trip.message` on the trip room. */
  @Get(':id/messages')
  messages(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<ChatMessage[]> {
    return this.chat.list(user, id);
  }

  @Post(':id/messages')
  sendMessage(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: ChatMessageDto): Promise<ChatMessage> {
    return this.chat.send(user, id, body.text);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: CancelTripDto): Promise<Trip> {
    return this.trips.cancel(user, id, body);
  }

  @Roles(Role.PASSENGER)
  @Post(':id/rate')
  @HttpCode(200)
  rate(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: RateTripDto): Promise<Trip> {
    return this.trips.rate(user.userId, id, body.rating);
  }

  @Roles(Role.DRIVER)
  @Post(':id/accept')
  @HttpCode(200)
  accept(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<Trip> {
    return this.trips.accept(TripsController.driverId(user), id);
  }

  @Roles(Role.DRIVER)
  @Post(':id/decline')
  @HttpCode(204)
  decline(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    return this.trips.decline(TripsController.driverId(user), id);
  }

  @Roles(Role.DRIVER)
  @Post(':id/arrived')
  @HttpCode(200)
  arrived(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: PositionCheckDto): Promise<Trip> {
    return this.trips.arrived(TripsController.driverId(user), id, body);
  }

  @Roles(Role.DRIVER)
  @Post(':id/start')
  @HttpCode(200)
  start(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: OtpDto): Promise<Trip> {
    return this.trips.start(TripsController.driverId(user), id, body.otp);
  }

  @Roles(Role.DRIVER)
  @Post(':id/complete')
  @HttpCode(200)
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: CompleteTripDto): Promise<Trip> {
    return this.trips.complete(TripsController.driverId(user), id, body);
  }

  /** Driver, after the trip: "Received cash" / "Received on UPI" (D-19 / D-22b). */
  @Roles(Role.DRIVER)
  @Post(':id/payment')
  @HttpCode(200)
  payment(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: RecordPaymentDto): Promise<Trip> {
    return this.trips.recordPayment(TripsController.driverId(user), id, body.mode);
  }

  private static driverId(user: AuthUser): string {
    if (!user.driverId) throw new ForbiddenException('Register as a driver first');
    return user.driverId;
  }
}
