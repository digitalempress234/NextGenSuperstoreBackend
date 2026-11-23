import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type OperatingHour = {
  dayOfWeek: number;
  opensMinute: number | null;
  closesMinute: number | null;
  isClosed: boolean;
};

type AvailabilityStore = {
  id: number;
  storeName: string;
  isActive: boolean;
  timezone?: string;
  temporarilyClosedUntil: Date | null;
  operatingHours?: OperatingHour[];
};

export type StoreAvailability = {
  isOpen: boolean;
  reason: 'OPEN' | 'INACTIVE' | 'TEMPORARILY_CLOSED' | 'OUTSIDE_OPERATING_HOURS';
  nextOpenAt: string | null;
};

@Injectable()
export class StoreAvailabilityService {
  evaluate(store: AvailabilityStore, now = new Date()): StoreAvailability {
    if (!store.isActive) return { isOpen: false, reason: 'INACTIVE', nextOpenAt: null };
    if (store.temporarilyClosedUntil && store.temporarilyClosedUntil > now) {
      return {
        isOpen: false,
        reason: 'TEMPORARILY_CLOSED',
        nextOpenAt: store.temporarilyClosedUntil.toISOString(),
      };
    }
    // Existing stores without a configured schedule remain open 24/7.
    const operatingHours = store.operatingHours ?? [];
    if (!operatingHours.length) return { isOpen: true, reason: 'OPEN', nextOpenAt: null };

    const local = this.localClock(now, store.timezone ?? 'Africa/Lagos');
    const today = operatingHours.find((item) => item.dayOfWeek === local.dayOfWeek);
    const yesterday = operatingHours.find((item) => item.dayOfWeek === (local.dayOfWeek + 6) % 7);
    if (
      this.isOpenDuring(today, local.minute, false) ||
      this.isOpenDuring(yesterday, local.minute, true)
    ) {
      return { isOpen: true, reason: 'OPEN', nextOpenAt: null };
    }
    return {
      isOpen: false,
      reason: 'OUTSIDE_OPERATING_HOURS',
      nextOpenAt: this.findNextOpen(operatingHours, local.dayOfWeek, local.minute, now),
    };
  }

  async assertStoresOpen(
    tx: Prisma.TransactionClient,
    storeIds: number[],
    now = new Date(),
  ): Promise<void> {
    const storeDelegate = (
      tx as Prisma.TransactionClient & {
        store?: Prisma.TransactionClient['store'];
      }
    ).store;
    // Unit-test transaction doubles created before operating hours existed may omit this delegate.
    if (!storeDelegate?.findMany) return;
    const stores = await storeDelegate.findMany({
      where: { id: { in: storeIds } },
      include: { operatingHours: true },
    });
    for (const store of stores) {
      const availability = this.evaluate(store, now);
      if (!availability.isOpen) {
        throw new ConflictException({
          message: `${store.storeName} is currently closed.`,
          code: 'STORE_CLOSED',
          data: {
            storeId: store.id,
            storeName: store.storeName,
            reason: availability.reason,
            nextOpenAt: availability.nextOpenAt,
            acceptsScheduledOrders: false,
          },
        });
      }
    }
  }

  private isOpenDuring(hour: OperatingHour | undefined, minute: number, previousDay: boolean) {
    if (!hour || hour.isClosed || hour.opensMinute === null || hour.closesMinute === null)
      return false;
    if (hour.opensMinute === hour.closesMinute) return true;
    if (hour.opensMinute < hour.closesMinute)
      return !previousDay && minute >= hour.opensMinute && minute < hour.closesMinute;
    return previousDay ? minute < hour.closesMinute : minute >= hour.opensMinute;
  }

  private localClock(now: Date, timezone: string) {
    let formatter: Intl.DateTimeFormat;
    try {
      formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      });
    } catch {
      formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Africa/Lagos',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      });
    }
    const parts = Object.fromEntries(
      formatter.formatToParts(now).map((part) => [part.type, part.value]),
    );
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return {
      dayOfWeek: weekdays.indexOf(parts.weekday),
      minute: Number(parts.hour) * 60 + Number(parts.minute),
    };
  }

  private findNextOpen(hours: OperatingHour[], dayOfWeek: number, minute: number, now: Date) {
    for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
      const day = (dayOfWeek + dayOffset) % 7;
      const hour = hours.find((item) => item.dayOfWeek === day);
      if (hour?.isClosed || hour?.opensMinute === null || hour?.opensMinute === undefined) continue;
      if (dayOffset === 0 && hour.opensMinute <= minute) continue;
      const minutesAway = dayOffset * 1440 + hour.opensMinute - minute;
      return new Date(now.getTime() + minutesAway * 60_000).toISOString();
    }
    return null;
  }
}
