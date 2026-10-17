import { validate } from 'class-validator';

import { ApiThrottlerGuard } from '../src/common/api-throttler.guard';
import { PaginationDto } from '../src/common/dto/pagination.dto';
import { OrdersService } from '../src/orders/orders.service';

class TestApiThrottlerGuard extends ApiThrottlerGuard {
  tracker(request: Record<string, unknown>) {
    return this.getTracker(request);
  }
}

describe('API throttling', () => {
  const guard = new TestApiThrottlerGuard([] as never, {} as never, {} as never);

  it('tracks authenticated traffic per user instead of the reverse-proxy address', async () => {
    await expect(guard.tracker({ user: { id: 42 }, ip: '::1' })).resolves.toBe('user:42');
  });

  it('tracks public traffic by the resolved client IP', async () => {
    await expect(guard.tracker({ ip: '203.0.113.10' })).resolves.toBe('ip:203.0.113.10');
  });
});

describe('Pagination limits', () => {
  it('rejects a requested page size above 15', async () => {
    const query = Object.assign(new PaginationDto(), { limit: 50 });
    const errors = await validate(query);

    expect(errors.some((error) => error.property === 'limit')).toBe(true);
  });

  it('defensively caps order queries at 15 in the service layer', async () => {
    const prisma = {
      order: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new OrdersService(prisma as never, {} as never, {} as never, {} as never);

    await service.mine(7, 1, 50);

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 15 }),
    );
  });
});
