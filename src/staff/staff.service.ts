import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, StaffRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';

import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateStaffUserDto,
  StaffChangePasswordDto,
  StaffLoginDto,
  UpdateStaffUserDto,
} from './dto/staff.dto';

const STAFF_PERMISSIONS: Record<StaffRole, string[]> = {
  SUPER_ADMIN: ['admin.*'],
  OPERATIONS_ADMIN: [
    'users.view', 'stores.view', 'stores.update', 'products.view', 'orders.view',
    'orders.cancel', 'orders.status.update', 'deliveries.view', 'deliveries.assign',
    'deliveries.status.update', 'reports.view', 'roles.assign', 'roles.revoke',
  ],
  FINANCE_ADMIN: [
    'orders.view', 'orders.refund.approve', 'payments.view', 'payments.reconcile',
    'payments.reverse', 'wallets.view', 'wallets.credit', 'wallets.debit',
    'reports.view', 'reports.export',
  ],
  RISK_COMPLIANCE_ADMIN: [
    'users.view', 'users.freeze', 'riders.view', 'kyc.read', 'kyc.review',
    'risk.flag', 'risk.blacklist.create', 'risk.blacklist.remove',
    'audit.view', 'reports.view',
  ],
  MERCHANT_ADMIN: [
    'stores.view', 'stores.create', 'stores.update', 'stores.activate', 'stores.suspend',
    'merchants.approve', 'merchants.suspend', 'products.view', 'products.create',
    'products.update', 'inventory.adjust', 'orders.view',
  ],
  CUSTOMER_SUPPORT_ADMIN: [
    'users.view', 'users.update', 'users.freeze', 'orders.view', 'orders.cancel',
    'orders.refund.initiate', 'products.view', 'stores.view',
  ],
  CREDIT_BNPL_ADMIN: [
    'users.view', 'bnpl.loan.create', 'bnpl.limit.adjust',
    'bnpl.repayment.restructure', 'reports.view',
  ],
  AUDIT_OBSERVER_ADMIN: [
    'users.view', 'stores.view', 'products.view', 'orders.view', 'payments.view',
    'deliveries.view', 'riders.view', 'kyc.read', 'reports.view', 'reports.export',
    'audit.view', 'audit.export',
  ],
  REGIONAL_ADMIN: [
    'users.view', 'stores.view', 'stores.update', 'products.view', 'orders.view',
    'orders.cancel', 'deliveries.view', 'deliveries.assign', 'riders.view', 'reports.view',
  ],
  COMPLIANCE_LEAD: [
    'users.view', 'users.freeze', 'riders.view', 'kyc.read', 'kyc.review',
    'risk.flag', 'risk.blacklist.create', 'audit.view', 'audit.export', 'reports.view',
  ],
};

