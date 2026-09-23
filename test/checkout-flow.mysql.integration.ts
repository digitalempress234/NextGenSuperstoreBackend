import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import type { PrismaService } from '../src/prisma/prisma.service';
import { CartService } from '../src/cart/cart.service';
import { CheckoutService } from '../src/checkout/checkout.service';
import { CheckoutSettingsService } from '../src/checkout/checkout-settings.service';
import { PaymentsService } from '../src/payments/payments.service';
import type { PaystackClient } from '../src/payments/paystack.client';
import { SettlementsService } from '../src/settlements/settlements.service';
import { BnplService } from '../src/bnpl/bnpl.service';
import { UsersService } from '../src/users/users.service';
import type { RbacService } from '../src/rbac/rbac.service';

const url = process.env.CHECKOUT_TEST_DATABASE_URL;
const localOptIn = process.env.CHECKOUT_TEST_USE_LOCAL_DB === 'true';
if (
  !url ||
  !['127.0.0.1', 'localhost'].includes(new URL(url).hostname) ||
  (new URL(url).pathname !== '/checkout_test' &&
    !(localOptIn && new URL(url).pathname === '/purse'))
) {
  throw new Error(
    'Use an isolated local checkout_test database, or explicitly opt in to the local purse database.',
  );
}
const adapter = new PrismaMariaDb(url);
const db = new PrismaClient({ adapter });
const prisma = db as unknown as PrismaService;
const config = new ConfigService({ BNPL_DATA_KEY: 'ab'.repeat(32) });
const cart = new CartService(prisma);
const settlements = new SettlementsService(prisma, config);
const gatewayStatuses = new Map<string, string>();
const initializationCalls = new Map<string, number>();
const paystack = {
  initialize: async (reference: string) => {
    initializationCalls.set(reference, (initializationCalls.get(reference) ?? 0) + 1);
    await new Promise((resolve) => setTimeout(resolve, 25));
    return { reference, authorization_url: 'https://checkout.example.test/' + reference };
  },
  verify: async (reference: string) => {
    const payment = await db.payment.findUniqueOrThrow({ where: { transactionRef: reference } });
    return {
      status: gatewayStatuses.get(reference) ?? 'success',
      reference,
      amount: payment.amount.mul(100).toNumber(),
      currency: 'NGN',
    };
  },
};
const payments = new PaymentsService(
  prisma,
  paystack as unknown as PaystackClient,
  settlements,
  cart,
);
const settings = new CheckoutSettingsService(prisma);
const checkout = new CheckoutService(prisma, cart, settings, payments);
const bnpl = new BnplService(prisma, cart, checkout, payments, config);
const users = new UsersService(prisma, {} as RbacService);
const suffix = randomUUID();
let testCategoryId: number | undefined;
let testStationId: number | undefined;
let testPlanId: number | undefined;

