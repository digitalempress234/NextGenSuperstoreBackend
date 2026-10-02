import {
  DeliveryTrackingGateway,
  extractDeliverySocketAccessToken,
} from '../src/delivery/delivery-tracking.gateway';
import {
  DELIVERY_SOCKET_EVENTS,
  DELIVERY_SOCKET_NAMESPACE,
  DELIVERY_SOCKET_PATH,
} from '../src/delivery/delivery-websocket.contract';

describe('DeliveryTrackingGateway', () => {
  it('publishes a stable public connection contract', () => {
    expect(DELIVERY_SOCKET_PATH).toBe('/socket.io');
    expect(DELIVERY_SOCKET_NAMESPACE).toBe('/delivery');
    expect(DELIVERY_SOCKET_EVENTS.join).toBe('delivery:join');
  });

  it.each([
    [
      'cookie',
      { headers: { cookie: 'other=value; purse_access_token=cookie-token' }, auth: {} },
      'cookie-token',
    ],
    ['handshake auth', { headers: {}, auth: { accessToken: 'auth-token' } }, 'auth-token'],
    [
      'authorization header',
      { headers: { authorization: 'Bearer header-token' }, auth: {} },
      'header-token',
    ],
  ])('accepts access tokens from the %s', (_source, handshake, expected) => {
    expect(extractDeliverySocketAccessToken({ handshake } as never)).toBe(expected);
  });

  it('does not accept tokens from the query string', () => {
    expect(
      extractDeliverySocketAccessToken({
        handshake: { headers: {}, auth: {}, query: { token: 'unsafe-token' } },
      } as never),
    ).toBeUndefined();
  });

  it('broadcasts location updates to the delivery room', () => {
    const emit = jest.fn();
    const gateway = Object.create(DeliveryTrackingGateway.prototype) as DeliveryTrackingGateway & {
      server: { to: jest.Mock };
    };
    gateway.server = { to: jest.fn(() => ({ emit })) } as never;

    gateway.broadcastLocation({
      deliveryId: 12,
      latitude: 6.524,
      longitude: 3.379,
      accuracyM: 10,
      speedKph: 25,
      headingDeg: 90,
      batteryLevel: 80,
      recordedAt: new Date().toISOString(),
    });

    expect(gateway.server.to).toHaveBeenCalledWith('delivery:12');
    expect(emit).toHaveBeenCalledWith(
      DELIVERY_SOCKET_EVENTS.locationUpdated,
      expect.objectContaining({ deliveryId: 12 }),
    );
  });
});
