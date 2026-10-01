import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import { createHash, randomInt, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CartService, cartInclude } from '../cart/cart.service';
import { PaymentsService } from '../payments/payments.service';
import { CheckoutSettingsService } from './checkout-settings.service';
import { CreateCheckoutDto } from './dto/checkout.dto';
import { money } from '../common/money';

export function jsonSnapshot(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
export function quoteFingerprint(value: unknown): string {
  const canonical = (input: unknown): unknown => {
    if (input && typeof input === 'object') {
      if (Array.isArray(input)) return input.map(canonical);
      return Object.fromEntries(
        Object.entries(input)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, canonical(item)]),
      );
    }
    return input;
  };
  return createHash('sha256')
    .update(JSON.stringify(canonical(JSON.parse(JSON.stringify(value)))))
    .digest('hex');
}

const ORDER_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function createOrderNumber(now = new Date()): string {
  const date = [
    String(now.getUTCFullYear()).slice(-2),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
  ].join('');
  let suffix = '';
  for (let index = 0; index < 8; index++) {
    suffix += ORDER_CODE_ALPHABET[randomInt(ORDER_CODE_ALPHABET.length)];
  }
  return `PUR-${date}-${suffix}`;
}

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cartService: CartService,
    private readonly settings: CheckoutSettingsService,
    private readonly payments: PaymentsService,
  ) {}

  async quote(userId: number, input: CreateCheckoutDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.cartService.lock(tx, userId);
      return this.quoteInTransaction(tx, userId, input);
    });
  }

  async quoteInTransaction(tx: Prisma.TransactionClient, userId: number, input: CreateCheckoutDto) {
    const fulfillmentType =
      input.fulfillmentType ??
      (input.deliveryMethod === 'home_delivery'
        ? 'DELIVERY'
        : input.deliveryMethod === 'store_pickup'
          ? 'PICKUP'
          : undefined);
    if (!fulfillmentType) throw new BadRequestException('Choose a delivery method.');
    if (
      input.fulfillmentType &&
      input.deliveryMethod &&
      (input.fulfillmentType === 'DELIVERY') !== (input.deliveryMethod === 'home_delivery')
    ) {
      throw new BadRequestException('Conflicting delivery methods.');
    }
    const cart = await tx.cart.findUnique({ where: { userId }, include: cartInclude });
    if (!cart || (input.cartId !== undefined && cart.id !== input.cartId))
      throw new NotFoundException('Cart not found.');
    if (!cart.items.length) throw new BadRequestException('Cart is empty.');
    if (cart.currency !== 'NGN')
      throw new BadRequestException('Checkout currently supports NGN only.');
    const customer = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    let address = input.address
      ? {
          ...input.address,
          firstName: customer.firstName,
          lastName: customer.lastName,
          phone: customer.phoneNumber,
          email: customer.email,
          additionalPhone: null as string | null,
          additionalInfo: null as string | null,
        }
      : null;
    let station = null;
    if (fulfillmentType === 'DELIVERY') {
      if (input.pickupStationId)
        throw new BadRequestException('A pickup station cannot be used for home delivery.');
      if (input.addressId) {
        const saved = await tx.address.findFirst({ where: { id: input.addressId, userId } });
        if (!saved) throw new NotFoundException('Address not found.');
        address = {
          label: saved.label ?? undefined,
          state: saved.state ?? undefined,
          city: saved.city ?? undefined,
          address: saved.address,
          firstName: saved.firstName ?? customer.firstName,
          lastName: saved.lastName ?? customer.lastName,
          phone: saved.phone ?? customer.phoneNumber,
          email: saved.email ?? customer.email,
          additionalPhone: saved.additionalPhone,
          additionalInfo: saved.additionalInfo,
        };
      }
      if (!address?.address?.trim()) throw new BadRequestException('Delivery address is required.');
    } else {
      if (input.addressId || input.address)
        throw new BadRequestException('An address cannot be used for store pickup.');
      if (!input.pickupStationId) throw new BadRequestException('Pickup station is required.');
      station = await tx.pickupStation.findFirst({
        where: { id: input.pickupStationId, isActive: true },
      });
      if (!station) throw new NotFoundException('Pickup station is unavailable.');
    }
    const settings = await this.settings.settings(tx);
    if (fulfillmentType === 'DELIVERY' && !settings.deliveryEnabled)
      throw new BadRequestException('Home delivery is not configured or is disabled.');
    const unavailableItems = cart.items
      .filter(
        (item) =>
          !item.storeProduct.isActive ||
          !item.storeProduct.store.isActive ||
          !item.storeProduct.product.status ||
          !item.storeProduct.availability ||
          item.storeProduct.stockQuantity < item.quantity,
      )
      .map((item) => ({
        productId: item.storeProduct.productId,
        storeProductId: item.storeProductId,
        productName: item.storeProduct.product.name,
        requestedQuantity: item.quantity,
        availableStock: item.storeProduct.stockQuantity,
      }));
    if (unavailableItems.length)
      throw new ConflictException({
        message: 'Some items are unavailable',
        data: { unavailableItems },
      });
    const items = cart.items.map((item) => {
      const unitPrice = money(item.storeProduct.discountPrice ?? item.storeProduct.price);
      return {
        cartItemId: item.id,
        storeProductId: item.storeProductId,
        productId: item.storeProduct.productId,
        storeId: item.storeProduct.storeId,
        productName: item.storeProduct.product.name,
        productCode: item.storeProduct.sku,
        image: item.storeProduct.product.images[0]?.url ?? null,
        quantity: item.quantity,
        unitPrice,
        totalPrice: unitPrice.mul(item.quantity),
      };
    });
    const storeIds = [...new Set(items.map((item) => item.storeId))].sort((a, b) => a - b);
    const perStoreFee =
      fulfillmentType === 'DELIVERY' ? money(settings.deliveryFeePerStore) : money(0);
    let orders = storeIds.map((storeId) => {
      const lines = items.filter((item) => item.storeId === storeId);
      const subtotal = lines.reduce((sum, line) => sum.add(line.totalPrice), money(0));
      return {
        storeId,
        items: lines,
        subtotal,
        shippingFee: perStoreFee,
        tax: money(0),
        discountAmount: money(0),
        shippingDiscount: money(0),
        total: subtotal.add(perStoreFee),
      };
    });
    const grossSubtotal = orders.reduce((sum, order) => sum.add(order.subtotal), money(0));
    let discountAmount = money(0);
    const appliedVoucher = cart.voucher?.voucher;
    if (appliedVoucher) {
      const valid =
        appliedVoucher.isActive &&
        appliedVoucher.startsAt <= new Date() &&
        (!appliedVoucher.expiresAt || appliedVoucher.expiresAt > new Date()) &&
        grossSubtotal.gte(appliedVoucher.minimumOrderAmount);
      if (!valid) throw new ConflictException('Applied voucher is no longer eligible.');
      orders = orders.map((order) => {
        if (appliedVoucher.storeId && appliedVoucher.storeId !== order.storeId) return order;
        if (appliedVoucher.type === 'FREE_SHIPPING')
          return { ...order, shippingDiscount: order.shippingFee, total: order.subtotal };
        const raw = appliedVoucher.discountPercent
          ? order.subtotal.mul(appliedVoucher.discountPercent).div(100)
          : money(appliedVoucher.discountAmount ?? 0);
        const amount = money(Prisma.Decimal.min(raw, order.subtotal));
        return { ...order, discountAmount: amount, total: order.total.sub(amount) };
      });
    }
    const appliedCoupon = cart.coupon?.coupon;
    if (appliedCoupon) {
      const valid =
        appliedCoupon.isActive &&
        appliedCoupon.startsAt <= new Date() &&
        (!appliedCoupon.expiresAt || appliedCoupon.expiresAt > new Date()) &&
        grossSubtotal.gte(appliedCoupon.minimumOrderAmount) &&
        (appliedCoupon.usageLimit === null || appliedCoupon.usedCount < appliedCoupon.usageLimit);
      if (!valid) throw new ConflictException('Applied coupon is no longer eligible.');
      let couponTotal =
        appliedCoupon.type === 'PERCENTAGE' && appliedCoupon.discountPercent
          ? grossSubtotal.mul(appliedCoupon.discountPercent).div(100)
          : money(appliedCoupon.discountAmount ?? 0);
      if (appliedCoupon.maximumDiscount)
        couponTotal = Prisma.Decimal.min(couponTotal, appliedCoupon.maximumDiscount);
      couponTotal = money(
        Prisma.Decimal.min(
          couponTotal,
          orders.reduce((sum, order) => sum.add(order.total), money(0)),
        ),
      );
      let remaining = couponTotal;
      orders = orders.map((order, index) => {
        const proportional = grossSubtotal.isZero()
          ? money(0)
          : couponTotal.mul(order.subtotal).div(grossSubtotal);
        const amount = money(
          Prisma.Decimal.min(
            remaining,
            order.total,
            index === orders.length - 1 ? remaining : proportional,
          ),
        );
        remaining = remaining.sub(amount);
        return {
          ...order,
          discountAmount: order.discountAmount.add(amount),
          total: order.total.sub(amount),
        };
      });
    }
    discountAmount = orders.reduce(
      (sum, order) => sum.add(order.discountAmount).add(order.shippingDiscount),
      money(0),
    );
    const subtotal = grossSubtotal;
    const shippingFee = perStoreFee.mul(storeIds.length);
    return {
      cartId: cart.id,
      currency: cart.currency,
      fulfillmentType,
      deliveryAddress: address,
      pickupStation: station,
      subtotal,
      shippingFee,
      tax: money(0),
      discountAmount,
      total: subtotal.add(shippingFee).sub(discountAmount),
      orders,
      paymentMethod: input.paymentMethod ?? 'card',
    };
  }

  async create(userId: number, input: CreateCheckoutDto) {
    const group = await this.prisma.$transaction(
      (tx) => this.createInTransaction(tx, userId, input),
      { timeout: 15000 },
    );
    if (group.status === 'PAID') await this.payments.dispatchGroupConfirmations([group.id]);
    return this.payments.summary(userId, group.id);
  }

  async place(userId: number, input: CreateCheckoutDto) {
    const group = await this.prisma.$transaction(
      (tx) => this.createInTransaction(tx, userId, input),
      { timeout: 15000 },
    );
    if (group.paymentMethod === 'CARD' || group.paymentMethod === 'BANK_TRANSFER')
      await this.payments.initialize(userId, group.id);
    if (group.status === 'PAID') await this.payments.dispatchGroupConfirmations([group.id]);
    return this.payments.summary(userId, group.id);
  }

  async createInTransaction(
    tx: Prisma.TransactionClient,
    userId: number,
    input: CreateCheckoutDto,
    credit?: { method: PaymentMethod; expectedFingerprint: string; applicationId: number },
  ) {
    const cart = await this.cartService.lock(tx, userId);
    if (input.cartId !== undefined && cart.id !== input.cartId)
      throw new NotFoundException('Cart not found.');
    const pending = await tx.checkoutPaymentGroup.findUnique({ where: { activeCartId: cart.id } });
    if (pending) {
      const previous = pending.checkoutSnapshot as { input?: unknown } | null;
      if (
        credit ||
        quoteFingerprint(previous?.input ?? pending.checkoutSnapshot) !== quoteFingerprint(input)
      ) {
        throw new ConflictException({
          message:
            'An unpaid checkout already exists. Resume or cancel it before changing checkout.',
          data: { paymentGroupId: pending.id },
        });
      }
      return pending;
    }
    const quote = await this.quoteInTransaction(tx, userId, input);
    if (credit && quoteFingerprint(quote) !== credit.expectedFingerprint)
      throw new ConflictException(
        'Cart, prices, or delivery details changed. Submit a new BNPL application.',
      );
    const method: PaymentMethod =
      credit?.method ??
      (input.paymentMethod === 'wallet'
        ? 'WALLET'
        : input.paymentMethod === 'bank_transfer'
          ? 'BANK_TRANSFER'
          : 'CARD');
    const orders = [];
    for (const order of quote.orders) {
      for (const item of order.items) {
        const reserved = await tx.storeProduct.updateMany({
          where: {
            id: item.storeProductId,
            isActive: true,
            store: { isActive: true },
            product: { status: true },
            availability: true,
            stockQuantity: { gte: item.quantity },
            OR: [{ discountPrice: item.unitPrice }, { discountPrice: null, price: item.unitPrice }],
          },
          data: { stockQuantity: { decrement: item.quantity } },
        });
        if (reserved.count !== 1)
          throw new ConflictException({
            message: 'Stock or price changed; refresh checkout.',
            data: { storeProductId: item.storeProductId },
          });
      }
      const address = quote.deliveryAddress;
      const created = await tx.order.create({
        data: {
          orderNumber: createOrderNumber(),
          userId,
          storeId: order.storeId,
          fulfillmentType: quote.fulfillmentType,
          customerName:
            [address?.firstName, address?.lastName].filter(Boolean).join(' ') ||
            (await tx.user.findUniqueOrThrow({ where: { id: userId } })).email,
          customerEmail:
            address?.email ?? (await tx.user.findUniqueOrThrow({ where: { id: userId } })).email,
          customerPhone: address?.phone,
          deliveryAddress: address?.address,
          deliveryLabel: address?.label,
          deliveryCity: address?.city,
          deliveryState: address?.state,
          currency: quote.currency,
          subtotal: order.subtotal,
          shippingFee: order.shippingFee,
          discountAmount: order.discountAmount,
          shippingDiscount: order.shippingDiscount,
          total: order.total,
          items: {
            create: order.items.map((item) => ({
              storeProductId: item.storeProductId,
              productId: item.productId,
              productName: item.productName,
              productCode: item.productCode,
              productImage: item.image,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice,
            })),
          },
          statusHistory: { create: { toStatus: 'ORDER_RECEIVED' } },
        },
      });
      if (quote.fulfillmentType === 'PICKUP') {
        await tx.pickup.create({
          data: {
            orderId: created.id,
            codeHash: createHash('sha256').update(randomUUID()).digest('hex'),
            qrToken: randomUUID(),
            stationId: quote.pickupStation!.id,
            stationSnapshot: jsonSnapshot(quote.pickupStation),
          },
        });
      } else {
        await tx.delivery.create({
          data: {
            orderId: created.id,
            deliveryAddress: address!.address,
            deliveryLabel: address?.label,
            deliveryState: address?.state,
            deliveryCity: address?.city,
          },
        });
      }
      orders.push(created);
    }
    let group = await tx.checkoutPaymentGroup.create({
      data: {
        userId,
        activeCartId: cart.id,
        cartSnapshot: jsonSnapshot(quote.orders.flatMap((order) => order.items)),
        checkoutSnapshot: jsonSnapshot({ input, quote }),
        paymentMethod: method,
        totalAmount: quote.total,
        discountAmount: quote.discountAmount,
        currency: quote.currency,
        allocations: {
          create: orders.map((order) => ({ orderId: order.id, amount: order.total })),
        },
      },
    });
    if (method === 'WALLET' || credit) {
      const reference = credit ? 'BNPL-' + credit.applicationId : 'WALLET-' + group.id;
      if (method === 'WALLET') {
        const debit = await tx.wallet.updateMany({
          where: { userId, balance: { gte: quote.total } },
          data: { balance: { decrement: quote.total } },
        });
        if (debit.count !== 1) throw new BadRequestException('Insufficient wallet balance.');
        const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            amount: quote.total,
            type: 'DEBIT',
            reference,
            description: 'Checkout ' + group.id,
          },
        });
      }
      const payment = await tx.payment.create({
        data: {
          amount: quote.total,
          currency: quote.currency,
          paymentMethod: method,
          provider: 'MANUAL',
          transactionRef: reference,
          status: 'PAID',
          paidAt: new Date(),
        },
      });
      group = await tx.checkoutPaymentGroup.update({
        where: { id: group.id },
        data: { paymentId: payment.id },
      });
      await this.payments.completeGroup(tx, group.id);
      group = await tx.checkoutPaymentGroup.findUniqueOrThrow({ where: { id: group.id } });
    }
    return group;
  }
}
