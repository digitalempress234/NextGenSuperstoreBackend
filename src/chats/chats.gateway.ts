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
import { extractSocketAccessToken } from '../common/socket-auth';
import { ChatsService } from './chats.service';
import {
  CHAT_SOCKET_EVENTS,
  CHAT_SOCKET_NAMESPACE,
  CHAT_SOCKET_PATH,
} from './chat-websocket.contract';
@WebSocketGateway({
  path: CHAT_SOCKET_PATH,
  namespace: CHAT_SOCKET_NAMESPACE,
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
    const token = extractSocketAccessToken(socket);
    if (!token) throw new Error('Authentication token is missing.');
    return this.jwt.verify<{ sub: number }>(token, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    }).sub;
  }
  broadcastMessage(conversationId: number, message: unknown) {
    this.server.to(`chat:${conversationId}`).emit(CHAT_SOCKET_EVENTS.messageCreated, message);
  }
  @SubscribeMessage(CHAT_SOCKET_EVENTS.join) async join(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { conversationId: number },
  ) {
    const userId = this.userId(socket);
    await this.chats.assertMember(userId, data.conversationId);
    await socket.join(`chat:${data.conversationId}`);
    return { joined: true, conversationId: data.conversationId };
  }
  @SubscribeMessage(CHAT_SOCKET_EVENTS.sendMessage) async message(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { conversationId: number; body: string },
  ) {
    const message = await this.chats.send(this.userId(socket), data.conversationId, data.body);
    this.broadcastMessage(data.conversationId, message);
    return message;
  }
}
