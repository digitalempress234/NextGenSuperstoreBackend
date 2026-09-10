import { PrismaClient, RoleName } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ─── Permission Definitions ───────────────────────────────────────────────────

const permissionDefinitions: Array<[string, string]> = [
  ['users.view', 'View customer and user profiles.'],
  ['users.update', 'Update customer and user profiles.'],
  ['users.freeze', 'Freeze or unfreeze user accounts.'],
  ['roles.create', 'Create platform roles.'],
  ['roles.assign', 'Assign roles to users.'],
  ['roles.revoke', 'Revoke user roles.'],
  ['roles.override', 'Grant or remove temporary permission overrides.'],
  ['stores.view', 'View stores and merchant profiles.'],
  ['stores.create', 'Create a store.'],
  ['stores.update', 'Update store information.'],
  ['stores.activate', 'Activate a merchant store.'],
  ['stores.suspend', 'Suspend a merchant store.'],
  ['merchants.approve', 'Approve merchant onboarding.'],
  ['merchants.suspend', 'Suspend a merchant.'],
  ['products.view', 'View products.'],
  ['products.create', 'Create catalog products.'],
  ['products.update', 'Update catalog products.'],
  ['products.archive', 'Archive catalog products.'],
  ['products.price.update', 'Update store-specific prices.'],
  ['inventory.adjust', 'Adjust inventory stock.'],
  ['orders.view', 'View orders.'],
  ['orders.place', 'Place customer orders via checkout.'],
  ['cart.manage', 'Add, update, and remove items from cart.'],
  ['checkout.create', 'Convert cart into orders at checkout.'],
  ['payments.initiate', 'Initialize a payment for a checkout.'],
  ['reviews.write', 'Submit product reviews after purchase.'],
  ['orders.cancel', 'Cancel orders.'],
  ['orders.refund.initiate', 'Initiate a refund workflow.'],
  ['orders.refund.approve', 'Approve a refund workflow.'],
  ['orders.status.update', 'Update order operational status.'],
  ['payments.view', 'View payment transactions.'],
  ['payments.reverse', 'Reverse a payment transaction.'],
  ['payments.reconcile', 'Reconcile payment transactions.'],
  ['wallets.view', 'View wallets.'],
  ['wallets.freeze', 'Freeze wallets.'],
  ['wallets.credit', 'Credit wallets.'],
  ['wallets.debit', 'Debit wallets.'],
  ['riders.view', 'View riders.'],
  ['riders.update', 'Update rider profiles.'],
  ['riders.approve', 'Approve riders.'],
  ['riders.suspend', 'Suspend riders.'],
  ['kyc.read', 'Read KYC documents and verification status.'],
  ['kyc.review', 'Approve or reject KYC documents.'],
  ['deliveries.view', 'View deliveries.'],
  ['deliveries.assign', 'Assign deliveries to riders.'],
  ['deliveries.status.update', 'Update delivery status.'],
  ['reports.view', 'View reports.'],
  ['reports.export', 'Export sensitive reports.'],
  ['notifications.send', 'Send operational notifications.'],
  ['integrations.manage', 'Manage API integrations and webhooks.'],
  ['risk.flag', 'Flag entities for risk review.'],
  ['risk.blacklist.create', 'Blacklist a risk entity.'],
  ['risk.blacklist.remove', 'Remove a blacklist entry.'],
  ['bnpl.loan.create', 'Create BNPL loans.'],
  ['bnpl.limit.adjust', 'Adjust customer BNPL limits.'],
  ['bnpl.repayment.restructure', 'Restructure BNPL repayment plans.'],
  ['audit.view', 'Read audit logs.'],
  ['audit.export', 'Export audit records.'],
];

// ─── Role Permissions ─────────────────────────────────────────────────────────

