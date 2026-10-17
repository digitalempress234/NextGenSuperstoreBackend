import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class ApiThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(request: Record<string, unknown>): Promise<string> {
    const user = request.user as { id?: number | string } | undefined;
    const userId = user?.id;
    if (typeof userId === 'number' || typeof userId === 'string') {
      return `user:${userId}`;
    }

    return `ip:${await super.getTracker(request)}`;
  }
}
