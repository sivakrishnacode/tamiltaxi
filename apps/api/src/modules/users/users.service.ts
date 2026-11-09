import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { EmergencyContact, SavedPlace, User } from '../../generated/prisma/client.js';
import { Role, WelcomeTrigger } from '../../generated/prisma/enums.js';
import { WelcomeService } from '../whatsapp/welcome.service.js';
import type { CreateContactDto } from './dto/create-contact.dto.js';
import type { SavedPlaceDto } from './dto/saved-place.dto.js';
import type { UpdateProfileDto } from './dto/update-profile.dto.js';

const MAX_CONTACTS = 3;

/** The signed-in user's profile, emergency contacts and saved places. */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly welcome: WelcomeService,
  ) {}

  me(userId: string): Promise<User & { emergencyContacts: EmergencyContact[]; savedPlaces: SavedPlace[] }> {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { emergencyContacts: true, savedPlaces: true },
    });
  }

  /** A rider's first name (P-05) finishes their sign-up: the rider WhatsApp welcome goes out, when it is on. */
  async update(userId: string, dto: UpdateProfileDto): Promise<User> {
    const before = dto.name ? await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } }) : null;
    const user = await this.prisma.user.update({ where: { id: userId }, data: dto });
    if (before && !before.name?.trim() && user.name?.trim() && user.role === Role.PASSENGER) this.welcome.send(userId, WelcomeTrigger.RIDER_SIGNUP);
    return user;
  }

  async addContact(userId: string, dto: CreateContactDto): Promise<EmergencyContact> {
    const count = await this.prisma.emergencyContact.count({ where: { userId } });
    if (count >= MAX_CONTACTS) throw new BadRequestException(`You can add up to ${MAX_CONTACTS} contacts`);
    return this.prisma.emergencyContact.create({ data: { ...dto, userId } });
  }

  async removeContact(userId: string, id: string): Promise<void> {
    await this.prisma.emergencyContact.deleteMany({ where: { id, userId } });
  }

  addPlace(userId: string, dto: SavedPlaceDto): Promise<SavedPlace> {
    return this.prisma.savedPlace.create({ data: { ...dto, userId } });
  }

  async removePlace(userId: string, id: string): Promise<void> {
    await this.prisma.savedPlace.deleteMany({ where: { id, userId } });
  }
}