const rolePermissions: Record<RoleName, string[]> = {
  CUSTOMER: [
    'users.view', 'stores.view', 'products.view', 'orders.view', 'orders.place',
    'deliveries.view', 'cart.manage', 'checkout.create', 'payments.initiate', 'reviews.write',
  ],
  VENDOR: [
    'stores.view', 'stores.create', 'stores.update', 'products.view', 'products.create',
    'products.update', 'products.price.update', 'inventory.adjust', 'orders.view', 'orders.status.update',
  ],
  STORE_AGENT: ['stores.view', 'products.view', 'orders.view', 'orders.status.update'],
  RIDER: ['users.view', 'riders.view', 'riders.update', 'deliveries.view', 'deliveries.status.update'],
  SUPER_ADMIN: permissionDefinitions.map((p) => p[0]),
  OPERATIONS_ADMIN: [
    'users.view', 'stores.view', 'stores.update', 'products.view', 'orders.view',
    'orders.cancel', 'orders.status.update', 'deliveries.view', 'deliveries.assign',
    'deliveries.status.update', 'reports.view',
  ],
  FINANCE_ADMIN: [
    'orders.view', 'orders.refund.approve', 'payments.view', 'payments.reconcile',
    'payments.reverse', 'wallets.view', 'wallets.credit', 'wallets.debit', 'reports.view', 'reports.export',
  ],
  RISK_COMPLIANCE_ADMIN: [
    'users.view', 'users.freeze', 'riders.view', 'kyc.read', 'kyc.review',
    'risk.flag', 'risk.blacklist.create', 'risk.blacklist.remove', 'audit.view', 'reports.view',
  ],
  MERCHANT_ADMIN: [
    'stores.view', 'stores.create', 'stores.update', 'stores.activate', 'stores.suspend',
    'merchants.approve', 'merchants.suspend', 'products.view', 'products.create', 'products.update',
    'inventory.adjust', 'orders.view',
  ],
  CUSTOMER_SUPPORT_ADMIN: [
    'users.view', 'users.update', 'users.freeze', 'orders.view', 'orders.cancel',
    'orders.refund.initiate', 'products.view', 'stores.view',
  ],
  CREDIT_BNPL_ADMIN: ['users.view', 'bnpl.loan.create', 'bnpl.limit.adjust', 'bnpl.repayment.restructure', 'reports.view'],
  AUDIT_OBSERVER_ADMIN: [
    'users.view', 'stores.view', 'products.view', 'orders.view', 'payments.view',
    'deliveries.view', 'riders.view', 'kyc.read', 'reports.view', 'reports.export', 'audit.view', 'audit.export',
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

// ─── Approval Policies ────────────────────────────────────────────────────────

const approvalPolicies = [
  { actionKey: 'orders.refund.approve', description: 'Refunds requiring Finance approval.', requiredApprovals: 1, initiatorPermissions: ['orders.refund.initiate'], approverPermissions: ['orders.refund.approve'] },
  { actionKey: 'payments.reverse', description: 'Payment reversals require Finance approval.', requiredApprovals: 1, initiatorPermissions: ['payments.view'], approverPermissions: ['payments.reverse'] },
  { actionKey: 'roles.assign', description: 'Role assignments are controlled by privileged administrators.', requiredApprovals: 1, initiatorPermissions: ['roles.assign'], approverPermissions: ['roles.assign'] },
  { actionKey: 'risk.blacklist.remove', description: 'Blacklist removals require Risk approval and audit.', requiredApprovals: 1, initiatorPermissions: ['risk.flag'], approverPermissions: ['risk.blacklist.remove'] },
];

// ─── Demo Data ────────────────────────────────────────────────────────────────

const DEMO_PASSWORD = 'Password123!';

const categories = [
  { name: 'Electronics',     children: ['Smartphones', 'Laptops & Computers', 'Accessories', 'Televisions', 'Audio & Headphones'] },
  { name: 'Fashion',         children: ['Men\'s Clothing', 'Women\'s Clothing', 'Shoes & Footwear', 'Bags & Accessories'] },
  { name: 'Supermarket',     children: ['Beverages', 'Snacks & Confectionery', 'Household Essentials', 'Personal Care', 'Baby & Kids'] },
  { name: 'Home & Furniture',children: ['Kitchen & Dining', 'Bedding & Pillows', 'Home Decor', 'Furniture'] },
  { name: 'Health & Beauty', children: ['Skincare', 'Haircare', 'Vitamins & Supplements', 'Fitness Equipment'] },
];

// catalog: [name, brand, description, unit, parentCategoryName, imageUrl]
const catalogProducts: Array<{
  name: string; brand: string; description: string; unit: string;
  category: string; image: string;
}> = [
  // Electronics - Smartphones
  { name: 'iPhone 15 Pro Max 256GB', brand: 'Apple', description: 'A17 Pro chip, titanium design, 48MP camera system, USB-C with USB 3 speeds. The most powerful iPhone ever.', unit: 'piece', category: 'Smartphones', image: 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=600' },
  { name: 'Samsung Galaxy S24 Ultra', brand: 'Samsung', description: '200MP camera, integrated S Pen, 6.8" QHD+ Dynamic AMOLED display, Snapdragon 8 Gen 3.', unit: 'piece', category: 'Smartphones', image: 'https://images.unsplash.com/photo-1706721490006-18c5a4b0e3ae?w=600' },
  { name: 'Tecno Camon 30 Pro', brand: 'Tecno', description: '50MP Sony LYTIA-700C sensor, 6.77" AMOLED display, 5000mAh battery, 45W fast charging.', unit: 'piece', category: 'Smartphones', image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600' },
  { name: 'Infinix Hot 40 Pro', brand: 'Infinix', description: '6.78" 120Hz display, 50MP AI triple camera, 5000mAh battery with 33W charging.', unit: 'piece', category: 'Smartphones', image: 'https://images.unsplash.com/photo-1567581935884-3349723552ca?w=600' },

  // Electronics - Laptops
  { name: 'MacBook Air M3 13"', brand: 'Apple', description: '18-hour battery, 8-core GPU, stunning Liquid Retina display. Fanless, portable, powerful.', unit: 'piece', category: 'Laptops & Computers', image: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=600' },
  { name: 'HP Laptop 15s Core i5', brand: 'HP', description: '12th Gen Intel Core i5, 8GB RAM, 512GB SSD, Windows 11, 15.6" FHD display.', unit: 'piece', category: 'Laptops & Computers', image: 'https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2?w=600' },
  { name: 'Lenovo IdeaPad Gaming 3', brand: 'Lenovo', description: 'RTX 4050, AMD Ryzen 7, 16GB RAM, 512GB SSD, 15.6" 120Hz IPS display.', unit: 'piece', category: 'Laptops & Computers', image: 'https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=600' },

  // Electronics - Audio
  { name: 'Sony WH-1000XM5 Headphones', brand: 'Sony', description: 'Industry-leading noise cancelling, 30-hour battery, multipoint connection, crystal-clear call quality.', unit: 'piece', category: 'Audio & Headphones', image: 'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=600' },
  { name: 'JBL Flip 6 Bluetooth Speaker', brand: 'JBL', description: 'IP67 waterproof, 12 hours playtime, PartyBoost feature, powerful JBL Original Pro Sound.', unit: 'piece', category: 'Audio & Headphones', image: 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=600' },
  { name: 'Airpods Pro 2nd Generation', brand: 'Apple', description: 'Active Noise Cancellation, Transparency mode, Adaptive Audio, Personalized Spatial Audio.', unit: 'piece', category: 'Audio & Headphones', image: 'https://images.unsplash.com/photo-1606220588913-b3aacb4d2f37?w=600' },

  // Electronics - TV
  { name: 'Samsung 55" 4K Smart TV', brand: 'Samsung', description: 'Crystal UHD 4K, HDR, Tizen OS, AirPlay 2, 3 HDMI ports, Bluetooth 5.2.', unit: 'piece', category: 'Televisions', image: 'https://images.unsplash.com/photo-1593784991095-a205069470b6?w=600' },
  { name: 'Hisense 43" QLED TV', brand: 'Hisense', description: '4K QLED display, Dolby Vision & Atmos, VIDAA Smart OS, built-in Netflix & YouTube.', unit: 'piece', category: 'Televisions', image: 'https://images.unsplash.com/photo-1507101105822-7472b28e22ac?w=600' },

  // Fashion - Men
  { name: 'Men\'s Classic Oxford Shirt', brand: 'ZARA', description: 'Premium cotton poplin fabric, slim fit, button-down collar. Available in white and blue.', unit: 'piece', category: 'Men\'s Clothing', image: 'https://images.unsplash.com/photo-1598033129183-c4f50c736f10?w=600' },
  { name: 'Men\'s Chino Trousers', brand: 'H&M', description: 'Slim fit, stretch cotton blend, five-pocket styling. Perfect for office or casual wear.', unit: 'piece', category: 'Men\'s Clothing', image: 'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=600' },
  { name: 'Men\'s Agbada 3-Piece Set', brand: 'Deola Sagoe', description: 'Premium hand-embroidered agbada set, aso-oke fabric, traditional Nigerian ceremonial wear.', unit: 'set', category: 'Men\'s Clothing', image: 'https://images.unsplash.com/photo-1588117305388-c2631a279f82?w=600' },

  // Fashion - Women
  { name: 'Women\'s Ankara Maxi Dress', brand: 'House of Deola', description: 'Vibrant 100% authentic Ankara print, floor-length, fitted bodice, flare bottom. Sizes XS–3XL.', unit: 'piece', category: 'Women\'s Clothing', image: 'https://images.unsplash.com/photo-1590735213920-68192a487bc2?w=600' },
  { name: 'Women\'s Blazer Jacket', brand: 'Mango', description: 'Structured lapel blazer, single-button closure, two front pockets. Office-ready elegance.', unit: 'piece', category: 'Women\'s Clothing', image: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=600' },

  // Shoes
  { name: 'Nike Air Max 270', brand: 'Nike', description: 'Max Air unit in the heel, breathable mesh upper, foam midsole for all-day comfort.', unit: 'pair', category: 'Shoes & Footwear', image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600' },
  { name: 'Men\'s Leather Oxford Shoes', brand: 'Clarks', description: 'Full-grain leather upper, cushioned Ortholite® footbed, rubber outsole. Classic business formal.', unit: 'pair', category: 'Shoes & Footwear', image: 'https://images.unsplash.com/photo-1614252235316-8c857d38b5f4?w=600' },

  // Supermarket - Beverages
  { name: 'Milo Chocolate Drink 900g', brand: 'Nestlé', description: 'Malted chocolate energy drink powder, rich in vitamins and minerals. For children and adults.', unit: '900g tin', category: 'Beverages', image: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=600' },
  { name: 'Lipton Yellow Label Tea (100 bags)', brand: 'Lipton', description: 'Bold, smooth black tea from the world\'s top tea brand. 100 individually wrapped tea bags.', unit: 'pack', category: 'Beverages', image: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=600' },
  { name: 'Coca-Cola 50cl (12 pack)', brand: 'Coca-Cola', description: 'The original sparkling soft drink. Pack of 12 × 500ml chilled bottles.', unit: '12 pack', category: 'Beverages', image: 'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=600' },
  { name: 'Chi Exotic Juice 1L', brand: 'CHI', description: 'Premium fruit drink in mixed tropical, mango, and orange variants. No artificial colours.', unit: '1 litre', category: 'Beverages', image: 'https://images.unsplash.com/photo-1621263764928-df1444c5e859?w=600' },

  // Supermarket - Snacks
  { name: 'Pringles Original 165g', brand: 'Pringles', description: 'Stackable potato crisps, original salted flavour, resealable iconic tube.', unit: 'tube', category: 'Snacks & Confectionery', image: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=600' },
  { name: 'Cadbury Dairy Milk Chocolate 90g', brand: 'Cadbury', description: 'Silky smooth milk chocolate made with a glass and a half of full-cream milk.', unit: 'bar', category: 'Snacks & Confectionery', image: 'https://images.unsplash.com/photo-1481391319762-47dff72954d9?w=600' },
  { name: 'Indomie Chicken Flavour (Pack of 40)', brand: 'Indomie', description: 'Nigeria\'s favourite instant noodles. Pack of 40 × 70g chicken-flavoured sachets.', unit: 'carton', category: 'Snacks & Confectionery', image: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=600' },

  // Supermarket - Household
  { name: 'Ariel Washing Powder 2.5kg', brand: 'Ariel', description: 'Outstanding stain removal with Active Foam. Works in cold water. Fresh scent.', unit: '2.5kg bag', category: 'Household Essentials', image: 'https://images.unsplash.com/photo-1582735689369-4fe89db7114c?w=600' },
  { name: 'Dettol Antiseptic Liquid 750ml', brand: 'Dettol', description: 'Kills 99.9% of germs. Suitable for wounds, bathing, laundry disinfection, and floor cleaning.', unit: '750ml bottle', category: 'Household Essentials', image: 'https://images.unsplash.com/photo-1584515933487-779824d29309?w=600' },

  // Supermarket - Personal Care
  { name: 'Dove Body Wash 500ml', brand: 'Dove', description: 'Deep moisture formula with Dove\'s unique ¼ moisturising cream for noticeably softer skin.', unit: '500ml bottle', category: 'Personal Care', image: 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=600' },
  { name: 'Oral-B Pro-Health Toothbrush', brand: 'Oral-B', description: 'Cross Action bristles reach 37% more plaque. Tongue and cheek cleaner. Ergonomic handle.', unit: 'piece', category: 'Personal Care', image: 'https://images.unsplash.com/photo-1607613009820-a29f7bb81c04?w=600' },

  // Home & Furniture - Kitchen
  { name: 'Scanfrost 50L Chest Freezer', brand: 'Scanfrost', description: 'Energy-saving refrigerant, adjustable temperature, pull-out basket, ideal for homes and shops.', unit: 'piece', category: 'Kitchen & Dining', image: 'https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=600' },
  { name: 'Tefal Non-Stick Frying Pan 28cm', brand: 'Tefal', description: 'Titanium Excellence coating, induction-compatible, thermo-spot heat indicator, oven-safe to 175°C.', unit: 'piece', category: 'Kitchen & Dining', image: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600' },
  { name: 'Dinner Set 24 Pieces', brand: 'Royal', description: 'Elegant bone china dinner set for 6 people. Includes plates, bowls, cups and saucers. Dishwasher-safe.', unit: 'set', category: 'Kitchen & Dining', image: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=600' },

  // Health & Beauty
  { name: 'Neutrogena Hydro Boost Gel Cream', brand: 'Neutrogena', description: 'Oil-free, non-comedogenic hyaluronic acid moisturiser. Locks in 48-hour hydration.', unit: '50ml jar', category: 'Skincare', image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600' },
  { name: 'OAN Hair Growth Serum', brand: 'OAN', description: 'Biotin and keratin-enriched serum that reduces breakage and promotes hair growth in 4 weeks.', unit: '100ml bottle', category: 'Haircare', image: 'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=600' },
  { name: 'Vitamin C + Zinc 1000mg (60 tablets)', brand: 'Seven Seas', description: 'Supports immune function and collagen formation. High-strength formulation.', unit: '60 tablets', category: 'Vitamins & Supplements', image: 'https://images.unsplash.com/photo-1550572017-edd951b55104?w=600' },
];

// stores: [name, city, state, address, ownerEmail, ownerName]
const storeDefinitions = [
  {
    name: 'TechHub Electronics Ikeja',
    city: 'Ikeja', state: 'Lagos',
    address: '15 Allen Avenue, Ikeja, Lagos',
    email: 'vendor.techhub@superstore.test',
    ownerFirst: 'Emeka', ownerLast: 'Okafor',
    description: 'Your one-stop shop for genuine electronics, gadgets, and accessories at the best prices in Lagos.',
    categories: ['Smartphones', 'Laptops & Computers', 'Audio & Headphones', 'Televisions', 'Accessories'],
  },
  {
    name: 'FashionNaija Lekki',
    city: 'Lekki', state: 'Lagos',
    address: '4 Admiralty Way, Lekki Phase 1, Lagos',
    email: 'vendor.fashionnaija@superstore.test',
    ownerFirst: 'Amara', ownerLast: 'Obi',
    description: 'Premium Nigerian and international fashion — from Ankara prints to designer labels.',
    categories: ['Men\'s Clothing', 'Women\'s Clothing', 'Shoes & Footwear', 'Bags & Accessories'],
  },
  {
    name: 'ChoiceStore Supermarket Abuja',
    city: 'Garki', state: 'FCT Abuja',
    address: '7 Moshood Abiola Way, Garki, Abuja',
    email: 'vendor.choicestore@superstore.test',
    ownerFirst: 'Bello', ownerLast: 'Musa',
    description: 'Quality groceries, beverages, household essentials and personal care delivered to your doorstep.',
    categories: ['Beverages', 'Snacks & Confectionery', 'Household Essentials', 'Personal Care', 'Baby & Kids'],
  },
  {
    name: 'HomeFirst Living Enugu',
    city: 'Enugu', state: 'Enugu',
    address: '22 Ogui Road, GRA Enugu',
    email: 'vendor.homefirst@superstore.test',
    ownerFirst: 'Chisom', ownerLast: 'Eze',
    description: 'Furniture, kitchen appliances, home decor, and everything you need to make your house a home.',
    categories: ['Kitchen & Dining', 'Bedding & Pillows', 'Home Decor', 'Furniture'],
  },
  {
    name: 'WellnessPlus Health & Beauty',
    city: 'Victoria Island', state: 'Lagos',
    address: '10 Adeola Odeku Street, Victoria Island, Lagos',
    email: 'vendor.wellnessplus@superstore.test',
    ownerFirst: 'Fatima', ownerLast: 'Aliyu',
    description: 'Authentic health, beauty, skincare and wellness products from trusted global brands.',
    categories: ['Skincare', 'Haircare', 'Vitamins & Supplements', 'Fitness Equipment'],
  },
];

// Price map per product name: [regularPrice, discountPrice | null]
const priceMap: Record<string, [number, number | null]> = {
  'iPhone 15 Pro Max 256GB':          [1_280_000, 1_199_000],
  'Samsung Galaxy S24 Ultra':          [980_000,  920_000],
  'Tecno Camon 30 Pro':                [285_000,  265_000],
  'Infinix Hot 40 Pro':                [185_000,  170_000],
  'MacBook Air M3 13"':                [1_750_000, 1_650_000],
  'HP Laptop 15s Core i5':             [620_000,  580_000],
  'Lenovo IdeaPad Gaming 3':           [850_000,  790_000],
  'Sony WH-1000XM5 Headphones':        [285_000,  260_000],
  'JBL Flip 6 Bluetooth Speaker':      [95_000,   85_000],
  'Airpods Pro 2nd Generation':        [380_000,  350_000],
  'Samsung 55" 4K Smart TV':           [650_000,  599_000],
  'Hisense 43" QLED TV':               [420_000,  385_000],
  'Men\'s Classic Oxford Shirt':        [18_500,   null],
  'Men\'s Chino Trousers':             [22_000,   null],
  'Men\'s Agbada 3-Piece Set':         [95_000,   80_000],
  'Women\'s Ankara Maxi Dress':        [35_000,   28_000],
  'Women\'s Blazer Jacket':            [45_000,   38_000],
  'Nike Air Max 270':                  [85_000,   72_000],
  'Men\'s Leather Oxford Shoes':        [55_000,   null],
  'Milo Chocolate Drink 900g':         [6_800,    6_200],
  'Lipton Yellow Label Tea (100 bags)': [3_500,    null],
  'Coca-Cola 50cl (12 pack)':          [4_200,    3_800],
  'Chi Exotic Juice 1L':               [1_200,    null],
  'Pringles Original 165g':            [3_200,    null],
  'Cadbury Dairy Milk Chocolate 90g':  [2_500,    2_200],
  'Indomie Chicken Flavour (Pack of 40)': [10_500, 9_500],
  'Ariel Washing Powder 2.5kg':        [7_500,    null],
  'Dettol Antiseptic Liquid 750ml':    [4_200,    null],
  'Dove Body Wash 500ml':              [5_500,    null],
  'Oral-B Pro-Health Toothbrush':      [2_800,    null],
  'Scanfrost 50L Chest Freezer':       [185_000,  168_000],
  'Tefal Non-Stick Frying Pan 28cm':   [28_500,   25_000],
  'Dinner Set 24 Pieces':              [45_000,   38_000],
  'Neutrogena Hydro Boost Gel Cream':  [12_500,   null],
  'OAN Hair Growth Serum':             [8_500,    7_500],
  'Vitamin C + Zinc 1000mg (60 tablets)': [4_800, null],
};

// Map which products each store sells
const storeProducts: Record<string, string[]> = {
  'TechHub Electronics Ikeja': [
    'iPhone 15 Pro Max 256GB', 'Samsung Galaxy S24 Ultra', 'Tecno Camon 30 Pro', 'Infinix Hot 40 Pro',
    'MacBook Air M3 13"', 'HP Laptop 15s Core i5', 'Lenovo IdeaPad Gaming 3',
    'Sony WH-1000XM5 Headphones', 'JBL Flip 6 Bluetooth Speaker', 'Airpods Pro 2nd Generation',
    'Samsung 55" 4K Smart TV', 'Hisense 43" QLED TV',
  ],
  'FashionNaija Lekki': [
    'Men\'s Classic Oxford Shirt', 'Men\'s Chino Trousers', 'Men\'s Agbada 3-Piece Set',
    'Women\'s Ankara Maxi Dress', 'Women\'s Blazer Jacket',
    'Nike Air Max 270', 'Men\'s Leather Oxford Shoes',
  ],
  'ChoiceStore Supermarket Abuja': [
    'Milo Chocolate Drink 900g', 'Lipton Yellow Label Tea (100 bags)', 'Coca-Cola 50cl (12 pack)', 'Chi Exotic Juice 1L',
    'Pringles Original 165g', 'Cadbury Dairy Milk Chocolate 90g', 'Indomie Chicken Flavour (Pack of 40)',
    'Ariel Washing Powder 2.5kg', 'Dettol Antiseptic Liquid 750ml', 'Dove Body Wash 500ml', 'Oral-B Pro-Health Toothbrush',
  ],
  'HomeFirst Living Enugu': [
    'Scanfrost 50L Chest Freezer', 'Tefal Non-Stick Frying Pan 28cm', 'Dinner Set 24 Pieces',
  ],
  'WellnessPlus Health & Beauty': [
    'Neutrogena Hydro Boost Gel Cream', 'OAN Hair Growth Serum', 'Vitamin C + Zinc 1000mg (60 tablets)',
    'Dove Body Wash 500ml', 'Oral-B Pro-Health Toothbrush',
  ],
};

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('🌱 Seeding Superstore database...\n');

  // 1. Permissions
  console.log('→ Seeding permissions...');
  for (const [key, description] of permissionDefinitions) {
    await prisma.permission.upsert({ where: { key }, update: { description }, create: { key, description } });
  }

  // 2. Roles + role permissions
  console.log('→ Seeding roles...');
  const roleMetadata: Record<RoleName, { description: string; level: number }> = {
    CUSTOMER:              { description: 'Marketplace customer.', level: 1 },
    VENDOR:                { description: 'Merchant/vendor owner.', level: 2 },
    STORE_AGENT:           { description: 'Store fulfillment agent.', level: 2 },
    RIDER:                 { description: 'Approved delivery rider.', level: 2 },
    SUPER_ADMIN:           { description: 'Global system governance.', level: 100 },
    OPERATIONS_ADMIN:      { description: 'Commerce operations.', level: 80 },
    FINANCE_ADMIN:         { description: 'Financial operations.', level: 80 },
    RISK_COMPLIANCE_ADMIN: { description: 'Fraud, risk and KYC management.', level: 80 },
    MERCHANT_ADMIN:        { description: 'Merchant ecosystem management.', level: 70 },
    CUSTOMER_SUPPORT_ADMIN:{ description: 'Customer assistance.', level: 60 },
    CREDIT_BNPL_ADMIN:     { description: 'Credit and BNPL operations.', level: 70 },
    AUDIT_OBSERVER_ADMIN:  { description: 'Read-only oversight.', level: 50 },
    REGIONAL_ADMIN:        { description: 'Region-scoped operations.', level: 60 },
    COMPLIANCE_LEAD:       { description: 'Compliance oversight.', level: 75 },
  };
  for (const name of Object.values(RoleName)) {
    const role = await prisma.role.upsert({ where: { name }, update: roleMetadata[name], create: { name, ...roleMetadata[name] } });
    for (const key of rolePermissions[name]) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { key } });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  // 3. Approval policies
  console.log('→ Seeding approval policies...');
  for (const policy of approvalPolicies) {
    await prisma.approvalPolicy.upsert({ where: { actionKey: policy.actionKey }, update: policy, create: policy });
  }

  // 4. Super admin
  const adminEmail    = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    console.log('→ Seeding super admin...');
    const admin = await prisma.staffUser.upsert({
      where: { email: adminEmail.toLowerCase() },
      update: {},
      create: { 
        email: adminEmail.toLowerCase(), 
        firstName: 'Platform', 
        lastName: 'Administrator', 
        passwordHash: await bcrypt.hash(adminPassword, 12), 
        role: 'SUPER_ADMIN',
        mustChangePassword: false
      },
    });
    console.log(`   ✓ Admin: ${admin.email} / password: ${adminPassword}`);
  }

  // 5. Demo customer
  console.log('→ Seeding demo customer...');
  const customerRole = await prisma.role.findUniqueOrThrow({ where: { name: 'CUSTOMER' } });
  const customer = await prisma.user.upsert({
    where: { email: 'customer@superstore.test' },
    update: {},
    create: {
      email: 'customer@superstore.test',
      firstName: 'Chimezirim',
      lastName: 'Demo',
      phoneNumber: '+2348012345678',
      gender: 'MALE',
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12),
      isEmailVerified: true,
    },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: customer.id, roleId: customerRole.id } },
    update: {},
    create: { userId: customer.id, roleId: customerRole.id },
  });
  console.log(`   ✓ Customer: customer@superstore.test / ${DEMO_PASSWORD}`);

  // 6. Categories
  console.log('→ Seeding categories...');
  const categoryMap = new Map<string, number>();
  for (const cat of categories) {
    const parent = await prisma.category.upsert({
      where: { id: (await prisma.category.findFirst({ where: { name: cat.name, parentId: null } }))?.id ?? 0 },
      update: {},
      create: { name: cat.name, level: 0 },
    });
    categoryMap.set(cat.name, parent.id);
    for (const childName of cat.children) {
      const child = await prisma.category.upsert({
        where: { id: (await prisma.category.findFirst({ where: { name: childName, parentId: parent.id } }))?.id ?? 0 },
        update: {},
        create: { name: childName, parentId: parent.id, level: 1 },
      });
      categoryMap.set(childName, child.id);
    }
  }

  // 7. Catalog products
  console.log('→ Seeding catalog products...');
  const productMap = new Map<string, number>(); // name → id
  for (const p of catalogProducts) {
    const categoryId = categoryMap.get(p.category);
    if (!categoryId) throw new Error(`Category not found: ${p.category}`);

    const existing = await prisma.product.findFirst({ where: { name: p.name } });
    const product = existing
      ? await prisma.product.update({ where: { id: existing.id }, data: { name: p.name, brand: p.brand, description: p.description, unit: p.unit, categoryId } })
      : await prisma.product.create({ data: { name: p.name, brand: p.brand, description: p.description, unit: p.unit, categoryId } });

    // Upsert image
    const existingImage = await prisma.productImage.findFirst({ where: { productId: product.id, url: p.image } });
    if (!existingImage) {
      await prisma.productImage.create({ data: { productId: product.id, url: p.image, sortOrder: 0 } });
    }

    productMap.set(p.name, product.id);
  }

  // 8. Stores + vendors + store products
  console.log('→ Seeding stores and vendors...');
  const vendorRole = await prisma.role.findUniqueOrThrow({ where: { name: 'VENDOR' } });

  for (const def of storeDefinitions) {
    // Create vendor user
    const vendor = await prisma.user.upsert({
      where: { email: def.email },
      update: {},
      create: {
        email: def.email,
        firstName: def.ownerFirst,
        lastName: def.ownerLast,
        passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12),
        isEmailVerified: true,
        phoneNumber: '+234801' + Math.floor(1000000 + Math.random() * 9000000).toString(),
      },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: vendor.id, roleId: vendorRole.id } },
      update: {},
      create: { userId: vendor.id, roleId: vendorRole.id },
    });

    // Vendor profile
    await prisma.vendorProfile.upsert({
      where: { userId: vendor.id },
      update: {},
      create: { userId: vendor.id, phoneNumber: vendor.phoneNumber, state: def.state, city: def.city, address: def.address, documentReviewStatus: 'APPROVED' },
    });

    // Create store
    const existingStore = await prisma.store.findFirst({ where: { ownerUserId: vendor.id, storeName: def.name } });
    const store = existingStore ?? await prisma.store.create({
      data: {
        ownerUserId: vendor.id,
        storeName:   def.name,
        description: def.description,
        email:       def.email,
        state:       def.state,
        city:        def.city,
        address:     def.address,
        isActive:    true,
      },
    });

    // Ensure store wallet exists
    await prisma.storeWallet.upsert({
      where: { storeId: store.id },
      update: {},
      create: { storeId: store.id, balance: 0, lockedBalance: 0 },
    });

    // Add store products
    const productNames = storeProducts[def.name] ?? [];
    for (const productName of productNames) {
      const productId = productMap.get(productName);
      if (!productId) continue;
      const [price, discountPrice] = priceMap[productName] ?? [5000, null];
      await prisma.storeProduct.upsert({
        where: { storeId_productId: { storeId: store.id, productId } },
        update: { price, discountPrice, stockQuantity: 50 + Math.floor(Math.random() * 150), isActive: true, availability: true },
        create: {
          storeId: store.id,
          productId,
          price,
          discountPrice,
          discountType: discountPrice ? 'FIXED' : undefined,
          stockQuantity: 50 + Math.floor(Math.random() * 150),
          isActive: true,
          availability: true,
          sku: `SKU-${store.id}-${productId}`,
        },
      });
    }

    console.log(`   ✓ Store: ${def.name} (${productNames.length} products) — vendor: ${def.email}`);
  }

  console.log('\n✅ Seed complete!');
  console.log('\n─────────────────────────────────────────────');
  console.log('Demo Accounts (all password: Password123!)');
  console.log('─────────────────────────────────────────────');
  console.log('👤 Customer:   customer@superstore.test');
  if (adminEmail) console.log(`🔑 Admin:      ${adminEmail}`);
  for (const s of storeDefinitions) console.log(`🏪 Vendor:     ${s.email}  (${s.name})`);
  console.log('─────────────────────────────────────────────\n');
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
