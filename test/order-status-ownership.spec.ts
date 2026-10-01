import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { AdminService } from '../src/admin/admin.service';
import { DeliveryService } from '../src/delivery/delivery.service';
import { OrdersService } from '../src/orders/orders.service';

const actor = {
  id: 10,
  email: 'vendor@example.com',
  roles: ['VENDOR'],
  permissions: ['orders.status.update'],
  merchantScopeIds: [],
  regionScopes: [],
};

describe('order status ownership boundaries', () => {
  it('does not let store operators set rider-owned statuses', async () => {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          currentStatus: 'READY_FOR_PICKUP',
          store: { ownerUserId: actor.id, members: [] },
        }),
      },
    };
    const service = new OrdersService(prisma as never, {} as never, {} as never);

    await expect(service.setStatus(actor, 1, 'PICKED_UP')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('synchronizes rider transit to the customer-visible order', async () => {
    const tx = {
      delivery: { update: jest.fn().mockResolvedValue({ id: 5, status: 'IN_TRANSIT' }) },
      deliveryStatusUpdate: { create: jest.fn() },
      order: { update: jest.fn() },
      orderStatusHistory: { create: jest.fn() },
    };
    const prisma = {
      delivery: {
        findUnique: jest.fn().mockResolvedValue({
          id: 5,
          orderId: 1,
          riderId: 20,
          status: 'PICKED_UP',
          order: { id: 1, currentStatus: 'PICKED_UP' },
        }),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new DeliveryService(
      prisma as never,
      {} as never,
      { broadcastStatus: jest.fn() } as never,
      {} as never,
    );

    await service.updateStatus(20, 5, 'IN_TRANSIT');

    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { currentStatus: 'OUT_FOR_DELIVERY' },
    });
    expect(tx.orderStatusHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ changedById: 20, toStatus: 'OUT_FOR_DELIVERY' }),
      }),
    );
  });

  it('requires customer QR confirmation before DELIVERED', async () => {
    const prisma = {
      delivery: {
        findUnique: jest.fn().mockResolvedValue({
          id: 5,
          orderId: 1,
          riderId: 20,
          status: 'OUT_FOR_DELIVERY',
          order: { id: 1, currentStatus: 'OUT_FOR_DELIVERY' },
        }),
      },
    };
    const service = new DeliveryService(prisma as never, {} as never, {} as never, {} as never);

    await expect(service.updateStatus(20, 5, 'DELIVERED')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('records an audited staff intervention', async () => {
    const tx = {
      order: {
        findUnique: jest.fn().mockResolvedValue({ id: 1, currentStatus: 'OUT_FOR_DELIVERY' }),
        update: jest.fn().mockResolvedValue({ id: 1, currentStatus: 'DELIVERED' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 1, currentStatus: 'DELIVERED' }),
      },
      orderStatusHistory: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new AdminService(prisma as never, {} as never);

    await service.updateOrderStatus(1, 99, 'DELIVERED', 'Evidence reviewed');

    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          staffActorId: 99,
          action: 'order.status.update',
          changes: expect.objectContaining({ reason: 'Evidence reviewed' }),
        }),
      }),
    );
  });
});