async function main() {
  const seller = await db.user.create({ data: { email: 'seller-' + suffix + '@example.test' } });
  const buyer = await db.user.create({
    data: { email: 'buyer-' + suffix + '@example.test', wallet: { create: { balance: 500 } } },
  });
  const other = await db.user.create({ data: { email: 'other-' + suffix + '@example.test' } });
  const category = await db.category.create({ data: { name: 'Test' } });
  testCategoryId = category.id;
  const store = await db.store.create({
    data: {
      ownerUserId: seller.id,
      storeName: 'Test',
      state: 'Lagos',
      city: 'Ikeja',
      address: 'Test',
      isActive: true,
    },
  });
  const product = await db.product.create({
    data: { categoryId: category.id, name: 'Test product' },
  });
  const offer = await db.storeProduct.create({
    data: { storeId: store.id, productId: product.id, price: '10.10', stockQuantity: 20 },
  });
  const station = await db.pickupStation.create({
    data: {
      name: 'Test station',
      address: 'Test',
      state: 'Lagos',
      city: 'Ikeja',
      phone: '08000000000',
    },
  });
  testStationId = station.id;
  const input = { deliveryMethod: 'store_pickup' as const, pickupStationId: station.id };
  const stock = async () =>
    (await db.storeProduct.findUniqueOrThrow({ where: { id: offer.id } })).stockQuantity;
  const firstAddress = await users.addAddress(buyer.id, {
    state: 'Lagos',
    town: 'Ikeja',
    address: 'Test',
    firstName: 'Buyer',
    phone: '08000000000',
  });
  const secondAddress = await users.addAddress(buyer.id, {
    state: 'Lagos',
    city: 'Ikeja',
    address: 'Second',
    isDefault: true,
  });
  assert.equal(
    (await users.getAddresses(buyer.id)).filter((address) => address.isDefault).length,
    1,
  );
  await assert.rejects(users.deleteAddress(other.id, firstAddress.id));
  await users.deleteAddress(buyer.id, secondAddress.id);
  assert.equal((await users.getAddresses(buyer.id))[0].isDefault, true);

  assert.equal((await cart.get(buyer.id)).items.length, 0);
  await cart.addSelection(buyer.id, { productId: product.id, quantity: 2 });
  const paid = await checkout.place(buyer.id, { ...input, paymentMethod: 'wallet' });
  assert.equal(paid.paymentStatus, 'paid');
  assert.equal(await stock(), 18);
  assert.equal((await cart.get(buyer.id)).items.length, 0);
  assert.equal(
    (await db.wallet.findUniqueOrThrow({ where: { userId: buyer.id } })).balance.toString(),
    '479.8',
  );
  assert.equal(await db.storeWalletTransaction.count({ where: { orderId: paid.orderId } }), 1);
  console.log(
    'PASS wallet checkout, stock reservation, address ownership/defaults, and atomic settlement',
  );

  await cart.add(other.id, offer.id, 2);
  const before = await stock();
  await assert.rejects(
    checkout.place(other.id, { ...input, paymentMethod: 'wallet' }),
    /Insufficient wallet/,
  );
  assert.equal(await stock(), before);
  assert.equal(await db.order.count({ where: { userId: other.id } }), 0);
  await cart.clear(other.id);
  console.log('PASS insufficient wallet rolls back orders and stock');

  await cart.add(buyer.id, offer.id, 1);
  const [pending, repeated] = await Promise.all([
    checkout.place(buyer.id, { ...input, paymentMethod: 'card' }),
    checkout.place(buyer.id, { ...input, paymentMethod: 'card' }),
  ]);
  assert.equal(repeated.paymentGroupId, pending.paymentGroupId);
  assert.equal(initializationCalls.get(pending.paymentReference!), 1);
  assert.equal((await cart.get(buyer.id)).items.length, 1);
  await Promise.all([
    payments.verifyReference(pending.paymentReference!),
    payments.verifyReference(pending.paymentReference!),
  ]);
  assert.equal(await db.storeWalletTransaction.count({ where: { orderId: pending.orderId } }), 1);
  assert.equal((await cart.get(buyer.id)).items.length, 0);
  console.log('PASS repeated order submission and concurrent payment callbacks settle once');

  await cart.add(buyer.id, offer.id, 1);
  const failed = await checkout.place(buyer.id, { ...input, paymentMethod: 'card' });
  const reservedStock = await stock();
  gatewayStatuses.set(failed.paymentReference!, 'failed');
  await payments.verifyReference(failed.paymentReference!);
  await payments.verifyReference(failed.paymentReference!);
  assert.equal(await stock(), reservedStock + 1);
  assert.equal((await cart.get(buyer.id)).items.length, 1);
  console.log('PASS failed payment restores stock exactly once and retains cart');

  await cart.clear(buyer.id);
  await db.storeProduct.update({ where: { id: offer.id }, data: { stockQuantity: 1 } });
  await cart.add(buyer.id, offer.id, 1);
  await cart.add(other.id, offer.id, 1);
  const concurrent = await Promise.allSettled([
    checkout.create(buyer.id, input),
    checkout.create(other.id, input),
  ]);
  assert.equal(concurrent.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(await stock(), 0);
  const winner = concurrent.find((result) => result.status === 'fulfilled');
  assert(winner?.status === 'fulfilled');
  const winnerId = concurrent[0].status === 'fulfilled' ? buyer.id : other.id;
  await payments.cancel(winnerId, winner.value.paymentGroupId);
  await payments.cancel(winnerId, winner.value.paymentGroupId);
  assert.equal(await stock(), 1);
  await cart.clear(other.id);
  await cart.clear(buyer.id);
  console.log('PASS concurrent customers cannot oversell; cancellation releases once');

  await cart.add(buyer.id, offer.id, 1);
  const plan = await db.bnplPlan.create({
    data: {
      provider: 'wallet_bnpl',
      label: 'Test 3 months',
      months: 3,
      interestRate: 5,
      isActive: true,
    },
  });
  testPlanId = plan.id;
  const activeCart = await cart.get(buyer.id);
  const application = await bnpl.apply(
    buyer.id,
    {
      ...input,
      cartId: activeCart.id,
      provider: 'wallet_bnpl',
      planId: plan.id,
      employerName: 'Test employer',
      monthlyIncome: 100000,
      accountNumber: '0123456789',
      bankName: 'Test bank',
      nibssConsent: true,
    },
    { buffer: Buffer.from('%PDF-1.7 test fixture') } as Express.Multer.File,
  );
  await assert.rejects(bnpl.confirm(buyer.id, application.applicationId), /must be approved/);
  const stored = await db.bnplApplication.findUniqueOrThrow({
    where: { id: application.applicationId },
  });
  assert.notEqual(stored.accountNumber, '0123456789');
  assert.notEqual(Buffer.from(stored.documentData).subarray(0, 5).toString(), '%PDF-');
  const staff = await db.staffUser.create({
    data: {
      email: 'staff-' + suffix + '@example.test',
      firstName: 'Test',
      lastName: 'Reviewer',
      passwordHash: 'test-only',
      role: 'CREDIT_BNPL_ADMIN',
    },
  });
  const staffContext = {
    id: staff.id,
    email: staff.email,
    role: staff.role,
    permissions: [],
    sessionId: 1,
    mustChangePassword: false,
  };
  await bnpl.review(staffContext, application.applicationId, {
    status: 'APPROVED',
    reason: 'Test financing approval',
  });
  await db.storeProduct.update({ where: { id: offer.id }, data: { price: '10.11' } });
  await assert.rejects(bnpl.confirm(buyer.id, application.applicationId), /changed/);
  await db.storeProduct.update({ where: { id: offer.id }, data: { price: '10.10' } });
  const financed = await bnpl.confirm(buyer.id, application.applicationId);
  const again = await bnpl.confirm(buyer.id, application.applicationId);
  assert.equal(financed.checkout.paymentGroupId, again.checkout.paymentGroupId);
  assert.equal(financed.application.status, 'confirmed');
  assert.equal(financed.checkout.paymentMethod, 'wallet_bnpl');
  assert.equal(await stock(), 0);
  console.log('PASS BNPL encrypted storage, approval gate, financing, and repeat confirmation');
  console.log('All MySQL checkout integration checks passed.');
}
async function cleanup() {
  const emails = ['buyer-', 'seller-', 'other-'].map((prefix) => prefix + suffix + '@example.test');
  const userIds = (
    await db.user.findMany({ where: { email: { in: emails } }, select: { id: true } })
  ).map((user) => user.id);
  await db.$transaction(
    async (tx) => {
      const groups = await tx.checkoutPaymentGroup.findMany({ where: { userId: { in: userIds } } });
      const paymentIds = groups.flatMap((group) => (group.paymentId ? [group.paymentId] : []));
      await tx.bnplApplication.deleteMany({ where: { userId: { in: userIds } } });
      await tx.checkoutPaymentAllocation.deleteMany({
        where: { paymentGroupId: { in: groups.map((group) => group.id) } },
      });
      await tx.checkoutPaymentGroup.deleteMany({
        where: { id: { in: groups.map((group) => group.id) } },
      });
      await tx.paymentWebhookEvent.deleteMany({ where: { paymentId: { in: paymentIds } } });
      await tx.payment.deleteMany({ where: { id: { in: paymentIds } } });
      await tx.order.deleteMany({ where: { userId: { in: userIds } } });
      await tx.cartItem.deleteMany({ where: { cart: { userId: { in: userIds } } } });
      await tx.store.deleteMany({ where: { ownerUserId: { in: userIds } } });
      if (testCategoryId) {
        await tx.product.deleteMany({ where: { categoryId: testCategoryId } });
        await tx.category.delete({ where: { id: testCategoryId } });
      }
      if (testStationId) await tx.pickupStation.delete({ where: { id: testStationId } });
      if (testPlanId) await tx.bnplPlan.delete({ where: { id: testPlanId } });
      const staff = await tx.staffUser.findUnique({
        where: { email: 'staff-' + suffix + '@example.test' },
      });
      if (staff) {
        await tx.auditLog.deleteMany({ where: { staffActorId: staff.id } });
        await tx.staffUser.delete({ where: { id: staff.id } });
      }
      await tx.user.deleteMany({ where: { id: { in: userIds } } });
    },
    { timeout: 20000 },
  );
  console.log('Removed this run’s test fixtures.');
}
main()
  .finally(async () => {
    try {
      await cleanup();
    } finally {
      await db.$disconnect();
    }
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
