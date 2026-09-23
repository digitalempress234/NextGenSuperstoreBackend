import { Prisma } from '@prisma/client';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  async getProfile(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        gender: true,
        dateOfBirth: true,
        email: true,
        phoneNumber: true,
        avatarUrl: true,
        status: true,
        isEmailVerified: true,
        createdAt: true,
        updatedAt: true,
        roles: {
          include: { role: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return {
      ...user,
      roles: user.roles.map((assignment) => ({
        name: assignment.role.name,
        expiresAt: assignment.expiresAt,
      })),
    };
  }

  getAccess(userId: number) {
    return this.rbac.buildUserContext(userId);
  }

  updateProfile(userId: number, dto: UpdateUserDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phoneNumber: dto.phoneNumber,
        gender: dto.gender,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        gender: true,
        dateOfBirth: true,
        email: true,
        phoneNumber: true,
        avatarUrl: true,
        status: true,
        isEmailVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getAddresses(userId: number) {
    const addresses = await this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return addresses.map((address) => ({ ...address, town: address.city }));
  }

  async addAddress(userId: number, dto: CreateAddressDto) {
    const { town, ...fields } = dto;
    if (!fields.city && !town) throw new BadRequestException('City or town is required.');
    if (town && fields.city && town !== fields.city)
      throw new BadRequestException('City and town must match.');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM User WHERE id = ${userId} FOR UPDATE`);
      const isDefault = fields.isDefault ?? (await tx.address.count({ where: { userId } })) === 0;
      if (isDefault)
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      const address = await tx.address.create({
        data: { ...fields, userId, city: fields.city ?? town, isDefault },
      });
      return { ...address, town: address.city };
    });
  }

  async updateAddress(userId: number, addressId: number, dto: UpdateAddressDto) {
    const { town, ...fields } = dto;
    if (town && fields.city && town !== fields.city)
      throw new BadRequestException('City and town must match.');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM User WHERE id = ${userId} FOR UPDATE`);
      const existing = await tx.address.findFirst({ where: { id: addressId, userId } });
      if (!existing) throw new NotFoundException('Address not found.');
      if (fields.isDefault)
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      const address = await tx.address.update({
        where: { id: addressId },
        data: { ...fields, city: fields.city ?? town },
      });
      return { ...address, town: address.city };
    });
  }

  async deleteAddress(userId: number, addressId: number) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM User WHERE id = ${userId} FOR UPDATE`);
      const address = await tx.address.findFirst({ where: { id: addressId, userId } });
      if (!address) throw new NotFoundException('Address not found.');
      await tx.address.delete({ where: { id: addressId } });
      if (address.isDefault) {
        const replacement = await tx.address.findFirst({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        });
        if (replacement)
          await tx.address.update({ where: { id: replacement.id }, data: { isDefault: true } });
      }
      return { deleted: true };
    });
  }
}
