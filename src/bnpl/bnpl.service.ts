import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BnplApplication, Prisma, PaymentMethod } from '@prisma/client';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CartService } from '../cart/cart.service';
import { CheckoutService, jsonSnapshot, quoteFingerprint } from '../checkout/checkout.service';
import { CreateCheckoutDto } from '../checkout/dto/checkout.dto';
import { BnplPlanDto, UpdateBnplPlanDto } from '../checkout/checkout-settings.dto';
import { PaymentsService } from '../payments/payments.service';
import { AuthenticatedStaff } from '../staff/staff-jwt.guard';
import { money } from '../common/money';
import { ApplyBnplDto, ReviewBnplDto } from './bnpl.dto';

export function installmentTerms(
  principal: Prisma.Decimal.Value,
  months: number,
  rate: Prisma.Decimal.Value,
) {
  const totalPayable = money(principal)
    .mul(new Prisma.Decimal(rate).div(100).add(1))
    .toDecimalPlaces(2);
  const monthlyAmount = totalPayable.div(months).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  return {
    principal: money(principal),
    months,
    interestRate: new Prisma.Decimal(rate),
    totalPayable,
    monthlyAmount,
    finalInstallment: totalPayable.sub(monthlyAmount.mul(months - 1)),
  };
}
function dueDate(start: Date, monthOffset: number) {
  const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + monthOffset, 1));
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(start.getUTCDate(), lastDay));
  return date;
}

