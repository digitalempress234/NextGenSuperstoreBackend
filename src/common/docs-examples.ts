const timestamp = '2026-10-03T09:30:00.000Z';

export const SUPPORT_TICKETS_EXAMPLE = {
  items: [
    {
      id: 41,
      ticketNumber: 'SUP-1791019800000-A1B2C3',
      orderId: 501,
      category: 'DELIVERY',
      subject: 'Order has not arrived',
      description: 'The rider has not reached the delivery address.',
      status: 'OPEN',
      priority: 'NORMAL',
      attachments: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  total: 1,
  page: 1,
  limit: 15,
  pages: 1,
};

export const CHAT_CONVERSATIONS_EXAMPLE = {
  items: [
    {
      id: 45,
      participantId: 1001,
      storeId: 12,
      orderId: 501,
      lastMessageAt: timestamp,
      store: { id: 12, storeName: 'Lagos Mart', imageUrl: null },
      order: { id: 501, orderNumber: 'PUR-261003-A1B2C3D4' },
      messages: [
        {
          id: 803,
          conversationId: 45,
          senderId: 1001,
          body: 'Is my order ready for pickup?',
          createdAt: timestamp,
        },
      ],
    },
  ],
  total: 1,
  page: 1,
  limit: 15,
  pages: 1,
};

export const REWARD_SUMMARY_EXAMPLE = {
  totalCashback: '1250.00',
  availablePoints: 420,
  giveawayEntries: 3,
  activeVouchersCount: 2,
  currency: 'NGN',
};

export const STORE_ORDERS_EXAMPLE = {
  items: [
    {
      id: 501,
      orderNumber: 'PUR-261003-A1B2C3D4',
      currentStatus: 'PREPARING',
      fulfillmentType: 'DELIVERY',
      total: '18500.00',
      placedAt: timestamp,
      items: [{ id: 901, productName: 'Rice 5kg', quantity: 2, unitPrice: '8500.00' }],
    },
  ],
  total: 1,
  page: 1,
  limit: 15,
  pages: 1,
};

export const STORE_CAMPAIGNS_EXAMPLE = {
  items: [
    {
      id: 'voucher_01JTEST',
      storeId: 12,
      code: 'LAGOS10',
      type: 'PERCENTAGE',
      title: '10% off Lagos Mart orders',
      minimumOrderAmount: '5000.00',
      discountPercent: '10',
      isActive: true,
      startsAt: '2026-10-01T00:00:00.000Z',
      expiresAt: '2026-10-31T23:59:59.000Z',
    },
  ],
  total: 1,
  page: 1,
  limit: 15,
  pages: 1,
};

export const STORE_INBOX_EXAMPLE = {
  items: [
    {
      id: 45,
      storeId: 12,
      orderId: 501,
      lastMessageAt: timestamp,
      participant: {
        id: 1001,
        firstName: 'Ada',
        lastName: 'Okafor',
        avatarUrl: null,
      },
      order: { id: 501, orderNumber: 'PUR-261003-A1B2C3D4' },
      messages: [{ id: 803, body: 'Is my order ready for pickup?', createdAt: timestamp }],
    },
  ],
  total: 1,
  page: 1,
  limit: 15,
  pages: 1,
};

export const STORE_RIDERS_EXAMPLE = {
  items: [
    {
      id: 50,
      onboardingStatus: 'APPROVED',
      areaOfOperation: 'Ikeja',
      user: {
        id: 2001,
        firstName: 'Tunde',
        lastName: 'Adebayo',
        phoneNumber: '+2348012345678',
        avatarUrl: null,
      },
      vehicles: [
        { id: 20, type: 'MOTORCYCLE', make: 'Honda', model: 'CB125', plateNumber: 'LAG-123-XY' },
      ],
    },
  ],
  total: 1,
  page: 1,
  limit: 15,
  pages: 1,
};

export const STORE_COMPARE_DEALS_EXAMPLE = {
  items: [
    {
      storeOffer: {
        id: 301,
        storeId: 12,
        productId: 81,
        price: '8500.00',
        availability: true,
      },
      competingOffers: [
        {
          id: 302,
          storeId: 14,
          productId: 81,
          price: '8750.00',
          store: { id: 14, storeName: 'Mainland Foods' },
        },
      ],
    },
  ],
  total: 1,
  page: 1,
  limit: 15,
  pages: 1,
};

export const STORE_SETTINGS_EXAMPLE = {
  id: 12,
  storeName: 'Lagos Mart',
  email: 'store@example.com',
  phoneNumber: '+2348012345678',
  state: 'Lagos',
  city: 'Ikeja',
  address: '12 Allen Avenue',
  isActive: true,
  category: { id: 4, name: 'Groceries' },
  images: [],
};

export const RIDER_INBOX_EXAMPLE = {
  items: [
    {
      id: 71,
      type: 'DELIVERY_UPDATE',
      title: 'New delivery assigned',
      message: 'Delivery 33 has been assigned to you.',
      priority: 'HIGH',
      isRead: false,
      data: { deliveryId: 33, orderId: 501 },
      createdAt: timestamp,
    },
  ],
  pagination: { page: 1, limit: 15, total: 1, totalPages: 1 },
  unreadCount: 1,
};

export const RIDER_SETTINGS_EXAMPLE = {
  profile: {
    id: 50,
    onboardingStatus: 'APPROVED',
    areaOfOperation: 'Ikeja',
    canSubmit: false,
    canAcceptDeliveries: true,
    missingApplicationRequirements: [],
    missingOperationalRequirements: [],
  },
  notificationPreferences: [{ type: 'DELIVERY_UPDATE', inApp: true, email: true }],
};

export const REWARD_VOUCHERS_EXAMPLE = {
  vouchers: [
    {
      id: 'voucher_01JTEST',
      code: 'LAGOS10',
      type: 'PERCENTAGE',
      storeId: 12,
      storeName: 'Lagos Mart',
      title: '10% off Lagos Mart orders',
      minimumOrderAmount: '5000.00',
      discountPercent: '10',
      status: 'available',
      tags: [],
      expiresAt: '2026-10-31T23:59:59.000Z',
    },
  ],
  total: 1,
  page: 1,
  limit: 15,
  pages: 1,
};

export const ADMIN_SUPPORT_TICKETS_EXAMPLE = {
  ...SUPPORT_TICKETS_EXAMPLE,
  items: SUPPORT_TICKETS_EXAMPLE.items.map((ticket) => ({
    ...ticket,
    user: { id: 1001, email: 'ada@example.com', firstName: 'Ada', lastName: 'Okafor' },
  })),
};

export const ADMIN_CUSTOMERS_EXAMPLE = {
  items: [
    {
      id: 1001,
      firstName: 'Ada',
      lastName: 'Okafor',
      email: 'ada@example.com',
      phoneNumber: '+2348012345678',
      status: 'ACTIVE',
      createdAt: timestamp,
    },
  ],
  total: 1,
  page: 1,
  limit: 15,
  pages: 1,
};

export const ADMIN_CUSTOMER_EXAMPLE = {
  id: 1001,
  firstName: 'Ada',
  lastName: 'Okafor',
  email: 'ada@example.com',
  phoneNumber: '+2348012345678',
  status: 'ACTIVE',
  wallet: { id: 90, balance: '12500.00', currency: 'NGN' },
  rewardAccount: { availablePoints: 420, giveawayEntries: 3 },
  addresses: [{ id: 31, addressLine1: '12 Allen Avenue', city: 'Ikeja', state: 'Lagos' }],
  orders: [{ id: 501, orderNumber: 'PUR-261003-A1B2C3D4', currentStatus: 'PREPARING' }],
  supportTickets: [{ id: 41, ticketNumber: 'SUP-1791019800000-A1B2C3', status: 'OPEN' }],
};

export const ADMIN_ORDERS_EXAMPLE = {
  items: [
    {
      id: 501,
      orderNumber: 'PUR-261003-A1B2C3D4',
      currentStatus: 'PREPARING',
      total: '18500.00',
      user: { id: 1001, firstName: 'Ada', lastName: 'Okafor', email: 'ada@example.com' },
      store: { id: 12, storeName: 'Lagos Mart' },
      placedAt: timestamp,
    },
  ],
  total: 1,
  page: 1,
  limit: 15,
  pages: 1,
};

export const ADMIN_ORDER_EXAMPLE = {
  id: 501,
  orderNumber: 'PUR-261003-A1B2C3D4',
  currentStatus: 'OUT_FOR_DELIVERY',
  fulfillmentType: 'DELIVERY',
  total: '18500.00',
  user: { id: 1001, firstName: 'Ada', lastName: 'Okafor' },
  store: { id: 12, storeName: 'Lagos Mart' },
  items: [{ id: 901, productName: 'Rice 5kg', quantity: 2, unitPrice: '8500.00' }],
  delivery: { id: 33, status: 'OUT_FOR_DELIVERY', riderId: 2001 },
  statusHistory: [{ fromStatus: 'PICKED_UP', toStatus: 'OUT_FOR_DELIVERY', createdAt: timestamp }],
};

export const ADMIN_PAYOUTS_EXAMPLE = {
  items: [
    {
      source: 'USER',
      id: 61,
      userId: 2001,
      amount: '5000.00',
      status: 'PENDING',
      bankName: 'GTBank',
      accountNumber: '******6789',
      createdAt: timestamp,
    },
  ],
  total: 1,
  page: 1,
  limit: 15,
  pages: 1,
};

export const ADMIN_PAYOUT_EXAMPLE = {
  source: 'USER',
  id: 61,
  userId: 2001,
  amount: '5000.00',
  status: 'PENDING',
  bankName: 'GTBank',
  accountNumber: '******6789',
  accountName: 'Tunde Adebayo',
  createdAt: timestamp,
};

export const ADMIN_STORES_EXAMPLE = {
  items: [
    {
      id: 12,
      storeName: 'Lagos Mart',
      state: 'Lagos',
      city: 'Ikeja',
      isActive: true,
      owner: { id: 1101, email: 'vendor@example.com', firstName: 'Bola', lastName: 'Adeyemi' },
      category: { id: 4, name: 'Groceries' },
    },
  ],
  total: 1,
  page: 1,
  limit: 15,
  pages: 1,
};

export const ADMIN_STORE_EXAMPLE = {
  ...STORE_SETTINGS_EXAMPLE,
  owner: { id: 1101, email: 'vendor@example.com', firstName: 'Bola', lastName: 'Adeyemi' },
  members: [],
  products: [{ id: 301, productId: 81, price: '8500.00', availability: true }],
  wallet: { id: 92, balance: '45000.00', currency: 'NGN' },
  cacVerifications: [{ id: 8, status: 'APPROVED' }],
};

export const ADMIN_RIDERS_EXAMPLE = {
  items: STORE_RIDERS_EXAMPLE.items,
  total: 1,
  page: 1,
  limit: 15,
  pages: 1,
};

export const ADMIN_RIDER_EXAMPLE = {
  ...STORE_RIDERS_EXAMPLE.items[0],
  documents: [{ id: 10, type: 'NIN', status: 'APPROVED' }],
  licences: [{ id: 21, type: 'DRIVERS_LICENSE', number: 'AAA00000AA00', status: 'APPROVED' }],
  liveness: [{ id: 19, status: 'APPROVED' }],
  bankAccounts: [{ id: 30, bankName: 'GTBank', accountNumber: '******6789', isPrimary: true }],
  guarantors: [],
};

export const ADMIN_VENDORS_EXAMPLE = {
  items: [
    {
      id: 17,
      userId: 1101,
      businessName: 'Bola Retail Limited',
      onboardingStatus: 'APPROVED',
      user: {
        id: 1101,
        email: 'vendor@example.com',
        firstName: 'Bola',
        lastName: 'Adeyemi',
        phoneNumber: '+2348098765432',
      },
    },
  ],
  total: 1,
  page: 1,
  limit: 15,
  pages: 1,
};

export const ADMIN_VENDOR_EXAMPLE = {
  ...ADMIN_VENDORS_EXAMPLE.items[0],
  ninVerification: { id: 14, status: 'APPROVED' },
  cacVerification: { id: 8, status: 'APPROVED' },
  user: {
    ...ADMIN_VENDORS_EXAMPLE.items[0].user,
    storesOwned: [{ id: 12, storeName: 'Lagos Mart', isActive: true }],
    storeMemberships: [],
  },
};

export const ADMIN_CAMPAIGNS_EXAMPLE = {
  items: STORE_CAMPAIGNS_EXAMPLE.items,
  total: 1,
  page: 1,
  limit: 15,
  pages: 1,
};

export const ADMIN_CAMPAIGN_EXAMPLE = {
  ...STORE_CAMPAIGNS_EXAMPLE.items[0],
  store: { id: 12, storeName: 'Lagos Mart' },
  owners: [{ id: 71, userId: 1001, status: 'CLAIMED', claimedAt: timestamp }],
};
