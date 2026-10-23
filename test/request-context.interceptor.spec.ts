import { BadRequestException } from '@nestjs/common';
import { throwError } from 'rxjs';

import { RequestContextInterceptor } from '../src/logging/request-context.interceptor';

describe('RequestContextInterceptor', () => {
  it('records the exception HTTP status instead of the route default on failure', async () => {
    const logger = { info: jest.fn(), error: jest.fn() };
    const requestContext = {
      run: jest.fn((_context: unknown, callback: () => void) => callback()),
    };
    const response = { statusCode: 201, setHeader: jest.fn() };
    const executionContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {},
          method: 'POST',
          originalUrl: '/purse/v1/rewards/vouchers/test/claim',
          ip: '127.0.0.1',
        }),
        getResponse: () => response,
      }),
    };
    const interceptor = new RequestContextInterceptor(requestContext as never, logger as never);

    await new Promise<void>((resolve) => {
      interceptor
        .intercept(executionContext as never, {
          handle: () => throwError(() => new BadRequestException('Insufficient reward points.')),
        })
        .subscribe({ error: () => resolve() });
    });

    expect(logger.info).toHaveBeenCalledWith(
      'request.failed.metrics',
      expect.objectContaining({ statusCode: 400 }),
    );
  });
});
