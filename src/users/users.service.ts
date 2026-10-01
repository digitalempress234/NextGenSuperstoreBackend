import { Prisma } from '@prisma/client';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';
import { UploadsService } from '../uploads/uploads.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import * as bcrypt from 'bcryptjs';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly uploads: UploadsService,
  ) {}

  async updateAvatar(userId: number, file: Express.Multer.File) {
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype) ||
      file.size > 5 * 1024 * 1024
    )
      throw new BadRequestException('Avatar must be a JPEG, PNG, or WebP image up to 5 MB.');
    const jpeg = file.buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
    const png = file.buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const webp =
      file.buffer.subarray(0, 4).equals(Buffer.from('RIFF')) &&
      file.buffer.subarray(8, 12).equals(Buffer.from('WEBP'));
    if (!jpeg && !png && !webp) throw new BadRequestException('Invalid image file signature.');
    const result = await this.uploads.upload(file.buffer, `purse/users/${userId}/avatar`);
    const previous = await this.prisma.upload.findFirst({
      where: { ownerUserId: userId, type: 'PROFILE_PHOTO' },
      orderBy: { createdAt: 'desc' },
    });
    const user = await this.prisma.$transaction(async (tx) => {
      await tx.upload.create({
        data: {
          ownerUserId: userId,
          type: 'PROFILE_PHOTO',
          url: result.secure_url,
          publicId: result.public_id,
          resourceType: result.resource_type,
        },
      });
      return tx.user.update({
        where: { id: userId },
        data: { avatarUrl: result.secure_url },
        select: { id: true, avatarUrl: true },
      });
    });
    if (previous?.publicId) void this.uploads.destroy(previous.publicId).catch(() => undefined);
    return user;
  }

  async changePassword(userId: number, sessionId: number | undefined, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.passwordHash)
      throw new ForbiddenException('Set a password through password recovery before changing it.');
    if (!(await bcrypt.compare(dto.oldPassword, user.passwordHash)))
      throw new UnauthorizedException('Current password is incorrect.');
    if (await bcrypt.compare(dto.newPassword, user.passwordHash))
      throw new BadRequestException('New password must be different from the current password.');
    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.prisma.adminSession.updateMany({
        where: { userId, id: sessionId ? { not: sessionId } : undefined, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { changed: true, otherSessionsRevoked: true };
  }

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
