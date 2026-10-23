import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging, Messaging } from 'firebase-admin/messaging';
import { PrismaService } from '../prisma/prisma.service';

export interface PushDeliveryResult {
  enabled: boolean;
  attempted: number;
  successful: number;
  failed: number;
}

@Injectable()
export class PushNotificationsService implements OnModuleInit {
  private readonly logger = new Logger(PushNotificationsService.name);
  private messaging?: Messaging;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    const raw = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON');
    if (!raw) {
      this.logger.log('FCM push disabled: FIREBASE_SERVICE_ACCOUNT_JSON is not configured.');
      return;
    }
    try {
      const app =
        getApps()[0] ??
        initializeApp({ credential: cert(JSON.parse(raw) as Record<string, string>) });
      this.messaging = getMessaging(app);
    } catch (error) {
      this.logger.error('Could not initialize Firebase Admin SDK', error);
    }
  }

  async send(
    userId: number,
    title: string,
    body: string,
    data?: Record<string, unknown>,
    imageUrl?: string,
  ): Promise<PushDeliveryResult> {
    if (!this.messaging) return { enabled: false, attempted: 0, successful: 0, failed: 0 };
    const devices = await this.prisma.deviceRegistration.findMany({
      where: { userId, enabled: true },
      select: { id: true, token: true },
    });
    if (!devices.length) return { enabled: true, attempted: 0, successful: 0, failed: 0 };
    let response;
    try {
      response = await this.messaging.sendEachForMulticast({
        tokens: devices.map((device) => device.token),
        notification: { title, body, ...(imageUrl ? { imageUrl } : {}) },
        data: Object.fromEntries(
          Object.entries(data ?? {}).map(([key, value]) => [key, String(value)]),
        ),
      });
    } catch (error) {
      this.logger.error(`FCM delivery failed for user ${userId}`, error);
      return {
        enabled: true,
        attempted: devices.length,
        successful: 0,
        failed: devices.length,
      };
    }
    const invalidIds = response.responses
      .map((item, index) => ({ item, id: devices[index].id }))
      .filter(({ item }) =>
        [
          'messaging/invalid-registration-token',
          'messaging/registration-token-not-registered',
        ].includes(item.error?.code ?? ''),
      )
      .map(({ id }) => id);
    if (invalidIds.length) {
      await this.prisma.deviceRegistration.updateMany({
        where: { id: { in: invalidIds } },
        data: { enabled: false },
      });
    }
    return {
      enabled: true,
      attempted: devices.length,
      successful: response.successCount,
      failed: response.failureCount,
    };
  }
}
