import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, PushCampaignAudienceType, PushCampaignStatus, RoleName } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePushCampaignDto,
  PushCampaignAudienceDto,
  PushCampaignListQueryDto,
  ReviewPushCampaignDto,
  UpdatePushCampaignDto,
} from '../admin/dto/push-campaign.dto';
import {
  CreateStorePushCampaignDto,
  StorePushCampaignListQueryDto,
  UpdateStorePushCampaignDto,
} from '../stores/dto/store-push-campaign.dto';
import { NotificationsService } from './notifications.service';

interface AudienceFilter {
  userIds?: number[];
  state?: string;
  city?: string;
}

@Injectable()
export class PushCampaignsService implements OnModuleInit, OnModuleDestroy {
  private static readonly VENDOR_DAILY_SEND_LIMIT = 3;
  private readonly logger = new Logger(PushCampaignsService.name);
  private timer?: NodeJS.Timeout;
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    void this.processDueCampaigns();
    this.timer = setInterval(() => void this.processDueCampaigns(), 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async create(dto: CreatePushCampaignDto, staffUserId: number) {
    this.validateAudience(dto.audience);
    const campaign = await this.prisma.pushCampaign.create({
      data: {
        title: dto.title.trim(),
        message: dto.message.trim(),
        imageUrl: dto.imageUrl,
        deepLink: dto.deepLink,
        includeInApp: dto.includeInApp ?? true,
        audienceType: dto.audience.type,
        audienceFilter: this.audienceFilter(dto.audience),
        approvalStatus: 'NOT_REQUIRED',
        createdById: staffUserId,
      },
      include: {
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });
    await this.audit(staffUserId, 'PUSH_CAMPAIGN_CREATED', campaign.id, {
      title: campaign.title,
      audienceType: campaign.audienceType,
    });
    return campaign;
  }

  async list(query: PushCampaignListQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(15, Math.max(1, query.limit ?? 15));
    const where: Prisma.PushCampaignWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.audienceType ? { audienceType: query.audienceType } : {}),
      ...(query.approvalStatus ? { approvalStatus: query.approvalStatus } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.pushCampaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
          createdByUser: { select: { id: true, email: true, firstName: true, lastName: true } },
          store: { select: { id: true, storeName: true, isActive: true } },
          reviewedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.pushCampaign.count({ where }),
    ]);
    return {
      items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async get(id: number) {
    const campaign = await this.prisma.pushCampaign.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
        createdByUser: { select: { id: true, email: true, firstName: true, lastName: true } },
        store: { select: { id: true, storeName: true, isActive: true } },
        reviewedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
        deliveries: {
          orderBy: { updatedAt: 'desc' },
          take: 15,
          include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
        },
      },
    });
    if (!campaign) throw new NotFoundException('Push campaign not found.');
    return campaign;
  }

  async update(id: number, dto: UpdatePushCampaignDto, staffUserId: number) {
    const campaign = await this.requireEditable(id);
    if (campaign.storeId && dto.audience) {
      throw new BadRequestException(
        'The audience of a vendor campaign is fixed to that store’s eligible customers.',
      );
    }
    if (dto.audience) this.validateAudience(dto.audience);
    const updated = await this.prisma.pushCampaign.update({
      where: { id },
      data: {
        ...(dto.title === undefined ? {} : { title: dto.title.trim() }),
        ...(dto.message === undefined ? {} : { message: dto.message.trim() }),
        ...(dto.imageUrl === undefined ? {} : { imageUrl: dto.imageUrl }),
        ...(dto.deepLink === undefined ? {} : { deepLink: dto.deepLink }),
        ...(dto.includeInApp === undefined ? {} : { includeInApp: dto.includeInApp }),
        ...(dto.audience
          ? {
              audienceType: dto.audience.type,
              audienceFilter: this.audienceFilter(dto.audience),
            }
          : {}),
        ...(campaign.storeId
          ? {
              status: 'DRAFT',
              scheduledAt: null,
              approvalStatus: 'PENDING',
              reviewedById: null,
              reviewedAt: null,
              rejectionReason: null,
            }
          : {}),
      },
    });
    await this.audit(staffUserId, 'PUSH_CAMPAIGN_UPDATED', campaign.id, {
      previousStatus: campaign.status,
      fields: Object.keys(dto),
    });
    return updated;
  }

  async test(id: number, userId: number, staffUserId: number) {
    const campaign = await this.requireCampaign(id);
    if (campaign.status === 'CANCELLED') {
      throw new ConflictException('A cancelled campaign cannot be test-sent.');
    }
    const result = await this.notifications.notifyMarketingUser({
      userId,
      campaignId: id,
      title: campaign.title,
      message: campaign.message,
      imageUrl: campaign.imageUrl,
      deepLink: campaign.deepLink,
      includeInApp: campaign.includeInApp,
      test: true,
    });
    await this.audit(staffUserId, 'PUSH_CAMPAIGN_TEST_SENT', id, {
      userId,
      inAppDelivered: result.inAppDelivered,
      optedOut: result.optedOut,
      pushEnabled: result.push.enabled,
      pushAttempted: result.push.attempted,
      pushSuccessful: result.push.successful,
      pushFailed: result.push.failed,
    });
    return { campaignId: id, userId, ...result };
  }

  async schedule(id: number, scheduledAtInput: string, staffUserId: number) {
    const existing = await this.requireEditable(id);
    this.ensureDeliveryApproved(existing);
    const scheduledAt = new Date(scheduledAtInput);
    if (scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException('scheduledAt must be in the future.');
    }
    if (existing.storeId) {
      await this.assertVendorDailyLimit(existing.storeId, id, scheduledAt);
    }
    const campaign = await this.prisma.pushCampaign.update({
      where: { id },
      data: { status: 'SCHEDULED', scheduledAt, cancelledAt: null, lastError: null },
    });
    await this.audit(staffUserId, 'PUSH_CAMPAIGN_SCHEDULED', id, {
      scheduledAt: scheduledAt.toISOString(),
    });
    return campaign;
  }

  async sendNow(id: number, staffUserId: number) {
    const campaign = await this.requireCampaign(id);
    this.ensureDeliveryApproved(campaign);
    if (!(['DRAFT', 'SCHEDULED', 'FAILED'] as PushCampaignStatus[]).includes(campaign.status)) {
      throw new ConflictException(`Campaign cannot be sent while it is ${campaign.status}.`);
    }
    if (campaign.storeId) {
      await this.assertVendorDailyLimit(campaign.storeId, id, new Date());
    }
    if (campaign.status === 'FAILED') {
      await this.prisma.pushCampaignDelivery.updateMany({
        where: { campaignId: id, status: 'FAILED' },
        data: { status: 'PENDING', errorMessage: null },
      });
    }
    await this.prisma.pushCampaign.update({
      where: { id },
      data: { status: 'SCHEDULED', scheduledAt: new Date(), lastError: null, cancelledAt: null },
    });
    await this.audit(staffUserId, 'PUSH_CAMPAIGN_SEND_REQUESTED', id);
    void this.processDueCampaigns();
    return this.get(id);
  }

  async cancel(id: number, staffUserId: number) {
    const campaign = await this.requireCampaign(id);
    if (!(['DRAFT', 'SCHEDULED', 'SENDING'] as PushCampaignStatus[]).includes(campaign.status)) {
      throw new ConflictException(`Campaign cannot be cancelled while it is ${campaign.status}.`);
    }
    const updated = await this.prisma.pushCampaign.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    await this.audit(staffUserId, 'PUSH_CAMPAIGN_CANCELLED', id);
    return updated;
  }

  async createForStore(userId: number, storeId: number, dto: CreateStorePushCampaignDto) {
    const store = await this.requireOwnedStore(userId, storeId, true);
    const campaign = await this.prisma.pushCampaign.create({
      data: {
        title: dto.title.trim(),
        message: dto.message.trim(),
        imageUrl: dto.imageUrl,
        deepLink: dto.deepLink,
        includeInApp: dto.includeInApp ?? true,
        audienceType: 'STORE_CUSTOMERS',
        audienceFilter: { storeId },
        approvalStatus: 'PENDING',
        createdByUserId: userId,
        storeId,
      },
      include: { store: { select: { id: true, storeName: true, isActive: true } } },
    });
    await this.auditUser(userId, 'STORE_PUSH_CAMPAIGN_CREATED', campaign.id, {
      storeId,
      storeName: store.storeName,
    });
    return campaign;
  }

  async listForStore(userId: number, storeId: number, query: StorePushCampaignListQueryDto) {
    await this.requireOwnedStore(userId, storeId, false);
    const page = query.page ?? 1;
    const limit = Math.min(15, Math.max(1, query.limit ?? 15));
    const where: Prisma.PushCampaignWhereInput = {
      storeId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.approvalStatus ? { approvalStatus: query.approvalStatus } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.pushCampaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.pushCampaign.count({ where }),
    ]);
    return {
      items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getForStore(userId: number, storeId: number, campaignId: number) {
    await this.requireOwnedStore(userId, storeId, false);
    return this.requireStoreCampaign(storeId, campaignId);
  }

  async updateForStore(
    userId: number,
    storeId: number,
    campaignId: number,
    dto: UpdateStorePushCampaignDto,
  ) {
    await this.requireOwnedStore(userId, storeId, true);
    const campaign = await this.requireStoreCampaign(storeId, campaignId);
    if (campaign.status !== 'DRAFT') {
      throw new ConflictException('Only a draft vendor campaign can be edited.');
    }
    if (!Object.keys(dto).length) {
      throw new BadRequestException('At least one campaign field must be supplied.');
    }
    const updated = await this.prisma.pushCampaign.update({
      where: { id: campaignId },
      data: {
        ...(dto.title === undefined ? {} : { title: dto.title.trim() }),
        ...(dto.message === undefined ? {} : { message: dto.message.trim() }),
        ...(dto.imageUrl === undefined ? {} : { imageUrl: dto.imageUrl }),
        ...(dto.deepLink === undefined ? {} : { deepLink: dto.deepLink }),
        ...(dto.includeInApp === undefined ? {} : { includeInApp: dto.includeInApp }),
        approvalStatus: 'PENDING',
        reviewedById: null,
        reviewedAt: null,
        rejectionReason: null,
      },
    });
    await this.auditUser(userId, 'STORE_PUSH_CAMPAIGN_UPDATED', campaignId, {
      storeId,
      approvalReset: true,
      fields: Object.keys(dto),
    });
    return updated;
  }

  async testForStore(userId: number, storeId: number, campaignId: number) {
    await this.requireOwnedStore(userId, storeId, true);
    const campaign = await this.requireStoreCampaign(storeId, campaignId);
    if (campaign.status === 'CANCELLED') {
      throw new ConflictException('A cancelled campaign cannot be test-sent.');
    }
    const result = await this.notifications.notifyMarketingUser({
      userId,
      campaignId,
      storeId,
      title: campaign.title,
      message: campaign.message,
      imageUrl: campaign.imageUrl,
      deepLink: campaign.deepLink,
      includeInApp: campaign.includeInApp,
      test: true,
    });
    await this.auditUser(userId, 'STORE_PUSH_CAMPAIGN_TEST_SENT', campaignId, {
      storeId,
      pushAttempted: result.push.attempted,
      pushSuccessful: result.push.successful,
      inAppDelivered: result.inAppDelivered,
    });
    return { campaignId, userId, ...result };
  }

  async scheduleForStore(
    userId: number,
    storeId: number,
    campaignId: number,
    scheduledAtInput: string,
  ) {
    await this.requireOwnedStore(userId, storeId, true);
    const campaign = await this.requireStoreCampaign(storeId, campaignId);
    this.ensureVendorSendable(campaign);
    const scheduledAt = new Date(scheduledAtInput);
    if (scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException('scheduledAt must be in the future.');
    }
    await this.assertVendorDailyLimit(storeId, campaignId, scheduledAt);
    const updated = await this.prisma.pushCampaign.update({
      where: { id: campaignId },
      data: { status: 'SCHEDULED', scheduledAt, cancelledAt: null, lastError: null },
    });
    await this.auditUser(userId, 'STORE_PUSH_CAMPAIGN_SCHEDULED', campaignId, {
      storeId,
      scheduledAt: scheduledAt.toISOString(),
    });
    return updated;
  }

  async sendForStore(userId: number, storeId: number, campaignId: number) {
    await this.requireOwnedStore(userId, storeId, true);
    const campaign = await this.requireStoreCampaign(storeId, campaignId);
    this.ensureVendorSendable(campaign);
    await this.assertVendorDailyLimit(storeId, campaignId, new Date());
    if (campaign.status === 'FAILED') {
      await this.prisma.pushCampaignDelivery.updateMany({
        where: { campaignId, status: 'FAILED' },
        data: { status: 'PENDING', errorMessage: null },
      });
    }
    await this.prisma.pushCampaign.update({
      where: { id: campaignId },
      data: { status: 'SCHEDULED', scheduledAt: new Date(), lastError: null, cancelledAt: null },
    });
    await this.auditUser(userId, 'STORE_PUSH_CAMPAIGN_SEND_REQUESTED', campaignId, { storeId });
    void this.processDueCampaigns();
    return this.getForStore(userId, storeId, campaignId);
  }

  async cancelForStore(userId: number, storeId: number, campaignId: number) {
    await this.requireOwnedStore(userId, storeId, false);
    const campaign = await this.requireStoreCampaign(storeId, campaignId);
    if (!(['DRAFT', 'SCHEDULED', 'SENDING'] as PushCampaignStatus[]).includes(campaign.status)) {
      throw new ConflictException(`Campaign cannot be cancelled while it is ${campaign.status}.`);
    }
    const updated = await this.prisma.pushCampaign.update({
      where: { id: campaignId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    await this.auditUser(userId, 'STORE_PUSH_CAMPAIGN_CANCELLED', campaignId, { storeId });
    return updated;
  }

  async reviewVendorCampaign(id: number, staffUserId: number, dto: ReviewPushCampaignDto) {
    const campaign = await this.requireCampaign(id);
    if (!campaign.storeId || !campaign.createdByUserId) {
      throw new BadRequestException('Only vendor-created campaigns require review.');
    }
    if (campaign.status !== 'DRAFT') {
      throw new ConflictException('Only a draft vendor campaign can be reviewed.');
    }
    if (dto.decision === 'REJECT' && !dto.reason?.trim()) {
      throw new BadRequestException('A rejection reason is required.');
    }
    const approved = dto.decision === 'APPROVE';
    const updated = await this.prisma.pushCampaign.update({
      where: { id },
      data: {
        approvalStatus: approved ? 'APPROVED' : 'REJECTED',
        rejectionReason: approved ? null : dto.reason?.trim(),
        reviewedById: staffUserId,
        reviewedAt: new Date(),
      },
    });
    await this.audit(
      staffUserId,
      approved ? 'STORE_PUSH_CAMPAIGN_APPROVED' : 'STORE_PUSH_CAMPAIGN_REJECTED',
      id,
      {
        storeId: campaign.storeId,
        reason: dto.reason?.trim() ?? null,
      },
    );
    await this.notifications.notifyUser({
      userId: campaign.createdByUserId,
      type: 'SYSTEM_ANNOUNCEMENT',
      title: approved ? 'Campaign approved' : 'Campaign needs changes',
      message: approved
        ? `Your campaign “${campaign.title}” is approved and can now be scheduled or sent.`
        : `Your campaign “${campaign.title}” was rejected: ${dto.reason?.trim()}`,
      data: { campaignId: id, storeId: campaign.storeId, approvalStatus: updated.approvalStatus },
      eventKey: `store-push-campaign-review:${id}:${updated.approvalStatus}`,
    });
    return updated;
  }

  async processDueCampaigns() {
    if (this.processing) return;
    this.processing = true;
    try {
      const now = new Date();
      await this.prisma.pushCampaign.updateMany({
        where: {
          status: 'SENDING',
          startedAt: { lt: new Date(now.getTime() - 10 * 60_000) },
        },
        data: { status: 'SCHEDULED', scheduledAt: now, startedAt: null },
      });
      const due = await this.prisma.pushCampaign.findMany({
        where: {
          status: 'SCHEDULED',
          scheduledAt: { lte: now },
          approvalStatus: { in: ['NOT_REQUIRED', 'APPROVED'] },
        },
        orderBy: { scheduledAt: 'asc' },
        take: 5,
        select: { id: true },
      });
      for (const item of due) {
        const claimed = await this.prisma.pushCampaign.updateMany({
          where: { id: item.id, status: 'SCHEDULED', scheduledAt: { lte: now } },
          data: { status: 'SENDING', startedAt: new Date(), lastError: null },
        });
        if (claimed.count !== 1) continue;
        await this.processCampaign(item.id);
      }
    } catch (error) {
      this.logger.error('Push campaign scheduler failed', error);
    } finally {
      this.processing = false;
    }
  }

  private async processCampaign(id: number) {
    try {
      const campaign = await this.requireCampaign(id);
      if (campaign.storeId) {
        this.ensureDeliveryApproved(campaign);
        const store = await this.prisma.store.findUnique({
          where: { id: campaign.storeId },
          select: { isActive: true },
        });
        if (!store?.isActive) {
          throw new ConflictException('Store approval is required before campaign delivery.');
        }
      }
      const userIds = await this.resolveAudience(
        campaign.audienceType,
        campaign.audienceFilter as AudienceFilter | null,
        campaign.storeId,
      );
      if (userIds.length) {
        await this.prisma.pushCampaignDelivery.createMany({
          data: userIds.map((userId) => ({ campaignId: id, userId })),
          skipDuplicates: true,
        });
      }
      await this.prisma.pushCampaign.update({
        where: { id },
        data: { totalRecipients: userIds.length },
      });

      while (true) {
        const current = await this.prisma.pushCampaign.findUnique({
          where: { id },
          select: { status: true },
        });
        if (current?.status !== 'SENDING') return;
        const deliveries = await this.prisma.pushCampaignDelivery.findMany({
          where: { campaignId: id, status: 'PENDING' },
          orderBy: { id: 'asc' },
          take: 25,
        });
        if (!deliveries.length) break;
        await Promise.all(
          deliveries.map(async (delivery) => {
            try {
              const result = await this.notifications.notifyMarketingUser({
                userId: delivery.userId,
                campaignId: id,
                storeId: campaign.storeId,
                title: campaign.title,
                message: campaign.message,
                imageUrl: campaign.imageUrl,
                deepLink: campaign.deepLink,
                includeInApp: campaign.includeInApp,
              });
              const delivered = result.inAppDelivered || result.push.successful > 0;
              const failed = !delivered && result.push.failed > 0;
              await this.prisma.pushCampaignDelivery.update({
                where: { id: delivery.id },
                data: {
                  status: delivered ? 'DELIVERED' : failed ? 'FAILED' : 'SKIPPED',
                  pushAttempted: result.push.attempted,
                  pushSuccessful: result.push.successful,
                  pushFailed: result.push.failed,
                  attemptedAt: new Date(),
                  deliveredAt: delivered ? new Date() : null,
                  errorMessage: failed ? 'Firebase did not accept the notification.' : null,
                },
              });
            } catch (error) {
              await this.prisma.pushCampaignDelivery.update({
                where: { id: delivery.id },
                data: {
                  status: 'FAILED',
                  attemptedAt: new Date(),
                  errorMessage: this.errorMessage(error),
                },
              });
            }
          }),
        );
      }

      const [deliveredCount, failedCount, skippedCount] = await Promise.all([
        this.prisma.pushCampaignDelivery.count({ where: { campaignId: id, status: 'DELIVERED' } }),
        this.prisma.pushCampaignDelivery.count({ where: { campaignId: id, status: 'FAILED' } }),
        this.prisma.pushCampaignDelivery.count({ where: { campaignId: id, status: 'SKIPPED' } }),
      ]);
      await this.prisma.pushCampaign.updateMany({
        where: { id, status: 'SENDING' },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          deliveredCount,
          failedCount,
          skippedCount,
          lastError: failedCount ? `${failedCount} recipient delivery attempts failed.` : null,
        },
      });
    } catch (error) {
      const message = this.errorMessage(error);
      await this.prisma.pushCampaign.updateMany({
        where: { id, status: 'SENDING' },
        data: { status: 'FAILED', lastError: message },
      });
      this.logger.error(`Push campaign ${id} failed`, error);
    }
  }

  private async resolveAudience(
    type: PushCampaignAudienceType,
    filter: AudienceFilter | null,
    storeId?: number | null,
  ) {
    const where: Prisma.UserWhereInput = { status: 'ACTIVE' };
    const roleByAudience: Partial<Record<PushCampaignAudienceType, RoleName>> = {
      CUSTOMERS: 'CUSTOMER',
      RIDERS: 'RIDER',
      VENDORS: 'VENDOR',
    };
    const role = roleByAudience[type];
    if (role) where.roles = { some: { role: { name: role } } };
    if (type === 'SELECTED_USERS') where.id = { in: filter?.userIds ?? [] };
    if (type === 'STORE_CUSTOMERS') {
      if (!storeId) throw new BadRequestException('Store campaign is missing its store.');
      where.roles = { some: { role: { name: 'CUSTOMER' } } };
      where.orders = {
        some: {
          storeId,
          currentStatus: { not: 'CANCELLED' },
          payment: { is: { status: { in: ['PAID', 'PARTIALLY_REFUNDED'] } } },
        },
      };
    }

    if (filter?.state || filter?.city) {
      const location = {
        ...(filter.state ? { state: filter.state } : {}),
        ...(filter.city ? { city: filter.city } : {}),
      };
      where.AND = [
        {
          OR: [
            { addresses: { some: location } },
            { vendorProfile: { is: location } },
            {
              riderProfile: {
                is: {
                  ...(filter.state ? { businessState: filter.state } : {}),
                  ...(filter.city ? { businessCity: filter.city } : {}),
                },
              },
            },
          ],
        },
      ];
    }
    const users = await this.prisma.user.findMany({ where, select: { id: true } });
    return users.map((user) => user.id);
  }

  private validateAudience(audience: PushCampaignAudienceDto) {
    if (audience.type === 'SELECTED_USERS' && !audience.userIds?.length) {
      throw new BadRequestException('audience.userIds is required for SELECTED_USERS.');
    }
    if (audience.type !== 'SELECTED_USERS' && audience.userIds?.length) {
      throw new BadRequestException('audience.userIds can only be used with SELECTED_USERS.');
    }
  }

  private audienceFilter(audience: PushCampaignAudienceDto): Prisma.InputJsonValue {
    return {
      ...(audience.userIds ? { userIds: audience.userIds } : {}),
      ...(audience.state ? { state: audience.state.trim() } : {}),
      ...(audience.city ? { city: audience.city.trim() } : {}),
    };
  }

  private async requireCampaign(id: number) {
    const campaign = await this.prisma.pushCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('Push campaign not found.');
    return campaign;
  }

  private async requireEditable(id: number) {
    const campaign = await this.requireCampaign(id);
    if (!(['DRAFT', 'SCHEDULED'] as PushCampaignStatus[]).includes(campaign.status)) {
      throw new ConflictException(`Campaign cannot be edited while it is ${campaign.status}.`);
    }
    return campaign;
  }

  private async requireOwnedStore(userId: number, storeId: number, requireActive: boolean) {
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, ownerUserId: userId },
      select: { id: true, storeName: true, isActive: true },
    });
    if (!store) throw new NotFoundException('Store not found.');
    if (requireActive && !store.isActive) {
      throw new ConflictException('Store approval is required before campaigns can be managed.');
    }
    return store;
  }

  private async requireStoreCampaign(storeId: number, campaignId: number) {
    const campaign = await this.prisma.pushCampaign.findFirst({
      where: { id: campaignId, storeId },
    });
    if (!campaign) throw new NotFoundException('Store push campaign not found.');
    return campaign;
  }

  private ensureDeliveryApproved(campaign: { storeId: number | null; approvalStatus: string }) {
    if (campaign.storeId && campaign.approvalStatus !== 'APPROVED') {
      throw new ConflictException('Vendor campaign must be approved before it can be sent.');
    }
  }

  private ensureVendorSendable(campaign: { status: PushCampaignStatus; approvalStatus: string }) {
    if (campaign.approvalStatus !== 'APPROVED') {
      throw new ConflictException('Campaign is awaiting admin approval.');
    }
    if (!(['DRAFT', 'SCHEDULED', 'FAILED'] as PushCampaignStatus[]).includes(campaign.status)) {
      throw new ConflictException(`Campaign cannot be sent while it is ${campaign.status}.`);
    }
  }

  private async assertVendorDailyLimit(storeId: number, campaignId: number, target: Date) {
    const lagosOffsetMs = 60 * 60_000;
    const lagosTime = new Date(target.getTime() + lagosOffsetMs);
    const start = new Date(
      Date.UTC(lagosTime.getUTCFullYear(), lagosTime.getUTCMonth(), lagosTime.getUTCDate()) -
        lagosOffsetMs,
    );
    const end = new Date(start.getTime() + 24 * 60 * 60_000);
    const count = await this.prisma.pushCampaign.count({
      where: {
        id: { not: campaignId },
        storeId,
        status: { in: ['SCHEDULED', 'SENDING', 'SENT'] },
        OR: [
          { scheduledAt: { gte: start, lt: end } },
          { startedAt: { gte: start, lt: end } },
          { sentAt: { gte: start, lt: end } },
        ],
      },
    });
    if (count >= PushCampaignsService.VENDOR_DAILY_SEND_LIMIT) {
      throw new HttpException(
        `A store can send at most ${PushCampaignsService.VENDOR_DAILY_SEND_LIMIT} campaigns per day.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private audit(
    staffActorId: number,
    action: string,
    campaignId: number,
    changes?: Prisma.InputJsonValue,
  ) {
    return this.prisma.auditLog.create({
      data: {
        staffActorId,
        action,
        permission: 'notifications.send',
        entity: 'PushCampaign',
        entityId: String(campaignId),
        changes,
      },
    });
  }

  private auditUser(
    actorId: number,
    action: string,
    campaignId: number,
    changes?: Prisma.InputJsonValue,
  ) {
    return this.prisma.auditLog.create({
      data: {
        actorId,
        action,
        permission: 'stores.update',
        entity: 'PushCampaign',
        entityId: String(campaignId),
        changes,
      },
    });
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown campaign delivery error';
  }
}
