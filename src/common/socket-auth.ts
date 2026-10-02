import type { Socket } from 'socket.io';

export const SOCKET_IO_PATH = '/socket.io';

export const SOCKET_AUTH = {
  cookieName: 'purse_access_token',
  authField: 'accessToken',
  authorizationHeader: 'Bearer <access-token>',
  queryTokensAccepted: false,
} as const;

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

function normalizeBearerToken(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const token = value.trim();
  if (!token) return undefined;
  return token.toLowerCase().startsWith('bearer ') ? token.slice(7).trim() : token;
}

export function extractSocketAccessToken(socket: Pick<Socket, 'handshake'>): string | undefined {
  const cookieToken = getCookieValue(socket.handshake.headers.cookie, SOCKET_AUTH.cookieName);
  if (cookieToken) return cookieToken;

  const auth = socket.handshake.auth as Record<string, unknown>;
  const handshakeToken =
    normalizeBearerToken(auth[SOCKET_AUTH.authField]) ?? normalizeBearerToken(auth.token);
  if (handshakeToken) return handshakeToken;

  return normalizeBearerToken(socket.handshake.headers.authorization);
}
