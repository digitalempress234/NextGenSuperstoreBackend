import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId: string;
  userId?: number;
  path?: string;
  method?: string;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  run<T>(context: RequestContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  get(): RequestContext | undefined {
    return this.storage.getStore();
  }

  patch(values: Partial<RequestContext>): void {
    const current = this.storage.getStore();

    if (!current) {
      return;
    }

    Object.assign(current, values);
  }

  get requestId(): string | undefined {
    return this.storage.getStore()?.requestId;
  }
}
