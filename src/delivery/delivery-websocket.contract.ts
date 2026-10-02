import { SOCKET_AUTH, SOCKET_IO_PATH } from '../common/socket-auth';

export const DELIVERY_SOCKET_PATH = SOCKET_IO_PATH;
export const DELIVERY_SOCKET_NAMESPACE = '/delivery';

export const DELIVERY_SOCKET_EVENTS = {
  join: 'delivery:join',
  leave: 'delivery:leave',
  locationInput: 'delivery:location',
  locationUpdated: 'delivery.location.updated',
  statusUpdated: 'delivery.status.updated',
  locationAcknowledged: 'delivery.location.ack',
} as const;

export const DELIVERY_SOCKET_AUTH = SOCKET_AUTH;
