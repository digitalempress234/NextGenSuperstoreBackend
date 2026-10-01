import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatsService } from './chats.service';
@WebSocketGateway({
  namespace: '/purse/v1/ws/chat',
  cors: {
    credentials: true,
    origin: (process.env.CORS_ORIGIN ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  },
})
export class ChatsGateway {
  @WebSocketServer() server!: Server;
  constructor(
    private readonly chats: ChatsService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}
  private userId(socket: Socket) {
    const cookie = String(socket.handshake.headers.cookie ?? '')
      .split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith('purse_access_token='))
      ?.split('=')
      .slice(1)
      .join('=');
    if (!cookie) throw new Error('Authentication cookie is missing.');
    return this.jwt.verify<{ sub: number }>(decodeURIComponent(cookie), {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    }).sub;
  }
  @SubscribeMessage('chat:join') async join(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { conversationId: number },
  ) {
    const userId = this.userId(socket);
    await this.chats.assertMember(userId, data.conversationId);
    await socket.join(`chat:${data.conversationId}`);
    return { joined: true, conversationId: data.conversationId };
  }
  @SubscribeMessage('chat:message') async message(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { conversationId: number; body: string },
  ) {
    const message = await this.chats.send(this.userId(socket), data.conversationId, data.body);
    this.server.to(`chat:${data.conversationId}`).emit('chat.message.created', message);
    return message;
  }
}