@Injectable()
export class BnplService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
    private readonly checkout: CheckoutService,
    private readonly payments: PaymentsService,
    private readonly config: ConfigService,
  ) {}

  async plans(userId: number, provider: string, cartId: number) {
    const cart = await this.cart.get(userId);
    if (cart.id !== cartId) throw new NotFoundException('Cart not found.');
    const plans = await this.prisma.bnplPlan.findMany({
      where: { provider, isActive: true },
      orderBy: { months: 'asc' },
    });
    return {
      provider,
      cartTotal: cart.subtotal,
      currency: cart.currency,
      plans: plans.map((plan) => ({
        id: plan.id,
        label: plan.label,
        ...installmentTerms(cart.subtotal, plan.months, plan.interestRate),
      })),
      note: 'Final financing includes delivery and is calculated when applying. Approval is required.',
    };
  }

  async apply(userId: number, dto: ApplyBnplDto, file?: Express.Multer.File) {
    if (!file || !file.buffer.length)
      throw new BadRequestException('Verification document is required.');
    const mime = this.documentMime(file.buffer);
    if (file.buffer.length > 5 * 1024 * 1024)
      throw new BadRequestException('Document exceeds 5 MB.');
    const encryptedDocument = this.encrypt(file.buffer);
    const encryptedAccount = this.encrypt(Buffer.from(dto.accountNumber)).toString('base64');
    const input: CreateCheckoutDto = {
      cartId: dto.cartId,
      deliveryMethod: dto.deliveryMethod,
      ...(dto.addressId ? { addressId: dto.addressId } : {}),
      ...(dto.pickupStationId ? { pickupStationId: dto.pickupStationId } : {}),
    };
    return this.prisma.$transaction(
      async (tx) => {
        await this.cart.lock(tx, userId);
        const existing = await tx.bnplApplication.findUnique({
          where: { activeCartId: dto.cartId },
        });
        if (existing)
          throw new UnprocessableEntityException(
            'A BNPL application already exists for this cart.',
          );
        const pendingCheckout = await tx.checkoutPaymentGroup.findUnique({
          where: { activeCartId: dto.cartId },
        });
        if (pendingCheckout)
          throw new ConflictException('Resolve the unpaid checkout before applying for BNPL.');
        const plan = await tx.bnplPlan.findFirst({
          where: { id: dto.planId, provider: dto.provider, isActive: true },
        });
        if (!plan) throw new BadRequestException('Installment plan is unavailable.');
        const quote = await this.checkout.quoteInTransaction(tx, userId, input);
        const terms = {
          provider: plan.provider,
          label: plan.label,
          ...installmentTerms(quote.total, plan.months, plan.interestRate),
        };
        const application = await tx.bnplApplication.create({
          data: {
            userId,
            cartId: dto.cartId,
            activeCartId: dto.cartId,
            planId: plan.id,
            employerName: dto.employerName,
            monthlyIncome: dto.monthlyIncome,
            accountNumber: encryptedAccount,
            accountLast4: dto.accountNumber.slice(-4),
            bankName: dto.bankName,
            documentData: new Uint8Array(encryptedDocument),
            documentName:
              'verification' +
              (mime === 'application/pdf' ? '.pdf' : mime === 'image/png' ? '.png' : '.jpg'),
            documentMime: mime,
            consentAt: new Date(),
            checkoutInput: jsonSnapshot(input),
            quoteSnapshot: jsonSnapshot(quote),
            planSnapshot: jsonSnapshot(terms),
          },
        });
        return this.present(application);
      },
      { timeout: 15000 },
    );
  }

  async get(userId: number, id: number) {
    const application = await this.prisma.bnplApplication.findFirst({ where: { id, userId } });
    if (!application) throw new NotFoundException('BNPL application not found.');
    return this.present(application);
  }
  async mine(userId: number) {
    const applications = await this.prisma.bnplApplication.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return applications.map((application) => this.present(application));
  }
  async cancel(userId: number, id: number) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM BnplApplication WHERE id = ${id} FOR UPDATE`);
      const app = await tx.bnplApplication.findFirst({ where: { id, userId } });
      if (!app) throw new NotFoundException('BNPL application not found.');
      if (!['PENDING_REVIEW', 'APPROVED'].includes(app.status))
        throw new ConflictException('Application cannot be cancelled.');
      return this.present(
        await tx.bnplApplication.update({
          where: { id },
          data: { status: 'CANCELLED', activeCartId: null },
        }),
      );
    });
  }
  async confirm(userId: number, id: number) {
    const groupId = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM BnplApplication WHERE id = ${id} FOR UPDATE`);
        const app = await tx.bnplApplication.findFirst({
          where: { id, userId },
          include: { plan: true },
        });
        if (!app) throw new NotFoundException('BNPL application not found.');
        if (app.status === 'CONFIRMED' && app.paymentGroupId) return app.paymentGroupId;
        if (app.status !== 'APPROVED')
          throw new ForbiddenException('BNPL application must be approved before confirmation.');
        if (!app.plan.isActive)
          throw new ConflictException('This financing plan has been disabled.');
        const methods: Record<string, PaymentMethod> = {
          nextgen_purse: 'NEXTGEN_PURSE',
          easybuy: 'EASYBUY',
          wallet_bnpl: 'WALLET_BNPL',
        };
        const group = await this.checkout.createInTransaction(
          tx,
          userId,
          app.checkoutInput as unknown as CreateCheckoutDto,
          {
            method: methods[(app.planSnapshot as { provider: string }).provider],
            expectedFingerprint: quoteFingerprint(app.quoteSnapshot),
            applicationId: app.id,
          },
        );
        const terms = app.planSnapshot as unknown as {
          months: number;
          monthlyAmount: string;
          finalInstallment: string;
        };
        const now = new Date();
        await tx.bnplApplication.update({
          where: { id },
          data: {
            status: 'CONFIRMED',
            activeCartId: null,
            paymentGroupId: group.id,
            confirmedAt: now,
            planSnapshot: {
              ...(app.planSnapshot as Prisma.JsonObject),
              schedule: Array.from({ length: terms.months }, (_, index) => ({
                installment: index + 1,
                amount: index === terms.months - 1 ? terms.finalInstallment : terms.monthlyAmount,
                dueDate: dueDate(now, index + 1).toISOString(),
                status: 'DUE',
              })),
            },
          },
        });
        return group.id;
      },
      { timeout: 20000 },
    );
    return {
      application: await this.get(userId, id),
      checkout: await this.payments.summary(userId, groupId),
    };
  }

  async allPlans() {
    return this.prisma.bnplPlan.findMany({ orderBy: { id: 'asc' } });
  }
  async savePlan(actorId: number, dto: BnplPlanDto | UpdateBnplPlanDto, id?: number) {
    return this.prisma.$transaction(async (tx) => {
      if (id && !(await tx.bnplPlan.findUnique({ where: { id } })))
        throw new NotFoundException('Plan not found.');
      const plan = id
        ? await tx.bnplPlan.update({ where: { id }, data: dto })
        : await tx.bnplPlan.create({ data: dto as BnplPlanDto });
      await tx.auditLog.create({
        data: {
          staffActorId: actorId,
          action: 'BNPL_PLAN_SAVED',
          entity: 'BnplPlan',
          entityId: String(plan.id),
          changes: jsonSnapshot(dto),
        },
      });
      return plan;
    });
  }
  async applications(page = 1, limit = 20) {
    const applications = await this.prisma.bnplApplication.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return applications.map((app) => ({
      ...this.present(app),
      employerName: app.employerName,
      monthlyIncome: app.monthlyIncome,
    }));
  }
  async review(staff: AuthenticatedStaff, id: number, dto: ReviewBnplDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM BnplApplication WHERE id = ${id} FOR UPDATE`);
      const app = await tx.bnplApplication.findUnique({ where: { id } });
      if (!app) throw new NotFoundException('Application not found.');
      if (app.status !== 'PENDING_REVIEW')
        throw new ConflictException('Application has already been reviewed.');
      const user = await tx.user.findUniqueOrThrow({ where: { id: app.userId } });
      if (user.email.toLowerCase() === staff.email.toLowerCase())
        throw new ForbiddenException('You cannot review your own application.');
      const result = await tx.bnplApplication.update({
        where: { id },
        data: {
          status: dto.status,
          reviewedById: staff.id,
          reviewedAt: new Date(),
          reviewReason: dto.reason,
          ...(dto.status === 'REJECTED' ? { activeCartId: null } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          staffActorId: staff.id,
          action: 'BNPL_' + dto.status,
          entity: 'BnplApplication',
          entityId: String(id),
          changes: { reason: dto.reason },
        },
      });
      await tx.notification.create({
        data: {
          recipientId: app.userId,
          type: 'SYSTEM_ANNOUNCEMENT',
          title: 'BNPL application reviewed',
          message: 'Your application is ' + dto.status.toLowerCase() + '.',
          data: { applicationId: id },
        },
      });
      return this.present(result);
    });
  }
  async document(staffId: number, id: number) {
    const app = await this.prisma.bnplApplication.findUnique({ where: { id } });
    if (!app) throw new NotFoundException('Application not found.');
    await this.prisma.auditLog.create({
      data: {
        staffActorId: staffId,
        action: 'BNPL_DOCUMENT_VIEWED',
        entity: 'BnplApplication',
        entityId: String(id),
      },
    });
    return {
      buffer: this.decrypt(Buffer.from(app.documentData)),
      mime: app.documentMime,
      name: app.documentName,
    };
  }
  private present(app: BnplApplication) {
    return {
      applicationId: app.id,
      userId: app.userId,
      cartId: app.cartId,
      status: app.status.toLowerCase(),
      planId: app.planId,
      plan: app.planSnapshot,
      quote: app.quoteSnapshot,
      bankName: app.bankName,
      accountNumber: '******' + app.accountLast4,
      documentUploaded: true,
      nibssConsent: true,
      consentAt: app.consentAt,
      reviewReason: app.reviewReason,
      paymentGroupId: app.paymentGroupId,
      createdAt: app.createdAt,
      confirmedAt: app.confirmedAt,
    };
  }
  private key() {
    const value = this.config.get<string>('BNPL_DATA_KEY') ?? '';
    if (!/^[a-fA-F0-9]{64}$/.test(value))
      throw new ServiceUnavailableException('BNPL document encryption is not configured.');
    return Buffer.from(value, 'hex');
  }
  private encrypt(data: Buffer) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const body = Buffer.concat([cipher.update(data), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]);
  }
  private decrypt(data: Buffer) {
    const decipher = createDecipheriv('aes-256-gcm', this.key(), data.subarray(0, 12));
    decipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]);
  }
  private documentMime(data: Buffer) {
    if (data.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
    if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
      return 'image/png';
    if (data[0] === 255 && data[1] === 216 && data[2] === 255) return 'image/jpeg';
    throw new BadRequestException('Document must be a PDF, PNG, or JPEG.');
  }
}
