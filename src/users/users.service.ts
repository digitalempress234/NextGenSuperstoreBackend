import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { UpdateUserDto } from './dto/update-user.dto';

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
}
