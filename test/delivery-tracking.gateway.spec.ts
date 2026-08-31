import { DeliveryTrackingGateway } from '../src/delivery/delivery-tracking.gateway';

describe('DeliveryTrackingGateway', () => {
  it('broadcasts location updates to the delivery room', () => {
    const emit = jest.fn();
    const gateway = Object.create(DeliveryTrackingGateway.prototype) as DeliveryTrackingGateway & {
      server: { to: jest.Mock };
    };
    gateway.server = { to: jest.fn(() => ({ emit })) } as any;

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
      'delivery.location.updated',
      expect.objectContaining({ deliveryId: 12 }),
    );
  });
});
