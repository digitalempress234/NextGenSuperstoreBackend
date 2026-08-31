import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateVendorProfileDto } from './dto/vendor.dto';

@Injectable()
export class VendorsService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: number) {
    const profile = await this.prisma.vendorProfile.findUnique({
      where: { userId },
    });
    
    return profile;
  }

  async updateProfile(userId: number, dto: UpdateVendorProfileDto) {
    return this.prisma.vendorProfile.upsert({
      where: { userId },
      create: {
        userId,
        ...dto,
      },
      update: dto,
    });
  }
}
