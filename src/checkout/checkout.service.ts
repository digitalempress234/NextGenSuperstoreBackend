import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
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
    if (input.paymentMethod === 'opay' && !settings.opayEnabled)
      throw new BadRequestException('OPay is not enabled.');
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
    const orders = storeIds.map((storeId) => {
      const lines = items.filter((item) => item.storeId === storeId);
      const subtotal = lines.reduce((sum, line) => sum.add(line.totalPrice), money(0));
      return {
        storeId,
        items: lines,
        subtotal,
        shippingFee: perStoreFee,
        tax: money(0),
        total: subtotal.add(perStoreFee),
      };
    });
    const subtotal = orders.reduce((sum, order) => sum.add(order.subtotal), money(0));
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
      total: subtotal.add(shippingFee),
      orders,
      paymentMethod: input.paymentMethod ?? 'card',
    };
  }

  async create(userId: number, input: CreateCheckoutDto) {
    const group = await this.prisma.$transaction(
      (tx) => this.createInTransaction(tx, userId, input),
      { timeout: 15000 },
    );
    return this.payments.summary(userId, group.id);
  }

  async place(userId: number, input: CreateCheckoutDto) {
    const group = await this.prisma.$transaction(
      (tx) => this.createInTransaction(tx, userId, input),
      { timeout: 15000 },
    );
    if (group.paymentMethod === 'CARD' || group.paymentMethod === 'OPAY')
      await this.payments.initialize(userId, group.id);
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
        : input.paymentMethod === 'opay'
          ? 'OPAY'
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
          orderNumber: 'PUR-' + randomUUID().toUpperCase(),
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