export function getStaffPermissions(role: StaffRole): string[] {
  return STAFF_PERMISSIONS[role] ?? [];
}

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  

  async login(dto: StaffLoginDto, ipAddress?: string, userAgent?: string) {
    const email = dto.email.trim().toLowerCase();
    const staff = await this.prisma.staffUser.findUnique({ where: { email } });

    if (!staff?.passwordHash) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const valid = await bcrypt.compare(dto.password, staff.passwordHash);
    if (!valid || staff.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid credentials or inactive account.');
    }

    const { accessToken, sessionId } = await this.issueTokens(staff.id, email, ipAddress, userAgent);

    await this.prisma.staffUser.update({
      where: { id: staff.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      accessToken,
      mustChangePassword: staff.mustChangePassword,
      staff: {
        id: staff.id,
        email: staff.email,
        firstName: staff.firstName,
        lastName: staff.lastName,
        role: staff.role,
        permissions: getStaffPermissions(staff.role),
        sessionId,
      },
    };
  }

  async logout(sessionId: number) {
    await this.prisma.staffSession.updateMany({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
    return { loggedOut: true };
  }

  async me(staffId: number) {
    const staff = await this.prisma.staffUser.findUnique({
      where: { id: staffId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        mustChangePassword: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    if (!staff) throw new NotFoundException('Staff account not found.');

    return { ...staff, permissions: getStaffPermissions(staff.role) };
  }

  async changePassword(staffId: number, dto: StaffChangePasswordDto) {
    const staff = await this.prisma.staffUser.findUnique({ where: { id: staffId } });
    if (!staff) throw new NotFoundException('Staff account not found.');

    const valid = await bcrypt.compare(dto.currentPassword, staff.passwordHash);
    if (!valid) throw new BadRequestException('Current password is incorrect.');

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('New password must differ from the current password.');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.$transaction([
      this.prisma.staffUser.update({
        where: { id: staffId },
        data: { passwordHash, mustChangePassword: false },
      }),
      
      this.prisma.staffSession.updateMany({
        where: { staffUserId: staffId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { passwordChanged: true };
  }

  

  async create(dto: CreateStaffUserDto, createdById: number) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.staffUser.findUnique({ where: { email } });
    if (existing) throw new ConflictException('A staff account with this email already exists.');

    const temporaryPassword = this.generatePassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    const staff = await this.prisma.staffUser.create({
      data: {
        email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
        phoneNumber: dto.phoneNumber,
        passwordHash,
        createdById,
        mustChangePassword: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        staffActorId: createdById,
        action: 'STAFF_USER_CREATED',
        permission: 'roles.assign',
        entity: 'StaffUser',
        entityId: String(staff.id),
        changes: { email, role: dto.role },
      },
    });

    
    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'https://admin.purse.com');
    const loginUrl = `${frontendUrl}/login`;
    await this.mail.sendTemplate(
      'staffWelcome',
      email,
      {
        firstName: dto.firstName,
        staffEmail: email,
        temporaryPassword,
        role: dto.role,
        loginUrl,
      },
      
    );

    return {
      id: staff.id,
      email: staff.email,
      firstName: staff.firstName,
      lastName: staff.lastName,
      role: staff.role,
      temporaryPassword,
      createdAt: staff.createdAt,
    };
  }

  async findAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.staffUser.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          mustChangePassword: true,
          lastLoginAt: true,
          createdAt: true,
        },
      }),
      this.prisma.staffUser.count(),
    ]);

    return {
      items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: number) {
    const staff = await this.prisma.staffUser.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        role: true,
        status: true,
        mustChangePassword: true,
        createdById: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!staff) throw new NotFoundException(`Staff user #${id} not found.`);
    return { ...staff, permissions: getStaffPermissions(staff.role) };
  }

  async update(id: number, dto: UpdateStaffUserDto, actorId: number) {
    await this.findOne(id);

    const updated = await this.prisma.staffUser.update({
      where: { id },
      data: {
        ...(dto.role ? { role: dto.role } : {}),
        ...(dto.firstName ? { firstName: dto.firstName } : {}),
        ...(dto.lastName ? { lastName: dto.lastName } : {}),
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.phoneNumber !== undefined ? { phoneNumber: dto.phoneNumber } : {}),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        role: true,
        status: true,
        mustChangePassword: true,
        createdById: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        staffActorId: actorId,
        action: 'STAFF_USER_UPDATED',
        permission: 'roles.assign',
        entity: 'StaffUser',
        entityId: String(id),
        changes: dto as unknown as Prisma.InputJsonValue,
      },
    });

    return updated;
  }

  async deactivate(id: number, actorId: number) {
    if (id === actorId) {
      throw new BadRequestException('You cannot deactivate your own account.');
    }

    await this.findOne(id);

    const updated = await this.prisma.staffUser.update({
      where: { id },
      data: { status: 'INACTIVE' },
    });

    
    await this.prisma.staffSession.updateMany({
      where: { staffUserId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.prisma.auditLog.create({
      data: {
        staffActorId: actorId,
        action: 'STAFF_USER_DEACTIVATED',
        permission: 'roles.assign',
        entity: 'StaffUser',
        entityId: String(id),
        changes: { status: 'INACTIVE' },
      },
    });

    return { id: updated.id, status: updated.status, deactivated: true };
  }

  

  private async issueTokens(
    staffId: number,
    email: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const sessionSecret = randomBytes(32).toString('hex');
    const sessionTokenHash = createHash('sha256').update(sessionSecret).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); 

    const session = await this.prisma.staffSession.create({
      data: { staffUserId: staffId, sessionTokenHash, expiresAt, ipAddress, userAgent },
    });

    const accessToken = await this.jwtService.signAsync(
      { sub: staffId, email, sid: session.id, type: 'STAFF' },
      {
        secret: this.config.getOrThrow<string>('JWT_STAFF_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '15m') as any,
      },
    );

    return { accessToken, sessionId: session.id };
  }

  
  async validateSession(staffId: number, sessionId: number) {
    const session = await this.prisma.staffSession.findUnique({ where: { id: sessionId } });

    if (!session || session.staffUserId !== staffId || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Session has expired or been revoked.');
    }

    await this.prisma.staffSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });

    const staff = await this.prisma.staffUser.findUnique({
      where: { id: staffId },
      select: { id: true, email: true, role: true, status: true, mustChangePassword: true },
    });

    if (!staff || staff.status !== 'ACTIVE') {
      throw new UnauthorizedException('Staff account is not active.');
    }

    return staff;
  }

  private generatePassword(): string {
    const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower   = 'abcdefghjkmnpqrstuvwxyz';
    const digits  = '23456789';
    const symbols = '!@#$%^&*';
    const all     = upper + lower + digits + symbols;

    const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)];

    
    const required = [pick(upper), pick(lower), pick(digits), pick(symbols)];
    const rest = Array.from({ length: 8 }, () => pick(all));

    return [...required, ...rest]
      .sort(() => Math.random() - 0.5)
      .join('');
  }
}
