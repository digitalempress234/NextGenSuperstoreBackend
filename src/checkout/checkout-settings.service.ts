import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CheckoutSettingsDto,
  PickupStationDto,
  UpdatePickupStationDto,
} from './checkout-settings.dto';

@Injectable()
export class CheckoutSettingsService {
  constructor(private readonly prisma: PrismaService) {}
  async settings(tx: Prisma.TransactionClient = this.prisma): Promise<CheckoutSettingsDto> {
    const row = await tx.platformConfig.findUnique({ where: { key: 'checkout_settings' } });
    return row
      ? (JSON.parse(row.value) as CheckoutSettingsDto)
      : { deliveryFeePerStore: 0, deliveryEnabled: false, opayEnabled: false };
  }
  async updateSettings(actorId: number, dto: CheckoutSettingsDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.platformConfig.upsert({
        where: { key: 'checkout_settings' },
        create: { key: 'checkout_settings', value: JSON.stringify(dto) },
        update: { value: JSON.stringify(dto) },
      });
      await this.audit(
        tx,
        actorId,
        'CHECKOUT_SETTINGS_UPDATED',
        'PlatformConfig',
        'checkout_settings',
        dto,
      );
      return dto;
    });
  }
  stations(includeInactive = false) {
    return this.prisma.pickupStation.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
    });
  }
  async createStation(actorId: number, dto: PickupStationDto) {
    return this.prisma.$transaction(async (tx) => {
      const station = await tx.pickupStation.create({ data: dto });
      await this.audit(
        tx,
        actorId,
        'PICKUP_STATION_CREATED',
        'PickupStation',
        String(station.id),
        dto,
      );
      return station;
    });
  }
  async updateStation(actorId: number, id: number, dto: UpdatePickupStationDto) {
    return this.prisma.$transaction(async (tx) => {
      if (!(await tx.pickupStation.findUnique({ where: { id } })))
        throw new NotFoundException('Pickup station not found.');
      const station = await tx.pickupStation.update({ where: { id }, data: dto });
      await this.audit(tx, actorId, 'PICKUP_STATION_UPDATED', 'PickupStation', String(id), dto);
      return station;
    });
  }
  private audit(
    tx: Prisma.TransactionClient,
    staffActorId: number,
    action: string,
    entity: string,
    entityId: string,
    changes: object,
  ) {
    return tx.auditLog.create({
      data: {
        staffActorId,
        action,
        entity,
        entityId,
        changes: JSON.parse(JSON.stringify(changes)),
      },
    });
  }
}
