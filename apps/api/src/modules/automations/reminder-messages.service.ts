import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../core/prisma/prisma.service.js';
import { Prisma, type ReminderMessage } from '../../generated/prisma/client.js';
import type { ReminderMessageKind } from '../../generated/prisma/enums.js';
import { messageError } from './reminder-messages.js';
import { BOOKED_WITHIN_MIN } from './reminders.js';

const DAY_MS = 86_400_000;
/** How far back each message's sent / booked counts go. */
const STATS_DAYS = 30;

/** A reminder message with how it did over the last [STATS_DAYS] days. */
export type ReminderMessageWithStats = ReminderMessage & { sent30d: number; booked30d: number };

/** Admin › Engage › Automations: the wordings of each reminder (one is picked at random per send). */
@Injectable()
export class ReminderMessagesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every message, oldest first per kind, with its sends and bookings (within an hour) over 30 days. */
  async list(now = new Date()): Promise<ReminderMessageWithStats[]> {
    const booked = Prisma.sql`EXISTS (SELECT 1 FROM "Trip" t WHERE t."passengerId" = r."userId" AND t."createdAt" >= r."sentAt"
      AND t."createdAt" < r."sentAt" + ${BOOKED_WITHIN_MIN} * INTERVAL '1 minute')`;
    const [messages, stats] = await Promise.all([
      this.prisma.reminderMessage.findMany({ orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.$queryRaw<{ messageId: string; sent: number; booked: number }[]>`
        SELECT r."messageId", COUNT(*)::int AS sent, (COUNT(*) FILTER (WHERE ${booked}))::int AS booked
        FROM "Reminder" r WHERE r."messageId" IS NOT NULL AND r."sentAt" >= ${new Date(now.getTime() - STATS_DAYS * DAY_MS)}
        GROUP BY r."messageId"`,
    ]);
    const byId = new Map(stats.map((s) => [s.messageId, s]));
    return messages.map((m) => ({ ...m, sent30d: byId.get(m.id)?.sent ?? 0, booked30d: byId.get(m.id)?.booked ?? 0 }));
  }

  async create(p: { kind: ReminderMessageKind; title: string; body: string }): Promise<ReminderMessage> {
    const title = p.title.trim();
    const body = p.body.trim();
    const error = messageError(p.kind, title, body);
    if (error) throw new BadRequestException(error);
    return this.prisma.reminderMessage.create({ data: { kind: p.kind, title, body } });
  }

  /** Edits the wording or switches it on / off (its kind never changes). */
  async update(id: string, p: { title?: string; body?: string; isActive?: boolean }): Promise<ReminderMessage> {
    const current = await this.prisma.reminderMessage.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Message not found');
    const title = p.title?.trim() ?? current.title;
    const body = p.body?.trim() ?? current.body;
    const error = messageError(current.kind, title, body);
    if (error) throw new BadRequestException(error);
    return this.prisma.reminderMessage.update({ where: { id }, data: { title, body, isActive: p.isActive } });
  }

  /** Reminders already sent with it keep their text (their link is cleared). */
  async remove(id: string): Promise<void> {
    const { count } = await this.prisma.reminderMessage.deleteMany({ where: { id } });
    if (!count) throw new NotFoundException('Message not found');
  }
}
