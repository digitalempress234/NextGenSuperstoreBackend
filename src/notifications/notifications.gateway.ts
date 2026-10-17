import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { extractSocketAccessToken } from '../common/socket-auth';
import { PrismaService } from '../prisma/prisma.service';

@WebSocketGateway({
  path: '/socket.io',
  namespace: '/notifications',
  cors: {
    origin: (process.env.CORS_ORIGIN ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class NotificationsGateway implements OnGatewayConnection {
  private readonly logger = new Logger(NotificationsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(socket: Socket) {
    try {
      const token = extractSocketAccessToken(socket);
      if (!token) return socket.disconnect(true);
      const payload = await this.jwt.verifyAsync<{ sub: number }>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      const active = await this.prisma.user.count({ where: { id: payload.sub, status: 'ACTIVE' } });
      if (!active) return socket.disconnect(true);
      await socket.join(`user:${payload.sub}`);
    } catch (error) {
      this.logger.debug('Notification socket authentication rejected', error);
      socket.disconnect(true);
    }
  }

  created(userId: number, notification: unknown) {
    this.server?.to(`user:${userId}`).emit('notification.created', notification);
  }
}
