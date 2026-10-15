import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';

import type { Job } from '../../core/jobs/job-runner.js';
import { JobsService } from '../../core/jobs/jobs.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { Campaign } from '../../generated/prisma/client.js';
import { CampaignStatus, CampaignTarget } from '../../generated/prisma/enums.js';
import { PUSH_TOPICS, PushService } from '../notifications/push.service.js';
import type { CreateCampaignDto } from './dto/campaign.dto.js';

/** Durable job: send campaign <id> at its time. */
export const CAMPAIGN_JOB = 'campaign.send';
/** A send time this close to now, either way, means "now". */
const NOW_SLACK_MS = 60_000;
const LIST_MAX = 100;

/** Admin festival / weekend pushes to every passenger (the `passengers` topic), now or scheduled. */
@Injectable()
export class CampaignsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly push: PushService,
  ) {}

  onModuleInit(): void {
    this.jobs.register(CAMPAIGN_JOB, async (j: Job<unknown>) => {
      await this.send(j.id);
    });
  }

  /** Scheduled ones first (soonest first), then sent and cancelled ones (newest first). */
  async list(): Promise<Campaign[]> {
    const scheduled = await this.prisma.campaign.findMany({ where: { status: CampaignStatus.SCHEDULED }, orderBy: { sendAt: 'asc' }, take: LIST_MAX });
    const rest =
      scheduled.length < LIST_MAX
        ? await this.prisma.campaign.findMany({ where: { status: { not: CampaignStatus.SCHEDULED } }, orderBy: { sendAt: 'desc' }, take: LIST_MAX - scheduled.length })
        : [];
    return [...scheduled, ...rest];
  }

  /** Sends now (no time, or within the next minute) or schedules the send. */
  async create(dto: CreateCampaignDto, now = new Date()): Promise<Campaign> {
    const title = dto.title.trim();
    const body = dto.body.trim();
    if (!title || !body) throw new BadRequestException('Write a title and a message');
    const at = dto.sendAt ? new Date(dto.sendAt) : now;
    if (at.getTime() < now.getTime() - NOW_SLACK_MS) throw new BadRequestException('Pick a time in the future');
    const isNow = at.getTime() <= now.getTime() + NOW_SLACK_MS;
    const row = await this.prisma.campaign.create({ data: { title, body, target: dto.target ?? CampaignTarget.HOME, sendAt: isNow ? now : at } });
    if (isNow) return (await this.send(row.id, now)) ?? row;
    await this.jobs.schedule(CAMPAIGN_JOB, row.id, at);
    return row;
  }

  /**
   * Pushes [id] to every passenger once: the campaign is marked SENT first and only while still SCHEDULED, so a
   * repeated job run (or one after a cancel) sends nothing. The sent campaign, or null when nothing was sent.
   */
  async send(id: string, now = new Date()): Promise<Campaign | null> {
    const { count } = await this.prisma.campaign.updateMany({ where: { id, status: CampaignStatus.SCHEDULED }, data: { status: CampaignStatus.SENT, sentAt: now } });
    if (count === 0) return null;
    const c = await this.prisma.campaign.findUniqueOrThrow({ where: { id } });
    this.push.toTopic(PUSH_TOPICS.PASSENGER, { title: c.title, body: c.body, channel: 'suggestions', data: { type: 'campaign', id: c.id, target: c.target } });
    return c;
  }

  /** Stops a scheduled campaign (409 once it was sent or cancelled). */
  async cancel(id: string): Promise<Campaign> {
    const { count } = await this.prisma.campaign.updateMany({ where: { id, status: CampaignStatus.SCHEDULED }, data: { status: CampaignStatus.CANCELLED } });
    if (count === 0) {
      const c = await this.prisma.campaign.findUnique({ where: { id }, select: { status: true } });
      if (!c) throw new NotFoundException('Campaign not found');
      throw new ConflictException(c.status === CampaignStatus.SENT ? 'This campaign was already sent' : 'This campaign was already cancelled');
    }
    await this.jobs.cancel(CAMPAIGN_JOB, id);
    return this.prisma.campaign.findUniqueOrThrow({ where: { id } });
  }

  async remove(id: string): Promise<void> {
    const c = await this.prisma.campaign.findUnique({ where: { id }, select: { status: true } });
    if (!c) throw new NotFoundException('Campaign not found');
    if (c.status === CampaignStatus.SCHEDULED) await this.jobs.cancel(CAMPAIGN_JOB, id);
    await this.prisma.campaign.delete({ where: { id } });
  }
}
