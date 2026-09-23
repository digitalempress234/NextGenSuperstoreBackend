import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { DeliveryTrackingService } from './delivery-tracking.service';
import { UpdateDeliveryLocationDto } from './dto/tracking.dto';

interface SocketUser {
  id: number;
  email: string;
}

function getCookieValue(header: string | undefined, key: string): string | undefined {
  if (!header) return undefined;
  for (const pair of header.split(';')) {
    const index = pair.indexOf('=');
    if (index === -1) continue;
    const name = pair.slice(0, index).trim();
    if (name !== key) continue;
    return decodeURIComponent(pair.slice(index + 1).trim());
  }
  return undefined;
}

@WebSocketGateway({
  namespace: '/delivery',
  cors: {
    origin: (process.env.CORS_ORIGIN ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class DeliveryTrackingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly tracking: DeliveryTrackingService,
  ) {}

  async handleConnection(socket: Socket): Promise<void> {
    try {
      const token = getCookieValue(socket.handshake.headers.cookie, 'purse_access_token');
      if (!token) {
        socket.disconnect(true);
        return;
      }

      const payload = await this.jwt.verifyAsync<{ sub: number }>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, status: true },
      });

      if (!user || user.status !== 'ACTIVE') {
        socket.disconnect(true);
        return;
      }

      socket.data.user = { id: user.id, email: user.email } satisfies SocketUser;
      socket.join(`user:${user.id}`);
    } catch {
      socket.disconnect(true);
    }
  }

  broadcastLocation(event: {
    deliveryId: number;
    latitude: number;
    longitude: number;
    accuracyM: number | null;
    speedKph: number | null;
    headingDeg: number | null;
    batteryLevel: number | null;
    recordedAt: string;
  }): void {
    this.server.to(`delivery:${event.deliveryId}`).emit('delivery.location.updated', event);
  }

  broadcastStatus(event: { deliveryId: number; status: string; occurredAt: string }): void {
    this.server.to(`delivery:${event.deliveryId}`).emit('delivery.status.updated', event);
  }

  handleDisconnect(_socket: Socket): void {
    
  }

  @SubscribeMessage('delivery:join')
  async joinDelivery(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { deliveryId: number },
  ): Promise<{ joined: boolean; deliveryId: number }> {
    const user = socket.data.user as SocketUser | undefined;
    if (!user || !Number.isInteger(body?.deliveryId)) {
      throw new Error('Invalid tracking request.');
    }

    await this.tracking.assertCanTrack(user.id, body.deliveryId);
    const room = `delivery:${body.deliveryId}`;
    await socket.join(room);
    return { joined: true, deliveryId: body.deliveryId };
  }

  @SubscribeMessage('delivery:location')
  async updateLocation(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: UpdateDeliveryLocationDto & { deliveryId: number },
  ): Promise<{ accepted: boolean }> {
    const user = socket.data.user as SocketUser | undefined;
    if (!user || !Number.isInteger(body?.deliveryId)) {
      throw new Error('Invalid tracking request.');
    }

    const location = await this.tracking.recordLocation(user.id, body.deliveryId, body);
    const event = {
      deliveryId: body.deliveryId,
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      accuracyM: location.accuracyM == null ? null : Number(location.accuracyM),
      speedKph: location.speedKph == null ? null : Number(location.speedKph),
      headingDeg: location.headingDeg == null ? null : Number(location.headingDeg),
      batteryLevel: location.batteryLevel,
      recordedAt: location.recordedAt.toISOString(),
    };

    this.broadcastLocation(event);
    this.server.to(`user:${user.id}`).emit('delivery.location.ack', event);
    return { accepted: true };
  }

  @SubscribeMessage('delivery:leave')
  async leaveDelivery(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { deliveryId: number },
  ): Promise<{ left: boolean }> {
    await socket.leave(`delivery:${body.deliveryId}`);
    return { left: true };
  }
}
