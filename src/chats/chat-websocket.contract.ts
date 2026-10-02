import { SOCKET_AUTH, SOCKET_IO_PATH } from '../common/socket-auth';

export const CHAT_SOCKET_PATH = SOCKET_IO_PATH;
export const CHAT_SOCKET_NAMESPACE = '/purse/v1/ws/chat';
export const CHAT_SOCKET_AUTH = SOCKET_AUTH;

export const CHAT_SOCKET_EVENTS = {
  join: 'chat:join',
  sendMessage: 'chat:message',
  messageCreated: 'chat.message.created',
} as const;
